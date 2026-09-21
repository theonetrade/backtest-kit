---
title: docs/function/listenSchedulePingFilter
group: docs
---

# listenSchedulePingFilter

```ts
declare function listenSchedulePingFilter(filterFn: (event: SchedulePingContract) => boolean | Promise<boolean>, fn: (event: SchedulePingContract) => void): () => void;
```

Subscribes to schedule ping events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSchedulePing}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
