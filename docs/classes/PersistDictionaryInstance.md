---
title: docs/class/PersistDictionaryInstance
group: docs
---

# PersistDictionaryInstance

Implements `IPersistDictionaryInstance`

Default file-based implementation of IPersistDictionaryInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses dictionaryName as entity ID within a per-signal PersistBase
- dispose is a no-op (memo cache is managed by PersistDictionaryUtils)

## Constructor

```ts
constructor(signalId: string, dictionaryName: string);
```

## Properties

### signalId

```ts
signalId: string
```

### dictionaryName

```ts
dictionaryName: string
```

### _storage

```ts
_storage: any
```

Underlying file-based storage scoped to this context

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readDictionaryData

```ts
readDictionaryData(): Promise<DictionaryData | null>;
```

Reads the persisted dictionary using `dictionaryName` as the entity key.

### writeDictionaryData

```ts
writeDictionaryData(data: DictionaryData, _when: Date): Promise<void>;
```

Writes the dictionary using `dictionaryName` as the entity key.

### dispose

```ts
dispose(): void;
```

No-op for the default file-based implementation.
Resource cleanup (memo cache invalidation) is handled by PersistDictionaryUtils.dispose().
