import { ExchangeName } from "./Exchange.interface";
import { FrameName } from "./Frame.interface";
import { RuntimeData, StrategyName } from "./Strategy.interface";

/**
 * Interface for runtime information and range used in backtesting and strategy execution.
 * The interface defines the time range for the backtest while executing a strategy in backtest mode
 */
export interface IRuntimeRange {
    /** Start date of the runtime range */
    from: Date;
    /** End date of the runtime range */
    to: Date;
}

/**
 * Interface for runtime information returned by the RuntimeMetaService.
 * This includes the symbol being traded, the time range of the backtest, any additional info defined by the strategy,
 * and contextual information about the exchange, strategy, and frame being used.
 */
export interface IRuntimeInfo<Data extends RuntimeData = RuntimeData> {
    /** Trading pair symbol (e.g., "BTCUSDT") */
    symbol: string;
    /** Time range for the backtest, null if running in live mode */
    range: IRuntimeRange | null;
    /** Additional runtime information defined by the strategy, can be used for custom monitoring or reporting */
    info: Data | null;
    /** Contextual information about the current execution environment */
    context: {
        exchangeName: ExchangeName;
        strategyName: StrategyName;
        frameName: FrameName;
    };
    /** Timestamp of the current candle or tick */
    when: Date;
    /** Current market price for the symbol at the time of execution */
    currentPrice: number;
    /** Whether the strategy is running in backtest mode */
    backtest: boolean;
}
