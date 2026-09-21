---
title: docs/function/listenPartialProfitAvailableFilter
group: docs
---

# listenPartialProfitAvailableFilter

```ts
declare function listenPartialProfitAvailableFilter(filterFn: (event: PartialProfitContract) => boolean | Promise<boolean>, fn: (event: PartialProfitContract) => void): () => void;
```

Subscribes to partial profit level events matching the predicate, keeping the subscription.

Filtered variant of {@link listenPartialProfitAvailable}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event (each new level of the same signal included).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
