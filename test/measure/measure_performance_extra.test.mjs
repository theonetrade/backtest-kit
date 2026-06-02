import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Performance edge cases not covered by performance.test.mjs:
// - waitTime statistics (avg/min/max between consecutive events of same type)
// - getReport sort: metrics ordered by totalDuration desc ("bottleneck first")

const STRATEGY = "perf-extra";
const EXCHANGE = "ccxt-exchange";
const FRAME = "perf-frame";

const T0 = Date.UTC(2026, 0, 1);

const ev = (metricType, duration, offset, previousOffset, symbol) => ({
  timestamp: T0 + offset,
  previousTimestamp: previousOffset === null ? null : T0 + previousOffset,
  metricType,
  duration,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol,
  backtest: true,
});

// ---------------------------------------------------------------------------
// Test 1: waitTime statistics.
// 5 events of type "backtest_signal" at offsets 0, 1000, 4000, 5000, 12000.
// previousTimestamp on each = previous event's timestamp.
// waitTimes = [1000, 3000, 1000, 7000].
// avg = 3000, min = 1000, max = 7000.
// ---------------------------------------------------------------------------
test("performance_extra: waitTime statistics — avg/min/max between consecutive events", async ({ pass, fail }) => {
  const svc = lib.performanceMarkdownService;
  svc.subscribe();
  const SYM = "PERF-WAIT";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  const offsets = [0, 1000, 4000, 5000, 12000];
  for (let i = 0; i < offsets.length; i++) {
    await svc.track(ev("backtest_signal", 5, offsets[i], i === 0 ? null : offsets[i - 1], SYM));
  }

  const stats = await svc.getData(SYM, STRATEGY, EXCHANGE, FRAME, true);
  const m = stats.metricStats["backtest_signal"];
  if (!m) return fail(`metricStats.backtest_signal missing`);

  const expectedWaits = [1000, 3000, 1000, 7000];
  const expectedAvg = expectedWaits.reduce((a, b) => a + b, 0) / expectedWaits.length; // 3000
  const expectedMin = Math.min(...expectedWaits); // 1000
  const expectedMax = Math.max(...expectedWaits); // 7000

  if (Math.abs(m.avgWaitTime - expectedAvg) > 1e-9) return fail(`avgWaitTime: expected ${expectedAvg}, got ${m.avgWaitTime}`);
  if (m.minWaitTime !== expectedMin) return fail(`minWaitTime: expected ${expectedMin}, got ${m.minWaitTime}`);
  if (m.maxWaitTime !== expectedMax) return fail(`maxWaitTime: expected ${expectedMax}, got ${m.maxWaitTime}`);
  pass(`waitTimes verified: avg=${m.avgWaitTime}, min=${m.minWaitTime}, max=${m.maxWaitTime}`);
});

// ---------------------------------------------------------------------------
// Test 2: getReport sorts metrics by totalDuration DESC. Bottleneck (largest
// total time) must appear first in the output. We render the report and
// verify the order of metric labels.
// ---------------------------------------------------------------------------
test("performance_extra: getReport sorts metrics by totalDuration DESC (bottleneck first)", async ({ pass, fail }) => {
  const svc = lib.performanceMarkdownService;
  svc.subscribe();
  const SYM = "PERF-SORT";
  await svc.clear({ symbol: SYM, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });

  // Three metrics with distinct totals:
  //   live_tick:        3 events × 10ms = 30ms total
  //   backtest_signal:  2 events × 50ms = 100ms total
  //   backtest_total:   1 event × 500ms = 500ms total  (largest → must appear first)
  await svc.track(ev("backtest_total", 500, 0, null, SYM));
  await svc.track(ev("backtest_signal", 50, 100, null, SYM));
  await svc.track(ev("backtest_signal", 50, 200, 100, SYM));
  await svc.track(ev("live_tick", 10, 300, null, SYM));
  await svc.track(ev("live_tick", 10, 400, 300, SYM));
  await svc.track(ev("live_tick", 10, 500, 400, SYM));

  const md = await svc.getReport(SYM, STRATEGY, EXCHANGE, FRAME, true);

  // Strip the table; look at the per-metric percentages list AFTER the table.
  // Each metric appears as "- **<metric>**: x.x% (yy.yy ms total)".
  const lines = md.split("\n").filter((l) => l.startsWith("- **"));
  if (lines.length < 3) return fail(`expected 3+ percentage lines, got ${lines.length}:\n${md}`);

  // Extract metric names in order of appearance.
  const order = lines.map((l) => l.match(/- \*\*([^*]+)\*\*/)?.[1]).filter(Boolean);
  const expectedOrder = ["backtest_total", "backtest_signal", "live_tick"];
  if (order.slice(0, 3).join("|") !== expectedOrder.join("|")) {
    return fail(`metric order: expected ${expectedOrder.join("|")}, got ${order.join("|")}`);
  }
  pass(`Sorted by totalDuration DESC: ${order.slice(0, 3).join(" > ")}`);
});
