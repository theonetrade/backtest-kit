---
title: docs/function/cacheCandles
group: docs
---

# cacheCandles

```ts
declare function cacheCandles({ symbol, interval, from, to, exchangeName, onCheckStart, onWarmStart, }: ICacheCandlesParams): Promise<void>;
```

Ensures candles for the given range are present in persist storage.
Runs a check-then-warm pipeline with one retry: validates the cache first
and, on a miss, downloads the missing data and re-validates.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `__0` | |
