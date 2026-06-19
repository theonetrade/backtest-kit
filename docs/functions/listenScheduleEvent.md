---
title: docs/function/listenScheduleEvent
group: docs
---

# listenScheduleEvent

```ts
declare function listenScheduleEvent(fn: (event: ScheduleEventContract) => void): () => void;
```

Subscribes to scheduled signal lifecycle events (creation and cancellation) with queued async processing.

Emitted when a scheduled signal is created (action "scheduled") or cancelled before activation
(action "cancelled" with reason "timeout" / "price_reject" / "user"), in both live and backtest.

IMPORTANT: The scheduled -&gt; active transition (activation) is NOT reported here. Activation
produces an "opened" event on the regular signal emitters (listenSignal) instead.

Events are processed sequentially in order received, even if callback is async.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `fn` | Callback function to handle scheduled lifecycle events |
