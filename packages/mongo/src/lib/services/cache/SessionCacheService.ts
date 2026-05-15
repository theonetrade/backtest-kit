import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { ISessionRow } from "../../../schema/Session.schema";

const REDIS_KEY = "session_cache";

export class SessionCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(strategyName: string, exchangeName: string, frameName: string): string {
    return `${exchangeName}:${strategyName}:${frameName}`;
  }

  public async hasSessionId(strategyName: string, exchangeName: string, frameName: string): Promise<boolean> {
    this.loggerService.log("sessionCacheService hasSessionId", { strategyName, exchangeName, frameName });
    return await this.has(this._cacheKey(strategyName, exchangeName, frameName));
  }

  public async getSessionId(strategyName: string, exchangeName: string, frameName: string): Promise<string | null> {
    this.loggerService.log("sessionCacheService getSessionId", { strategyName, exchangeName, frameName });
    const id = <string>await super.get(this._cacheKey(strategyName, exchangeName, frameName));
    return id ?? null;
  }

  public async setSessionId(row: ISessionRow): Promise<string> {
    this.loggerService.log("sessionCacheService setSessionId", {
      strategyName: row.strategyName,
      exchangeName: row.exchangeName,
      frameName: row.frameName,
    });
    await super.set(this._cacheKey(row.strategyName, row.exchangeName, row.frameName), row.id);
    return row.id;
  }
}

export default SessionCacheService;
