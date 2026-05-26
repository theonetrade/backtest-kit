---
title: docs/function/listenAfterEndOnce
group: docs
---

# listenAfterEndOnce

```ts
declare function listenAfterEndOnce(filterFn: (event: AfterEndContract) => boolean, fn: (event: AfterEndContract) => void): () => void;
```

Subscribes to filtered after end events with one-time execution.
Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
