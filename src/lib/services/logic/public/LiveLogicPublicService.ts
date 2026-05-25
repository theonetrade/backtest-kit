import { inject } from "../../../core/di";
import { TLoggerService } from "../../base/LoggerService";
import TYPES from "../../../core/types";
import LiveLogicPrivateService from "../private/LiveLogicPrivateService";
import MethodContextService from "../../context/MethodContextService";
import { StrategyName } from "../../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../../interfaces/Exchange.interface";
import { beforeStartSubject, afterEndSubject, errorEmitter } from "../../../../config/emitters";
import { errorData, getErrorMessage, trycatch } from "functools-kit";
import ExecutionContextService from "../../context/ExecutionContextService";
import alignToInterval from "../../../../utils/alignToInterval";

/**
 * Type definition for public LiveLogic service.
 * Omits private dependencies from LiveLogicPrivateService.
 */
type ILiveLogicPrivateService = Omit<LiveLogicPrivateService, keyof {
  loggerService: never;
  strategyCoreService: never;
  methodContextService: never;
}>;

/**
 * Type definition for LiveLogicPublicService.
 * Maps all keys of ILiveLogicPrivateService to any type.
 */
type TLiveLogicPrivateService = {
  [key in keyof ILiveLogicPrivateService]: any;
};

/**
 * Run iterator function for live logic.
 *
 * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
 * @param context - Execution context with strategy and exchange names
 * @param self - Instance of LiveLogicPublicService
 * @returns Async iterator for live trading results
 */
const RUN_ITERATOR_FN = (
  self: LiveLogicPublicService,
  symbol: string,
  context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
  },
) => {
  return MethodContextService.runAsyncIterator(
    self.liveLogicPrivateService.run(symbol),
    {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: "",
    }
  );
}

/**
 * Call before start execution for live logic.
 * This function is responsible for triggering the beforeStartSubject
 * with the appropriate context and symbol information.
 */
const CALL_BEFORE_START_FN = trycatch(
  async (
    _self: LiveLogicPublicService,
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    },
  ) => {
    await MethodContextService.runInContext(async () => {
      await ExecutionContextService.runInContext(async () => {
        await beforeStartSubject.next({
          symbol,
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          frameName: "",
          backtest: false,
        });
      }, {
        symbol,
        when: alignToInterval(new Date(), "1m"),
        backtest: false,
      });
    }, {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: "",
    });
  }, {
    fallback: (error, self) => {
      const message = "LiveLogicPublicService CALL_BEFORE_START_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Call after end execution for live logic.
 * This function is responsible for triggering the afterEndSubject
 * with the appropriate context and symbol information.
 */
const CALL_AFTER_END_FN = trycatch(
  async (
    _self: LiveLogicPublicService,
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    },
  ) => {
    await MethodContextService.runInContext(async () => {
      await ExecutionContextService.runInContext(async () => {
        await afterEndSubject.next({
          symbol,
          exchangeName: context.exchangeName,
          strategyName: context.strategyName,
          frameName: "",
          backtest: false,
        });
      }, {
        symbol,
        when: alignToInterval(new Date(), "1m"),
        backtest: false,
      });
    }, {
      exchangeName: context.exchangeName,
      strategyName: context.strategyName,
      frameName: "",
    });
  }, {
    fallback: (error, self) => {
      const message = "LiveLogicPublicService CALL_AFTER_END_FN thrown";
      const payload = {
        error: errorData(error),
        message: getErrorMessage(error),
      };
      self.loggerService.warn(message, payload);
      console.error(message, payload);
      errorEmitter.next(error);
    },
  }
);

/**
 * Public service for live trading orchestration with context management.
 *
 * Wraps LiveLogicPrivateService with MethodContextService to provide
 * implicit context propagation for strategyName and exchangeName.
 *
 * This allows getCandles(), getSignal(), and other functions to work without
 * explicit context parameters.
 *
 * Features:
 * - Infinite async generator (never completes)
 * - Crash recovery via persisted state
 * - Real-time progression with Date.now()
 *
 * @example
 * ```typescript
 * const liveLogicPublicService = inject(TYPES.liveLogicPublicService);
 *
 * // Infinite loop - use Ctrl+C to stop
 * for await (const result of liveLogicPublicService.run("BTCUSDT", {
 *   strategyName: "my-strategy",
 *   exchangeName: "my-exchange",
 * })) {
 *   if (result.action === "opened") {
 *     console.log("Signal opened:", result.signal);
 *   } else if (result.action === "closed") {
 *     console.log("PNL:", result.pnl.profit);
 *   }
 * }
 * ```
 */
export class LiveLogicPublicService implements TLiveLogicPrivateService {
  readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  readonly liveLogicPrivateService = inject<LiveLogicPrivateService>(
    TYPES.liveLogicPrivateService
  );

  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Streams opened and closed signals as infinite async generator.
   * Context is automatically injected into all framework functions.
   * Process can crash and restart - state will be recovered from disk.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Infinite async generator yielding opened and closed signals
   */
  public async *run(
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) {
    this.loggerService.log("liveLogicPublicService run", {
      symbol,
      context,
    });
    await CALL_BEFORE_START_FN(this, symbol, context);
    yield* RUN_ITERATOR_FN(this, symbol, context);
    await CALL_AFTER_END_FN(this, symbol, context);
  }
}

export default LiveLogicPublicService;
