import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";
import signals from "../data/backtest_100.json" with { type: "json" };
import { runBacktestPool, runLivePool } from "../utils/measure_helpers.mjs";

// Corrupted updatedAt: 30 input signals, one with updatedAt=0.
// Both services filter via the single-source-of-truth validSignals /
// validClosed pass. Backtest validSignals checks updatedAt > 0; Live
// validClosed checks event.timestamp > 0 (mapped from updatedAt). Both
// reject the row → N=29 in both. Confirms expectancy participates in
// the same filter, not computed on the raw input.

const POOL = "POOL-B100";

const assertCorruptedExpectancy = (stats) => {
  const reportedN = stats.totalSignals ?? stats.totalClosed;
  if (reportedN !== 29) return `expected N=29 after corrupted-row filter, got ${reportedN}`;
  if (stats.expectancy === null) return `expectancy must compute on N=29, got null`;
  return null;
};

test("backtest_100.json: corrupted updatedAt filtered → expectancy on N=29 (Backtest)", async (ctx) => {
  await runBacktestPool(lib.backtestMarkdownService, signals, POOL, "Backtest expectancy with corrupted row filtered", ctx, assertCorruptedExpectancy);
});

test("backtest_100.json: same in Live", async (ctx) => {
  await runLivePool(lib.liveMarkdownService, signals, POOL, "Live expectancy with corrupted row filtered", ctx, assertCorruptedExpectancy);
});
