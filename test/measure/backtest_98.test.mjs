import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_98.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// DCA realized: 15 winners +0.4%, 15 losers -0.3% — small per-trade.
// exp = 0.5*0.4 + 0.5*(-0.3) = +0.05 (probe matches).
// Confirms expectancy reads pnlPercentage from the realized field
// (not from cost-basis adjusted entries) — same source as winRate / avgPnl.

const POOL = "POOL-B98";

const assertDCAExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must compute, got null`;
  if (Math.abs(stats.expectancy - 0.05) > 1e-3) {
    return `expectancy magnitude wrong for DCA realized, got ${stats.expectancy} (expected ≈ +0.05)`;
  }
  return null;
};

test("backtest_98.json: DCA realized → expectancy ≈ +0.05 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest DCA realized expectancy verified", ctx, assertDCAExpectancy);
});

test("backtest_98.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live DCA realized expectancy verified", ctx, assertDCAExpectancy);
});
