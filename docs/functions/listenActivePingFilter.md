---
title: docs/function/listenActivePingFilter
group: docs
---

# listenActivePingFilter

```ts
declare function listenActivePingFilter(filterFn: (event: ActivePingContract) => boolean | Promise<boolean>, fn: (event: ActivePingContract) => void): () => void;
```

Subscribes to active ping events matching the predicate, keeping the subscription.

Filtered variant of {@link listenActivePing}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
