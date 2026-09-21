---
title: docs/function/listenPauseFilter
group: docs
---

# listenPauseFilter

```ts
declare function listenPauseFilter(filterFn: (event: PauseContract) => boolean | Promise<boolean>, fn: (event: PauseContract) => void): () => void;
```

Subscribes to pause state change events matching the predicate, keeping the subscription.

Filtered variant of {@link listenPause}: only events passing `filterFn` reach
the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
