import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_89.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Break-even dilution: 30 trades — 12 wins +1%, 6 losses -1%, 12 break-even (pnl=0).
// winRate denominator excludes break-even: 12/(12+6) = 66.7%.
// expectancy denominator is N (total), so break-even still count:
//   exp = (12/30)*1 + (6/30)*(-1) = 0.4 - 0.2 = 0.20.
// This shows expectancy correctly DILUTES with break-even trades —
// a strategy that wins half its trades and breaks even on the rest
// has lower per-trade EV than one that always commits to a direction.

const POOL = "POOL-B89";

const assertBreakEvenDilution = (stats) => {
  if (stats.expectancy === null) return `expectancy must be computed, got null`;
  if (Math.abs(stats.expectancy - 0.2) > 1e-9) {
    return `expectancy must be ≈ 0.20 (diluted by break-evens), got ${stats.expectancy}`;
  }
  return null;
};

test("backtest_89.json: break-even dilution → expectancy 0.20 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest break-even dilution verified", ctx, assertBreakEvenDilution);
});

test("backtest_89.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live break-even dilution verified", ctx, assertBreakEvenDilution);
});
