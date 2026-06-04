import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_94.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Float-artifact loss case: 29 wins +0.4%, 1 micro-loss ≈ -1e-15.
// avgLoss is essentially noise; certaintyRatio is correctly null
// (guard via |avgLoss| > STDDEV_EPSILON). expectancy must still be
// well-defined — the loss is real arithmetically:
//   exp = (29/30)*0.4 + (1/30)*(-1e-15) ≈ 0.3867 (probe reference).
// Confirms expectancy does NOT inherit certaintyRatio's STDDEV_EPSILON guard.

const POOL = "POOL-B94";

const assertArtifactLossExpectancy = (stats) => {
  if (stats.expectancy === null) {
    return `expectancy must compute (loss is real arithmetically), got null`;
  }
  if (Math.abs(stats.expectancy - 0.3867) > 1e-3) {
    return `expectancy magnitude wrong, got ${stats.expectancy} (expected ≈ 0.3867)`;
  }
  // certaintyRatio must be null because |avgLoss| is sub-epsilon
  if (stats.certaintyRatio !== null) {
    return `certaintyRatio must be null (avgLoss is float artifact), got ${stats.certaintyRatio}`;
  }
  return null;
};

test("backtest_94.json: float-artifact loss → expectancy=+0.39, certainty=null (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest expectancy with float-artifact loss verified", ctx, assertArtifactLossExpectancy);
});

test("backtest_94.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live expectancy with float-artifact loss verified", ctx, assertArtifactLossExpectancy);
});
