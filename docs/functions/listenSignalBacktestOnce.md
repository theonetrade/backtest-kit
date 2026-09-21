---
title: docs/function/listenSignalBacktestOnce
group: docs
---

# listenSignalBacktestOnce

```ts
declare function listenSignalBacktestOnce(filterFn: (event: IStrategyTickResult) => boolean | Promise<boolean>, fn: (event: IStrategyTickResult) => void): () => void;
```

Subscribes to filtered backtest signal events with one-time execution.

Only receives events from Backtest.run() execution.
Executes callback once and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
