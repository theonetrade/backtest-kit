import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_88.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Exact zero EV: 30 trades, 15 wins +1%, 15 losses -1%.
// expectancy = 0.5*1 + 0.5*(-1) = 0 exactly.
// Must be the literal number 0, not null (computed is well-defined).

const POOL = "POOL-B88";

const assertZeroExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must be 0 (computed), got null`;
  if (Math.abs(stats.expectancy) > 1e-9) {
    return `expectancy must be ≈ 0 (exact zero EV), got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_88.json: zero expectancy (exact 0) verified (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest zero-EV expectancy verified", ctx, assertZeroExpectancy);
});

test("backtest_88.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live zero-EV expectancy verified", ctx, assertZeroExpectancy);
});
