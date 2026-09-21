---
title: docs/function/listenHighestProfitFilter
group: docs
---

# listenHighestProfitFilter

```ts
declare function listenHighestProfitFilter(filterFn: (event: HighestProfitContract) => boolean | Promise<boolean>, fn: (event: HighestProfitContract) => void): () => void;
```

Subscribes to highest profit events matching the predicate, keeping the subscription.

Filtered variant of {@link listenHighestProfit}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event (each new peak of the same signal included).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
