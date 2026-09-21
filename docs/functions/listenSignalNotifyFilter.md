---
title: docs/function/listenSignalNotifyFilter
group: docs
---

# listenSignalNotifyFilter

```ts
declare function listenSignalNotifyFilter(filterFn: (event: SignalInfoContract) => boolean | Promise<boolean>, fn: (event: SignalInfoContract) => void): () => void;
```

Subscribes to signal info events matching the predicate, keeping the subscription.

Filtered variant of {@link listenSignalNotify}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
