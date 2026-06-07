import { IRuntimeInfo, IRuntimeRange } from "../../../interfaces/Runtime.interface";
import { RuntimeData } from "../../../interfaces/Strategy.interface";
import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import TimeMetaService from "./TimeMetaService";
import FrameSchemaService from "../schema/FrameSchemaService";
import { errorData, getErrorMessage, memoize, trycatch } from "functools-kit";
import { errorEmitter } from "../../../config/emitters";
import StrategySchemaService from "../schema/StrategySchemaService";
import PriceMetaService from "./PriceMetaService";
import { singleton } from "di-singleton";

const GET_RANGE_FN = trycatch(
  (
    self: TRuntimeMetaService,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ): IRuntimeRange | null => {
    if (!backtest) {
      return null;
    }
    const { startDate, endDate } = self.frameSchemaService.get(
      context.frameName,
    );
    return {
      from: startDate,
      to: endDate,
    };
  },
  {
    fallback: (error, self) => {
      const message = "RuntimeMetaService GET_RANGE_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  },
);

const GET_INFO_FN = trycatch(
  (
    self: TRuntimeMetaService,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
  ): RuntimeData | null => {
    const { info } = self.strategySchemaService.get(context.strategyName);
    return info || null;
  },
  {
    fallback: (error, self) => {
      const message = "RuntimeMetaService GET_INFO_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  },
);

const GET_PRICE_FN = trycatch(
  async (
    self: TRuntimeMetaService,
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ): Promise<number> => {
    return await self.priceMetaService.getCurrentPrice(
      symbol,
      context,
      backtest,
    );
  },
  {
    fallback: (error, self) => {
      const message = "RuntimeMetaService GET_PRICE_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
    defaultValue: null,
  },
);

export const RuntimeMetaService = singleton(class {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);

  readonly timeMetaService = inject<TimeMetaService>(TYPES.timeMetaService);
  readonly priceMetaService = inject<PriceMetaService>(TYPES.priceMetaService);

  readonly frameSchemaService = inject<FrameSchemaService>(TYPES.frameSchemaService);
  readonly strategySchemaService = inject<StrategySchemaService>(TYPES.strategySchemaService);

  /**
   * Fetches the time range for the current strategy execution context.
   *
   * For backtest mode, it retrieves the start and end dates from the frame schema.
   * For live mode, it returns null since there is no predefined time range.
   *
   * This method is memoized to optimize performance, as the time range for a given context will not change during execution.
   *
   * @param context - Strategy, exchange, and frame identifiers
   * @param backtest - True if backtest mode, false if live mode
   * @returns An object containing 'from' and 'to' Date objects for backtest mode, or null for live mode
   */
  _getRange = memoize(
    ([context, backtest]) => `${context.frameName}:${backtest ? "backtest" : "live"}`,
    (
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ) => {
    return GET_RANGE_FN(this, context, backtest);
  });

  /**
   * Fetches strategy-defined runtime information for the current execution context.
   *
   * This method retrieves the 'info' object defined in the strategy schema, which can contain any custom data the strategy wants to track at runtime.
   * The content of this object is not defined by the system and can be used freely by strategy implementations for monitoring, reporting, or external logic.
   *
   * This method is memoized to optimize performance, as the strategy info for a given context will not change during execution.
   *
   * @param context - Strategy, exchange, and frame identifiers
   * @returns The 'info' object defined in the strategy schema for the given strategy, or null if not defined
   */
  _getInfo = memoize(
    ([context]) => context.strategyName,
    (context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    }) => {
      return GET_INFO_FN(this, context);
    },
  );

  /**
   * Fetches comprehensive runtime information for a given symbol and strategy context, including current price, timestamp, and strategy-specific info.
   *
   * This method aggregates data from multiple sources (time, price, frame schema, strategy schema) to provide a complete picture of the current runtime state for a strategy tick.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Strategy, exchange, and frame identifiers
   * @param backtest - True if backtest mode, false if live mode
   * @returns An object containing symbol, time range, strategy-defined info, context, timestamp, current price, and backtest flag
   */
  public getRuntimeInfo = async <Data extends RuntimeData = RuntimeData>(
    symbol: string,
    context: {
      strategyName: string;
      exchangeName: string;
      frameName: string;
    },
    backtest: boolean,
  ): Promise<IRuntimeInfo<Data>> => {
    this.loggerService.log("runtimeMetaService getRuntimeInfo", {
      symbol,
      context,
      backtest,
    });
    const timestamp = await this.timeMetaService.getTimestamp(
      symbol,
      context,
      backtest,
    );
    const when = new Date(timestamp);
    const currentPrice = await GET_PRICE_FN(this, symbol, context, backtest);
    const range = this._getRange(context, backtest);
    const info = this._getInfo(context);
    return {
      symbol,
      range,
      info,
      context,
      backtest,
      when,
      currentPrice,
    }
  };
});

/**
 * Class representing the RuntimeMetaService, responsible for providing comprehensive runtime information for strategies, including current price, timestamp, and strategy-defined info.
 *
 * - Registered as singleton in DI container
 * - Aggregates data from TimeMetaService, PriceMetaService, FrameSchemaService, and StrategySchemaService
 * - Provides a single method getRuntimeInfo() to fetch all relevant runtime information for a strategy tick
 *
 * @example
 * ```typescript
 * const runtimeInfo = await backtest.runtimeMetaService.getRuntimeInfo("BTCUSDT", context, false);
 * console.log(runtimeInfo);
 * ```
 */
export type TRuntimeMetaService = InstanceType<typeof RuntimeMetaService>;

export default RuntimeMetaService;
