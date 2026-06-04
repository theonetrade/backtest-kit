import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_87.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Negative expectancy: 30 trades, 10 wins +1%, 20 losses -1%.
// expectancy = (1/3)*1 + (2/3)*(-1) = -0.3333... — a "lose money" strategy.
// Sign matters: investor must see this as red.

const POOL = "POOL-B87";

const assertNegativeExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must be computed, got null`;
  if (stats.expectancy >= 0) return `expectancy must be negative, got ${stats.expectancy}`;
  if (Math.abs(stats.expectancy - -0.3) > 1e-9) {
    return `expectancy must be ≈ -0.30, got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_87.json: negative expectancy (-0.30) verified (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest negative expectancy verified", ctx, assertNegativeExpectancy);
});

test("backtest_87.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live negative expectancy verified", ctx, assertNegativeExpectancy);
});
