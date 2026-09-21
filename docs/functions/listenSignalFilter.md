---
title: docs/function/listenSignalFilter
group: docs
---

# listenSignalFilter

```ts
declare function listenSignalFilter(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to signal events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSignal}: like {@link listenSignalOnce} only
events passing `filterFn` reach the callback, but the listener stays attached
and delivers every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
