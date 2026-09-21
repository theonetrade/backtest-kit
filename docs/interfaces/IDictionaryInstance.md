---
title: docs/interface/IDictionaryInstance
group: docs
---

# IDictionaryInstance

Interface for dictionary instance implementations.
Defines the contract for local, persist, and dummy backends.

Intended use: per-signal Map-like storage for strategy callbacks — e.g.
caching LLM annotations, per-level flags, or any keyed data tied to the
lifetime of one signal.

Every operation receives the logical `when` timestamp for look-ahead bias
protection: an entry whose stored `when` is greater than the requested `when`
is invisible (get returns null, has returns false, keys/values/entries/size
skip it). A write with a smaller `when` overwrites an existing record —
that lets a restarted backtest reset live-written entries.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the dictionary instance.

### get

```ts
get: <Value = unknown>(key: string, when: Date) => Promise<Value>
```

Read the value stored under `key`.
Returns null when the entry is missing or its stored `when` is greater
than the requested `when` (look-ahead bias protection).

### set

```ts
set: <Value = unknown>(key: string, value: Value, when: Date) => Promise<void>
```

Write `value` under `key`, stamping it with `when`.
A write with a smaller `when` overwrites an existing record.

### has

```ts
has: (key: string, when: Date) => Promise<boolean>
```

Check whether a visible entry exists under `key`.
An entry with a stored `when` greater than the requested `when` counts as absent.

### delete

```ts
delete: (key: string, when: Date) => Promise<boolean>
```

Remove the entry under `key` (hard delete, regardless of its `when`).

### clear

```ts
clear: (when: Date) => Promise<void>
```

Remove all entries (hard delete).

### keys

```ts
keys: (when: Date) => Promise<string[]>
```

List keys of visible entries (look-ahead-guarded).

### values

```ts
values: <Value = unknown>(when: Date) => Promise<Value[]>
```

List values of visible entries (look-ahead-guarded).

### entries

```ts
entries: <Value = unknown>(when: Date) => Promise<[string, Value][]>
```

List [key, value] pairs of visible entries (look-ahead-guarded).

### size

```ts
size: (when: Date) => Promise<number>
```

Count visible entries (look-ahead-guarded).

### dispose

```ts
dispose: () => Promise<void>
```

Releases any resources held by this instance.
