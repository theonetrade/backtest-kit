---
title: docs/interface/IRisk
group: docs
---

# IRisk

Risk interface implemented by ClientRisk.
Provides risk checking for signals and position tracking.

## Properties

### checkSignal

```ts
checkSignal: (params: IRiskCheckArgs, options?: Partial<IRiskCheckOptions>) => Promise<boolean>
```

Check if a signal should be allowed based on risk limits.

### checkSignalAndReserve

```ts
checkSignalAndReserve: (params: IRiskCheckArgs) => Promise<boolean>
```

Concurrency-safe variant of {@link checkSignal}: atomically validates the
signal AND, on success, writes a placeholder for the future position into
the active position map within the same critical section.

**Why this exists.** `checkSignal` followed later by `addSignal` is not
atomic — between the two calls the caller does signal setup work that
yields to the event loop (sync-open callback, persist writes, etc.). When
several strategies sharing the same risk profile run in parallel, all of
them can pass `checkSignal` while the active position map is still empty,
then each call `addSignal` and blow past the limit. Reserving inside the
lock guarantees the next concurrent caller observes the incremented size
before its own validation runs.

The reservation uses the same map key as the eventual `addSignal` call
(`strategyName + exchangeName + symbol`), so `addSignal` overwrites the
placeholder rather than appending a duplicate.

Callers MUST ensure that every successful return is followed by either
`addSignal` (overwrites the placeholder with real data) or `removeSignal`
(clears the placeholder if opening is aborted). Otherwise the riskMap
accumulates stale reservations.

### addSignal

```ts
addSignal: (symbol: string, context: { strategyName: string; riskName: string; exchangeName: string; frameName: string; }, positionData: { position: "long" | "short"; priceOpen: number; priceStopLoss: number; priceTakeProfit: number; minuteEstimatedTime: number; openTimestamp: number; }) => Promise<...>
```

Register a new opened signal/position.

### removeSignal

```ts
removeSignal: (symbol: string, context: { strategyName: string; riskName: string; exchangeName: string; frameName: string; }) => Promise<void>
```

Remove a closed signal/position.
