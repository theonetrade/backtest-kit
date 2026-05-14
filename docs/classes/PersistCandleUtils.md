---
title: docs/class/PersistCandleUtils
group: docs
---

# PersistCandleUtils

Utility class for managing candles cache persistence.

Features:
- Each candle stored as separate JSON file: ${exchangeName}/${symbol}/${interval}/${timestamp}.json
- Cache validation: returns cached data if file count matches requested limit
- Automatic cache invalidation and refresh when data is incomplete
- Atomic read/write operations

Used by ClientExchange for candle data caching.

## Constructor

```ts
constructor();
```

## Properties

### PersistCandleInstanceCtor

```ts
PersistCandleInstanceCtor: any
```

Constructor used to create per-context candle cache instances.
Replaceable via usePersistCandleAdapter() / useJson() / useDummy().

### getCandlesStorage

```ts
getCandlesStorage: any
```

Memoized factory creating one IPersistCandleInstance per (symbol, interval, exchange) triple.

### readCandlesData

```ts
readCandlesData: (symbol: string, interval: CandleInterval, exchangeName: string, limit: number, sinceTimestamp: number, untilTimestamp: number) => Promise<ICandleData[]>
```

Reads cached candles for the given context and time window.
Lazily initializes the instance on first access.

### writeCandlesData

```ts
writeCandlesData: (candles: ICandleData[], symbol: string, interval: CandleInterval, exchangeName: string) => Promise<void>
```

Writes candles to cache for the given context.
Lazily initializes the instance on first access.

## Methods

### usePersistCandleAdapter

```ts
usePersistCandleAdapter(Ctor: TPersistCandleInstanceCtor): void;
```

Registers a custom IPersistCandleInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### clear

```ts
clear(): void;
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistCandleInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistCandleDummyInstance (always returns null on read, discards writes).
