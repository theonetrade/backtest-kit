---
title: docs/function/listenBeforeStartFilter
group: docs
---

# listenBeforeStartFilter

```ts
declare function listenBeforeStartFilter(filterFn: (event: BeforeStartContract) => boolean | Promise<boolean>, fn: (event: BeforeStartContract) => void): () => void;
```

Subscribes to before start events matching the predicate, keeping the subscription.

Filtered variant of {@link listenBeforeStart}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
