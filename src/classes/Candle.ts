import LoggerService from "../lib/services/base/LoggerService";
import { GLOBAL_CONFIG } from "../config/params";
import { Lock } from "./Lock";
import { sleep, Subject } from "functools-kit";

const METHOD_NAME_ACQUIRE_LOCK = "CandleUtils.acquireLock";
const METHOD_NAME_RELEASE_LOCK = "CandleUtils.releaseLock";
const METHOD_NAME_SPIN_LOCK = "CandleUtils.spinLock";

const ROTATE_DELAY = 50;

/** Logger service injected as DI singleton */
const LOGGER_SERVICE = new LoggerService();

export class CandleUtils {
  private _lock = new Lock();
  private _spin = new Subject<void>();

  /**
   * Acquires the candle fetch mutex if CC_ENABLE_CANDLE_FETCH_MUTEX is enabled.
   * Prevents concurrent candle fetches from the same exchange.
   *
   * @param source - Caller identifier for logging
   */
  public acquireLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_ACQUIRE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    await this._lock.acquireLock();
    await this._spin.next();
  };

  /**
   * Releases the candle fetch mutex if CC_ENABLE_CANDLE_FETCH_MUTEX is enabled.
   * Must be called after acquireLock, typically in a finally block.
   *
   * @param source - Caller identifier for logging
   */
  public releaseLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_RELEASE_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    return await this._lock.releaseLock();
  };

  public spinLock = async (source: string) => {
    LOGGER_SERVICE.info(METHOD_NAME_SPIN_LOCK, {
      source,
    });
    if (!GLOBAL_CONFIG.CC_ENABLE_CANDLE_FETCH_MUTEX) {
      return;
    }
    if (!GLOBAL_CONFIG.CC_ENABLE_BACKTEST_PARALLEL_SPIN) {
      return;
    }
    await Promise.race([
      this._spin.toPromise(),
      sleep(ROTATE_DELAY),
    ])
  }
}

export const Candle = new CandleUtils();
