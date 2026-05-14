---
title: docs/interface/IPersistCandleInstance
group: docs
---

# IPersistCandleInstance

Per-context candle cache persistence instance interface.
Scoped to a specific (symbol, interval, exchangeName) triple.

Each candle is keyed by its timestamp inside the context-scoped storage.
`readCandlesData` returns `null` when ANY of the expected timestamps is
missing (cache miss), so the caller can refetch from the exchange.

Custom adapters should implement this interface to override the default
file-based candle cache behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this candle context.

### readCandlesData

```ts
readCandlesData: (limit: number, sinceTimestamp: number, untilTimestamp: number) => Promise<ICandleData[]>
```

Read cached candles for the requested time window.
Returns null if any candle in the window is missing (cache miss).

### writeCandlesData

```ts
writeCandlesData: (candles: ICandleData[]) => Promise<void>
```

Write candles to cache.
Implementations may skip incomplete candles (closeTime &gt; now) and
existing keys to avoid overwriting fully closed candles.
