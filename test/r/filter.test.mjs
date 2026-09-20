import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addStrategySchema,
  listenSignalFilter,
  listenSignalLiveFilter,
  listenSignalBacktestFilter,
  listenSignalEventFilter,
  listenRiskFilter,
  listenPauseFilter,
  emitters,
} from "../../build/index.mjs";

// Same shared-registry bookkeeping as per_signal.test.mjs: the files in test/r
// share one process and add*Schema throws on a duplicate name.
const REGISTERED =
  (globalThis.__rSuiteRegistered ??= { exchanges: new Set(), strategies: new Set() });

const registerSchemas = (strategyNames, exchangeNames) => {
  for (const exchangeName of exchangeNames) {
    if (REGISTERED.exchanges.has(exchangeName)) continue;
    REGISTERED.exchanges.add(exchangeName);
    addExchangeSchema({
      exchangeName,
      getCandles: async () => [],
      formatPrice: async (_symbol, price) => price.toFixed(2),
      formatQuantity: async (_symbol, quantity) => quantity.toFixed(2),
    });
  }
  for (const strategyName of strategyNames) {
    if (REGISTERED.strategies.has(strategyName)) continue;
    REGISTERED.strategies.add(strategyName);
    addStrategySchema({ strategyName, interval: "1m", getSignal: async () => null });
  }
};

registerSchemas(["r-strategy"], ["r-exchange"]);

// ---------------------------------------------------------------------------
// The `...Filter` listeners in src/function/event.ts are the persistent
// counterpart of the `...Once` forms: same (filterFn, fn) signature, the
// predicate runs inside the plain listener's queued() wrapper, but nothing
// unsubscribes after a match — EVERY matching event must be delivered.
//
// Like the Unique suite, these tests drive the real exported subjects directly:
// the behaviour under test is pure stream wiring (predicate, persistence of the
// subscription, unsubscribe), none of which depends on a running strategy. Only
// UNGATED channels are driven with synthetic events — the gated ones (partial,
// breakeven, pings, notify, commit) confirm the position is live via
// hasPendingSignal first and belong to test/e2e.
// ---------------------------------------------------------------------------

// Subject.next() resolves once the value is dispatched, but every listener is
// wrapped in queued(...), so the user callback runs on a later turn. Awaiting a
// macrotask is what makes the collected arrays stable.
const flush = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// Every emitted event carries a full tick shape so no neighbouring listener
// attached by another in-flight test can throw on it.
const tick = (action, id, extra = {}) => ({
  action,
  signal: id === null ? null : { id, priceOpen: 100 },
  strategyName: "r-strategy",
  exchangeName: "r-exchange",
  frameName: "",
  symbol: "BTCUSDT",
  currentPrice: 100,
  backtest: false,
  createdAt: 1700000000000,
  pnl: { pnlPercentage: 0 },
  ...extra,
});

// ---------------------------------------------------------------------------
// 1. The core contract: every matching event is delivered, repeats included.
//    This is exactly what separates Filter from Once (stops after the first)
//    and from Unique (collapses repeats of the same signal id).
// ---------------------------------------------------------------------------
test("listenSignalFilter delivers every matching event without unsubscribing", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalFilter(
    (event) => event.action === "active",
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "A"));
  await emitters.signalEmitter.next(tick("active", "B"));
  await emitters.signalEmitter.next(tick("active", "A"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["A", "A", "B", "A"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["A","A","B","A"] — Filter must not dedup or self-unsubscribe`);
    return;
  }
  pass("all four matching events delivered, duplicates included");
});

// ---------------------------------------------------------------------------
// 2. Non-matching events never reach the callback
// ---------------------------------------------------------------------------
test("listenSignalFilter drops events failing the predicate", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalFilter(
    (event) => event.action === "closed",
    (event) => seen.push(`${event.action}:${event.signal.id}`)
  );

  await emitters.signalEmitter.next(tick("active", "F1"));
  await emitters.signalEmitter.next(tick("closed", "F1"));
  await emitters.signalEmitter.next(tick("opened", "F2"));
  await emitters.signalEmitter.next(tick("closed", "F2"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["closed:F1", "closed:F2"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["closed:F1","closed:F2"]`);
    return;
  }
  pass("only the two closed events passed the predicate");
});

// ---------------------------------------------------------------------------
// 3. The subscription survives a match (regression against the Once pattern:
//    a stray disposeFn call after the first delivery would truncate this to
//    a single element).
// ---------------------------------------------------------------------------
test("listenSignalFilter stays subscribed after the first match", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalFilter(
    () => true,
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "S1"));
  await flush();
  // the first match is fully processed by now; a self-unsubscribing listener
  // would miss everything below
  await emitters.signalEmitter.next(tick("active", "S2"));
  await emitters.signalEmitter.next(tick("active", "S3"));
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["S1", "S2", "S3"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["S1","S2","S3"] — listener detached after the first match`);
    return;
  }
  pass("delivery continued after the first match");
});

// ---------------------------------------------------------------------------
// 4. Explicit unsubscribe is the only way to stop delivery
// ---------------------------------------------------------------------------
test("listenSignalFilter unsubscribe stops delivery", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalFilter(
    () => true,
    (event) => seen.push(event.signal.id)
  );

  await emitters.signalEmitter.next(tick("active", "P"));
  await flush();
  unsubscribe();
  await emitters.signalEmitter.next(tick("active", "Q"));
  await flush();

  if (JSON.stringify(seen) !== JSON.stringify(["P"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["P"]`);
    return;
  }
  pass("no delivery after unsubscribe");
});

// ---------------------------------------------------------------------------
// 5. Live / backtest emitter isolation
// ---------------------------------------------------------------------------
test("listenSignalLiveFilter and listenSignalBacktestFilter stay on their own emitter", async ({ pass, fail }) => {
  const live = [];
  const backtested = [];
  const unsubscribeLive = listenSignalLiveFilter(
    () => true,
    (event) => live.push(event.signal.id)
  );
  const unsubscribeBacktest = listenSignalBacktestFilter(
    () => true,
    (event) => backtested.push(event.signal.id)
  );

  await emitters.signalLiveEmitter.next(tick("active", "L1"));
  await emitters.signalLiveEmitter.next(tick("active", "L2"));
  await emitters.signalBacktestEmitter.next(tick("active", "B1", { backtest: true }));
  // the global emitter must not feed either of the scoped listeners
  await emitters.signalEmitter.next(tick("active", "G1"));
  await flush();
  unsubscribeLive();
  unsubscribeBacktest();

  if (JSON.stringify(live) !== JSON.stringify(["L1", "L2"])) {
    fail(`live delivered ${JSON.stringify(live)} expected ["L1","L2"]`);
    return;
  }
  if (JSON.stringify(backtested) !== JSON.stringify(["B1"])) {
    fail(`backtest delivered ${JSON.stringify(backtested)} expected ["B1"]`);
    return;
  }
  pass("live and backtest filters saw only their own emitter, global leaked into neither");
});

// ---------------------------------------------------------------------------
// 6. Ungated contract channels: signalEvent (both transitions of one signal id
//    must arrive — the exact case listenSignalEventUnique suppresses), risk and
//    pause repeats.
// ---------------------------------------------------------------------------
test("listenSignalEventFilter delivers both transitions of the same signal id", async ({ pass, fail }) => {
  const seen = [];
  const unsubscribe = listenSignalEventFilter(
    () => true,
    (event) => seen.push(`${event.action}:${event.data.id}`)
  );

  const envelope = {
    strategyName: "r-strategy",
    exchangeName: "r-exchange",
    frameName: "",
    symbol: "BTCUSDT",
    currentPrice: 100,
    backtest: false,
    timestamp: 1700000000000,
  };
  // `data` must look like a real signal row: the framework's own report
  // services subscribe to these subjects too and read data.pnl / prices.
  const emit = (action, id, extra = {}) =>
    emitters.signalEventSubject.next({
      ...envelope,
      action,
      ...extra,
      data: {
        id,
        strategyName: "r-strategy",
        exchangeName: "r-exchange",
        frameName: "",
        symbol: "BTCUSDT",
        position: "long",
        priceOpen: 100,
        priceTakeProfit: 110,
        priceStopLoss: 90,
        originalPriceOpen: 100,
        originalPriceTakeProfit: 110,
        originalPriceStopLoss: 90,
        cost: 100,
        totalEntries: 1,
        totalPartials: 0,
        partialExecuted: 0,
        _partial: [],
        note: "r-test",
        scheduledAt: 1700000000000,
        pendingAt: 1700000000000,
        minuteEstimatedTime: 60,
        pnl: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
        peakProfit: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
        maxDrawdown: { pnlPercentage: 0, pnlCost: 0, pnlEntries: 0, priceOpen: 100, priceClose: 100 },
      },
    });

  await emit("opened", "E1");
  await emit("closed", "E1", { closeReason: "take_profit" });
  await flush();
  unsubscribe();

  if (JSON.stringify(seen) !== JSON.stringify(["opened:E1", "closed:E1"])) {
    fail(`delivered ${JSON.stringify(seen)} expected ["opened:E1","closed:E1"] — Filter must not dedup by signal id`);
    return;
  }
  pass("opened and closed of the same signal both delivered");
});

test("listenRiskFilter and listenPauseFilter deliver every matching repeat", async ({ pass, fail }) => {
  const risks = [];
  const pauses = [];
  const unsubscribeRisk = listenRiskFilter(
    (event) => event.symbol === "BTCUSDT",
    (event) => risks.push(event.rejectionNote)
  );
  const unsubscribePause = listenPauseFilter(
    (event) => event.paused === true,
    (event) => pauses.push(event.symbol)
  );

  // Full RiskContract shape: RiskMarkdownService / RiskReportService subscribe
  // to the same subject and read these fields.
  const riskEvent = (rejectionNote) => ({
    symbol: "BTCUSDT",
    currentSignal: {
      position: "long",
      priceOpen: 100,
      priceTakeProfit: 110,
      priceStopLoss: 90,
      note: "r-test",
    },
    strategyName: "r-strategy",
    exchangeName: "r-exchange",
    frameName: "",
    currentPrice: 100,
    activePositionCount: 1,
    rejectionId: null,
    rejectionNote,
    timestamp: 1700000000000,
    when: new Date(1700000000000),
    backtest: false,
  });

  const pauseEvent = (paused) => ({
    symbol: "BTCUSDT",
    paused,
    timestamp: 1700000000000,
    when: new Date(1700000000000),
    strategyName: "r-strategy",
    exchangeName: "r-exchange",
    frameName: "",
    backtest: false,
  });

  await emitters.riskSubject.next(riskEvent("limit"));
  await emitters.riskSubject.next(riskEvent("limit"));
  await emitters.riskSubject.next({ ...riskEvent("other-symbol"), symbol: "ETHUSDT" });
  await emitters.pauseSubject.next(pauseEvent(true));
  await emitters.pauseSubject.next(pauseEvent(false));
  await emitters.pauseSubject.next(pauseEvent(true));
  await flush();
  unsubscribeRisk();
  unsubscribePause();

  if (JSON.stringify(risks) !== JSON.stringify(["limit", "limit"])) {
    fail(`risk delivered ${JSON.stringify(risks)} expected ["limit","limit"]`);
    return;
  }
  if (JSON.stringify(pauses) !== JSON.stringify(["BTCUSDT", "BTCUSDT"])) {
    fail(`pause delivered ${JSON.stringify(pauses)} expected ["BTCUSDT","BTCUSDT"]`);
    return;
  }
  pass("risk repeats delivered, pause predicate filtered the resume event");
});

// ---------------------------------------------------------------------------
// 7. Async callbacks are serialised by the underlying queued() wrapper
// ---------------------------------------------------------------------------
test("listenSignalFilter serialises async callbacks", async ({ pass, fail }) => {
  const order = [];
  let inFlight = 0;
  const unsubscribe = listenSignalFilter(
    () => true,
    async (event) => {
      inFlight += 1;
      if (inFlight > 1) {
        order.push("OVERLAP");
      }
      order.push(`start:${event.signal.id}`);
      await flush(10);
      order.push(`end:${event.signal.id}`);
      inFlight -= 1;
    }
  );

  await emitters.signalEmitter.next(tick("active", "Q1"));
  await emitters.signalEmitter.next(tick("active", "Q2"));
  await flush(120);
  unsubscribe();

  if (JSON.stringify(order) !== JSON.stringify(["start:Q1", "end:Q1", "start:Q2", "end:Q2"])) {
    fail(`order was ${JSON.stringify(order)} — callbacks overlapped`);
    return;
  }
  pass("second event waited for the first callback to finish");
});
