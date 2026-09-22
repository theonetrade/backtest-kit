---
title: docs/interface/InitialDispatchScheduleContract
group: docs
---

# InitialDispatchScheduleContract

Initial-dispatch payload for a RESTING entry: the state access resolved a
scheduled signal — the entry order is waiting for price to reach priceOpen.

## Properties

### type

```ts
type: "schedule"
```

Discriminator: "schedule" — resting entry order.

### signal

```ts
signal: IScheduledSignalRow
```

Complete scheduled signal row of the resting entry at the moment of state init.
