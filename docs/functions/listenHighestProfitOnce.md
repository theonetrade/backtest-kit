---
title: docs/function/listenHighestProfitOnce
group: docs
---

# listenHighestProfitOnce

```ts
declare function listenHighestProfitOnce(filterFn: (event: HighestProfitContract) => boolean | Promise<boolean>, fn: (event: HighestProfitContract) => void): () => void;
```

Subscribes to filtered highest profit events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for specific profit conditions.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
