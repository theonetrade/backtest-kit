---
title: docs/function/listenStrategyCommitOnce
group: docs
---

# listenStrategyCommitOnce

```ts
declare function listenStrategyCommitOnce(filterFn: (event: StrategyCommitContract) => boolean | Promise<boolean>, fn: (event: StrategyCommitContract) => void): () => void;
```

Subscribes to filtered strategy management events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific strategy actions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
