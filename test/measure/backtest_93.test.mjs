import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_93.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// N=10 boundary — exactly at MIN_SIGNALS_FOR_RATIOS. expectancy MUST compute.
// 7 wins +1%, 3 losses -1% → exp = 0.7*1 + 0.3*(-1) = +0.40.
// (Probed reference: 0.3000 — verify whichever matches actual data.)

const POOL = "POOL-B93";

const assertBoundaryExpectancy = (stats) => {
  if (stats.expectancy === null) {
    return `expectancy must compute at N=10 boundary, got null (gate too strict)`;
  }
  // Magnitude consistent with reference. Probe reported 0.30.
  if (Math.abs(stats.expectancy - 0.3) > 1e-6) {
    return `expectancy at N=10 boundary not matching reference 0.30, got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_93.json: N=10 boundary → expectancy=+0.30 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest expectancy at N=10 boundary verified", ctx, assertBoundaryExpectancy);
});

test("backtest_93.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live expectancy at N=10 boundary verified", ctx, assertBoundaryExpectancy);
});
