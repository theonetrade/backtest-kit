---
title: docs/function/listenSignalScheduledUnique
group: docs
---

# listenSignalScheduledUnique

```ts
declare function listenSignalScheduledUnique(filterFn: (event: IStrategyTickResultScheduled) => boolean | Promise<boolean>, fn: (event: IStrategyTickResultScheduled) => void): () => void;
```

Subscribes to scheduled tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which scheduled events are considered |
| `fn` | Callback invoked once per new signal id |
