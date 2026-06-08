import { inject } from "../../../lib/core/di";
import { TLoggerService } from "../base/LoggerService";
import TYPES from "../../../lib/core/types";
import BacktestLogicPublicService from "../logic/public/BacktestLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import FrameValidationService from "../validation/FrameValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import ActionValidationService from "../validation/ActionValidationService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { FrameName } from "../../../interfaces/Frame.interface";
import { memoize } from "functools-kit";

const METHOD_NAME_RUN = "backtestCommandService run";
const METHOD_NAME_VALIDATE = "backtestCommandService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "strategyName:exchangeName:frameName"
 * @param context - Context with strategyName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }): string => {
  const parts = [context.strategyName, context.exchangeName];
  if (context.frameName) parts.push(context.frameName);
  return parts.join(":");
};

/**
 * Type definition for keys of BacktestLogicPublicService.
 * Omits private dependencies. Used for creating a public API surface.
 */
type Keys = Omit<BacktestLogicPublicService, keyof {
  exchangeConnectionService: never;
  backtestLogicPrivateService: never;
  frameSchemaService: never;
  timeMetaService: never;
  loggerService: never;
}>;

/**
 * Type definition for BacktestLogicPublicService.
 * Maps all keys of BacktestLogicPublicService to any type.
 */
type TBacktestLogicPublicService = {
  [key in keyof Keys]: any;
};

/**
 * Global service providing access to backtest functionality.
 *
 * Simple wrapper around BacktestLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class BacktestCommandService implements TBacktestLogicPublicService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );  
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly actionValidationService = inject<ActionValidationService>(
    TYPES.actionValidationService
  );
  private readonly backtestLogicPublicService =
    inject<BacktestLogicPublicService>(TYPES.backtestLogicPublicService);
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
  private readonly frameValidationService = inject<FrameValidationService>(
    TYPES.frameValidationService
  );

  /**
   * Validates strategy and associated risk configuration.
   * Memoized to avoid redundant validations for the same strategy-exchange-frame combination.
   *
   * @param context - Context with strategyName, exchangeName and frameName
   * @param methodName - Name of the calling method for error tracking
   */
  private validate = memoize(
    ([context]) => CREATE_KEY_FN(context),
    (context: { strategyName: StrategyName; exchangeName: ExchangeName; frameName: FrameName }, methodName: string) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
        methodName,
      });
      this.strategyValidationService.validate(context.strategyName, methodName);
      this.exchangeValidationService.validate(context.exchangeName, methodName);
      this.frameValidationService.validate(context.frameName, methodName);
      const { riskName, riskList, actions } = this.strategySchemaService.get(context.strategyName);
      riskName && this.riskValidationService.validate(riskName, methodName);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, methodName));
      actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, methodName));
    }
  );

  /**
   * Runs backtest for a symbol with context propagation.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy, exchange, and frame names
   * @returns Async generator yielding closed signals with PNL
   */
  public run = (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
      frameName: FrameName;
    }
  ) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      symbol,
      context,
    });
    this.validate(context, METHOD_NAME_RUN);
    return this.backtestLogicPublicService.run(symbol, context);
  };
}

export default BacktestCommandService;
