import BaseMap from "../../common/BaseMap";
import { inject } from "../../core/di";
import { TYPES } from "../../core/types";
import LoggerService from "../base/LoggerService";
import { IDictionaryRow } from "../../../schema/Dictionary.schema";

const REDIS_KEY = "dictionary_cache";

export class DictionaryCacheService extends BaseMap(REDIS_KEY, -1) {
  readonly loggerService = inject<LoggerService>(TYPES.loggerService);

  private _cacheKey(signalId: string, dictionaryName: string): string {
    return `${signalId}:${dictionaryName}`;
  }

  public async hasDictionaryId(signalId: string, dictionaryName: string): Promise<boolean> {
    this.loggerService.log("dictionaryCacheService hasDictionaryId", { signalId, dictionaryName });
    return await this.has(this._cacheKey(signalId, dictionaryName));
  }

  public async getDictionaryId(signalId: string, dictionaryName: string): Promise<string | null> {
    this.loggerService.log("dictionaryCacheService getDictionaryId", { signalId, dictionaryName });
    const id = <string>await super.get(this._cacheKey(signalId, dictionaryName));
    return id ?? null;
  }

  public async setDictionaryId(row: IDictionaryRow): Promise<string> {
    this.loggerService.log("dictionaryCacheService setDictionaryId", {
      signalId: row.signalId,
      dictionaryName: row.dictionaryName,
    });
    await super.set(this._cacheKey(row.signalId, row.dictionaryName), row.id);
    return row.id;
  }
}

export default DictionaryCacheService;
