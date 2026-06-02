import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// WalkerMarkdownService — verifies the contract that walker is a PASSTHROUGH
// for BacktestStatisticsModel: stats produced by Backtest math (after our
// fixes) must surface unchanged through walker.getData(). If walker ever
// starts recomputing the suite locally, this test fails.

const WALKER = "edge-walker";
const EXCHANGE = "ccxt-exchange";
const FRAME = "edge-frame";
const SYMBOL = "EDGE-WALKER";

// Hand-crafted BacktestStatisticsModel matching what BacktestMarkdownService
// would produce. Mirrors all fields the model contract exposes.
const makeStats = (overrides = {}) => ({
  signalList: [],
  totalSignals: 22,
  winCount: 15,
  lossCount: 7,
  winRate: 68.18,
  avgPnl: 0.5,
  totalPnl: 11.0,
  stdDev: 0.8,
  sharpeRatio: 0.625,
  annualizedSharpeRatio: 4.2,
  certaintyRatio: 1.4,
  expectedYearlyReturns: 45.0,
  avgPeakPnl: 1.2,
  avgFallPnl: -0.8,
  sortinoRatio: 1.1,
  calmarRatio: 5.6,
  recoveryFactor: 2.4,
  ...overrides,
});

const makeContract = (strategyName, stats, metric = "sharpeRatio", metricValue = stats.sharpeRatio) => ({
  walkerName: WALKER,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  strategyName,
  stats,
  metricValue,
  metric,
  bestMetric: metricValue,
  bestStrategy: strategyName,
  strategiesTested: 1,
  totalStrategies: 3,
});

// ---------------------------------------------------------------------------
// Test 1: stats passthrough — every field of BacktestStatisticsModel is
// preserved bit-for-bit through walker.tick → walker.getData.
// ---------------------------------------------------------------------------
test("walker: BacktestStatisticsModel passes through unchanged", async ({ pass, fail }) => {
  const svc = lib.walkerMarkdownService;
  svc.subscribe();
  svc.clear(); // wipe all walker keys

  const inputStats = makeStats();
  await svc.tick(makeContract("strat-pass", inputStats));

  const results = await svc.getData(WALKER, SYMBOL, "sharpeRatio", { exchangeName: EXCHANGE, frameName: FRAME });

  const row = results.strategyResults.find((r) => r.strategyName === "strat-pass");
  if (!row) {
    fail(`strategy result for "strat-pass" not found in walker getData`);
    return;
  }
  const numericFields = [
    "totalSignals", "winCount", "lossCount", "winRate", "avgPnl", "totalPnl",
    "stdDev", "sharpeRatio", "annualizedSharpeRatio", "certaintyRatio",
    "expectedYearlyReturns", "avgPeakPnl", "avgFallPnl", "sortinoRatio",
    "calmarRatio", "recoveryFactor",
  ];
  for (const f of numericFields) {
    if (row.stats[f] !== inputStats[f]) {
      fail(`stats.${f} drift: walker=${row.stats[f]} input=${inputStats[f]}`);
      return;
    }
  }
  pass(`Stats passthrough verified across ${numericFields.length} fields`);
});

// ---------------------------------------------------------------------------
// Test 2: ranking — walker stores bestStrategy/bestMetric directly from each
// contract (the walker engine decides the winner upstream, not this service).
// Feed 3 strategies in order; the last contract carries the actual winner
// (mimicking what the real walker engine emits). Service must retain that
// winner and surface all 3 strategy rows for comparison.
// ---------------------------------------------------------------------------
test("walker: passes through bestStrategy/bestMetric from the latest contract", async ({ pass, fail }) => {
  const svc = lib.walkerMarkdownService;
  svc.subscribe();
  svc.clear();

  const a = makeStats({ sharpeRatio: 0.5 });
  const b = makeStats({ sharpeRatio: 1.8 }); // winner — engine picks this
  const c = makeStats({ sharpeRatio: 0.9 });

  // Each contract advertises the running-best as-of-when-it-fired:
  //  - after A only, best is A (0.5)
  //  - after B, best becomes B (1.8)
  //  - after C, best is still B (B > C). This mirrors the actual engine flow.
  await svc.tick({ ...makeContract("strat-A", a, "sharpeRatio", 0.5), bestStrategy: "strat-A", bestMetric: 0.5 });
  await svc.tick({ ...makeContract("strat-B", b, "sharpeRatio", 1.8), bestStrategy: "strat-B", bestMetric: 1.8 });
  await svc.tick({ ...makeContract("strat-C", c, "sharpeRatio", 0.9), bestStrategy: "strat-B", bestMetric: 1.8 });

  const results = await svc.getData(WALKER, SYMBOL, "sharpeRatio", { exchangeName: EXCHANGE, frameName: FRAME });
  if (results.bestStrategy !== "strat-B") {
    fail(`bestStrategy must be strat-B (engine's choice in last contract), got ${results.bestStrategy}`);
    return;
  }
  if (Math.abs(results.bestMetric - 1.8) > 1e-9) {
    fail(`bestMetric must be 1.8, got ${results.bestMetric}`);
    return;
  }
  if (results.strategyResults.length !== 3) {
    fail(`strategyResults must contain 3 entries, got ${results.strategyResults.length}`);
    return;
  }
  pass(`Walker passthrough: bestStrategy=${results.bestStrategy} bestMetric=${results.bestMetric}`);
});

// ---------------------------------------------------------------------------
// Test 3: null metricValue — strategies with null metric (e.g. gated math
// where sharpe couldn't be computed) must still register in strategyResults
// but cannot beat a strategy with a numeric metric.
// ---------------------------------------------------------------------------
test("walker: null metricValue does not displace a numeric winner", async ({ pass, fail }) => {
  const svc = lib.walkerMarkdownService;
  svc.subscribe();
  svc.clear();

  const gated = makeStats({ sharpeRatio: null }); // N<10 etc.
  const valid = makeStats({ sharpeRatio: 0.7 });

  // Engine resolves the best — null metric never beats a numeric one.
  await svc.tick({ ...makeContract("strat-gated", gated, "sharpeRatio", null), bestStrategy: null, bestMetric: null });
  await svc.tick({ ...makeContract("strat-valid", valid, "sharpeRatio", 0.7), bestStrategy: "strat-valid", bestMetric: 0.7 });

  const results = await svc.getData(WALKER, SYMBOL, "sharpeRatio", { exchangeName: EXCHANGE, frameName: FRAME });
  if (results.bestStrategy !== "strat-valid") {
    fail(`bestStrategy must be strat-valid (only numeric), got ${results.bestStrategy}`);
    return;
  }
  if (results.bestMetric !== 0.7) {
    fail(`bestMetric must be 0.7, got ${results.bestMetric}`);
    return;
  }
  const gatedRow = results.strategyResults.find((r) => r.strategyName === "strat-gated");
  if (!gatedRow) {
    fail(`strat-gated must still appear in strategyResults`);
    return;
  }
  if (gatedRow.metricValue !== null) {
    fail(`gated strategy metricValue must remain null, got ${gatedRow.metricValue}`);
    return;
  }
  pass(`Null metric handled: gated strategy preserved but not chosen as best`);
});
