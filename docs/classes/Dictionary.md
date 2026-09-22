---
title: docs/class/Dictionary
group: docs
---

# Dictionary

Per-signal Map-like storage scoped by dictionary name.

Works like `new Map()` but the entries are bound to the CURRENT pending or
scheduled signal: `new Dictionary({ name: "llm" }).set("key", value)` inside
any strategy lifecycle callback. Unlike State, no context is passed through
arguments — every instance method resolves the signal, mode and timestamp
itself from `backtest.methodContextService` / `backtest.executionContextService`,
so the class is unavailable outside async_hooks lifecycle callbacks by design.

Look-ahead bias protection: every entry is stamped with the logical `when` it
was written at; a read happening at an earlier `when` does not see it, and a
write with a smaller `when` overwrites (a restarted backtest resets
live-written entries).

Requires an explicit `Dictionary.enable()` call before use — the subscription
it creates disposes per-signal instances when the signal is cancelled or
closed, preventing stale instances from accumulating.

## Constructor

```ts
constructor(params: { name: string; });
```

## Properties

### params

```ts
params: any
```

### enable

```ts
enable: (() => (...args: any[]) => any) & ISingleshotClearable<() => (...args: any[]) => any>
```

Enables dictionary storage by subscribing to signal lifecycle events.
Clears memoized instances in DictionaryBacktest and DictionaryLive when a
signal is cancelled or closed, preventing stale instances from accumulating.
Uses singleshot to ensure one-time subscription.

### disable

```ts
disable: () => void
```

Disables dictionary storage by unsubscribing from signal lifecycle events.
Safe to call multiple times.

### _get

```ts
_get: <Value_1 = unknown>(dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }, key: string) => Promise<Value_1>
```

Context-free read of the value stored under `key`.
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _set

```ts
_set: <Value_1 = unknown>(dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }, key: string, value: Value_1) => Promise<void>
```

Context-free write of `value` under `key`.
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _has

```ts
_has: (dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }, key: string) => Promise<boolean>
```

Context-free check whether a visible entry exists under `key`.
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _delete

```ts
_delete: (dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }, key: string) => Promise<boolean>
```

Context-free removal of the entry under `key` (hard delete).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _clear

```ts
_clear: (dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }) => Promise<void>
```

Context-free removal of all entries (hard delete).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _keys

```ts
_keys: (dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }) => Promise<string[]>
```

Context-free listing of visible entry keys (look-ahead-guarded).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _values

```ts
_values: <Value_1 = unknown>(dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }) => Promise<Value_1[]>
```

Context-free listing of visible entry values (look-ahead-guarded).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _entries

```ts
_entries: <Value_1 = unknown>(dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }) => Promise<[string, Value_1][]>
```

Context-free listing of visible [key, value] pairs (look-ahead-guarded).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### _size

```ts
_size: (dto: { dictionaryName: string; signalId: string; backtest: boolean; when: Date; }) => Promise<number>
```

Context-free count of visible entries (look-ahead-guarded).
Routes to DictionaryBacktest or DictionaryLive based on dto.backtest.

### get

```ts
get: (key: string) => Promise<Value>
```

Read the value stored under `key` for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### set

```ts
set: (key: string, value: Value) => Promise<void>
```

Write `value` under `key` for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### has

```ts
has: (key: string) => Promise<boolean>
```

Check whether a visible entry exists under `key` for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### delete

```ts
delete: (key: string) => Promise<boolean>
```

Remove the entry under `key` for the active pending or scheduled signal (hard delete).
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### clear

```ts
clear: () => Promise<void>
```

Remove all entries for the active pending or scheduled signal (hard delete).
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### keys

```ts
keys: () => Promise<string[]>
```

List keys of visible entries for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### values

```ts
values: () => Promise<Value[]>
```

List values of visible entries for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### entries

```ts
entries: () => Promise<[string, Value][]>
```

List [key, value] pairs of visible entries for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.

### size

```ts
size: () => Promise<number>
```

Count visible entries for the active pending or scheduled signal.
Resolves the signal, mode and timestamp from execution context — no context arguments required.
