import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenSignalBacktest,
  listenDoneBacktest,
  getAveragePrice,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

/**
 * ПАРИТЕТ LIVE/BACKTEST ПО СОБЫТИЯМ (report parity, onBacktestTick).
 *
 * Live эмитит "active" на каждый тик мониторинга позиции. Раньше backtest
 * обрабатывал свечи внутри ClientStrategy.backtest() и глотал промежуточные
 * события — в signalBacktestEmitter попадали только opened/closed.
 *
 * После фикса ClientStrategy эмитит "active" на каждую свечу мониторинга
 * через onBacktestTick -> CALL_SIGNAL_EMIT_FN, и listenSignalBacktest обязан
 * получить полный поток: opened -> active (по-кандлово) -> closed.
 */
test("listenSignalBacktest receives per-candle active events between opened and closed", async ({ pass, fail }) => {
  const STRATEGY = "test-listen-backtest-active";
  const EXCHANGE = "binance-listen-backtest-active";
  const FRAME = "3h-listen-backtest-active";

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000;
  const basePrice = 42000;
  const lifetimeMinutes = 60;

  // Плоские свечи: VWAP ~ basePrice, TP/SL не задеваются никогда —
  // позиция живёт ровно minuteEstimatedTime и закрывается по time_expired.
  addExchangeSchema({
    exchangeName: EXCHANGE,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        result.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,
          low: basePrice - 50,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalEmitted = false;

  addStrategySchema({
    strategyName: STRATEGY,
    interval: "1m",
    getSignal: async () => {
      if (signalEmitted) {
        return null;
      }
      signalEmitted = true;
      const price = await getAveragePrice("BTCUSDT");
      return {
        position: "long",
        note: "listen backtest active parity",
        // Без priceOpen — немедленное открытие по текущей цене
        priceTakeProfit: price * 10,
        priceStopLoss: price / 10,
        minuteEstimatedTime: lifetimeMinutes,
      };
    },
  });

  addFrameSchema({
    frameName: FRAME,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T03:00:00Z"),
  });

  const events = [];
  const unListen = listenSignalBacktest((event) => {
    if (event.strategyName === STRATEGY) {
      events.push(event);
    }
  });

  const awaitSubject = new Subject();
  const unDone = listenDoneBacktest((event) => {
    if (event.strategyName === STRATEGY) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: FRAME,
  });

  await awaitSubject.toPromise();
  unListen();
  unDone();

  const openedIdx = events.findIndex((e) => e.action === "opened");
  const closedIdx = events.findIndex((e) => e.action === "closed");
  const activeEvents = events.filter((e) => e.action === "active");

  if (openedIdx === -1) {
    fail("No opened event reached listenSignalBacktest");
    return;
  }
  if (closedIdx === -1) {
    fail("No closed event reached listenSignalBacktest");
    return;
  }
  if (events[closedIdx].closeReason !== "time_expired") {
    fail(`Unexpected closeReason: ${events[closedIdx].closeReason} (expected time_expired)`);
    return;
  }

  // Покандловая эмиссия: позиция жила ~60 минут — ждём десятки active,
  // ровно один на свечу (до фикса здесь был ноль).
  if (activeEvents.length < 30 || activeEvents.length > lifetimeMinutes + 10) {
    fail(`Expected ~${lifetimeMinutes} per-candle active events, got ${activeEvents.length}`);
    return;
  }

  // Порядок потока: opened -> active... -> closed (в порядке доставки)
  const firstActiveIdx = events.findIndex((e) => e.action === "active");
  const lastActiveIdx = events.findLastIndex((e) => e.action === "active");
  if (!(openedIdx < firstActiveIdx && lastActiveIdx < closedIdx)) {
    fail(`Broken event order: opened=${openedIdx}, firstActive=${firstActiveIdx}, lastActive=${lastActiveIdx}, closed=${closedIdx}`);
    return;
  }

  // Каждая свеча эмитится ровно один раз: createdAt строго возрастает,
  // дублей (в т.ч. от chunk-финального active) нет.
  for (let i = 1; i < activeEvents.length; i++) {
    if (activeEvents[i].createdAt <= activeEvents[i - 1].createdAt) {
      fail(`Duplicate or out-of-order active createdAt at index ${i}: ${activeEvents[i - 1].createdAt} -> ${activeEvents[i].createdAt}`);
      return;
    }
  }

  // Санити полей active-события (форма как в live)
  const sample = activeEvents[0];
  if (
    sample.backtest !== true ||
    typeof sample.percentTp !== "number" ||
    typeof sample.percentSl !== "number" ||
    typeof sample.pnl?.pnlPercentage !== "number" ||
    !sample.signal?.id
  ) {
    fail("Active event is missing live-parity fields (backtest/percentTp/percentSl/pnl/signal)");
    return;
  }

  pass(`Per-candle stream verified: 1 opened, ${activeEvents.length} active, 1 closed (time_expired), strict order, no duplicates`);
});

/**
 * Scheduled-фаза: live эмитит "waiting" на каждый тик ожидания активации.
 * Backtest обязан отдавать в listenSignalBacktest тот же поток:
 * scheduled -> waiting (по-кандлово) -> opened (активация) -> closed.
 */
test("listenSignalBacktest receives scheduled, per-candle waiting, opened and closed for a scheduled signal", async ({ pass, fail }) => {
  const STRATEGY = "test-listen-backtest-waiting";
  const EXCHANGE = "binance-listen-backtest-waiting";
  const FRAME = "5h-listen-backtest-waiting";

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000;
  const basePrice = 42000;
  const waitingMinutes = 30;
  const lifetimeMinutes = 60;
  // До activationTime low не дотягивается до priceOpen (base - 150),
  // после — пробивает его и активирует scheduled-сигнал.
  const activationTime = startTime + waitingMinutes * intervalMs;

  addExchangeSchema({
    exchangeName: EXCHANGE,
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        const timestamp = alignedSince + i * intervalMs;
        const low = timestamp >= activationTime ? basePrice - 200 : basePrice - 100;
        result.push({
          timestamp,
          open: basePrice,
          high: basePrice + 50,
          low,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  let signalEmitted = false;

  addStrategySchema({
    strategyName: STRATEGY,
    interval: "1m",
    getSignal: async () => {
      if (signalEmitted) {
        return null;
      }
      signalEmitted = true;
      return {
        position: "long",
        note: "listen backtest waiting parity",
        // priceOpen ниже рынка — сигнал уходит в scheduled и ждёт касания
        priceOpen: basePrice - 150,
        priceTakeProfit: basePrice * 10,
        priceStopLoss: basePrice / 10,
        minuteEstimatedTime: lifetimeMinutes,
      };
    },
  });

  addFrameSchema({
    frameName: FRAME,
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T05:00:00Z"),
  });

  const events = [];
  const unListen = listenSignalBacktest((event) => {
    if (event.strategyName === STRATEGY) {
      events.push(event);
    }
  });

  const awaitSubject = new Subject();
  const unDone = listenDoneBacktest((event) => {
    if (event.strategyName === STRATEGY) {
      awaitSubject.next();
    }
  });

  Backtest.background("BTCUSDT", {
    strategyName: STRATEGY,
    exchangeName: EXCHANGE,
    frameName: FRAME,
  });

  await awaitSubject.toPromise();
  unListen();
  unDone();

  const scheduledIdx = events.findIndex((e) => e.action === "scheduled");
  const openedIdx = events.findIndex((e) => e.action === "opened");
  const closedIdx = events.findIndex((e) => e.action === "closed");
  const waitingEvents = events.filter((e) => e.action === "waiting");

  if (scheduledIdx === -1) {
    fail("No scheduled event reached listenSignalBacktest");
    return;
  }
  if (openedIdx === -1) {
    fail("No opened event reached listenSignalBacktest (scheduled activation lost)");
    return;
  }
  if (closedIdx === -1) {
    fail("No closed event reached listenSignalBacktest");
    return;
  }

  // Покандловая эмиссия ожидания: сигнал ждал ~30 минут — ждём десятки
  // waiting (до фикса здесь был ноль).
  if (waitingEvents.length < 10 || waitingEvents.length > waitingMinutes + 10) {
    fail(`Expected ~${waitingMinutes} per-candle waiting events, got ${waitingEvents.length}`);
    return;
  }

  // Порядок потока: scheduled -> waiting... -> opened -> closed
  const firstWaitingIdx = events.findIndex((e) => e.action === "waiting");
  const lastWaitingIdx = events.findLastIndex((e) => e.action === "waiting");
  if (!(scheduledIdx < firstWaitingIdx && lastWaitingIdx < openedIdx && openedIdx < closedIdx)) {
    fail(`Broken event order: scheduled=${scheduledIdx}, firstWaiting=${firstWaitingIdx}, lastWaiting=${lastWaitingIdx}, opened=${openedIdx}, closed=${closedIdx}`);
    return;
  }

  // Каждая свеча ожидания эмитится ровно один раз
  for (let i = 1; i < waitingEvents.length; i++) {
    if (waitingEvents[i].createdAt <= waitingEvents[i - 1].createdAt) {
      fail(`Duplicate or out-of-order waiting createdAt at index ${i}: ${waitingEvents[i - 1].createdAt} -> ${waitingEvents[i].createdAt}`);
      return;
    }
  }

  // Санити полей waiting-события (форма как в live: percentTp/percentSl = 0)
  const sample = waitingEvents[0];
  if (
    sample.backtest !== true ||
    sample.percentTp !== 0 ||
    sample.percentSl !== 0 ||
    typeof sample.pnl?.pnlPercentage !== "number" ||
    !sample.signal?.id
  ) {
    fail("Waiting event is missing live-parity fields (backtest/percentTp/percentSl/pnl/signal)");
    return;
  }

  pass(`Scheduled stream verified: 1 scheduled, ${waitingEvents.length} waiting, 1 opened, 1 closed, strict order, no duplicates`);
});
