import { compose, memoize, queued, singleshot } from "functools-kit";
import { signalEmitter } from "../config/emitters";
import { PersistStateAdapter } from "./Persist";
import {
  IPublicSignalRow,
  IScheduledSignalRow,
} from "../interfaces/Strategy.interface";
import { InitialDispatchContract } from "../contract/InitialDispatch.contract";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";

const CREATE_KEY_FN = (signalId: string, bucketName: string) =>
  `${signalId}_${bucketName}`;

/**
 * Updater function for setState — receives current value and returns the next value.
 * Used for functional updates to state, e.g. `setState(prev => ({ ...prev, peakPercent: newPeak }))`
 */
export type Dispatch<Value extends object = object> = (value: Value) => Value | Promise<Value>;

/**
 * Factory form of `initialData` in `new State({ name, initialData })` — receives the
 * resolved signal context ({@link InitialDispatchContract}) and returns the default
 * state value, sync or async. Runs on every access for a signal that has no persisted
 * value yet, so the default can be derived from the actual entry.
 */
export type InitialDataFn<Data extends object = object> = (payload: InitialDispatchContract) => Data | Promise<Data>;

/** 
 * Logical namespace for grouping state buckets within a signal, e.g. "trade" or "metrics".
 * Used to scope state values for different purposes within the same signal — e.g. "trade" bucket for tracking peakPercent and minutesOpen, "metrics" bucket for tracking other LLM confirmation metrics.
 */
export type BucketName = string;

const STATE_LOCAL_INSTANCE_METHOD_NAME_GET = "StateLocalInstance.getState";
const STATE_LOCAL_INSTANCE_METHOD_NAME_SET = "StateLocalInstance.setState";

const STATE_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "StatePersistInstance.waitForInit";
const STATE_PERSIST_INSTANCE_METHOD_NAME_GET = "StatePersistInstance.getState";
const STATE_PERSIST_INSTANCE_METHOD_NAME_SET = "StatePersistInstance.setState";

const STATE_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE = "StateBacktestAdapter.dispose";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_GET = "StateBacktestAdapter.getState";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_SET = "StateBacktestAdapter.setState";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "StateBacktestAdapter.useLocal";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "StateBacktestAdapter.usePersist";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "StateBacktestAdapter.useDummy";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER = "StateBacktestAdapter.useStateAdapter";
const STATE_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "StateBacktestAdapter.clear";

const STATE_LIVE_ADAPTER_METHOD_NAME_DISPOSE = "StateLiveAdapter.dispose";
const STATE_LIVE_ADAPTER_METHOD_NAME_GET = "StateLiveAdapter.getState";
const STATE_LIVE_ADAPTER_METHOD_NAME_SET = "StateLiveAdapter.setState";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "StateLiveAdapter.useLocal";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "StateLiveAdapter.usePersist";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "StateLiveAdapter.useDummy";
const STATE_LIVE_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER = "StateLiveAdapter.useStateAdapter";
const STATE_LIVE_ADAPTER_METHOD_NAME_CLEAR = "StateLiveAdapter.clear";

const STATE_METHOD_NAME_ENABLE = "State.enable";
const STATE_METHOD_NAME_DISABLE = "State.disable";
const STATE_METHOD_NAME_STATIC_GET = "State._getState";
const STATE_METHOD_NAME_STATIC_SET = "State._setState";
const STATE_METHOD_NAME_GET = "State.getState";
const STATE_METHOD_NAME_SET = "State.setState";

/**
 * Interface for state instance implementations.
 * Defines the contract for local, persist, and dummy backends.
 *
 * Intended use: per-signal mutable state for LLM-driven strategies that track
 * trade confirmation metrics across the position lifetime — e.g. peak unrealised PnL,
 * minutes since entry, and capitulation thresholds.
 *
 * Example shape:
 * ```ts
 * { peakPercent: number; minutesOpen: number }
 * ```
 * Profitable trades endure -0.5–2.5% drawdown yet still reach peak 2–3%+.
 * SL trades either never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Capitulation rule: if position open N minutes and peak < threshold (e.g. 0.3%) —
 * LLM thesis was not confirmed by market, exit immediately.
 */
export interface IStateInstance {
  /**
   * Initialize the state instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read the current state value.
   * Returns `initialValue` when the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current state value
   */
  getState<Value extends object = object>(when: Date): Promise<Value>;

  /**
   * Update the state value.
   * A write with a smaller `when` overwrites an existing record —
   * that lets a restarted backtest reset live-written state without breaking live.
   * The dispatch updater receives the look-ahead-guarded current value
   * (or `initialValue` when the stored `when` is in the future).
   * @param dispatch - New value or updater function receiving current value
   * @param when - Logical timestamp this value belongs to
   * @returns Updated state value
   */
  setState<Value extends object = object>(dispatch: Value | Dispatch<Value>, when: Date): Promise<Value>;

  /**
   * Releases any resources held by this instance.
   */
  dispose(): Promise<void>;
}

/**
 * Constructor type for state instance implementations.
 * Used for swapping backends via StateBacktestAdapter / StateLiveAdapter.
 */
export type TStateInstanceCtor = new (initialValue: object, signalId: string, bucketName: string) => IStateInstance;

/**
 * Public surface of StateBacktestAdapter / StateLiveAdapter — IStateInstance minus waitForInit and dispose.
 * waitForInit and dispose are managed internally by the adapter.
 */
type TStateAdapter = {
  [key in Exclude<keyof IStateInstance, "waitForInit" | "dispose">]: any;
}

/**
 * In-process state instance backed by a plain object reference.
 * All data lives in process memory only - no disk persistence.
 *
 * Features:
 * - Mutable in-memory state with functional dispatch support
 * - Scoped per (signalId, bucketName) pair
 *
 * Use for backtesting and unit tests where persistence between runs is not needed.
 * Tracks per-trade metrics such as peakPercent and minutesOpen to implement
 * the capitulation rule: exit when peak < threshold after N minutes open.
 */
export class StateLocalInstance implements IStateInstance {

  _value: object;
  _when: number = 0;

  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * Initializes _value from initialValue - local state needs no async setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    this._value = this.initialValue;
    this._when = 0;
  });

  /**
   * Read the current in-memory state value.
   * Returns `initialValue` when the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current state value
   */
  public async getState<Value extends object = object>(when: Date): Promise<Value> {
    swarm.loggerService.debug(STATE_LOCAL_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (this._when > when.getTime()) {
      return <Value>this.initialValue;
    }
    return <Value>this._value;
  }

  /**
   * Update the in-memory state value.
   * Records `when` so future reads with a smaller `when` see `initialValue`.
   * The dispatch updater receives the look-ahead-guarded current value.
   * @param dispatch - New value or updater function receiving current value
   * @param when - Logical timestamp this value belongs to
   * @returns Updated state value
   */
  public setState = queued(async <Value extends object = object>(dispatch: Value | Dispatch<Value>, when: Date): Promise<Value> => {
    swarm.loggerService.debug(STATE_LOCAL_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (typeof dispatch === "function") {
      const prev = this._when > when.getTime() ? <Value>this.initialValue : <Value>this._value;
      this._value = await dispatch(prev);
    } else {
      this._value = dispatch;
    }
    this._when = when.getTime();
    return <Value>this._value;
  });

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
  }
}

/**
 * No-op state instance that discards all writes.
 * Used for disabling state in tests or dry-run scenarios.
 *
 * Useful when replaying historical candles without needing to accumulate
 * peakPercent/minutesOpen — the capitulation rule is simply never triggered.
 */
export class StateDummyInstance implements IStateInstance {
  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * No-op read - always returns initialValue.
   * @returns initialValue
   */
  public async getState<Value extends object = object>(_when: Date): Promise<Value> {
    return <Value>this.initialValue;
  }

  /**
   * No-op write - discards the value and returns initialValue.
   * @returns initialValue
   */
  public async setState<Value extends object = object>(_dispatch: Value | Dispatch<Value>, _when: Date): Promise<Value> {
    return <Value>this.initialValue;
  }

  /** No-op. */
  public async dispose(): Promise<void> {
    void 0;
  }
}

/**
 * File-system backed state instance.
 * Data is persisted atomically to disk via PersistStateAdapter.
 * State is restored from disk on waitForInit.
 *
 * Features:
 * - Crash-safe atomic file writes
 * - Functional dispatch support
 * - Scoped per (signalId, bucketName) pair
 *
 * Use in live trading to survive process restarts mid-trade.
 * Preserves peakPercent and minutesOpen so the capitulation rule
 * (exit if peak < threshold after N minutes) continues correctly after a crash.
 */
export class StatePersistInstance implements IStateInstance {

  _value: object;
  _when: number = 0;

  constructor(
    readonly initialValue: object,
    readonly signalId: string,
    readonly bucketName: string,
  ) { }

  /**
   * Initialize persistence storage and restore state from disk.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      bucketName: this.bucketName,
      initial,
    });
    await PersistStateAdapter.waitForInit(this.signalId, this.bucketName, initial);
    const data = await PersistStateAdapter.readStateData(this.signalId, this.bucketName);
    if (data) {
      this._value = data.data;
      this._when = data.when;
      return;
    }
    this._value = this.initialValue;
    this._when = 0;
  });

  /**
   * Read the current persisted state value.
   * Returns `initialValue` when the stored `when` is greater than the requested `when`
   * (look-ahead bias protection).
   * @param when - Logical timestamp at which the read is happening
   * @returns Current state value
   */
  public async getState<Value extends object = object>(when: Date): Promise<Value> {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (this._when > when.getTime()) {
      return <Value>this.initialValue;
    }
    return <Value>this._value;
  }

  /**
   * Update state and persist to disk atomically.
   * A write with a smaller `when` overwrites an existing record — that lets a
   * restarted backtest reset live-written state without breaking live.
   * The dispatch updater receives the look-ahead-guarded current value.
   * @param dispatch - New value or updater function receiving current value
   * @param when - Logical timestamp this value belongs to
   * @returns Updated state value
   */
  public setState = queued(async <Value extends object = object>(dispatch: Value | Dispatch<Value>, when: Date): Promise<Value> => {
    swarm.loggerService.debug(STATE_PERSIST_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    if (typeof dispatch === "function") {
      const prev = this._when > when.getTime() ? <Value>this.initialValue : <Value>this._value;
      this._value = await dispatch(prev);
    } else {
      this._value = dispatch;
    }
    this._when = when.getTime();
    const id = CREATE_KEY_FN(this.signalId, this.bucketName);
    await PersistStateAdapter.writeStateData(
      { id, data: this._value, when: this._when },
      this.signalId,
      this.bucketName,
      when,
    );
    return <Value>this._value;
  })

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      bucketName: this.bucketName,
    });
    await PersistStateAdapter.dispose(this.signalId, this.bucketName);
  }
}

/**
 * Backtest state adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable state instance implementations
 * - Default backend: StateLocalInstance (in-memory, no disk persistence)
 * - Alternative backends: StatePersistInstance, StateDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useStateAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from StateAdapter
 *
 * Primary use case — LLM-driven capitulation rule:
 * Profitable trades endure -0.5–2.5% drawdown and still reach peak 2–3%+.
 * SL trades never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Rule: if position open >= N minutes and peakPercent < threshold (e.g. 0.3%),
 * the LLM thesis was not confirmed by market — exit immediately.
 * State tracks `{ peakPercent, minutesOpen }` per signal across onActivePing ticks.
 */
export class StateBacktestAdapter implements TStateAdapter {
  private StateFactory: TStateInstanceCtor = StateLocalInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: BucketName, initialValue: object): IStateInstance =>
      Reflect.construct(this.StateFactory, [initialValue, signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by StateAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Read the current state value for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current state value
   */
  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object, when: Date }): Promise<Value> => {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.getState(dto.when);
  };

  /**
   * Update the state value for a signal.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.when - Logical timestamp this value belongs to
   * @returns Updated state value
   */
  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object, when: Date }): Promise<Value> => {
    swarm.loggerService.debug(STATE_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.setState(dispatch, dto.when);
  };

  /**
   * Switches to in-memory adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.StateFactory = StateLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to disk via PersistStateAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.StateFactory = StatePersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.StateFactory = StateDummyInstance;
  };

  /**
   * Switches to a custom state adapter implementation.
   * @param Ctor - Constructor for the custom state instance
   */
  public useStateAdapter = (Ctor: TStateInstanceCtor): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER);
    this.StateFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(STATE_BACKTEST_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Live trading state adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable state instance implementations
 * - Default backend: StatePersistInstance (file-system backed, survives restarts)
 * - Alternative backends: StateLocalInstance, StateDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useStateAdapter()
 * - Memoized instances per (signalId, bucketName) pair; cleared via disposeSignal() from StateAdapter
 *
 * Primary use case — LLM-driven capitulation rule:
 * Profitable trades endure -0.5–2.5% drawdown and still reach peak 2–3%+.
 * SL trades never go positive (Feb25) or show peak < 0.15% (Feb08, Feb13).
 * Rule: if position open >= N minutes and peakPercent < threshold (e.g. 0.3%),
 * the LLM thesis was not confirmed by market — exit immediately.
 * State persists `{ peakPercent, minutesOpen }` per signal across process restarts.
 */
export class StateLiveAdapter implements TStateAdapter {
  private StateFactory: TStateInstanceCtor = StatePersistInstance;

  private getInstance = memoize(
    ([signalId, bucketName]) => CREATE_KEY_FN(signalId, bucketName),
    (signalId: string, bucketName: BucketName, initialValue: object): IStateInstance =>
      Reflect.construct(this.StateFactory, [initialValue, signalId, bucketName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by StateAdapter when a signal is cancelled or closed.
   * @param signalId - Signal identifier to dispose
   */
  public disposeSignal = (signalId: string): void => {
    const prefix = CREATE_KEY_FN(signalId, "");
    for (const key of this.getInstance.keys()) {
      if (key.startsWith(prefix)) {
        const instance = this.getInstance.get(key);
        instance && instance.dispose();
        this.getInstance.clear(key);
      }
    }
  };

  /**
   * Read the current state value for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current state value
   */
  public getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object, when: Date }): Promise<Value> => {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.getState(dto.when);
  };

  /**
   * Update the state value for a signal.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - Bucket name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.when - Logical timestamp this value belongs to
   * @returns Updated state value
   */
  public setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object, when: Date }): Promise<Value> => {
    swarm.loggerService.debug(STATE_LIVE_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
    });
    const key = CREATE_KEY_FN(dto.signalId, dto.bucketName);
    const isInitial = !this.getInstance.has(key);
    const instance = this.getInstance(dto.signalId, dto.bucketName, dto.initialValue);
    await instance.waitForInit(isInitial);
    return await instance.setState(dispatch, dto.when);
  };

  /**
   * Switches to in-memory adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.StateFactory = StateLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to disk via PersistStateAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.StateFactory = StatePersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.StateFactory = StateDummyInstance;
  };

  /**
   * Switches to a custom state adapter implementation.
   * @param Ctor - Constructor for the custom state instance
   */
  public useStateAdapter = (Ctor: TStateInstanceCtor): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_USE_STATE_ADAPTER);
    this.StateFactory = Ctor;
  };

  /**
   * Clears the memoized instance cache.
   * Call this when process.cwd() changes between strategy iterations
   * so new instances are created with the updated base path.
   */
  public clear = (): void => {
    swarm.loggerService.info(STATE_LIVE_ADAPTER_METHOD_NAME_CLEAR);
    this.getInstance.clear();
  };
}

/**
 * Per-signal mutable state scoped by state name.
 *
 * Works like a value bound to the CURRENT pending or scheduled signal:
 * `new State({ name: "trade", initialData: { peakPercent: 0 } }).setState(...)`
 * inside any strategy lifecycle callback. No context is passed through
 * arguments — every instance method resolves the signal, mode and timestamp
 * itself from `backtest.methodContextService` / `backtest.executionContextService`,
 * so the class is unavailable outside async_hooks lifecycle callbacks by design.
 *
 * `initialData` provides the default value when no state exists yet — a plain
 * object or a sync/async factory returning one. The factory receives an
 * {@link InitialDispatchContract} payload with the resolved signal context
 * (signal row, active/schedule type, currentPrice, mode, logical time), so the
 * initial state can be derived from the actual entry; it yields a fresh object
 * per access, so the default is never shared by reference.
 *
 * Look-ahead bias protection: a read at a `when` earlier than the stored `when`
 * yields `initialData`, and a write with a smaller `when` overwrites (a
 * restarted backtest resets live-written state).
 *
 * Requires an explicit `State.enable()` call before use — the subscription it
 * creates disposes per-signal instances when the signal is cancelled or
 * closed, preventing stale instances from accumulating.
 *
 * @example
 * ```typescript
 * State.enable();
 *
 * const state = new State({
 *   name: "trade",
 *   initialData: () => ({ peakPercent: 0, minutesOpen: 0 }),
 * });
 *
 * // inside a strategy callback:
 * await state.setState((prev) => ({
 *   peakPercent: Math.max(prev.peakPercent, currentPercent),
 *   minutesOpen: prev.minutesOpen + 1,
 * }));
 * const { peakPercent } = await state.getState();
 * ```
 */
export class State<Data extends object = object> {

  constructor(private readonly params: { name: BucketName; initialData: Data | InitialDataFn<Data> }) { }

  /**
   * Enables state storage by subscribing to signal lifecycle events.
   * Clears memoized instances in StateBacktest and StateLive when a signal
   * is cancelled or closed, preventing stale instances from accumulating.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public static enable = singleshot(() => {
    swarm.loggerService.info(STATE_METHOD_NAME_ENABLE);

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => {
        StateBacktest.disposeSignal(signal.id);
        StateLive.disposeSignal(signal.id);
      });

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => {
        StateBacktest.disposeSignal(signal.id);
        StateLive.disposeSignal(signal.id);
      });

    return compose(
      () => unCancel(),
      () => unClose(),
      () => State.enable.clear(),
    );
  });

  /**
   * Disables state storage by unsubscribing from signal lifecycle events.
   * Safe to call multiple times.
   */
  public static disable = () => {
    swarm.loggerService.info(STATE_METHOD_NAME_DISABLE);
    if (State.enable.hasValue()) {
      const lastSubscription = State.enable();
      lastSubscription();
    }
  };

  /**
   * Context-free read of the current state value for a signal.
   * Routes to StateBacktest or StateLive based on dto.backtest.
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - State name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Current state value
   * @throws Error if State is not enabled
   */
  public static _getState = async <Value extends object = object>(dto: { signalId: string, bucketName: BucketName, initialValue: object, backtest: boolean, when: Date }): Promise<Value> => {
    if (!State.enable.hasValue()) {
      throw new Error("State is not enabled. Call State.enable() first.");
    }
    swarm.loggerService.debug(STATE_METHOD_NAME_STATIC_GET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await StateBacktest.getState<Value>(dto);
    }
    return await StateLive.getState<Value>(dto);
  };

  /**
   * Context-free update of the state value for a signal.
   * Routes to StateBacktest or StateLive based on dto.backtest.
   * @param dispatch - New value or updater function receiving current value
   * @param dto.signalId - Signal identifier
   * @param dto.bucketName - State name
   * @param dto.initialValue - Default value when no persisted state exists
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp this value belongs to
   * @returns Updated state value
   * @throws Error if State is not enabled
   */
  public static _setState = async <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string, bucketName: BucketName, initialValue: object, backtest: boolean, when: Date }): Promise<Value> => {
    if (!State.enable.hasValue()) {
      throw new Error("State is not enabled. Call State.enable() first.");
    }
    swarm.loggerService.debug(STATE_METHOD_NAME_STATIC_SET, {
      signalId: dto.signalId,
      bucketName: dto.bucketName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await StateBacktest.setState<Value>(dispatch, dto);
    }
    return await StateLive.setState<Value>(dispatch, dto);
  };

  /**
   * Read the current state value for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Current state value (initialData when nothing was written yet)
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public getState = async (): Promise<Data> => {
    swarm.loggerService.info(STATE_METHOD_NAME_GET, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("State.getState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("State.getState requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    const pendingSignal: IPublicSignalRow = await swarm.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    );
    if (pendingSignal) {
      const initialValue = typeof this.params.initialData === "function"
        ? await (<InitialDataFn<Data>>this.params.initialData)({
            type: "active",
            signal: pendingSignal,
            symbol,
            strategyName,
            exchangeName,
            frameName,
            currentPrice,
            backtest: isBacktest,
            timestamp: when.getTime(),
            when,
          })
        : this.params.initialData;
      return await State._getState<Data>({
        signalId: pendingSignal.id,
        bucketName: this.params.name,
        initialValue,
        backtest: isBacktest,
        when,
      });
    }
    const scheduledSignal: IScheduledSignalRow = await swarm.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    );
    if (scheduledSignal) {
      const initialValue = typeof this.params.initialData === "function"
        ? await (<InitialDataFn<Data>>this.params.initialData)({
            type: "schedule",
            signal: scheduledSignal,
            symbol,
            strategyName,
            exchangeName,
            frameName,
            currentPrice,
            backtest: isBacktest,
            timestamp: when.getTime(),
            when,
          })
        : this.params.initialData;
      return await State._getState<Data>({
        signalId: scheduledSignal.id,
        bucketName: this.params.name,
        initialValue,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `State.getState requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Update the state value for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @param dispatch - New value or updater function receiving current value
   * @returns Updated state value
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public setState = async (dispatch: Data | Dispatch<Data>): Promise<Data> => {
    swarm.loggerService.info(STATE_METHOD_NAME_SET, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("State.setState requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("State.setState requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    const pendingSignal: IPublicSignalRow = await swarm.strategyCoreService.getPendingSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    );
    if (pendingSignal) {
      const initialValue = typeof this.params.initialData === "function"
        ? await (<InitialDataFn<Data>>this.params.initialData)({
            type: "active",
            signal: pendingSignal,
            symbol,
            strategyName,
            exchangeName,
            frameName,
            currentPrice,
            backtest: isBacktest,
            timestamp: when.getTime(),
            when,
          })
        : this.params.initialData;
      return await State._setState<Data>(dispatch, {
        signalId: pendingSignal.id,
        bucketName: this.params.name,
        initialValue,
        backtest: isBacktest,
        when,
      });
    }
    const scheduledSignal: IScheduledSignalRow = await swarm.strategyCoreService.getScheduledSignal(
      isBacktest,
      symbol,
      currentPrice,
      { exchangeName, frameName, strategyName },
    );
    if (scheduledSignal) {
      const initialValue = typeof this.params.initialData === "function"
        ? await (<InitialDataFn<Data>>this.params.initialData)({
            type: "schedule",
            signal: scheduledSignal,
            symbol,
            strategyName,
            exchangeName,
            frameName,
            currentPrice,
            backtest: isBacktest,
            timestamp: when.getTime(),
            when,
          })
        : this.params.initialData;
      return await State._setState<Data>(dispatch, {
        signalId: scheduledSignal.id,
        bucketName: this.params.name,
        initialValue,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `State.setState requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };
}

/**
 * Global singleton instance of StateLiveAdapter.
 * Provides live trading state storage with pluggable backends.
 */
export const StateLive = new StateLiveAdapter();

/**
 * Global singleton instance of StateBacktestAdapter.
 * Provides backtest state storage with pluggable backends.
 */
export const StateBacktest = new StateBacktestAdapter();
