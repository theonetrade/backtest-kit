---
title: docs/function/listenIdlePingFilter
group: docs
---

# listenIdlePingFilter

```ts
declare function listenIdlePingFilter(filterFn: (event: IdlePingContract) => boolean | Promise<boolean>, fn: (event: IdlePingContract) => void): () => void;
```

Subscribes to idle ping events matching the predicate, keeping the subscription.

Filtered variant of {@link listenIdlePing}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
