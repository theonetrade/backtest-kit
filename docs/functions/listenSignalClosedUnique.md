---
title: docs/function/listenSignalClosedUnique
group: docs
---

# listenSignalClosedUnique

```ts
declare function listenSignalClosedUnique(filterFn: (event: IStrategyTickResultClosed) => boolean | Promise<boolean>, fn: (event: IStrategyTickResultClosed) => void): () => void;
```

Subscribes to closed tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which closed events are considered |
| `fn` | Callback invoked once per new signal id |
