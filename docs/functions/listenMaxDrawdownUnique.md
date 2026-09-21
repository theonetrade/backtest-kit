---
title: docs/function/listenMaxDrawdownUnique
group: docs
---

# listenMaxDrawdownUnique

```ts
declare function listenMaxDrawdownUnique(filterFn: (event: MaxDrawdownContract) => boolean | Promise<boolean>, fn: (event: MaxDrawdownContract) => void): () => void;
```

Subscribes to max drawdown events, delivering the callback once per new signal id.

Deduplicates on `event.signal.id` — the first drawdown matching the predicate
is reported, later deeper drawdowns of the same signal are suppressed.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
