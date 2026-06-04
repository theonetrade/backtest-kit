import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_95.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Whale outlier: 15 wins +1%, 15 losses -1%, one outsized whale win +1000%.
// Probed: exp ≈ 33.32 — dominated by the +1000% trade.
// This is a tell-tale of "unrealistically good" EV — investor sees one trade
// carrying the whole strategy. Expectancy should report the math honestly,
// NOT clamp, so the bias is visible.

const POOL = "POOL-B95";

const assertWhaleExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must compute, got null`;
  if (stats.expectancy < 20) {
    return `expectancy must reflect whale dominance (>20), got ${stats.expectancy}`;
  }
  if (!isFinite(stats.expectancy)) {
    return `expectancy non-finite: ${stats.expectancy} (whale broke arithmetic)`;
  }
  return null;
};

test("backtest_95.json: whale outlier → expectancy ≈ +33 (reports honestly, Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest whale expectancy reported honestly", ctx, assertWhaleExpectancy);
});

test("backtest_95.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live whale expectancy reported honestly", ctx, assertWhaleExpectancy);
});
