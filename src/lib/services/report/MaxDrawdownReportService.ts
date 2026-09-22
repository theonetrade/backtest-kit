import { IPublicSignalRow } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import LoggerService, { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import { singleshot, LimitedMap } from "functools-kit";
import { maxDrawdownSubject } from "../../../config/emitters";
import { ReportWriter } from "../../../classes/Writer";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { GLOBAL_CONFIG } from "../../../config/params";

const MAX_DRAWDOWN_REPORT_METHOD_NAME_SUBSCRIBE = "MaxDrawdownReportService.subscribe";
const MAX_DRAWDOWN_REPORT_METHOD_NAME_UNSUBSCRIBE = "MaxDrawdownReportService.unsubscribe";
const MAX_DRAWDOWN_REPORT_METHOD_NAME_TICK = "MaxDrawdownReportService.tick";

/**
 * How many signals the min-step write-gate remembers
 * (symbol:strategy:exchange:frame:signalId -> last written drawdown PnL percent).
 * FIFO eviction; an evicted signal simply writes its next record once more —
 * never loses data, only loses the gate memory.
 */
const MAX_DRAWDOWN_GATE_MAP_LIMIT = 500;

/**
 * Service for logging max drawdown events to the JSONL report database.
 *
 * Listens to maxDrawdownSubject and writes each new drawdown record to
 * ReportWriter.writeData() for persistence and analytics.
 */
export class MaxDrawdownReportService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  /**
   * Last WRITTEN drawdown PnL percent per signal — state of the
   * CC_REPORT_MAX_DRAWDOWN_MIN_STEP_PERCENT write-gate. FIFO-bounded (see
   * MAX_DRAWDOWN_GATE_MAP_LIMIT).
   */
  private _lastWrittenPnl = new LimitedMap<string, number>(MAX_DRAWDOWN_GATE_MAP_LIMIT);

  /**
   * Handles a single `MaxDrawdownContract` event emitted by `maxDrawdownSubject`.
   *
   * Writes a JSONL record to the `"max_drawdown"` report database via
   * `ReportWriter.writeData`, capturing the full signal snapshot at the moment
   * the new drawdown record was set:
   * - `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
   * - `signalId`, `position`, `currentPrice`
   * - `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)
   *
   * `strategyName` and signal-level fields are sourced from `data.signal`
   * rather than the contract root.
   *
   * @param data - `MaxDrawdownContract` payload containing `symbol`,
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
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_TICK, { data });

    // Min-step write-gate (mirror of HighestProfitReportService for the loss
    // side): a steady decline sets a new trough on nearly every candle —
    // write only steps of at least the configured PnL worsening versus the
    // LAST WRITTEN row (the first record of a signal is always written).
    // Internal _fall tracking and the final drawdown stats in the closed row
    // stay exact; only this report channel is thinned.
    if (GLOBAL_CONFIG.CC_REPORT_MAX_DRAWDOWN_MIN_STEP_PERCENT > 0) {
      const gateKey = [
        data.symbol,
        data.signal.strategyName,
        data.exchangeName,
        data.frameName,
        data.signal.id,
      ].join(":");
      const fallPnl = data.signal.maxDrawdown.pnlPercentage;
      const lastWritten = this._lastWrittenPnl.get(gateKey);
      // Drawdown PnL is negative and worsens DOWNWARD: the step is the
      // distance the record fell below the previously written one.
      if (
        lastWritten !== undefined &&
        lastWritten - fallPnl < GLOBAL_CONFIG.CC_REPORT_MAX_DRAWDOWN_MIN_STEP_PERCENT
      ) {
        return;
      }
      this._lastWrittenPnl.set(gateKey, fallPnl);
    }

    await ReportWriter.writeData("max_drawdown", {
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
   * Subscribes to `maxDrawdownSubject` to start persisting drawdown records.
   * Protected against multiple subscriptions via `singleshot` — subsequent
   * calls return the same unsubscribe function without re-subscribing.
   *
   * The returned unsubscribe function clears the `singleshot` state and
   * detaches from `maxDrawdownSubject`.
   *
   * @returns Unsubscribe function; calling it tears down the subscription
   */
  public subscribe = singleshot(() => {
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_SUBSCRIBE);
    const unsub = maxDrawdownSubject.subscribe(this.tick);
    return () => {
      this.subscribe.clear();
      unsub();
    };
  });

  /**
   * Detaches from `maxDrawdownSubject`, stopping further JSONL writes.
   *
   * Calls the unsubscribe closure returned by `subscribe()`.
   * If `subscribe()` was never called, does nothing.
   */
  public unsubscribe = async () => {
    this.loggerService.log(MAX_DRAWDOWN_REPORT_METHOD_NAME_UNSUBSCRIBE);
    if (this.subscribe.hasValue()) {
      const lastSubscription = this.subscribe();
      lastSubscription();
    }
  };
}

export default MaxDrawdownReportService;
