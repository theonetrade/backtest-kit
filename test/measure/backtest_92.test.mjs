import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_92.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// N=9 below MIN_SIGNALS_FOR_RATIOS (=10).
// expectancy must be gated to null along with the other ratios.
// Computing per-trade EV on 9 trades is too noisy to publish.

const POOL = "POOL-B92";

const assertGatedExpectancy = (stats) => {
  if (stats.expectancy !== null) {
    return `expectancy must be null for N<MIN_SIGNALS_FOR_RATIOS, got ${stats.expectancy}`;
  }
  // Sanity: sharpeRatio also gated, confirms gate path active
  if (stats.sharpeRatio !== null) {
    return `sharpeRatio must also be null at N=9, got ${stats.sharpeRatio} (gate broken)`;
  }
  return null;
};

test("backtest_92.json: N=9 below gate → expectancy=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest expectancy gated below MIN_SIGNALS verified", ctx, assertGatedExpectancy);
});

test("backtest_92.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live expectancy gated below MIN_SIGNALS verified", ctx, assertGatedExpectancy);
});
