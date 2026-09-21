---
title: docs/function/listenDoneBacktestFilter
group: docs
---

# listenDoneBacktestFilter

```ts
declare function listenDoneBacktestFilter(filterFn: (event: DoneContract) => boolean | Promise<boolean>, fn: (event: DoneContract) => void): () => void;
```

Subscribes to backtest completion events matching the predicate, keeping the subscription.

Filtered variant of {@link listenDoneBacktest}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
