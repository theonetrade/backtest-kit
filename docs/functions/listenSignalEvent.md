---
title: docs/function/listenSignalEvent
group: docs
---

# listenSignalEvent

```ts
declare function listenSignalEvent(fn: (event: SignalEventContract) => void): () => void;
```

Subscribes to pending signal lifecycle events (open and close) with queued async processing.

Emitted when a pending position is opened (action "opened": new signal / immediate / scheduled
or user activation) or closed (action "closed" with closeReason "take_profit" / "stop_loss" /
"time_expired" / "closed"), in both live and backtest.

Events are processed sequentially in order received, even if callback is async.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle pending lifecycle events |
