---
title: docs/function/listenSignalLiveOnce
group: docs
---

# listenSignalLiveOnce

```ts
declare function listenSignalLiveOnce(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to filtered live signal events with one-time execution.

Only receives events from Live.run() execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
