---
title: docs/function/listenHighestProfitUnique
group: docs
---

# listenHighestProfitUnique

```ts
declare function listenHighestProfitUnique(filterFn: (event: HighestProfitContract) => boolean | Promise<boolean>, fn: (event: HighestProfitContract) => void): () => void;
```

Subscribes to highest profit events, delivering the callback once per new signal id.

Deduplicates on `event.signal.id`. Since this channel re-emits on every new
profit peak, the per-signal form reports the first peak that satisfies the
predicate and then goes quiet for that signal.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate selecting which events are considered |
| `fn` | Callback invoked once per new signal id |
