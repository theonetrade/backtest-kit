import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_86.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Positive expectancy: 30 trades, 20 wins +1%, 10 losses -1%.
// winProb=2/3, lossProb=1/3 → expectancy = (2/3)*1 + (1/3)*(-1) = +0.3333... per trade.
// Default runner check verifies expectancy against reference (helper).
// This file additionally locks down sign + magnitude.

const POOL = "POOL-B86";

const assertPositiveExpectancy = (stats) => {
  if (stats.totalSignals !== undefined && stats.totalSignals !== 30) {
    return `totalSignals must be 30, got ${stats.totalSignals}`;
  }
  if (stats.totalClosed !== undefined && stats.totalClosed !== 30) {
    return `totalClosed must be 30, got ${stats.totalClosed}`;
  }
  if (stats.expectancy === null) return `expectancy must be computed, got null`;
  if (stats.expectancy <= 0) return `expectancy must be positive, got ${stats.expectancy}`;
  if (Math.abs(stats.expectancy - 0.3) > 1e-9) {
    return `expectancy must be ≈ 0.30, got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_86.json: positive expectancy (+0.30) verified (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest positive expectancy verified", ctx, assertPositiveExpectancy);
});

test("backtest_86.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live positive expectancy verified", ctx, assertPositiveExpectancy);
});
