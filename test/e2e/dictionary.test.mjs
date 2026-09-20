import { test } from "worker-testbed";

import {
  addExchangeSchema,
  addFrameSchema,
  addStrategySchema,
  Backtest,
  listenDoneBacktest,
  listenError,
  Dictionary,
} from "../../build/index.mjs";

import { Subject } from "functools-kit";

const alignTimestamp = (timestampMs, intervalMinutes) => {
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.floor(timestampMs / intervalMs) * intervalMs;
};

test("DICTIONARY: not enabled - static core throws before any storage access", async ({ pass, fail }) => {
  try {
    await Dictionary._get(
      {
        dictionaryName: "e2e-dict-disabled",
        signalId: "no-such-signal",
        backtest: true,
        when: new Date("2024-01-01T00:00:00Z"),
      },
      "key",
    );
    fail("Dictionary._get resolved without Dictionary.enable()");
    return;
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes("Dictionary is not enabled")) {
      fail(`Unexpected error message: ${message}`);
      return;
    }
    pass(`Dictionary._get threw before enable: ${message}`);
  }
});

test("DICTIONARY: instance methods throw outside execution context", async ({ pass, fail }) => {
  const dictionary = new Dictionary({ name: "e2e-dict-nocontext" });
  try {
    await dictionary.get("key");
    fail("Dictionary.get resolved outside execution context");
    return;
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes("requires an execution context")) {
      fail(`Unexpected error message: ${message}`);
      return;
    }
    pass(`Dictionary.get threw outside context: ${message}`);
  }
});

test("DICTIONARY: Map semantics per signal, isolation between signals, cleanup on close", async ({ pass, fail }) => {

  Dictionary.enable();

  const startTime = new Date("2024-01-01T00:00:00Z").getTime();
  const intervalMs = 60 * 1000; // 1 minute
  const basePrice = 42000;

  addExchangeSchema({
    exchangeName: "binance-dictionary-test",
    getCandles: async (_symbol, _interval, since, limit) => {
      const alignedSince = alignTimestamp(since.getTime(), 1);
      const result = [];
      for (let i = 0; i < limit; i++) {
        result.push({
          timestamp: alignedSince + i * intervalMs,
          open: basePrice,
          high: basePrice + 100,
          low: basePrice - 100,
          close: basePrice,
          volume: 100,
        });
      }
      return result;
    },
    formatPrice: async (_symbol, price) => price.toFixed(8),
    formatQuantity: async (_symbol, quantity) => quantity.toFixed(8),
  });

  // Facts collected from inside the strategy callbacks, asserted after the run
  const facts = [];
  const openedSignalIds = [];
  let signalsIssued = 0;

  addStrategySchema({
    strategyName: "test-strategy-dictionary",
    interval: "1m",
    getSignal: async () => {
      if (signalsIssued >= 2) {
        return null;
      }
      signalsIssued += 1;
      return {
        position: "long",
        note: `dictionary-signal-${signalsIssued}`,
        priceTakeProfit: basePrice + 10000,
        priceStopLoss: basePrice - 10000,
        minuteEstimatedTime: 3,
      };
    },
    callbacks: {
      onOpen: async (_symbol, data) => {
        openedSignalIds.push(data.id);
        const dictionary = new Dictionary({ name: "e2e-dict" });

        // The second signal must start from an EMPTY dictionary: the first
        // signal's instance was disposed on close and the signalId differs
        const sizeBefore = await dictionary.size();
        const originBefore = await dictionary.get("origin");
        facts.push({ event: "open", signalId: data.id, sizeBefore, originBefore });

        await dictionary.set("origin", { note: data.note });
        await dictionary.set("tmp", { note: "to-be-deleted" });
        const removed = await dictionary.delete("tmp");
        const removedAgain = await dictionary.delete("tmp");
        const hasOrigin = await dictionary.has("origin");
        const hasTmp = await dictionary.has("tmp");
        const keys = await dictionary.keys();
        const entries = await dictionary.entries();
        const size = await dictionary.size();
        facts.push({ event: "written", signalId: data.id, removed, removedAgain, hasOrigin, hasTmp, keys, entries, size });
      },
      // Backtest fast-forwards candles inside ClientStrategy.backtest(), so the
      // per-tick "active" callback never fires there — the per-minute active
      // ping is the channel that observes a monitored position mid-life.
      onActivePing: async (_symbol, data) => {
        const dictionary = new Dictionary({ name: "e2e-dict" });
        const origin = await dictionary.get("origin");
        facts.push({ event: "active", signalId: data.id, origin });
      },
    },
  });

  addFrameSchema({
    frameName: "30m-dictionary-test",
    interval: "1m",
    startDate: new Date("2024-01-01T00:00:00Z"),
    endDate: new Date("2024-01-01T00:30:00Z"),
  });

  const awaitSubject = new Subject();

  let errorCaught = null;
  const unsubscribeError = listenError((error) => {
    errorCaught = error;
    awaitSubject.next();
  });

  listenDoneBacktest(() => {
    awaitSubject.next();
  });

  Backtest.background("BTCUSDT", {
    strategyName: "test-strategy-dictionary",
    exchangeName: "binance-dictionary-test",
    frameName: "30m-dictionary-test",
  });

  await awaitSubject.toPromise();
  unsubscribeError();

  if (errorCaught) {
    fail(`Error during backtest: ${errorCaught.message || errorCaught}`);
    return;
  }

  if (openedSignalIds.length !== 2) {
    fail(`Expected 2 opened signals, got ${openedSignalIds.length}`);
    return;
  }
  if (openedSignalIds[0] === openedSignalIds[1]) {
    fail(`Expected two distinct signal ids, got the same: ${openedSignalIds[0]}`);
    return;
  }

  // 1. Both signals started from an empty dictionary (isolation + cleanup on close)
  for (const signalId of openedSignalIds) {
    const open = facts.find((row) => row.event === "open" && row.signalId === signalId);
    if (!open) {
      fail(`No open fact recorded for signal ${signalId}`);
      return;
    }
    if (open.sizeBefore !== 0 || open.originBefore !== null) {
      fail(`Signal ${signalId} did not start empty: size=${open.sizeBefore} origin=${JSON.stringify(open.originBefore)}`);
      return;
    }
  }

  // 2. Map semantics right after the writes in onOpen
  for (const signalId of openedSignalIds) {
    const written = facts.find((row) => row.event === "written" && row.signalId === signalId);
    if (!written) {
      fail(`No written fact recorded for signal ${signalId}`);
      return;
    }
    if (written.removed !== true || written.removedAgain !== false) {
      fail(`delete contract broken for ${signalId}: removed=${written.removed} removedAgain=${written.removedAgain}`);
      return;
    }
    if (written.hasOrigin !== true || written.hasTmp !== false) {
      fail(`has contract broken for ${signalId}: hasOrigin=${written.hasOrigin} hasTmp=${written.hasTmp}`);
      return;
    }
    if (written.size !== 1 || written.keys.length !== 1 || written.keys[0] !== "origin") {
      fail(`keys/size contract broken for ${signalId}: size=${written.size} keys=${JSON.stringify(written.keys)}`);
      return;
    }
    if (written.entries.length !== 1 || written.entries[0][0] !== "origin") {
      fail(`entries contract broken for ${signalId}: ${JSON.stringify(written.entries)}`);
      return;
    }
  }

  // 3. Later ticks of the SAME signal see the value written at open
  for (const signalId of openedSignalIds) {
    const actives = facts.filter((row) => row.event === "active" && row.signalId === signalId);
    if (actives.length === 0) {
      fail(`No active fact recorded for signal ${signalId}`);
      return;
    }
    for (const active of actives) {
      if (!active.origin || typeof active.origin.note !== "string") {
        fail(`Active tick of ${signalId} lost the stored value: ${JSON.stringify(active.origin)}`);
        return;
      }
    }
  }

  pass(`2 signals: each started empty, Map semantics held (set/get/has/delete/keys/entries/size), values visible across ticks`);
});
