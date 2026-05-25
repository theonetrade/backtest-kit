import { ExchangeName } from "../interfaces/Exchange.interface";
import { FrameName } from "../interfaces/Frame.interface";
import { StrategyName } from "../interfaces/Strategy.interface";

/**
 * Contract for afterEnd hook in strategy execution.
 *
 * This interface defines the structure of the context object
 * passed to the afterEnd hook, including the trading symbol,
 * strategy name, exchange name, and frame name.
 */
export interface AfterEndContract {
  /** Trading symbol (e.g., "BTCUSDT") */
  symbol: string;
  /** Strategy name for context */
  strategyName: StrategyName;
  /** Exchange name for context */
  exchangeName: ExchangeName;
  /** Frame name for context (e.g. "1m", "5m") */
  frameName: FrameName;
  /** Backtest flag for context */
  backtest: boolean;
  /** Current price for context */
  currentPrice: number;
  /** Date object from context */
  when: Date;
  /** Timestamp from context */
  timestamp: number;
}
