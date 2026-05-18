import {
  addStrategySchema,
  listenError,
  Log,
  Position,
} from "backtest-kit";
import { errorData, getErrorMessage, singleshot, str } from "functools-kit";
import { readFile } from "fs/promises";
import { join } from "path";

const HOLD_MINUTES = 24 * 60;
const HARD_STOP_PERCENT = 50;

const MIN_ABS_DPROB = 0.05;
const MAX_SIGNAL_AGE_MS = 60 * 60 * 1000;

const POLY_RESULT_PATH = join(
  __dirname,
  "assets",
  "polymarket-backtest-result.json",
);

interface IPolySignal {
  timestamp: number;
  dateISO: string;
  direction: "long" | "short";
  dprob: number;
}

interface IRawSignal {
  dateISO: string;
  t: number;
  dprob: number;
  direction: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  win: boolean;
}

interface IRawResult {
  results: Array<{ signals: IRawSignal[] }>;
}

const getPolymarketSignals = singleshot(async (): Promise<IPolySignal[]> => {
  const raw = await readFile(POLY_RESULT_PATH, "utf-8");
  const parsed = JSON.parse(raw) as IRawResult;

  const byDay = new Map<string, IRawSignal>();
  for (const result of parsed.results) {
    for (const sig of result.signals) {
      const day = sig.dateISO.slice(0, 10);
      const current = byDay.get(day);
      if (!current || Math.abs(sig.dprob) > Math.abs(current.dprob)) {
        byDay.set(day, sig);
      }
    }
  }

  return [...byDay.values()]
    .sort((a, b) => a.t - b.t)
    .map(({ t, dateISO, direction, dprob }) => ({
      timestamp: t,
      dateISO,
      direction,
      dprob,
    }));
});

const pickSignal = (signals: IPolySignal[], when: Date): IPolySignal | null => {
  const now = when.getTime();
  for (let i = signals.length - 1; i >= 0; i--) {
    const sig = signals[i];
    if (sig.timestamp > now) continue;
    if (now - sig.timestamp > MAX_SIGNAL_AGE_MS) return null;
    if (Math.abs(sig.dprob) < MIN_ABS_DPROB) return null;
    return sig;
  }
  return null;
};

addStrategySchema({
  strategyName: "apr_2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when, currentPrice) => {

    console.log(symbol, when);

    const polySignals = await getPolymarketSignals();
    const sig = pickSignal(polySignals, when);

    if (!sig) {
      return null;
    }

    console.log(sig);

    return {
      position: sig.direction,
      ...Position.moonbag({
        currentPrice,
        position: sig.direction,
        percentStopLoss: HARD_STOP_PERCENT,
      }),
      minuteEstimatedTime: HOLD_MINUTES,
      note: str.newline(
        `# Polymarket Δprob сигнал ${sig.direction}`,
        `dprob=${sig.dprob.toFixed(3)} signalAt=${sig.dateISO}`,
      ),
    };
  },
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
