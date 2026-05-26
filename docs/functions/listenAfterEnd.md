---
title: docs/function/listenAfterEnd
group: docs
---

# listenAfterEnd

```ts
declare function listenAfterEnd(fn: (event: AfterEndContract) => void): () => void;
```

Subscribes to after end events with queued async processing.
Emits when the engine has completed processing a strategy execution for a symbol.
Events are processed sequentially in order received, even if callback is async.
Uses queued wrapper to prevent concurrent execution of the callback.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle after end events |
