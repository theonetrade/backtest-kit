import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for the afterEnd lifecycle event of strategy execution.
 *
 * Emitted by the engine after the strategy iterator has finished — whether
 * by reaching the end of the frame, being stopped via `stopStrategy`,
 * throwing an error, or being cancelled by the consumer (e.g., breaking out
 * of `for await`). Used by subscribers to perform teardown that should
 * happen exactly once per run: flushing buffers, closing files, computing
 * final aggregates, sending a "run completed" notification, etc.
 *
 * Guarantees:
 * - Fires exactly once per `run()` invocation, paired with the matching
 *   `BeforeStartContract` event. The pairing holds for every termination
 *   path including exceptions and external cancellation (delivered via the
 *   generator's `try/finally` block).
 * - Listener errors are caught and routed to the global errorEmitter; they
 *   never propagate to the original caller.
 *
 * Mode differences:
 * - In backtest mode, `when` is the cursor position from `TimeMetaService`
 *   at the moment of completion — i.e., the historical time of the last
 *   processed candle. If the run was interrupted before any candle was
 *   processed (e.g., empty frame, immediate cancellation), `when` falls
 *   back to the frame's planned start date so it equals
 *   `BeforeStartContract.when` for the same run. This means
 *   `afterEnd.when - beforeStart.when` is always the real processed
 *   duration, never an inflated planned one.
 * - In live mode, `when` is the current wall-clock time aligned to the
 *   1-minute boundary at the moment of emission.
 *
 * @see BeforeStartContract — the paired initialization event.
 */
export interface AfterEndContract {
  /**
   * Trading symbol the run was for (e.g., "BTCUSDT", "ETHUSDT").
   * Matches the symbol from the paired `BeforeStartContract`.
   */
  symbol: string;

  /**
   * Name of the strategy that was executed. Use this to demultiplex events
   * when subscribing globally to runs across multiple strategies on the
   * same symbol.
   */
  strategyName: StrategyName;

  /**
   * Name of the exchange that provided market data for this run.
   */
  exchangeName: ExchangeName;

  /**
   * Name of the frame (timeframe / date range) the run used. Empty string
   * in live mode, where frames are not used.
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
   * In backtest: cursor position from `TimeMetaService` at completion (the
   * time of the last processed candle), with fallback to the frame's
   * planned start date if no candle was processed.
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
