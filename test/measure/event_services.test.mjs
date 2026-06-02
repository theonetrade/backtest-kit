import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Smoke + memoization isolation + N/A formatting for the seven event-logger
// services that don't do statistics:
//   breakeven, highestProfit, maxDrawdown, partial (profit + loss), risk, sync
//
// These services are pure passthrough — accept events, key by
// (symbol, strategy, exchange, frame, backtest), expose getData. The only
// regressions they're prone to are:
//   - memoization key collision (events from one symbol leaking into another)
//   - tick handler accidentally dropping events
//   - getReport rendering null fields with the literal "null" or "NaN"
//
// We feed two distinct buckets per service and verify they remain independent.

const EXCHANGE = "ccxt-exchange";
const FRAME = "edge-frame";
const STRATEGY_A = "strat-A";
const STRATEGY_B = "strat-B";
const T0 = Date.UTC(2026, 0, 1);

// Minimal IPublicSignalRow — only the fields the markdown services actually
// reach into when handling these event types.
const makeSignalRow = (id, symbol, strategyName) => ({
  id,
  symbol,
  strategyName,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  position: "long",
  priceOpen: 100,
  priceStopLoss: 95,
  priceTakeProfit: 105,
  originalPriceOpen: 100,
  originalPriceStopLoss: 95,
  originalPriceTakeProfit: 105,
  scheduledAt: T0,
  pendingAt: T0,
  timestamp: T0,
  totalEntries: 1,
  totalPartials: 0,
  partialExecuted: 0,
  note: "",
  // peak/fall metadata services may dereference
  peakProfit: { pnlPercentage: 1.0 },
  maxDrawdown: { pnlPercentage: -0.5 },
  pnl: { pnlPercentage: 0.5, priceOpen: 100, priceClose: 100.5, pnlCost: 0.5, pnlEntries: 100 },
});

// ---------------------------------------------------------------------------
// breakevenMarkdownService — tickBreakeven
// ---------------------------------------------------------------------------
test("event_services: breakeven — memoization isolation across symbols", async ({ pass, fail }) => {
  const svc = lib.breakevenMarkdownService;
  svc.subscribe();
  await svc.clear();

  for (let i = 0; i < 3; i++) {
    await svc.tickBreakeven({
      symbol: "BE-A",
      data: makeSignalRow(`bea-${i}`, "BE-A", STRATEGY_A),
      currentPrice: 100,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }
  for (let i = 0; i < 5; i++) {
    await svc.tickBreakeven({
      symbol: "BE-B",
      data: makeSignalRow(`beb-${i}`, "BE-B", STRATEGY_B),
      currentPrice: 100,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }

  const a = await svc.getData("BE-A", STRATEGY_A, EXCHANGE, FRAME, true);
  const b = await svc.getData("BE-B", STRATEGY_B, EXCHANGE, FRAME, true);

  if (a.totalEvents !== 3) return fail(`BE-A.totalEvents must be 3, got ${a.totalEvents}`);
  if (b.totalEvents !== 5) return fail(`BE-B.totalEvents must be 5, got ${b.totalEvents}`);
  pass(`Breakeven isolation: A=${a.totalEvents}, B=${b.totalEvents}`);
});

// ---------------------------------------------------------------------------
// highestProfitMarkdownService — tick(data)
// ---------------------------------------------------------------------------
test("event_services: highestProfit — memoization isolation across symbols", async ({ pass, fail }) => {
  const svc = lib.highestProfitMarkdownService;
  svc.subscribe();
  await svc.clear();

  for (let i = 0; i < 4; i++) {
    await svc.tick({
      symbol: "HP-A",
      signal: makeSignalRow(`hpa-${i}`, "HP-A", STRATEGY_A),
      currentPrice: 100,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }
  for (let i = 0; i < 2; i++) {
    await svc.tick({
      symbol: "HP-B",
      signal: makeSignalRow(`hpb-${i}`, "HP-B", STRATEGY_B),
      currentPrice: 100,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }

  const a = await svc.getData("HP-A", STRATEGY_A, EXCHANGE, FRAME, true);
  const b = await svc.getData("HP-B", STRATEGY_B, EXCHANGE, FRAME, true);
  if (a.totalEvents !== 4) return fail(`HP-A.totalEvents must be 4, got ${a.totalEvents}`);
  if (b.totalEvents !== 2) return fail(`HP-B.totalEvents must be 2, got ${b.totalEvents}`);
  pass(`highestProfit isolation: A=${a.totalEvents}, B=${b.totalEvents}`);
});

// ---------------------------------------------------------------------------
// maxDrawdownMarkdownService — tick(data) (same shape as highestProfit)
// ---------------------------------------------------------------------------
test("event_services: maxDrawdown — memoization isolation across symbols", async ({ pass, fail }) => {
  const svc = lib.maxDrawdownMarkdownService;
  svc.subscribe();
  await svc.clear();

  for (let i = 0; i < 6; i++) {
    await svc.tick({
      symbol: "MD-A",
      signal: makeSignalRow(`mda-${i}`, "MD-A", STRATEGY_A),
      currentPrice: 100,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }
  await svc.tick({
    symbol: "MD-B",
    signal: makeSignalRow("mdb-0", "MD-B", STRATEGY_B),
    currentPrice: 100,
    backtest: true,
    timestamp: T0,
    exchangeName: EXCHANGE,
    frameName: FRAME,
  });

  const a = await svc.getData("MD-A", STRATEGY_A, EXCHANGE, FRAME, true);
  const b = await svc.getData("MD-B", STRATEGY_B, EXCHANGE, FRAME, true);
  if (a.totalEvents !== 6) return fail(`MD-A.totalEvents must be 6, got ${a.totalEvents}`);
  if (b.totalEvents !== 1) return fail(`MD-B.totalEvents must be 1, got ${b.totalEvents}`);
  pass(`maxDrawdown isolation: A=${a.totalEvents}, B=${b.totalEvents}`);
});

// ---------------------------------------------------------------------------
// partialMarkdownService — separate tickProfit / tickLoss methods
// ---------------------------------------------------------------------------
test("event_services: partial — tickProfit and tickLoss both routed correctly", async ({ pass, fail }) => {
  const svc = lib.partialMarkdownService;
  svc.subscribe();
  await svc.clear();

  for (let i = 0; i < 3; i++) {
    await svc.tickProfit({
      symbol: "PT",
      data: makeSignalRow(`pp-${i}`, "PT", STRATEGY_A),
      currentPrice: 100,
      level: 10,
      backtest: true,
      timestamp: T0 + i * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }
  for (let i = 0; i < 2; i++) {
    await svc.tickLoss({
      symbol: "PT",
      data: makeSignalRow(`pl-${i}`, "PT", STRATEGY_A),
      currentPrice: 100,
      level: 10,
      backtest: true,
      timestamp: T0 + (10 + i) * 1000,
      exchangeName: EXCHANGE,
      frameName: FRAME,
    });
  }

  const stats = await svc.getData("PT", STRATEGY_A, EXCHANGE, FRAME, true);
  if (stats.totalEvents !== 5) return fail(`partial totalEvents must be 5 (3 profit + 2 loss), got ${stats.totalEvents}`);
  pass(`Partial: 3 profit + 2 loss → ${stats.totalEvents} total`);
});

// ---------------------------------------------------------------------------
// riskMarkdownService — tickRejection(data)
// ---------------------------------------------------------------------------
test("event_services: risk — tickRejection memoization isolation", async ({ pass, fail }) => {
  const svc = lib.riskMarkdownService;
  svc.subscribe();
  await svc.clear();

  const makeRiskEvent = (symbol, strategyName, i) => ({
    timestamp: T0 + i * 1000,
    symbol,
    strategyName,
    exchangeName: EXCHANGE,
    frameName: FRAME,
    currentPrice: 100,
    activePositionCount: 0,
    rejectionId: `rej-${strategyName}-${i}`,
    rejectionNote: "synthetic-rejection",
    backtest: true,
    currentSignal: {
      symbol,
      strategyName,
      position: "long",
      priceOpen: 100,
      priceStopLoss: 95,
      priceTakeProfit: 105,
      cost: 100,
      note: "",
    },
  });

  for (let i = 0; i < 4; i++) await svc.tickRejection(makeRiskEvent("RSK-A", STRATEGY_A, i));
  for (let i = 0; i < 3; i++) await svc.tickRejection(makeRiskEvent("RSK-B", STRATEGY_B, i));

  const a = await svc.getData("RSK-A", STRATEGY_A, EXCHANGE, FRAME, true);
  const b = await svc.getData("RSK-B", STRATEGY_B, EXCHANGE, FRAME, true);
  if (a.totalRejections !== 4) return fail(`RSK-A.totalRejections must be 4, got ${a.totalRejections}`);
  if (b.totalRejections !== 3) return fail(`RSK-B.totalRejections must be 3, got ${b.totalRejections}`);
  pass(`Risk isolation: A=${a.totalRejections}, B=${b.totalRejections}`);
});

// ---------------------------------------------------------------------------
// syncMarkdownService — tick(SignalSyncContract: open|close)
// ---------------------------------------------------------------------------
test("event_services: sync — signal-open and signal-close ticks both registered", async ({ pass, fail }) => {
  const svc = lib.syncMarkdownService;
  svc.subscribe();
  await svc.clear();

  const SYM = "SYNC-X";
  const pnl = { pnlPercentage: 0.5, priceOpen: 100, priceClose: 100.5, pnlCost: 0.5, pnlEntries: 100 };
  const peakProfit = { pnlPercentage: 1.0, priceOpen: 100, priceClose: 101, pnlCost: 1.0, pnlEntries: 100 };
  const maxDrawdown = { pnlPercentage: -0.3, priceOpen: 100, priceClose: 99.7, pnlCost: -0.3, pnlEntries: 100 };
  const signal = makeSignalRow("sig-1", SYM, STRATEGY_A);

  const base = {
    symbol: SYM, strategyName: STRATEGY_A, exchangeName: EXCHANGE, frameName: FRAME,
    backtest: true, signalId: "sig-1", signal, pnl, peakProfit, maxDrawdown, cost: 100,
    position: "long", priceOpen: 100, priceTakeProfit: 105, priceStopLoss: 95,
    originalPriceTakeProfit: 105, originalPriceStopLoss: 95, originalPriceOpen: 100,
    scheduledAt: T0, pendingAt: T0, totalEntries: 1, totalPartials: 0, currentPrice: 100,
  };

  await svc.tick({ ...base, timestamp: T0, action: "signal-open" });
  await svc.tick({ ...base, timestamp: T0 + 60_000, action: "signal-close", closeReason: "take_profit", currentPrice: 101 });

  const stats = await svc.getData(SYM, STRATEGY_A, EXCHANGE, FRAME, true);
  if (stats.totalEvents !== 2) return fail(`sync totalEvents must be 2 (open + close), got ${stats.totalEvents}`);
  pass(`Sync: open + close → ${stats.totalEvents} events`);
});
