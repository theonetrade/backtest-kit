import { IPublicSignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot, LimitedMap } from "functools-kit";
import { highestProfitSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { GLOBAL_CONFIG } from "../../../config/params";

const HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE = "HighestProfitReportService.subscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE = "HighestProfitReportService.unsubscribe";
const HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK = "HighestProfitReportService.tick";

/**
 * How many signals the min-step write-gate remembers
 * (symbol:strategy:exchange:frame:signalId -> last written peak PnL percent).
 * FIFO eviction; an evicted signal simply writes its next record once more —
 * never loses data, only loses the gate memory.
 */
const HIGHEST_PROFIT_GATE_MAP_LIMIT = 500;

/**
 * Service for logging highest profit events to the JSONL report database.
 *
 * Listens to highestProfitSubject and writes each new price record to
 * ReportWriter.writeData() for persistence and analytics.
 */
export class HighestProfitReportService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Last WRITTEN peak PnL percent per signal — state of the
   * CC_REPORT_HIGHEST_PROFIT_MIN_STEP_PERCENT write-gate. FIFO-bounded (see
   * HIGHEST_PROFIT_GATE_MAP_LIMIT).
   */
  private _lastWrittenPnl = new LimitedMap<string, number>(HIGHEST_PROFIT_GATE_MAP_LIMIT);

  /**
   * Handles a single `HighestProfitContract` event emitted by `highestProfitSubject`.
   *
   * Writes a JSONL record to the `"highest_profit"` report database via
   * `ReportWriter.writeData`, capturing the full signal snapshot at the moment
   * the new profit record was set:
   * - `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
   * - `signalId`, `position`, `currentPrice`
   * - `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)
   *
   * `strategyName` and signal-level fields are sourced from `data.signal`
   * rather than the contract root.
   *
   * @param data - `HighestProfitContract` payload containing `symbol`,
   *   `signal`, `currentPrice`, `backtest`, `timestamp`, `exchangeName`,
   *   `frameName`
   */
  private tick = async (data: {
    symbol: string;
    signal: IPublicSignalRow;
    currentPrice: number;
    backtest: boolean;
    timestamp: number;
    exchangeName: ExchangeName;
    frameName: FrameName;
  }) => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_TICK, { data });

    // Min-step write-gate: a steady trend beats the peak record on nearly
    // every candle — write only steps of at least the configured PnL
    // improvement over the LAST WRITTEN row (the first record of a signal is
    // always written). Internal _peak tracking and the final peak stats in
    // the closed row stay exact; only this report channel is thinned.
    if (GLOBAL_CONFIG.CC_REPORT_HIGHEST_PROFIT_MIN_STEP_PERCENT > 0) {
      const gateKey = [
        data.symbol,
        data.signal.strategyName,
        data.exchangeName,
        data.frameName,
        data.signal.id,
      ].join(":");
      const peakPnl = data.signal.peakProfit.pnlPercentage;
      const lastWritten = this._lastWrittenPnl.get(gateKey);
      if (
        lastWritten !== undefined &&
        peakPnl - lastWritten < GLOBAL_CONFIG.CC_REPORT_HIGHEST_PROFIT_MIN_STEP_PERCENT
      ) {
        return;
      }
      this._lastWrittenPnl.set(gateKey, peakPnl);
    }

    await ReportWriter.writeData("highest_profit", {
      timestamp: data.timestamp,
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      backtest: data.backtest,
      signalId: data.signal.id,
      position: data.signal.position,
      currentPrice: data.currentPrice,
      priceOpen: data.signal.priceOpen,
      priceTakeProfit: data.signal.priceTakeProfit,
      priceStopLoss: data.signal.priceStopLoss,
      peakProfitPercentage: data.signal.peakProfit.pnlPercentage,
      peakProfitCost: data.signal.peakProfit.pnlCost,
      peakProfitEntries: data.signal.peakProfit.pnlEntries,
      peakProfitPriceOpen: data.signal.peakProfit.priceOpen,
      peakProfitPriceClose: data.signal.peakProfit.priceClose,
      maxDrawdownPercentage: data.signal.maxDrawdown.pnlPercentage,
      maxDrawdownCost: data.signal.maxDrawdown.pnlCost,
      maxDrawdownEntries: data.signal.maxDrawdown.pnlEntries,
      maxDrawdownPriceOpen: data.signal.maxDrawdown.priceOpen,
      maxDrawdownPriceClose: data.signal.maxDrawdown.priceClose,
    }, {
      symbol: data.symbol,
      strategyName: data.signal.strategyName,
      exchangeName: data.exchangeName,
      frameName: data.frameName,
      signalId: data.signal.id,
      walkerName: "",
    });
  };

  /**
   * Subscribes to `highestProfitSubject` to start persisting profit records.
   * Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state and
   * detaches from `highestProfitSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription
   *
   * @example
   * ```typescript
   * const service = new HighestProfitReportService();
   * const unsubscribe = service.subscribe();
   * // ... later
   * unsubscribe();
   * ```
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = highestProfitSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  /**
   * Detaches from `highestProfitSubject`, stopping further JSONL writes.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   *
   * @example
   * ```typescript
   * const service = new HighestProfitReportService();
   * service.subscribe();
   * // ... later
   * await service.unsubscribe();
   * ```
   */
  public unsubscribe = async () => {
    this.loggerService.log(HIGHEST_PROFIT_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default HighestProfitReportService;
