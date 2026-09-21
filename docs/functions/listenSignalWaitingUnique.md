---
title: docs/function/listenSignalWaitingUnique
group: docs
---

# listenSignalWaitingUnique

```ts
declare function listenSignalWaitingUnique(filterFn: (event: IStrategyTickResultWaiting) => boolean | Promise<boolean>, fn: (event: IStrategyTickResultWaiting) => void): () => void;
```

Subscribes to waiting tick results, once per new signal id (live + backtest).

The canonical use: "waiting" repeats every tick, so this reports the first tick a
resting entry satisfies the predicate and then stays quiet for that signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which waiting events are considered |
| `fn` | Callback invoked once per new signal id |
