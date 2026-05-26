---
title: docs/function/listenBeforeStart
group: docs
---

# listenBeforeStart

```ts
declare function listenBeforeStart(fn: (event: BeforeStartContract) => void): () => void;
```

Subscribes to before start events with queued async processing.
Emits when the engine is about to start a new strategy execution for a symbol.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle before start events |
