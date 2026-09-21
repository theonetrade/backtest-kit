---
title: docs/function/listenStrategyCommitFilter
group: docs
---

# listenStrategyCommitFilter

```ts
declare function listenStrategyCommitFilter(filterFn: (event: StrategyCommitContract) => boolean | Promise<boolean>, fn: (event: StrategyCommitContract) => void): () => void;
```

Subscribes to strategy management events matching the predicate, keeping the subscription.

Filtered variant of {@link listenStrategyCommit}: only events passing
`filterFn` reach the callback, and the listener keeps delivering every
matching event.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `filterFn` | Predicate to filter which events trigger the callback |
| `fn` | Callback function to handle each matching event |
