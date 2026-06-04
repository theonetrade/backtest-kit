import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  addWalkerSchema,
  Walker,
  listenWalker,
  getAveragePrice,
} from "../../build/index.mjs";

import { createAwaiter } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

// ---------------------------------------------------------------------------
// Test 1: insufficient signals → bestStrategy stays null
//
// Flat candle stream, 1-day frame. Neither strategy closes enough signals to
// clear the Sharpe gate (N >= MIN_SIGNALS_FOR_RATIOS = 10). Every metricValue
// is null, so the running max never picks a winner — bestStrategy must stay
// null on every progress event. This is the post-audit invariant: don't crown
// a strategy on statistically unsafe data.
// ---------------------------------------------------------------------------

test("Walker: insufficient signals → bestStrategy stays null", async ({ pass, fail }) => {
  const [awaiter, { resolve, reject }] = createAwaiter();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60_000;
  const basePrice = 42_000;
  const bufferMinutes = 5;
  const bufferStartTime = startTime - bufferMinutes * intervalMs;

  const allCandles = [];
  for (let i = 0; i < 6; i++) {
    allCandles.push({
      timestamp: bufferStartTime + i * intervalMs,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 50,
      close: basePrice,
      volume: 100,
    });
  }

  addExchangeSchema({
    exchangeName: "binance-mock-walker-null",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const existing = allCandles.find((c) => c.timestamp === timestamp);
        result.push(
          existing ?? {
            timestamp,
            open: basePrice,
            high: basePrice + 100,
            low: basePrice - 50,
            close: basePrice,
            volume: 100,
          },
        );
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-walker-null-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "null-metric test 1",
        priceOpen: price,
        priceTakeProfit: price + 1_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-walker-null-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "null-metric test 2",
        priceOpen: price,
        priceTakeProfit: price + 2_000,
        priceStopLoss: price - 1_000,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "1d-backtest-walker-null",
    interval: "1d",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-02T00:00:00Z"),
  });

  addWalkerSchema({
    walkerName: "test-walker-null",
    exchangeName: "binance-mock-walker-null",
    frameName: "1d-backtest-walker-null",
    strategies: ["test-strategy-walker-null-1", "test-strategy-walker-null-2"],
    metric: "sharpeRatio",
  });

  const progressEvents = [];
  const unsubscribe = listenWalker((event) => {
    progressEvents.push({
      strategyName: event.strategyName,
      metricValue: event.metricValue,
      bestStrategy: event.bestStrategy,
      bestMetric: event.bestMetric,
      strategiesTested: event.strategiesTested,
      totalStrategies: event.totalStrategies,
    });

    if (event.strategiesTested !== event.totalStrategies) return;

    try {
      if (progressEvents.length !== 2) {
        fail(`expected 2 progress events, got ${progressEvents.length}`);
        reject();
        return;
      }
      for (const e of progressEvents) {
        if (e.metricValue !== null) {
          fail(`metricValue must be null (Sharpe gated), got ${e.metricValue}`);
          reject();
          return;
        }
        if (e.bestStrategy !== null) {
          fail(`bestStrategy must stay null, got ${e.bestStrategy}`);
          reject();
          return;
        }
        if (e.bestMetric !== null) {
          fail(`bestMetric must stay null, got ${e.bestMetric}`);
          reject();
          return;
        }
      }
      pass("bestStrategy=null when neither strategy clears the Sharpe gate");
      resolve();
    } finally {
      unsubscribe();
    }
  });

  for await (const _ of Walker.run("BTCUSDT", { walkerName: "test-walker-null" })) {
    // consume
  }
  await awaiter;
});

// ---------------------------------------------------------------------------
// Test 2: enough signals → bestStrategy populated
//
// Sawtooth candle stream over a multi-day frame. Each minute the price either
// climbs to TP or stays flat depending on a deterministic schedule, so each
// strategy closes well over MIN_SIGNALS_FOR_RATIOS = 10 trades. sharpeRatio
// is computed for at least one strategy; Walker's running max picks a winner
// and monotonically improves bestMetric.
// ---------------------------------------------------------------------------

test("Walker: sufficient signals → bestStrategy populated", async ({ pass, fail }) => {
  const [awaiter, { resolve, reject }] = createAwaiter();

  const startTime = new Date("2024-02-01T00:00:00Z").getTime();
  const intervalMs = 60_000;
  const basePrice = 42_000;

  // 60-minute cycles. First 30 min: completely flat at basePrice (lets
  // getAveragePrice converge so priceOpen ≈ basePrice). Then phase 45 is an
  // up-spike (magnitude alternates per cycle: large 800 vs small 80), and
  // phase 50 is a down-spike (always 500). The tight-TP strategy (+30) wins
  // on both up-spikes; the wider-TP strategy (+200) only wins on large ones
  // and loses to the down-spike on small cycles → mixed wins/losses, non-zero
  // stdDev, Sharpe computable and different between the two strategies.
  const candleAt = (timestamp) => {
    const minutesSinceStart = Math.floor((timestamp - startTime) / intervalMs);
    const cycle = Math.floor(minutesSinceStart / 60);
    const phase = ((minutesSinceStart % 60) + 60) % 60;
    const close = basePrice;
    const isUp = phase === 45;
    const isDown = phase === 50;
    const upMag = cycle % 2 === 0 ? 800 : 80;
    return {
      timestamp,
      open: close,
      high: isUp ? close + upMag : close + 1,
      low: isDown ? close - 500 : close - 1,
      close,
      volume: 100,
    };
  };

  addExchangeSchema({
    exchangeName: "binance-mock-walker-best",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push(candleAt(alignedSince + i * intervalMs));
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  addStrategySchema({
    strategyName: "test-strategy-walker-best-1",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "tight TP catches every up-spike",
        priceOpen: price,
        priceTakeProfit: price + 30,
        priceStopLoss: price - 300,
        minuteEstimatedTime: 60,
      };
    },
  });

  addStrategySchema({
    strategyName: "test-strategy-walker-best-2",
    interval: "1m",
    getSignal: async () => {
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "wider TP only catches large up-spike",
        priceOpen: price,
        priceTakeProfit: price + 200,
        priceStopLoss: price - 300,
        minuteEstimatedTime: 60,
      };
    },
  });

  addFrameSchema({
    frameName: "20d-backtest-walker-best",
    interval: "1d",
    startDate: new Date("2024-02-01T00:00:00Z"),
    endDate: new Date("2024-02-21T00:00:00Z"),
  });

  addWalkerSchema({
    walkerName: "test-walker-best",
    exchangeName: "binance-mock-walker-best",
    frameName: "20d-backtest-walker-best",
    strategies: ["test-strategy-walker-best-1", "test-strategy-walker-best-2"],
    metric: "sharpeRatio",
  });

  const progressEvents = [];
  const unsubscribe = listenWalker((event) => {
    progressEvents.push({
      strategyName: event.strategyName,
      metricValue: event.metricValue,
      bestStrategy: event.bestStrategy,
      bestMetric: event.bestMetric,
      strategiesTested: event.strategiesTested,
      totalStrategies: event.totalStrategies,
    });

    if (event.strategiesTested !== event.totalStrategies) return;

    try {
      if (progressEvents.length !== 2) {
        fail(`expected 2 progress events, got ${progressEvents.length}`);
        reject();
        return;
      }
      const [first, second] = progressEvents;

      if (first.metricValue === null && second.metricValue === null) {
        fail(`at least one strategy must clear the Sharpe gate — got null/null`);
        reject();
        return;
      }
      // After the final event, bestStrategy must be one of the two and
      // bestMetric must equal the max of the (non-null) metricValues.
      if (second.bestStrategy === null) {
        fail("bestStrategy must be non-null after all strategies tested");
        reject();
        return;
      }
      const known = ["test-strategy-walker-best-1", "test-strategy-walker-best-2"];
      if (!known.includes(second.bestStrategy)) {
        fail(`bestStrategy must be one of the configured strategies, got ${second.bestStrategy}`);
        reject();
        return;
      }
      // Running max is monotonic on bestMetric.
      if (
        first.bestMetric !== null &&
        second.bestMetric !== null &&
        second.bestMetric < first.bestMetric
      ) {
        fail(`bestMetric regressed: ${first.bestMetric} -> ${second.bestMetric}`);
        reject();
        return;
      }
      pass(`bestStrategy=${second.bestStrategy} bestMetric=${second.bestMetric}`);
      resolve();
    } finally {
      unsubscribe();
    }
  });

  for await (const _ of Walker.run("BTCUSDT", { walkerName: "test-walker-best" })) {
    // consume
  }
  await awaiter;
});
