---
title: docs/function/listenWalkerFilter
group: docs
---

# listenWalkerFilter

```ts
declare function listenWalkerFilter(filterFn: (event: WalkerContract) => boolean | Promise<boolean>, fn: (event: WalkerContract) => void): () => void;
```

Subscribes to walker progress events matching the predicate, keeping the subscription.

Filtered variant of {@link listenWalker}: only events passing `filterFn`
reach the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
