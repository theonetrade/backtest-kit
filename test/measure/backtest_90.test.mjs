import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_90.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// All wins: 30 trades, all +0.4%.
// lossProb=0 → expectancy = avgWin = +0.40 exactly.
// Confirms that expectancy DOES NOT divide by zero or go null
// when there are no losses (unlike certaintyRatio which needs |avgLoss|>0).

const POOL = "POOL-B90";

const assertAllWinsExpectancy = (stats) => {
  if (stats.lossCount !== 0) return `lossCount must be 0, got ${stats.lossCount}`;
  if (stats.expectancy === null) return `expectancy must be computed (no division), got null`;
  if (Math.abs(stats.expectancy - 0.4) > 1e-9) {
    return `expectancy must be ≈ +0.40 = avgWin, got ${stats.expectancy}`;
  }
  // certaintyRatio must still be null (no losses to divide by)
  if (stats.certaintyRatio !== null) {
    return `certaintyRatio must be null when lossCount=0, got ${stats.certaintyRatio}`;
  }
  return null;
};

test("backtest_90.json: all wins → expectancy=+0.40, certaintyRatio=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest all-wins expectancy verified", ctx, assertAllWinsExpectancy);
});

test("backtest_90.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live all-wins expectancy verified", ctx, assertAllWinsExpectancy);
});
