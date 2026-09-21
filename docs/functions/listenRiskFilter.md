---
title: docs/function/listenRiskFilter
group: docs
---

# listenRiskFilter

```ts
declare function listenRiskFilter(filterFn: (event: RiskContract) => boolean | Promise<boolean>, fn: (event: RiskContract) => void): () => void;
```

Subscribes to risk rejection events matching the predicate, keeping the subscription.

Filtered variant of {@link listenRisk}: only events passing `filterFn` reach
the callback, and the listener keeps delivering every matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
