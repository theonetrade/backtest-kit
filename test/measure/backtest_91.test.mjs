import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_91.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// All losses: 30 trades, all -0.4%.
// winProb=0 → expectancy = avgLoss = -0.40 exactly.
// Confirms negative expectancy is well-defined when there are no wins.

const POOL = "POOL-B91";

const assertAllLossesExpectancy = (stats) => {
  if (stats.winCount !== 0) return `winCount must be 0, got ${stats.winCount}`;
  if (stats.expectancy === null) return `expectancy must be computed, got null`;
  if (Math.abs(stats.expectancy - -0.4) > 1e-9) {
    return `expectancy must be ≈ -0.40 = avgLoss, got ${stats.expectancy}`;
  }
  // certaintyRatio = 0/|avgLoss| = 0 (NOT null — avgLoss is finite)
  if (stats.certaintyRatio !== null && Math.abs(stats.certaintyRatio) > 1e-9) {
    return `certaintyRatio should be ≈ 0 (no wins), got ${stats.certaintyRatio}`;
  }
  return null;
};

test("backtest_91.json: all losses → expectancy=-0.40 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest all-losses expectancy verified", ctx, assertAllLossesExpectancy);
});

test("backtest_91.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live all-losses expectancy verified", ctx, assertAllLossesExpectancy);
});
