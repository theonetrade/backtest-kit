---
title: docs/function/listenSignalEventOnce
group: docs
---

# listenSignalEventOnce

```ts
declare function listenSignalEventOnce(filterFn: (event: SignalEventContract) => boolean, fn: (event: SignalEventContract) => void): () => void;
```

Subscribes to filtered pending lifecycle events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for a specific open or close.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
