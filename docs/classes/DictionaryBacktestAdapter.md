---
title: docs/class/DictionaryBacktestAdapter
group: docs
---

# DictionaryBacktestAdapter

Implements `TDictionaryAdapter`

Backtest dictionary adapter with pluggable storage backend.

Features:
- Adapter pattern for swappable dictionary instance implementations
- Default backend: DictionaryLocalInstance (in-memory, no disk persistence)
- Alternative backends: DictionaryPersistInstance, DictionaryDummyInstance
- Convenience methods: useLocal(), usePersist(), useDummy(), useDictionaryAdapter()
- Memoized instances per (signalId, dictionaryName) pair; cleared via disposeSignal() from Dictionary.enable

## Constructor

```ts
constructor();
```

## Properties

### DictionaryFactory

```ts
DictionaryFactory: any
```

### getInstance

```ts
getInstance: any
```

### disposeSignal

```ts
disposeSignal: (signalId: string) => void
```

Disposes all memoized instances for the given signalId.
Called by Dictionary.enable subscription when a signal is cancelled or closed.

### get

```ts
get: <Value = unknown>(dto: { signalId: string; dictionaryName: string; when: Date; }, key: string) => Promise<Value>
```

Read the value stored under `key` for a signal.

### set

```ts
set: <Value = unknown>(dto: { signalId: string; dictionaryName: string; when: Date; }, key: string, value: Value) => Promise<void>
```

Write `value` under `key` for a signal.

### has

```ts
has: (dto: { signalId: string; dictionaryName: string; when: Date; }, key: string) => Promise<boolean>
```

Check whether a visible entry exists under `key` for a signal.

### delete

```ts
delete: (dto: { signalId: string; dictionaryName: string; when: Date; }, key: string) => Promise<boolean>
```

Remove the entry under `key` for a signal (hard delete).

### clear

```ts
clear: (dto: { signalId: string; dictionaryName: string; when: Date; }) => Promise<void>
```

Remove all entries for a signal (hard delete).

### keys

```ts
keys: (dto: { signalId: string; dictionaryName: string; when: Date; }) => Promise<string[]>
```

List keys of visible entries for a signal (look-ahead-guarded).

### values

```ts
values: <Value = unknown>(dto: { signalId: string; dictionaryName: string; when: Date; }) => Promise<Value[]>
```

List values of visible entries for a signal (look-ahead-guarded).

### entries

```ts
entries: <Value = unknown>(dto: { signalId: string; dictionaryName: string; when: Date; }) => Promise<[string, Value][]>
```

List [key, value] pairs of visible entries for a signal (look-ahead-guarded).

### size

```ts
size: (dto: { signalId: string; dictionaryName: string; when: Date; }) => Promise<number>
```

Count visible entries for a signal (look-ahead-guarded).

### useLocal

```ts
useLocal: () => void
```

Switches to in-memory adapter (default).
All data lives in process memory only.

### usePersist

```ts
usePersist: () => void
```

Switches to file-system backed adapter.
Data is persisted to disk via PersistDictionaryAdapter.

### useDummy

```ts
useDummy: () => void
```

Switches to dummy adapter that discards all writes.

### useDictionaryAdapter

```ts
useDictionaryAdapter: (Ctor: TDictionaryInstanceCtor) => void
```

Switches to a custom dictionary adapter implementation.
