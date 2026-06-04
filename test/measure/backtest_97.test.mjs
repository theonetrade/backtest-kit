import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_97.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Low win rate but prophet wins: 15 wins +5%, 15 losses -1%.
// winRate=50% looks middling, but per-trade EV is strongly positive:
//   exp = 0.5*5 + 0.5*(-1) = +2.0 (probe reports +1.95).
// Mirror of #96: expectancy unmasks a "trend-follower" strategy whose
// occasional big wins more than pay for many small losses.

const POOL = "POOL-B97";

const assertProphetExpectancy = (stats) => {
  if (stats.expectancy === null) return `expectancy must compute, got null`;
  if (stats.expectancy <= 1) {
    return `expectancy must be strongly POSITIVE (prophets dominate), got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_97.json: low winRate but prophets → expectancy > +1 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest prophet-payoff expectancy unmasks low-winrate", ctx, assertProphetExpectancy);
});

test("backtest_97.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live prophet-payoff expectancy unmasks low-winrate", ctx, assertProphetExpectancy);
});
