---
title: docs/function/listenPartialLossAvailableFilter
group: docs
---

# listenPartialLossAvailableFilter

```ts
declare function listenPartialLossAvailableFilter(filterFn: (event: PartialLossContract) => boolean | Promise<boolean>, fn: (event: PartialLossContract) => void): () => void;
```

Subscribes to partial loss level events matching the predicate, keeping the subscription.

Filtered variant of {@link listenPartialLossAvailable}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event (each new level of the same signal included).

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
