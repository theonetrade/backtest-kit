---
title: docs/class/PersistStorageInstance
group: docs
---

# PersistStorageInstance

Implements `IPersistStorageInstance`

Default file-based implementation of IPersistStorageInstance.

Features:
- Each signal stored as separate JSON file keyed by signal.id
- Read iterates all keys via PersistBase.keys()
- Crash-safe via atomic writes

## Constructor

```ts
constructor(backtest: boolean);
```

## Properties

### backtest

```ts
backtest: boolean
```

### _storage

```ts
_storage: any
```

Underlying file-based storage for this mode

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readStorageData

```ts
readStorageData(): Promise<StorageData>;
```

Reads all persisted signals by iterating storage keys.

### writeStorageData

```ts
writeStorageData(signals: StorageData): Promise<void>;
```

Writes each signal as a separate entity keyed by `signal.id`.
