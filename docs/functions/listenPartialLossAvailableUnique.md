---
title: docs/function/listenPartialLossAvailableUnique
group: docs
---

# listenPartialLossAvailableUnique

```ts
declare function listenPartialLossAvailableUnique(filterFn: (event: PartialLossContract) => boolean | Promise<boolean>, fn: (event: PartialLossContract) => void): () => void;
```

Subscribes to partial loss level events, delivering the callback once per new signal id.

Deduplicates on `event.data.id` — only the first matching loss level of a
signal reaches the callback. The same per-level caveat as the partial-profit
form applies: narrow `filterFn` to a single level if you need each one.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
