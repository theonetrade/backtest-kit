import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_99.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Identical wins: 30 trades all +0.5%.
// stdDev=0 → sharpeRatio=null (STDDEV_EPSILON guard).
// expectancy = avgWin = +0.50 — well-defined despite Sharpe being null.
// Confirms expectancy and Sharpe are independent computations.

const POOL = "POOL-B99";

const assertIdenticalWinsExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must compute, got null`;
  if (Math.abs(stats.expectancy - 0.5) > 1e-9) {
    return `expectancy must be ≈ +0.50 = avgWin, got ${stats.expectancy}`;
  }
  // Sharpe must be null (float-artifact stdDev guard)
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must be null (stdDev ≈ 0), got ${stats.sharpeRatio}`;
  }
  return null;
};

test("backtest_99.json: identical wins → expectancy=+0.50, sharpe=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest identical-wins expectancy independent of Sharpe", ctx, assertIdenticalWinsExpectancy);
});

test("backtest_99.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live identical-wins expectancy independent of Sharpe", ctx, assertIdenticalWinsExpectancy);
});
