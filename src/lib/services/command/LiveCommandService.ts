import { inject } from "../../../lib/core/di";
import TYPES from "../../../lib/core/types";
import LiveLogicPublicService from "../logic/public/LiveLogicPublicService";
import StrategyValidationService from "../validation/StrategyValidationService";
import ExchangeValidationService from "../validation/ExchangeValidationService";
import StrategySchemaService from "../schema/StrategySchemaService";
import RiskValidationService from "../validation/RiskValidationService";
import ActionValidationService from "../validation/ActionValidationService";
import { StrategyName } from "../../../interfaces/Strategy.interface";
import { ExchangeName } from "../../../interfaces/Exchange.interface";
import { TLoggerService } from "../base/LoggerService";
import { memoize } from "functools-kit";

const METHOD_NAME_RUN = "liveCommandService run";
const METHOD_NAME_VALIDATE = "liveCommandService validate";

/**
 * Creates a unique key for memoizing validate calls.
 * Key format: "strategyName:exchangeName:frameName"
 * @param context - Context with strategyName, exchangeName, frameName
 * @returns Unique string key for memoization
 */
const CREATE_KEY_FN = (context: { strategyName: StrategyName; exchangeName: ExchangeName }): string => {
  const parts = [context.strategyName, context.exchangeName];
  return parts.join(":");
};

type Keys = Omit<LiveLogicPublicService, keyof {
  loggerService: never;
  liveLogicPrivateService: never;
  exchangeConnectionService: never;
}>;

/**
 * Type definition for LiveLogicPublicService.
 * Maps all keys of LiveLogicPublicService to any type.
 */
type TLiveLogicPublicService = {
  [key in keyof Keys]: any;
};

/**
 * Global service providing access to live trading functionality.
 *
 * Simple wrapper around LiveLogicPublicService for dependency injection.
 * Used by public API exports.
 */
export class LiveCommandService implements TLiveLogicPublicService {
  private readonly loggerService = inject<TLoggerService>(TYPES.loggerService);
  private readonly liveLogicPublicService = inject<LiveLogicPublicService>(
    TYPES.liveLogicPublicService
  );
  private readonly strategyValidationService =
    inject<StrategyValidationService>(TYPES.strategyValidationService);
  private readonly exchangeValidationService =
    inject<ExchangeValidationService>(TYPES.exchangeValidationService);
  private readonly strategySchemaService = inject<StrategySchemaService>(
    TYPES.strategySchemaService
  );  
  private readonly riskValidationService = inject<RiskValidationService>(
    TYPES.riskValidationService
  );
  private readonly actionValidationService = inject<ActionValidationService>(
    TYPES.actionValidationService
  );


  /**
   * Validates strategy and associated risk configuration.
   * Memoized to avoid redundant validations for the same strategy-exchange combination.
   *
   * @param context - Context with strategyName, exchangeName
   * @param methodName - Name of the calling method for error tracking
   */
  private validate = memoize(
    ([context]) => CREATE_KEY_FN(context),
    (context: { strategyName: StrategyName; exchangeName: ExchangeName }, methodName: string) => {
      this.loggerService.log(METHOD_NAME_VALIDATE, {
        context,
        methodName,
      });
      this.strategyValidationService.validate(context.strategyName, methodName);
      this.exchangeValidationService.validate(context.exchangeName, methodName);
      const { riskName, riskList, actions } = this.strategySchemaService.get(context.strategyName);
      riskName && this.riskValidationService.validate(riskName, methodName);
      riskList && riskList.forEach((riskName) => this.riskValidationService.validate(riskName, methodName));
      actions && actions.forEach((actionName) => this.actionValidationService.validate(actionName, methodName));
    }
  );

  /**
   * Runs live trading for a symbol with context propagation.
   *
   * Infinite async generator with crash recovery support.
   *
   * @param symbol - Trading pair symbol (e.g., "BTCUSDT")
   * @param context - Execution context with strategy and exchange names
   * @returns Infinite async generator yielding opened and closed signals
   */
  public run = (
    symbol: string,
    context: {
      strategyName: StrategyName;
      exchangeName: ExchangeName;
    }
  ) => {
    this.loggerService.log(METHOD_NAME_RUN, {
      symbol,
      context,
    });
    this.validate(context, METHOD_NAME_RUN);
    return this.liveLogicPublicService.run(symbol, context);
  };
}

export default LiveCommandService;
