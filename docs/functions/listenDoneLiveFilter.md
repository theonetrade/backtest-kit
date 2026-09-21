---
title: docs/function/listenDoneLiveFilter
group: docs
---

# listenDoneLiveFilter

```ts
declare function listenDoneLiveFilter(filterFn: (event: DoneContract) => boolean | Promise<boolean>, fn: (event: DoneContract) => void): () => void;
```

Subscribes to live completion events matching the predicate, keeping the subscription.

Filtered variant of {@link listenDoneLive}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
