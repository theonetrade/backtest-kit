---
title: docs/class/PersistDictionaryUtils
group: docs
---

# PersistDictionaryUtils

Utility class for managing dictionary persistence.

Features:
- Memoized storage instances per (signalId, dictionaryName) pair
- Custom adapter support
- Atomic read/write operations

Storage layout: ./dump/dictionary/&lt;signalId&gt;/&lt;dictionaryName&gt;.json

Used by DictionaryPersistInstance for crash-safe dictionary persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistDictionaryInstanceCtor

```ts
PersistDictionaryInstanceCtor: any
```

Constructor used to create per-context dictionary instances.
Replaceable via usePersistDictionaryAdapter() / useJson() / useDummy().

### getDictionaryStorage

```ts
getDictionaryStorage: any
```

Memoized factory creating one IPersistDictionaryInstance per (signalId, dictionaryName) pair.

### waitForInit

```ts
waitForInit: (signalId: string, dictionaryName: string, initial: boolean) => Promise<void>
```

Initializes the dictionary storage for the given context.
Skips initialization when `initial` is false (used to gate first-time setup).

### readDictionaryData

```ts
readDictionaryData: (signalId: string, dictionaryName: string) => Promise<DictionaryData>
```

Reads persisted dictionary snapshot for the given context.
Lazily initializes the instance on first access.

### writeDictionaryData

```ts
writeDictionaryData: (data: DictionaryData, signalId: string, dictionaryName: string, when: Date) => Promise<void>
```

Writes dictionary snapshot for the given context.
Lazily initializes the instance on first access.

### useDummy

```ts
useDummy: () => void
```

Switches to PersistDictionaryDummyInstance (all operations are no-ops).

### useJson

```ts
useJson: () => void
```

Switches to the default file-based PersistDictionaryInstance.

### clear

```ts
clear: () => void
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### dispose

```ts
dispose: (signalId: string, dictionaryName: string) => void
```

Drops the memoized instance for the given context.
Call when a signal is removed to clean up its associated storage entry.

## Methods

### usePersistDictionaryAdapter

```ts
usePersistDictionaryAdapter(Ctor: TPersistDictionaryInstanceCtor): void;
```

Registers a custom IPersistDictionaryInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.
