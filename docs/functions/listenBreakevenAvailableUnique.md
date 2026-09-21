---
title: docs/function/listenBreakevenAvailableUnique
group: docs
---

# listenBreakevenAvailableUnique

```ts
declare function listenBreakevenAvailableUnique(filterFn: (event: BreakevenContract) => boolean | Promise<boolean>, fn: (event: BreakevenContract) => void): () => void;
```

Subscribes to breakeven events, delivering the callback once per new signal id.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
