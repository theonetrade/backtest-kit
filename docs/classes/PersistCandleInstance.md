---
title: docs/class/PersistCandleInstance
group: docs
---

# PersistCandleInstance

Implements `IPersistCandleInstance`

Default file-based implementation of IPersistCandleInstance.

Features:
- Each candle stored as a separate JSON file keyed by its timestamp
- Read returns null on any missing timestamp (cache miss → refetch)
- Write skips incomplete candles (closeTime &gt; now) and existing keys
- Invalid cached candles emit warnings via errorEmitter and treated as miss

## Constructor

```ts
constructor(symbol: string, interval: CandleInterval, exchangeName: string);
```

## Properties

### symbol

```ts
symbol: string
```

### interval

```ts
interval: CandleInterval
```

### exchangeName

```ts
exchangeName: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readCandlesData

```ts
readCandlesData(limit: number, sinceTimestamp: number, _untilTimestamp: number): Promise<CandleData[] | null>;
```

Reads cached candles for the requested window.
Computes expected timestamps (sinceTimestamp + i * stepMs) and reads each
by timestamp key. Returns null on ANY missing timestamp (cache miss).
Invalid cached candles emit a warning via errorEmitter and are treated as miss.

### writeCandlesData

```ts
writeCandlesData(candles: CandleData[]): Promise<void>;
```

Writes candles to cache.
Skips incomplete candles (closeTime &gt; now) and existing keys to keep
the cache append-only for fully closed candles.
