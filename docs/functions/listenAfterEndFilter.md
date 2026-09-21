---
title: docs/function/listenAfterEndFilter
group: docs
---

# listenAfterEndFilter

```ts
declare function listenAfterEndFilter(filterFn: (event: AfterEndContract) => boolean | Promise<boolean>, fn: (event: AfterEndContract) => void): () => void;
```

Subscribes to after end events matching the predicate, keeping the subscription.

Filtered variant of {@link listenAfterEnd}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
