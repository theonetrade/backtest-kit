---
title: docs/function/listenScheduleEventOnce
group: docs
---

# listenScheduleEventOnce

```ts
declare function listenScheduleEventOnce(filterFn: (event: ScheduleEventContract) => boolean, fn: (event: ScheduleEventContract) => void): () => void;
```

Subscribes to filtered scheduled lifecycle events with one-time execution.

Listens for events matching the filter predicate, then executes callback once
and automatically unsubscribes. Useful for waiting for a specific scheduled creation
or cancellation.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle the filtered event (called only once) |
