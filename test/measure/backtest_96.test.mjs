import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_96.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// High win rate but black swans: 20 wins +0.5%, 10 losses -7%.
// winRate=66.7% looks great, but per-trade EV is hugely negative:
//   exp ≈ (2/3)*0.5 + (1/3)*(-7) ≈ -2.0  (probe reports -2.25 — pnls
//   computed with realistic compounded-equity context).
// The point: expectancy unmasks a "high-winrate" trap that certaintyRatio
// alone can hide. Sign must be NEGATIVE despite winRate > 50%.

const POOL = "POOL-B96";

const assertSwanExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must compute, got null`;
  // Critical: NEGATIVE even with winRate > 50%
  if (stats.expectancy >= 0) {
    return `expectancy must be NEGATIVE (swans dominate), got ${stats.expectancy} despite winRate=${stats.winRate}`;
  }
  if (stats.winRate === null || stats.winRate < 50) {
    return `winRate should be > 50% (high-winrate trap), got ${stats.winRate}`;
  }
  return null;
};

test("backtest_96.json: high winRate but swans → expectancy < 0 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest swan-trap expectancy unmasks high-winrate", ctx, assertSwanExpectancy);
});

test("backtest_96.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live swan-trap expectancy unmasks high-winrate", ctx, assertSwanExpectancy);
});
