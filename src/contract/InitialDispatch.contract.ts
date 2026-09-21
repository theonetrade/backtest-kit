import { FrameName } from "../interfaces/Frame.interface";
import { ExchangeName } from "../interfaces/Exchange.interface";
import {
  IPublicSignalRow,
  IScheduledSignalRow,
  StrategyName,
} from "../interfaces/Strategy.interface";

/**
 * Base fields shared by both variants of the initial-dispatch payload.
 * Carries the resolved execution context of the state access.
 */
interface InitialDispatchContractBase {
  /**
   * Trading pair symbol (e.g., "BTCUSDT").
   */
  symbol: string;

  /**
   * Strategy name owning the signal.
   */
  strategyName: StrategyName;

  /**
   * Exchange name where this strategy is running.
   */
  exchangeName: ExchangeName;

  /**
   * Frame name (if backtest)
   */
  frameName: FrameName;

  /**
   * Current market price of the symbol at the moment of state init.
   */
  currentPrice: number;

  /**
   * Execution mode flag.
   * - true: Event from backtest execution (historical candle data)
   * - false: Event from live trading (real-time tick)
   */
  backtest: boolean;

  /**
   * Event timestamp in milliseconds since Unix epoch.
   *
   * Timing semantics:
   * - Live mode: when.getTime() at the moment of state init
   * - Backtest mode: candle.timestamp of the candle being processed
   */
  timestamp: number;

  /**
   * Event time as a `Date` instance.
   *
   * - Backtest mode: virtual execution time — `candle.timestamp` of the candle
   *   being processed (not wall-clock time).
   * - Live mode: wall-clock time at the moment of state init.
   *
   * Always equal to `new Date(timestamp)`.
   */
  when: Date;
}

/**
 * Initial-dispatch payload for an OPEN position: the state access resolved a
 * pending signal — the order is filled and the position is being monitored.
 */
export interface InitialDispatchActiveContract extends InitialDispatchContractBase {
  /**
   * Discriminator: "active" — open position order.
   */
  type: "active";

  /**
   * Complete public signal row of the open position at the moment of state init.
   */
  signal: IPublicSignalRow;
}

/**
 * Initial-dispatch payload for a RESTING entry: the state access resolved a
 * scheduled signal — the entry order is waiting for price to reach priceOpen.
 */
export interface InitialDispatchScheduleContract extends InitialDispatchContractBase {
  /**
   * Discriminator: "schedule" — resting entry order.
   */
  type: "schedule";

  /**
   * Complete scheduled signal row of the resting entry at the moment of state init.
   */
  signal: IScheduledSignalRow;
}

/**
 * Contract for lazy per-signal state initialization.
 *
 * Passed as the first argument to the `initialData` factory of `new State({ name, initialData })`
 * when the factory form is used: the factory runs on every state access for the signal
 * that has no persisted value yet, and this payload carries the full resolved context of
 * that moment — so the initial state can be DERIVED from the live signal instead of being
 * a static constant.
 *
 * Discriminated union on `type`: "active" carries the pending `IPublicSignalRow` of an
 * open position, "schedule" carries the `IScheduledSignalRow` of a resting entry — use
 * `payload.type === "active"` for type-safe access to the variant-specific signal shape.
 *
 * Typical use: seed per-trade metrics from the actual entry — e.g. start `peakPercent`
 * from the current unrealized PnL, anchor thresholds to `signal.priceOpen` / TP / SL
 * distances, or branch the defaults for a resting entry versus an open position.
 *
 * The payload is assembled by the State facade right after the active signal is resolved
 * from the async_hooks execution context: `signal` is the pending or scheduled row,
 * `currentPrice` is the VWAP used for that resolution, and `when`/`timestamp` carry the
 * LOGICAL time of the access (candle time in backtest, wall-clock in live) — the same
 * timestamp that powers the look-ahead guard, so a factory deriving values from it can
 * never peek ahead of the tick being processed.
 *
 * The returned object becomes `initialValue`: it is what reads yield while nothing was
 * written (or while the stored record is in the future relative to `when`), and what the
 * `setState` dispatch updater receives as `prev` on the first update. A fresh payload is
 * built per access, so the factory result is never shared by reference between calls.
 */
export type InitialDispatchContract =
  | InitialDispatchActiveContract
  | InitialDispatchScheduleContract;

export default InitialDispatchContract;
