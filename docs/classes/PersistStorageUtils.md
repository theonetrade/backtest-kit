---
title: docs/class/PersistStorageUtils
group: docs
---

# PersistStorageUtils

Utility class for managing signal storage persistence.

Features:
- Memoized storage instances
- Custom adapter support
- Atomic read/write operations for StorageData
- Each signal stored as separate file keyed by id
- Crash-safe signal state management

Used by SignalLiveUtils for live mode persistence of signals.

## Constructor

```ts
constructor();
```

## Properties

### PersistStorageInstanceCtor

```ts
PersistStorageInstanceCtor: any
```

Constructor used to create per-mode signal storage instances.
Replaceable via usePersistStorageAdapter() / useJson() / useDummy().

### getStorage

```ts
getStorage: any
```

Memoized factory creating one IPersistStorageInstance per mode (backtest/live).
Key: "backtest" or "live".

### readStorageData

```ts
readStorageData: (backtest: boolean) => Promise<StorageData>
```

Reads all persisted signals for the given mode.
Lazily initializes the instance on first access.

### writeStorageData

```ts
writeStorageData: (signalData: StorageData, backtest: boolean) => Promise<void>
```

Writes signals for the given mode.
Lazily initializes the instance on first access.

## Methods

### usePersistStorageAdapter

```ts
usePersistStorageAdapter(Ctor: TPersistStorageInstanceCtor): void;
```

Registers a custom IPersistStorageInstance constructor.
Clears the memoization cache so subsequent calls use the new adapter.

### clear

```ts
clear(): void;
```

Clears the memoized instance cache.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistStorageInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistStorageDummyInstance (all operations are no-ops).
