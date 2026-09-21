---
title: docs/function/listenMaxDrawdownFilter
group: docs
---

# listenMaxDrawdownFilter

```ts
declare function listenMaxDrawdownFilter(filterFn: (event: MaxDrawdownContract) => boolean | Promise<boolean>, fn: (event: MaxDrawdownContract) => void): () => void;
```

Subscribes to max drawdown events matching the predicate, keeping the subscription.

Filtered variant of {@link listenMaxDrawdown}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event
(each deeper drawdown of the same signal included).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
