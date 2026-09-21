---
title: docs/function/listenSignalOnce
group: docs
---

# listenSignalOnce

```ts
declare function listenSignalOnce(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to filtered signal events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific signal conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
