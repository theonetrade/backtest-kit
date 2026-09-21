---
title: docs/function/listenBreakevenAvailableFilter
group: docs
---

# listenBreakevenAvailableFilter

```ts
declare function listenBreakevenAvailableFilter(filterFn: (event: BreakevenContract) => boolean | Promise<boolean>, fn: (event: BreakevenContract) => void): () => void;
```

Subscribes to breakeven events matching the predicate, keeping the subscription.

Filtered variant of {@link listenBreakevenAvailable}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
