---
title: docs/interface/InitialDispatchActiveContract
group: docs
---

# InitialDispatchActiveContract

Initial-dispatch payload for an OPEN position: the state access resolved a
pending signal — the order is filled and the position is being monitored.

## Properties

### type

```ts
type: "active"
```

Discriminator: "active" — open position order.

### signal

```ts
signal: IPublicSignalRow
```

Complete public signal row of the open position at the moment of state init.
