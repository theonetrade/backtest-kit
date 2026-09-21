import { compose, memoize, queued, singleshot } from "functools-kit";
import { signalEmitter } from "../config/emitters";
import { PersistDictionaryAdapter } from "./Persist";
import {
  IPublicSignalRow,
  IScheduledSignalRow,
} from "../interfaces/Strategy.interface";
import swarm, { ExecutionContextService, MethodContextService } from "../lib";

const CREATE_KEY_FN = (signalId: string, dictionaryName: string) =>
  `${signalId}_${dictionaryName}`;

/**
 * Logical name of a dictionary, e.g. "llm" or "levels".
 * Used to scope dictionary entries for different purposes within the same signal —
 * the name becomes the persisted file name (like `name` in Cache.file).
 */
export type DictionaryName = string;

/**
 * Single dictionary entry with the logical timestamp it was written at.
 * The `when` stamp powers the look-ahead bias guard: an entry written in the
 * future (relative to the reading tick) is invisible.
 */
interface IDictionaryEntry {
  /** Stored value */
  value: unknown;
  /** Logical timestamp (ms) this value was written at */
  when: number;
}

const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_GET = "DictionaryLocalInstance.get";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_SET = "DictionaryLocalInstance.set";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_HAS = "DictionaryLocalInstance.has";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_DELETE = "DictionaryLocalInstance.delete";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_CLEAR = "DictionaryLocalInstance.clear";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_KEYS = "DictionaryLocalInstance.keys";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_VALUES = "DictionaryLocalInstance.values";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_ENTRIES = "DictionaryLocalInstance.entries";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_SIZE = "DictionaryLocalInstance.size";
const DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_DISPOSE = "DictionaryLocalInstance.dispose";

const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT = "DictionaryPersistInstance.waitForInit";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_GET = "DictionaryPersistInstance.get";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_SET = "DictionaryPersistInstance.set";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_HAS = "DictionaryPersistInstance.has";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_DELETE = "DictionaryPersistInstance.delete";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_CLEAR = "DictionaryPersistInstance.clear";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_KEYS = "DictionaryPersistInstance.keys";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_VALUES = "DictionaryPersistInstance.values";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_ENTRIES = "DictionaryPersistInstance.entries";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_SIZE = "DictionaryPersistInstance.size";
const DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_DISPOSE = "DictionaryPersistInstance.dispose";

const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_GET = "DictionaryBacktestAdapter.get";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_SET = "DictionaryBacktestAdapter.set";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_HAS = "DictionaryBacktestAdapter.has";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_DELETE = "DictionaryBacktestAdapter.delete";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_CLEAR = "DictionaryBacktestAdapter.clear";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_KEYS = "DictionaryBacktestAdapter.keys";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_VALUES = "DictionaryBacktestAdapter.values";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_ENTRIES = "DictionaryBacktestAdapter.entries";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_SIZE = "DictionaryBacktestAdapter.size";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL = "DictionaryBacktestAdapter.useLocal";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST = "DictionaryBacktestAdapter.usePersist";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY = "DictionaryBacktestAdapter.useDummy";
const DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_DICTIONARY_ADAPTER = "DictionaryBacktestAdapter.useDictionaryAdapter";

const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_GET = "DictionaryLiveAdapter.get";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_SET = "DictionaryLiveAdapter.set";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_HAS = "DictionaryLiveAdapter.has";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_DELETE = "DictionaryLiveAdapter.delete";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_CLEAR = "DictionaryLiveAdapter.clear";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_KEYS = "DictionaryLiveAdapter.keys";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_VALUES = "DictionaryLiveAdapter.values";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_ENTRIES = "DictionaryLiveAdapter.entries";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_SIZE = "DictionaryLiveAdapter.size";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL = "DictionaryLiveAdapter.useLocal";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST = "DictionaryLiveAdapter.usePersist";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY = "DictionaryLiveAdapter.useDummy";
const DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_DICTIONARY_ADAPTER = "DictionaryLiveAdapter.useDictionaryAdapter";

const DICTIONARY_METHOD_NAME_ENABLE = "Dictionary.enable";
const DICTIONARY_METHOD_NAME_DISABLE = "Dictionary.disable";
const DICTIONARY_METHOD_NAME_STATIC_GET = "Dictionary._get";
const DICTIONARY_METHOD_NAME_STATIC_SET = "Dictionary._set";
const DICTIONARY_METHOD_NAME_STATIC_HAS = "Dictionary._has";
const DICTIONARY_METHOD_NAME_STATIC_DELETE = "Dictionary._delete";
const DICTIONARY_METHOD_NAME_STATIC_CLEAR = "Dictionary._clear";
const DICTIONARY_METHOD_NAME_STATIC_KEYS = "Dictionary._keys";
const DICTIONARY_METHOD_NAME_STATIC_VALUES = "Dictionary._values";
const DICTIONARY_METHOD_NAME_STATIC_ENTRIES = "Dictionary._entries";
const DICTIONARY_METHOD_NAME_STATIC_SIZE = "Dictionary._size";
const DICTIONARY_METHOD_NAME_GET = "Dictionary.get";
const DICTIONARY_METHOD_NAME_SET = "Dictionary.set";
const DICTIONARY_METHOD_NAME_HAS = "Dictionary.has";
const DICTIONARY_METHOD_NAME_DELETE = "Dictionary.delete";
const DICTIONARY_METHOD_NAME_CLEAR = "Dictionary.clear";
const DICTIONARY_METHOD_NAME_KEYS = "Dictionary.keys";
const DICTIONARY_METHOD_NAME_VALUES = "Dictionary.values";
const DICTIONARY_METHOD_NAME_ENTRIES = "Dictionary.entries";
const DICTIONARY_METHOD_NAME_SIZE = "Dictionary.size";

/**
 * Interface for dictionary instance implementations.
 * Defines the contract for local, persist, and dummy backends.
 *
 * Intended use: per-signal Map-like storage for strategy callbacks — e.g.
 * caching LLM annotations, per-level flags, or any keyed data tied to the
 * lifetime of one signal.
 *
 * Every operation receives the logical `when` timestamp for look-ahead bias
 * protection: an entry whose stored `when` is greater than the requested `when`
 * is invisible (get returns null, has returns false, keys/values/entries/size
 * skip it). A write with a smaller `when` overwrites an existing record —
 * that lets a restarted backtest reset live-written entries.
 */
export interface IDictionaryInstance {
  /**
   * Initialize the dictionary instance.
   * @param initial - Whether this is the first initialization
   */
  waitForInit(initial: boolean): Promise<void>;

  /**
   * Read the value stored under `key`.
   * Returns null when the entry is missing or its stored `when` is greater
   * than the requested `when` (look-ahead bias protection).
   * @param key - Entry key
   * @param when - Logical timestamp at which the read is happening
   * @returns Stored value, or null
   */
  get<Value = unknown>(key: string, when: Date): Promise<Value | null>;

  /**
   * Write `value` under `key`, stamping it with `when`.
   * A write with a smaller `when` overwrites an existing record.
   * @param key - Entry key
   * @param value - Value to store
   * @param when - Logical timestamp this value belongs to
   */
  set<Value = unknown>(key: string, value: Value, when: Date): Promise<void>;

  /**
   * Check whether a visible entry exists under `key`.
   * An entry with a stored `when` greater than the requested `when` counts as absent.
   * @param key - Entry key
   * @param when - Logical timestamp at which the check is happening
   * @returns true if a visible entry exists
   */
  has(key: string, when: Date): Promise<boolean>;

  /**
   * Remove the entry under `key` (hard delete, regardless of its `when`).
   * @param key - Entry key
   * @param when - Logical timestamp at which the delete is happening
   * @returns true if an entry existed and was removed
   */
  delete(key: string, when: Date): Promise<boolean>;

  /**
   * Remove all entries (hard delete).
   * @param when - Logical timestamp at which the clear is happening
   */
  clear(when: Date): Promise<void>;

  /**
   * List keys of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of keys
   */
  keys(when: Date): Promise<string[]>;

  /**
   * List values of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of values
   */
  values<Value = unknown>(when: Date): Promise<Value[]>;

  /**
   * List [key, value] pairs of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of [key, value] tuples
   */
  entries<Value = unknown>(when: Date): Promise<[string, Value][]>;

  /**
   * Count visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Number of visible entries
   */
  size(when: Date): Promise<number>;

  /**
   * Releases any resources held by this instance.
   */
  dispose(): Promise<void>;
}

/**
 * Constructor type for dictionary instance implementations.
 * Used for swapping backends via DictionaryBacktestAdapter / DictionaryLiveAdapter.
 */
export type TDictionaryInstanceCtor = new (signalId: string, dictionaryName: string) => IDictionaryInstance;

/**
 * Public surface of DictionaryBacktestAdapter / DictionaryLiveAdapter — IDictionaryInstance minus waitForInit and dispose.
 * waitForInit and dispose are managed internally by the adapter.
 */
type TDictionaryAdapter = {
  [key in Exclude<keyof IDictionaryInstance, "waitForInit" | "dispose">]: any;
};

/**
 * In-process dictionary instance backed by a plain Map.
 * All data lives in process memory only - no disk persistence.
 *
 * Features:
 * - Mutable in-memory Map with per-entry `when` stamps
 * - Scoped per (signalId, dictionaryName) pair
 *
 * Use for backtesting and unit tests where persistence between runs is not needed.
 */
export class DictionaryLocalInstance implements IDictionaryInstance {
  _map = new Map<string, IDictionaryEntry>();

  constructor(
    readonly signalId: string,
    readonly dictionaryName: string,
  ) { }

  /**
   * Initializes _map to an empty Map - local dictionary needs no async setup.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    this._map = new Map();
  });

  /**
   * Read the value stored under `key`.
   * Returns null when the entry is missing or its stored `when` is greater
   * than the requested `when` (look-ahead bias protection).
   * @param key - Entry key
   * @param when - Logical timestamp at which the read is happening
   * @returns Stored value, or null
   */
  public async get<Value = unknown>(key: string, when: Date): Promise<Value | null> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    const entry = this._map.get(key);
    if (!entry) {
      return null;
    }
    if (entry.when > when.getTime()) {
      return null;
    }
    return <Value>entry.value;
  }

  /**
   * Write `value` under `key`, stamping it with `when`.
   * A write with a smaller `when` overwrites an existing record —
   * that lets a restarted backtest reset live-written entries.
   * @param key - Entry key
   * @param value - Value to store
   * @param when - Logical timestamp this value belongs to
   */
  public set = queued(async <Value = unknown>(key: string, value: Value, when: Date): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    this._map.set(key, { value, when: when.getTime() });
  }) as <Value = unknown>(key: string, value: Value, when: Date) => Promise<void>;

  /**
   * Check whether a visible entry exists under `key`.
   * An entry with a stored `when` greater than the requested `when` counts as absent.
   * @param key - Entry key
   * @param when - Logical timestamp at which the check is happening
   * @returns true if a visible entry exists
   */
  public async has(key: string, when: Date): Promise<boolean> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_HAS, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    const entry = this._map.get(key);
    if (!entry) {
      return false;
    }
    if (entry.when > when.getTime()) {
      return false;
    }
    return true;
  }

  /**
   * Remove the entry under `key` (hard delete, regardless of its `when`).
   * @param key - Entry key
   * @param when - Logical timestamp at which the delete is happening
   * @returns true if an entry existed and was removed
   */
  public delete = queued(async (key: string, _when: Date): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_DELETE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    return this._map.delete(key);
  }) as (key: string, when: Date) => Promise<boolean>;

  /**
   * Remove all entries (hard delete).
   * @param when - Logical timestamp at which the clear is happening
   */
  public clear = queued(async (_when: Date): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_CLEAR, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    this._map.clear();
  }) as (when: Date) => Promise<void>;

  /**
   * List keys of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of keys
   */
  public async keys(when: Date): Promise<string[]> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_KEYS, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: string[] = [];
    for (const [key, entry] of this._map.entries()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push(key);
    }
    return result;
  }

  /**
   * List values of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of values
   */
  public async values<Value = unknown>(when: Date): Promise<Value[]> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_VALUES, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: Value[] = [];
    for (const entry of this._map.values()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push(<Value>entry.value);
    }
    return result;
  }

  /**
   * List [key, value] pairs of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of [key, value] tuples
   */
  public async entries<Value = unknown>(when: Date): Promise<[string, Value][]> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_ENTRIES, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: [string, Value][] = [];
    for (const [key, entry] of this._map.entries()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push([key, <Value>entry.value]);
    }
    return result;
  }

  /**
   * Count visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Number of visible entries
   */
  public async size(when: Date): Promise<number> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_SIZE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    let result = 0;
    for (const entry of this._map.values()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result += 1;
    }
    return result;
  }

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(DICTIONARY_LOCAL_INSTANCE_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
  }
}

/**
 * No-op dictionary instance that discards all writes.
 * Used for disabling dictionary storage in tests or dry-run scenarios.
 *
 * Useful when replaying historical candles without needing per-signal
 * keyed storage — get always returns null, has always returns false.
 */
export class DictionaryDummyInstance implements IDictionaryInstance {
  constructor(
    readonly signalId: string,
    readonly dictionaryName: string,
  ) { }

  /**
   * No-op initialization.
   * @returns Promise that resolves immediately
   */
  public waitForInit = singleshot(async (_initial: boolean) => {
    void 0;
  });

  /**
   * No-op read - always returns null.
   * @returns null
   */
  public async get<Value = unknown>(_key: string, _when: Date): Promise<Value | null> {
    return null;
  }

  /**
   * No-op write - discards the value.
   */
  public async set<Value = unknown>(_key: string, _value: Value, _when: Date): Promise<void> {
    void 0;
  }

  /**
   * No-op check - always returns false.
   * @returns false
   */
  public async has(_key: string, _when: Date): Promise<boolean> {
    return false;
  }

  /**
   * No-op delete - always returns false.
   * @returns false
   */
  public async delete(_key: string, _when: Date): Promise<boolean> {
    return false;
  }

  /**
   * No-op clear.
   */
  public async clear(_when: Date): Promise<void> {
    void 0;
  }

  /**
   * No-op read - always returns an empty array.
   * @returns Empty array
   */
  public async keys(_when: Date): Promise<string[]> {
    return [];
  }

  /**
   * No-op read - always returns an empty array.
   * @returns Empty array
   */
  public async values<Value = unknown>(_when: Date): Promise<Value[]> {
    return [];
  }

  /**
   * No-op read - always returns an empty array.
   * @returns Empty array
   */
  public async entries<Value = unknown>(_when: Date): Promise<[string, Value][]> {
    return [];
  }

  /**
   * No-op read - always returns zero.
   * @returns 0
   */
  public async size(_when: Date): Promise<number> {
    return 0;
  }

  /** No-op. */
  public async dispose(): Promise<void> {
    void 0;
  }
}

/**
 * File-system backed dictionary instance.
 * Data is persisted atomically to disk via PersistDictionaryAdapter.
 * The dictionary is restored from disk on waitForInit.
 *
 * Features:
 * - Crash-safe atomic file writes (whole-dictionary snapshot per mutation)
 * - Per-entry `when` stamps survive restarts
 * - Scoped per (signalId, dictionaryName) pair
 *
 * Use in live trading to survive process restarts mid-trade.
 */
export class DictionaryPersistInstance implements IDictionaryInstance {
  _map = new Map<string, IDictionaryEntry>();

  constructor(
    readonly signalId: string,
    readonly dictionaryName: string,
  ) { }

  /**
   * Initialize persistence storage and restore the dictionary from disk.
   * @param initial - Whether this is the first initialization
   */
  public waitForInit = singleshot(async (initial: boolean) => {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_WAIT_FOR_INIT, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      initial,
    });
    await PersistDictionaryAdapter.waitForInit(this.signalId, this.dictionaryName, initial);
    const data = await PersistDictionaryAdapter.readDictionaryData(this.signalId, this.dictionaryName);
    if (data) {
      this._map = new Map(Object.entries(data.data));
      return;
    }
    this._map = new Map();
  });

  /**
   * Read the value stored under `key`.
   * Returns null when the entry is missing or its stored `when` is greater
   * than the requested `when` (look-ahead bias protection).
   * @param key - Entry key
   * @param when - Logical timestamp at which the read is happening
   * @returns Stored value, or null
   */
  public async get<Value = unknown>(key: string, when: Date): Promise<Value | null> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_GET, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    const entry = this._map.get(key);
    if (!entry) {
      return null;
    }
    if (entry.when > when.getTime()) {
      return null;
    }
    return <Value>entry.value;
  }

  /**
   * Write `value` under `key` and persist the whole snapshot to disk atomically.
   * A write with a smaller `when` overwrites an existing record —
   * that lets a restarted backtest reset live-written entries.
   * @param key - Entry key
   * @param value - Value to store
   * @param when - Logical timestamp this value belongs to
   */
  public set = queued(async <Value = unknown>(key: string, value: Value, when: Date): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_SET, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    this._map.set(key, { value, when: when.getTime() });
    const id = CREATE_KEY_FN(this.signalId, this.dictionaryName);
    await PersistDictionaryAdapter.writeDictionaryData(
      { id, data: Object.fromEntries(this._map), when: when.getTime() },
      this.signalId,
      this.dictionaryName,
      when,
    );
  }) as <Value = unknown>(key: string, value: Value, when: Date) => Promise<void>;

  /**
   * Check whether a visible entry exists under `key`.
   * An entry with a stored `when` greater than the requested `when` counts as absent.
   * @param key - Entry key
   * @param when - Logical timestamp at which the check is happening
   * @returns true if a visible entry exists
   */
  public async has(key: string, when: Date): Promise<boolean> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_HAS, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    const entry = this._map.get(key);
    if (!entry) {
      return false;
    }
    if (entry.when > when.getTime()) {
      return false;
    }
    return true;
  }

  /**
   * Remove the entry under `key` (hard delete) and persist the snapshot.
   * @param key - Entry key
   * @param when - Logical timestamp at which the delete is happening
   * @returns true if an entry existed and was removed
   */
  public delete = queued(async (key: string, when: Date): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_DELETE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
      key,
    });
    const removed = this._map.delete(key);
    const id = CREATE_KEY_FN(this.signalId, this.dictionaryName);
    await PersistDictionaryAdapter.writeDictionaryData(
      { id, data: Object.fromEntries(this._map), when: when.getTime() },
      this.signalId,
      this.dictionaryName,
      when,
    );
    return removed;
  }) as (key: string, when: Date) => Promise<boolean>;

  /**
   * Remove all entries (hard delete) and persist the empty snapshot.
   * @param when - Logical timestamp at which the clear is happening
   */
  public clear = queued(async (when: Date): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_CLEAR, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    this._map.clear();
    const id = CREATE_KEY_FN(this.signalId, this.dictionaryName);
    await PersistDictionaryAdapter.writeDictionaryData(
      { id, data: Object.fromEntries(this._map), when: when.getTime() },
      this.signalId,
      this.dictionaryName,
      when,
    );
  }) as (when: Date) => Promise<void>;

  /**
   * List keys of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of keys
   */
  public async keys(when: Date): Promise<string[]> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_KEYS, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: string[] = [];
    for (const [key, entry] of this._map.entries()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push(key);
    }
    return result;
  }

  /**
   * List values of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of values
   */
  public async values<Value = unknown>(when: Date): Promise<Value[]> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_VALUES, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: Value[] = [];
    for (const entry of this._map.values()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push(<Value>entry.value);
    }
    return result;
  }

  /**
   * List [key, value] pairs of visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Array of [key, value] tuples
   */
  public async entries<Value = unknown>(when: Date): Promise<[string, Value][]> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_ENTRIES, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    const result: [string, Value][] = [];
    for (const [key, entry] of this._map.entries()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result.push([key, <Value>entry.value]);
    }
    return result;
  }

  /**
   * Count visible entries (look-ahead-guarded).
   * @param when - Logical timestamp at which the read is happening
   * @returns Number of visible entries
   */
  public async size(when: Date): Promise<number> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_SIZE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    let result = 0;
    for (const entry of this._map.values()) {
      if (entry.when > when.getTime()) {
        continue;
      }
      result += 1;
    }
    return result;
  }

  /** Releases resources held by this instance. */
  public async dispose(): Promise<void> {
    swarm.loggerService.debug(DICTIONARY_PERSIST_INSTANCE_METHOD_NAME_DISPOSE, {
      signalId: this.signalId,
      dictionaryName: this.dictionaryName,
    });
    PersistDictionaryAdapter.dispose(this.signalId, this.dictionaryName);
  }
}

/**
 * Backtest dictionary adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable dictionary instance implementations
 * - Default backend: DictionaryLocalInstance (in-memory, no disk persistence)
 * - Alternative backends: DictionaryPersistInstance, DictionaryDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useDictionaryAdapter()
 * - Memoized instances per (signalId, dictionaryName) pair; cleared via disposeSignal() from Dictionary.enable
 */
export class DictionaryBacktestAdapter implements TDictionaryAdapter {
  private DictionaryFactory: TDictionaryInstanceCtor = DictionaryLocalInstance;

  private getInstance = memoize(
    ([signalId, dictionaryName]) => CREATE_KEY_FN(signalId, dictionaryName),
    (signalId: string, dictionaryName: DictionaryName): IDictionaryInstance =>
      Reflect.construct(this.DictionaryFactory, [signalId, dictionaryName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by Dictionary.enable subscription when a signal is cancelled or closed.
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
   * Read the value stored under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @param key - Entry key
   * @returns Stored value, or null
   */
  public get = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<Value | null> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.get<Value>(key, dto.when);
  };

  /**
   * Write `value` under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp this value belongs to
   * @param key - Entry key
   * @param value - Value to store
   */
  public set = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string, value: Value): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.set<Value>(key, value, dto.when);
  };

  /**
   * Check whether a visible entry exists under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the check is happening (look-ahead guard)
   * @param key - Entry key
   * @returns true if a visible entry exists
   */
  public has = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_HAS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.has(key, dto.when);
  };

  /**
   * Remove the entry under `key` for a signal (hard delete).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the delete is happening
   * @param key - Entry key
   * @returns true if an entry existed and was removed
   */
  public delete = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_DELETE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.delete(key, dto.when);
  };

  /**
   * Remove all entries for a signal (hard delete).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the clear is happening
   */
  public clear = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_CLEAR, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.clear(dto.when);
  };

  /**
   * List keys of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of keys
   */
  public keys = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<string[]> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_KEYS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.keys(dto.when);
  };

  /**
   * List values of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of values
   */
  public values = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<Value[]> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_VALUES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.values<Value>(dto.when);
  };

  /**
   * List [key, value] pairs of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of [key, value] tuples
   */
  public entries = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<[string, Value][]> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_ENTRIES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.entries<Value>(dto.when);
  };

  /**
   * Count visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Number of visible entries
   */
  public size = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<number> => {
    swarm.loggerService.debug(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_SIZE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.size(dto.when);
  };

  /**
   * Switches to in-memory adapter (default).
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.DictionaryFactory = DictionaryLocalInstance;
  };

  /**
   * Switches to file-system backed adapter.
   * Data is persisted to disk via PersistDictionaryAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.DictionaryFactory = DictionaryPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.DictionaryFactory = DictionaryDummyInstance;
  };

  /**
   * Switches to a custom dictionary adapter implementation.
   * @param Ctor - Constructor for the custom dictionary instance
   */
  public useDictionaryAdapter = (Ctor: TDictionaryInstanceCtor): void => {
    swarm.loggerService.info(DICTIONARY_BACKTEST_ADAPTER_METHOD_NAME_USE_DICTIONARY_ADAPTER);
    this.DictionaryFactory = Ctor;
  };
}

/**
 * Live trading dictionary adapter with pluggable storage backend.
 *
 * Features:
 * - Adapter pattern for swappable dictionary instance implementations
 * - Default backend: DictionaryPersistInstance (file-system backed, survives restarts)
 * - Alternative backends: DictionaryLocalInstance, DictionaryDummyInstance
 * - Convenience methods: useLocal(), usePersist(), useDummy(), useDictionaryAdapter()
 * - Memoized instances per (signalId, dictionaryName) pair; cleared via disposeSignal() from Dictionary.enable
 */
export class DictionaryLiveAdapter implements TDictionaryAdapter {
  private DictionaryFactory: TDictionaryInstanceCtor = DictionaryPersistInstance;

  private getInstance = memoize(
    ([signalId, dictionaryName]) => CREATE_KEY_FN(signalId, dictionaryName),
    (signalId: string, dictionaryName: DictionaryName): IDictionaryInstance =>
      Reflect.construct(this.DictionaryFactory, [signalId, dictionaryName]),
  );

  /**
   * Disposes all memoized instances for the given signalId.
   * Called by Dictionary.enable subscription when a signal is cancelled or closed.
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
   * Read the value stored under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @param key - Entry key
   * @returns Stored value, or null
   */
  public get = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<Value | null> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_GET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.get<Value>(key, dto.when);
  };

  /**
   * Write `value` under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp this value belongs to
   * @param key - Entry key
   * @param value - Value to store
   */
  public set = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string, value: Value): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_SET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.set<Value>(key, value, dto.when);
  };

  /**
   * Check whether a visible entry exists under `key` for a signal.
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the check is happening (look-ahead guard)
   * @param key - Entry key
   * @returns true if a visible entry exists
   */
  public has = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_HAS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.has(key, dto.when);
  };

  /**
   * Remove the entry under `key` for a signal (hard delete).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the delete is happening
   * @param key - Entry key
   * @returns true if an entry existed and was removed
   */
  public delete = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }, key: string): Promise<boolean> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_DELETE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      key,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.delete(key, dto.when);
  };

  /**
   * Remove all entries for a signal (hard delete).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the clear is happening
   */
  public clear = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<void> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_CLEAR, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.clear(dto.when);
  };

  /**
   * List keys of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of keys
   */
  public keys = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<string[]> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_KEYS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.keys(dto.when);
  };

  /**
   * List values of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of values
   */
  public values = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<Value[]> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_VALUES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.values<Value>(dto.when);
  };

  /**
   * List [key, value] pairs of visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of [key, value] tuples
   */
  public entries = async <Value = unknown>(dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<[string, Value][]> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_ENTRIES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.entries<Value>(dto.when);
  };

  /**
   * Count visible entries for a signal (look-ahead-guarded).
   * @param dto.signalId - Signal identifier
   * @param dto.dictionaryName - Dictionary name
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Number of visible entries
   */
  public size = async (dto: { signalId: string, dictionaryName: DictionaryName, when: Date }): Promise<number> => {
    swarm.loggerService.debug(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_SIZE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
    });
    const mapKey = CREATE_KEY_FN(dto.signalId, dto.dictionaryName);
    const isInitial = !this.getInstance.has(mapKey);
    const instance = this.getInstance(dto.signalId, dto.dictionaryName);
    await instance.waitForInit(isInitial);
    return await instance.size(dto.when);
  };

  /**
   * Switches to in-memory adapter.
   * All data lives in process memory only.
   */
  public useLocal = (): void => {
    swarm.loggerService.info(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_LOCAL);
    this.DictionaryFactory = DictionaryLocalInstance;
  };

  /**
   * Switches to file-system backed adapter (default).
   * Data is persisted to disk via PersistDictionaryAdapter.
   */
  public usePersist = (): void => {
    swarm.loggerService.info(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_PERSIST);
    this.DictionaryFactory = DictionaryPersistInstance;
  };

  /**
   * Switches to dummy adapter that discards all writes.
   */
  public useDummy = (): void => {
    swarm.loggerService.info(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_DUMMY);
    this.DictionaryFactory = DictionaryDummyInstance;
  };

  /**
   * Switches to a custom dictionary adapter implementation.
   * @param Ctor - Constructor for the custom dictionary instance
   */
  public useDictionaryAdapter = (Ctor: TDictionaryInstanceCtor): void => {
    swarm.loggerService.info(DICTIONARY_LIVE_ADAPTER_METHOD_NAME_USE_DICTIONARY_ADAPTER);
    this.DictionaryFactory = Ctor;
  };
}

/**
 * Per-signal Map-like storage scoped by dictionary name.
 *
 * Works like `new Map()` but the entries are bound to the CURRENT pending or
 * scheduled signal: `new Dictionary({ name: "llm" }).set("key", value)` inside
 * any strategy lifecycle callback. Unlike State, no context is passed through
 * arguments — every instance method resolves the signal, mode and timestamp
 * itself from `backtest.methodContextService` / `backtest.executionContextService`,
 * so the class is unavailable outside async_hooks lifecycle callbacks by design.
 *
 * Look-ahead bias protection: every entry is stamped with the logical `when` it
 * was written at; a read happening at an earlier `when` does not see it, and a
 * write with a smaller `when` overwrites (a restarted backtest resets
 * live-written entries).
 *
 * Requires an explicit `Dictionary.enable()` call before use — the subscription
 * it creates disposes per-signal instances when the signal is cancelled or
 * closed, preventing stale instances from accumulating.
 *
 * @example
 * ```typescript
 * Dictionary.enable();
 *
 * const dictionary = new Dictionary<{ note: string }>({ name: "llm" });
 *
 * // inside a strategy callback:
 * await dictionary.set("thesis", { note: "breakout confirmed" });
 * const thesis = await dictionary.get("thesis");
 * ```
 */
export class Dictionary<Value = unknown> {

  constructor(private readonly params: { name: DictionaryName }) { }

  /**
   * Enables dictionary storage by subscribing to signal lifecycle events.
   * Clears memoized instances in DictionaryBacktest and DictionaryLive when a
   * signal is cancelled or closed, preventing stale instances from accumulating.
   * Uses singleshot to ensure one-time subscription.
   *
   * @returns Cleanup function that unsubscribes from all emitters
   */
  public static enable = singleshot(() => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_ENABLE);

    const unCancel = signalEmitter
      .filter(({ action }) => action === "cancelled")
      .connect(({ signal }) => {
        DictionaryBacktest.disposeSignal(signal.id);
        DictionaryLive.disposeSignal(signal.id);
      });

    const unClose = signalEmitter
      .filter(({ action }) => action === "closed")
      .connect(({ signal }) => {
        DictionaryBacktest.disposeSignal(signal.id);
        DictionaryLive.disposeSignal(signal.id);
      });

    return compose(
      () => unCancel(),
      () => unClose(),
      () => Dictionary.enable.clear(),
    );
  });

  /**
   * Disables dictionary storage by unsubscribing from signal lifecycle events.
   * Safe to call multiple times.
   */
  public static disable = () => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_DISABLE);
    if (Dictionary.enable.hasValue()) {
      const lastSubscription = Dictionary.enable();
      lastSubscription();
    }
  };

  /**
   * Context-free read of the value stored under `key`.
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @param key - Entry key
   * @returns Stored value, or null
   * @throws Error if Dictionary is not enabled
   */
  public static _get = async <Value = unknown>(dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }, key: string): Promise<Value | null> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_GET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
      key,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.get<Value>(dto, key);
    }
    return await DictionaryLive.get<Value>(dto, key);
  };

  /**
   * Context-free write of `value` under `key`.
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp this value belongs to
   * @param key - Entry key
   * @param value - Value to store
   * @throws Error if Dictionary is not enabled
   */
  public static _set = async <Value = unknown>(dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }, key: string, value: Value): Promise<void> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_SET, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
      key,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.set<Value>(dto, key, value);
    }
    return await DictionaryLive.set<Value>(dto, key, value);
  };

  /**
   * Context-free check whether a visible entry exists under `key`.
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the check is happening (look-ahead guard)
   * @param key - Entry key
   * @returns true if a visible entry exists
   * @throws Error if Dictionary is not enabled
   */
  public static _has = async (dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }, key: string): Promise<boolean> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_HAS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
      key,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.has(dto, key);
    }
    return await DictionaryLive.has(dto, key);
  };

  /**
   * Context-free removal of the entry under `key` (hard delete).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the delete is happening
   * @param key - Entry key
   * @returns true if an entry existed and was removed
   * @throws Error if Dictionary is not enabled
   */
  public static _delete = async (dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }, key: string): Promise<boolean> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_DELETE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
      key,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.delete(dto, key);
    }
    return await DictionaryLive.delete(dto, key);
  };

  /**
   * Context-free removal of all entries (hard delete).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the clear is happening
   * @throws Error if Dictionary is not enabled
   */
  public static _clear = async (dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }): Promise<void> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_CLEAR, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.clear(dto);
    }
    return await DictionaryLive.clear(dto);
  };

  /**
   * Context-free listing of visible entry keys (look-ahead-guarded).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of keys
   * @throws Error if Dictionary is not enabled
   */
  public static _keys = async (dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }): Promise<string[]> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_KEYS, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.keys(dto);
    }
    return await DictionaryLive.keys(dto);
  };

  /**
   * Context-free listing of visible entry values (look-ahead-guarded).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of values
   * @throws Error if Dictionary is not enabled
   */
  public static _values = async <Value = unknown>(dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }): Promise<Value[]> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_VALUES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.values<Value>(dto);
    }
    return await DictionaryLive.values<Value>(dto);
  };

  /**
   * Context-free listing of visible [key, value] pairs (look-ahead-guarded).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Array of [key, value] tuples
   * @throws Error if Dictionary is not enabled
   */
  public static _entries = async <Value = unknown>(dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }): Promise<[string, Value][]> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_ENTRIES, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.entries<Value>(dto);
    }
    return await DictionaryLive.entries<Value>(dto);
  };

  /**
   * Context-free count of visible entries (look-ahead-guarded).
   * Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.
   * @param dto.dictionaryName - Dictionary name
   * @param dto.signalId - Signal identifier
   * @param dto.backtest - Flag indicating if the context is backtest or live
   * @param dto.when - Logical timestamp at which the read is happening (look-ahead guard)
   * @returns Number of visible entries
   * @throws Error if Dictionary is not enabled
   */
  public static _size = async (dto: { dictionaryName: DictionaryName, signalId: string, backtest: boolean, when: Date }): Promise<number> => {
    if (!Dictionary.enable.hasValue()) {
      throw new Error("Dictionary is not enabled. Call Dictionary.enable() first.");
    }
    swarm.loggerService.debug(DICTIONARY_METHOD_NAME_STATIC_SIZE, {
      signalId: dto.signalId,
      dictionaryName: dto.dictionaryName,
      backtest: dto.backtest,
    });
    if (dto.backtest) {
      return await DictionaryBacktest.size(dto);
    }
    return await DictionaryLive.size(dto);
  };

  /**
   * Read the value stored under `key` for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @param key - Entry key
   * @returns Stored value, or null
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public get = async (key: string): Promise<Value | null> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_GET, { name: this.params.name, key });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.get requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.get requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._get<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._get<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    throw new Error(
      `Dictionary.get requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Write `value` under `key` for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @param key - Entry key
   * @param value - Value to store
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public set = async (key: string, value: Value): Promise<void> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_SET, { name: this.params.name, key });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.set requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.set requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._set<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key, value);
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._set<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key, value);
    }
    throw new Error(
      `Dictionary.set requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Check whether a visible entry exists under `key` for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @param key - Entry key
   * @returns true if a visible entry exists
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public has = async (key: string): Promise<boolean> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_HAS, { name: this.params.name, key });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.has requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.has requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._has({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._has({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    throw new Error(
      `Dictionary.has requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Remove the entry under `key` for the active pending or scheduled signal (hard delete).
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @param key - Entry key
   * @returns true if an entry existed and was removed
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public delete = async (key: string): Promise<boolean> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_DELETE, { name: this.params.name, key });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.delete requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.delete requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._delete({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._delete({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      }, key);
    }
    throw new Error(
      `Dictionary.delete requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Remove all entries for the active pending or scheduled signal (hard delete).
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public clear = async (): Promise<void> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_CLEAR, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.clear requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.clear requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._clear({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._clear({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `Dictionary.clear requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * List keys of visible entries for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Array of keys
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public keys = async (): Promise<string[]> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_KEYS, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.keys requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.keys requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._keys({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._keys({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `Dictionary.keys requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * List values of visible entries for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Array of values
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public values = async (): Promise<Value[]> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_VALUES, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.values requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.values requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._values<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._values<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `Dictionary.values requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * List [key, value] pairs of visible entries for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Array of [key, value] tuples
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public entries = async (): Promise<[string, Value][]> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_ENTRIES, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.entries requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.entries requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._entries<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._entries<Value>({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `Dictionary.entries requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };

  /**
   * Count visible entries for the active pending or scheduled signal.
   * Resolves the signal, mode and timestamp from execution context — no context arguments required.
   * @returns Number of visible entries
   * @throws Error if no execution/method context or no pending/scheduled signal exists
   */
  public size = async (): Promise<number> => {
    swarm.loggerService.info(DICTIONARY_METHOD_NAME_SIZE, { name: this.params.name });
    if (!ExecutionContextService.hasContext()) {
      throw new Error("Dictionary.size requires an execution context");
    }
    if (!MethodContextService.hasContext()) {
      throw new Error("Dictionary.size requires a method context");
    }
    const { backtest: isBacktest, when, symbol } =
      swarm.executionContextService.context;
    const { exchangeName, frameName, strategyName } =
      swarm.methodContextService.context;
    const currentPrice =
      await swarm.exchangeConnectionService.getAveragePrice(symbol);
    let signal: IPublicSignalRow | IScheduledSignalRow;
    if (
      signal = await swarm.strategyCoreService.getPendingSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._size({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    if (
      signal = await swarm.strategyCoreService.getScheduledSignal(
        isBacktest,
        symbol,
        currentPrice,
        { exchangeName, frameName, strategyName },
      )
    ) {
      return await Dictionary._size({
        dictionaryName: this.params.name,
        signalId: signal.id,
        backtest: isBacktest,
        when,
      });
    }
    throw new Error(
      `Dictionary.size requires a pending or scheduled signal for symbol=${symbol} name=${this.params.name}`,
    );
  };
}

/**
 * Global singleton instance of DictionaryLiveAdapter.
 * Provides live trading dictionary storage with pluggable backends.
 */
export const DictionaryLive = new DictionaryLiveAdapter();

/**
 * Global singleton instance of DictionaryBacktestAdapter.
 * Provides backtest dictionary storage with pluggable backends.
 */
export const DictionaryBacktest = new DictionaryBacktestAdapter();
