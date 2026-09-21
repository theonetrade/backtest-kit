---
title: docs/function/listenSignalLiveFilter
group: docs
---

# listenSignalLiveFilter

```ts
declare function listenSignalLiveFilter(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to live signal events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSignalLive}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
