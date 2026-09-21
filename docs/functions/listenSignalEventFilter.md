---
title: docs/function/listenSignalEventFilter
group: docs
---

# listenSignalEventFilter

```ts
declare function listenSignalEventFilter(filterFn: (event: SignalEventContract) => boolean | Promise<boolean>, fn: (event: SignalEventContract) => void): () => void;
```

Subscribes to pending lifecycle events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSignalEvent}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
