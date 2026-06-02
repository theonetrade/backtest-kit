import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Schedule edge cases not covered by the main schedule.test.mjs:
// - 100% cancellation (no opened in resolved set)
// - avgWaitTime for cancelled (fractional minutes, symmetric to avgActivationTime)
// - buffer overflow behaviour

const STRATEGY = "schedule-extra";
const EXCHANGE = "ccxt-exchange";
const FRAME = "edge-frame";
const SYMBOL = "EDGE-SCHED-EXTRA";

const T0 = Date.UTC(2026, 0, 1);

const base = (id, { scheduledAt, pendingAt }) => ({
  id,
  symbol: SYMBOL,
  position: "long",
  note: "",
  priceOpen: 100,
  priceStopLoss: 95,
  priceTakeProfit: 105,
  originalPriceTakeProfit: 105,
  originalPriceStopLoss: 95,
  originalPriceOpen: 100,
  totalEntries: 1,
  totalPartials: 0,
  partialExecuted: 0,
  scheduledAt,
  pendingAt,
  exchangeName: EXCHANGE,
  strategyName: STRATEGY,
  frameName: FRAME,
});

const scheduled = (id, at) => ({
  action: "scheduled",
  signal: base(id, { scheduledAt: at, pendingAt: at }),
  currentPrice: 100,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

const cancelled = (id, scheduledAt, closeTimestamp, reason = "time_expired") => ({
  action: "cancelled",
  signal: base(id, { scheduledAt, pendingAt: scheduledAt }),
  currentPrice: 100,
  closeTimestamp,
  reason,
  cancelId: `c-${id}`,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

const opened = (id, scheduledAt, pendingAt) => ({
  action: "opened",
  signal: base(id, { scheduledAt, pendingAt }),
  currentPrice: 100,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
});

// ---------------------------------------------------------------------------
// Test 1: 100% cancellation — every scheduled signal is cancelled, none opened.
// activationRate = 0, cancellationRate = 100.
// ---------------------------------------------------------------------------
test("schedule_extra: 100% cancellation — activationRate=0, cancellationRate=100", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 5; i++) {
    await svc.tick(scheduled(`c${i}`, T0 + i * 60_000));
    await svc.tick(cancelled(`c${i}`, T0 + i * 60_000, T0 + i * 60_000 + 30 * 60_000));
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);
  if (stats.activationRate !== 0) return fail(`activationRate must be 0, got ${stats.activationRate}`);
  if (stats.cancellationRate !== 100) return fail(`cancellationRate must be 100, got ${stats.cancellationRate}`);
  pass(`100% cancellation verified: act=${stats.activationRate}, cancel=${stats.cancellationRate}`);
});

// ---------------------------------------------------------------------------
// Test 2: avgWaitTime keeps fractional minutes for cancelled signals.
// Mirror of the avgActivationTime test in schedule.test.mjs — same regression
// risk but on the cancelled branch.
// ---------------------------------------------------------------------------
test("schedule_extra: avgWaitTime keeps fractional minutes for cancelled signals", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Sub-minute waits: 15s, 25s, 45s → 0.25, 5/12, 0.75 min. avg = (15+25+45)/180 = 85/180 ≈ 0.4722
  await svc.tick(scheduled("w1", T0));
  await svc.tick(cancelled("w1", T0, T0 + 15_000));
  await svc.tick(scheduled("w2", T0 + 1000));
  await svc.tick(cancelled("w2", T0 + 1000, T0 + 1000 + 25_000));
  await svc.tick(scheduled("w3", T0 + 2000));
  await svc.tick(cancelled("w3", T0 + 2000, T0 + 2000 + 45_000));

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);

  const expected = (15 / 60 + 25 / 60 + 45 / 60) / 3;
  if (stats.avgWaitTime === null) return fail(`avgWaitTime must be non-null, got null`);
  if (Math.abs(stats.avgWaitTime - expected) > 1e-9) {
    return fail(`avgWaitTime must be ${expected} min, got ${stats.avgWaitTime}`);
  }
  if (Math.abs(stats.avgWaitTime) < 1e-6) {
    return fail(`avgWaitTime ≈ 0 — old buggy code rounded sub-30s to 0`);
  }
  pass(`Fractional minutes preserved: avgWaitTime=${stats.avgWaitTime.toFixed(6)} min`);
});

// ---------------------------------------------------------------------------
// Test 3: buffer trim — feed MORE events than the buffer capacity. We can't
// know CC_MAX_SCHEDULE_MARKDOWN_ROWS without coupling, but feeding 600 events
// is safely over the documented 250 limit. After that, totalEvents must be
// capped, not unbounded.
// ---------------------------------------------------------------------------
test("schedule_extra: buffer trims event list to a finite capacity", async ({ pass, fail }) => {
  const svc = lib.scheduleMarkdownService;
  svc.subscribe();
  await svc.clear({ symbol: "OVERFLOW", strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  for (let i = 0; i < 600; i++) {
    // mix scheduled+cancelled so we have varied event types.
    await svc.tick({ ...scheduled(`bf${i}`, T0 + i * 60_000), symbol: "OVERFLOW", signal: { ...scheduled(`bf${i}`, T0 + i * 60_000).signal, symbol: "OVERFLOW" } });
    await svc.tick({ ...cancelled(`bf${i}`, T0 + i * 60_000, T0 + i * 60_000 + 30_000), symbol: "OVERFLOW", signal: { ...cancelled(`bf${i}`, T0 + i * 60_000, T0 + i * 60_000 + 30_000).signal, symbol: "OVERFLOW" } });
  }

  const stats = await svc.getData("OVERFLOW", STRATEGY, EXCHANGE, FRAME, true);
  // Sent 1200 events. Cap is 250 (CC_MAX_SCHEDULE_MARKDOWN_ROWS). After
  // trimming, totalEvents must NOT exceed 250.
  if (stats.totalEvents > 250) {
    return fail(`buffer must trim to ≤250, got totalEvents=${stats.totalEvents} (1200 fed)`);
  }
  if (stats.totalEvents !== 250) {
    return fail(`expected totalEvents = 250 after overflow, got ${stats.totalEvents}`);
  }
  pass(`Buffer overflow trimmed: 1200 fed → ${stats.totalEvents} retained`);
});
