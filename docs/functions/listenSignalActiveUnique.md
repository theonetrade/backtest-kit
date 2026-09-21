---
title: docs/function/listenSignalActiveUnique
group: docs
---

# listenSignalActiveUnique

```ts
declare function listenSignalActiveUnique(filterFn: (event: IStrategyTickResultActive) => boolean | Promise<boolean>, fn: (event: IStrategyTickResultActive) => void): () => void;
```

Subscribes to active tick results, once per new signal id (live + backtest).

Active ticks repeat for the whole life of a position, so this fires the first tick
the position meets the condition and then goes silent for it.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which active events are considered |
| `fn` | Callback invoked once per new signal id |
