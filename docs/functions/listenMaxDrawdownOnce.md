---
title: docs/function/listenMaxDrawdownOnce
group: docs
---

# listenMaxDrawdownOnce

```ts
declare function listenMaxDrawdownOnce(filterFn: (event: MaxDrawdownContract) => boolean | Promise<boolean>, fn: (event: MaxDrawdownContract) => void): () => void;
```

Subscribes to filtered max drawdown events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific drawdown conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
