---
title: docs/class/State
group: docs
---

# State

Per-signal mutable state scoped by state name.

Works like a value bound to the CURRENT pending or scheduled signal:
`new State({ name: "trade", initialData: { peakPercent: 0 } }).setState(...)`
inside any strategy lifecycle callback. No context is passed through
arguments — every instance method resolves the signal, mode and timestamp
itself from `backtest.methodContextService` / `backtest.executionContextService`,
so the class is unavailable outside async_hooks lifecycle callbacks by design.

`initialData` provides the default value when no state exists yet — a plain
object or a sync/async factory returning one (the factory yields a fresh
object per access, so the default is never shared by reference).

Look-ahead bias protection: a read at a `when` earlier than the stored `when`
yields `initialData`, and a write with a smaller `when` overwrites (a
restarted backtest resets live-written state).

Requires an explicit `State.enable()` call before use — the subscription it
creates disposes per-signal instances when the signal is cancelled or
closed, preventing stale instances from accumulating.

## Constructor

```ts
constructor(params: { name: string; initialData: Data | (() => Data | Promise<Data>); });
```

## Properties

### params

```ts
params: { name: string; initialData: Data | (() => Data | Promise<Data>); }
```

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables state storage by subscribing to signal lifecycle events.
Clears memoized instances in StateBacktest and StateLive when a signal
is cancelled or closed, preventing stale instances from accumulating.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables state storage by unsubscribing from signal lifecycle events.
Safe to call multiple times.

### _getState

```ts
_getState: <Value extends object = object>(dto: { signalId: string; bucketName: string; initialValue: object; backtest: boolean; when: Date; }) => Promise<Value>
```

Context-free read of the current state value for a signal.
Routes to StateBacktest or StateLive based on dto.backtest.

### _setState

```ts
_setState: <Value extends object = object>(dispatch: Value | Dispatch<Value>, dto: { signalId: string; bucketName: string; initialValue: object; backtest: boolean; when: Date; }) => Promise<...>
```

Context-free update of the state value for a signal.
Routes to StateBacktest or StateLive based on dto.backtest.

### getState

```ts
getState: () => Promise<Data>
```

Read the current state value for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### setState

```ts
setState: (dispatch: Data | Dispatch<Data>) => Promise<Data>
```

Update the state value for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.
