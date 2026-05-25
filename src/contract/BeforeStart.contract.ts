import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for the beforeStart lifecycle event of strategy execution.
 *
 * Emitted by the engine immediately before it begins iterating the strategy
 * for a given symbol — after validation and context setup, but before the
 * first candle/tick is processed. Used by subscribers to perform
 * initialization that should happen exactly once per run: opening log files,
 * resetting per-run accumulators, sending a "run started" notification,
 * snapshotting initial state, etc.
 *
 * Guarantees:
 * - Fires exactly once per `run()` invocation, before any signal is yielded.
 * - Always paired with an `AfterEndContract` event for the same run, even if
 *   the iterator is interrupted, throws, or is cancelled externally. If
 *   beforeStart fires, afterEnd is guaranteed to fire afterwards.
 * - Listener errors are caught and routed to the global errorEmitter; they
 *   never abort the run.
 *
 * Mode differences:
 * - In backtest mode, `when` is the planned start of the frame (from
 *   FrameSchemaService.startDate, aligned to 1-minute boundary). It is the
 *   intended beginning of the historical replay, not wall-clock time.
 * - In live mode, `when` is the current wall-clock time aligned to the
 *   1-minute boundary.
 *
 * @see AfterEndContract — the paired completion event.
 */
export interface BeforeStartContract {
  /**
   * Trading symbol the run is for (e.g., "BTCUSDT", "ETHUSDT").
   * Same value that was passed to `Backtest.run` / `Live.run`.
   */
  symbol: string;

  /**
   * Name of the strategy being executed. Use this to demultiplex events when
   * subscribing globally to runs across multiple strategies on the same
   * symbol.
   */
  strategyName: StrategyName;

  /**
   * Name of the exchange providing market data for this run.
   */
  exchangeName: ExchangeName;

  /**
   * Name of the frame (timeframe / date range) for the run. Empty string in
   * live mode, where frames are not used.
   */
  frameName: FrameName;

  /**
   * `true` if this event was emitted from a backtest run, `false` if from a
   * live trading run. Use this to branch listener logic without inspecting
   * other fields.
   */
  backtest: boolean;

  /**
   * Average symbol price observed at the moment the event was emitted,
   * fetched from `ExchangeConnectionService.getAveragePrice(symbol)`.
   * Provided as a convenience so subscribers don't need to query the
   * exchange themselves.
   */
  currentPrice: number;

  /**
   * Event time as a `Date` instance.
   *
   * In backtest: the planned start of the frame (aligned to 1-minute
   * boundary). Represents intended start time, not the moment of emission.
   *
   * In live: wall-clock now, aligned to 1-minute boundary.
   *
   * Always equal to `new Date(timestamp)`.
   */
  when: Date;

  /**
   * Same value as `when`, expressed as milliseconds since the Unix epoch.
   * Provided so subscribers can avoid calling `.getTime()` and to keep the
   * payload trivially serialisable (e.g., for forwarding over IPC or
   * writing to a log).
   */
  timestamp: number;
}
