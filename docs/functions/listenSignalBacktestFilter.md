---
title: docs/function/listenSignalBacktestFilter
group: docs
---

# listenSignalBacktestFilter

```ts
declare function listenSignalBacktestFilter(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to backtest signal events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSignalBacktest}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
