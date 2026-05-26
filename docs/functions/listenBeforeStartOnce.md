---
title: docs/function/listenBeforeStartOnce
group: docs
---

# listenBeforeStartOnce

```ts
declare function listenBeforeStartOnce(filterFn: (event: BeforeStartContract) => boolean, fn: (event: BeforeStartContract) => void): () => void;
```

Subscribes to filtered before start events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
