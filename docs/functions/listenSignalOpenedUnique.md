---
title: docs/function/listenSignalOpenedUnique
group: docs
---

# listenSignalOpenedUnique

```ts
declare function listenSignalOpenedUnique(filterFn: (event: IStrategyTickResultOpened) => boolean | Promise<boolean>, fn: (event: IStrategyTickResultOpened) => void): () => void;
```

Subscribes to opened tick results, once per new signal id (live + backtest).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which opened events are considered |
| `fn` | Callback invoked once per new signal id |
