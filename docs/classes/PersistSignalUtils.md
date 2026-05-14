---
title: docs/class/PersistSignalUtils
group: docs
---

# PersistSignalUtils

Utility class for managing signal persistence.

Features:
- Memoized storage instances per strategy
- Custom adapter support
- Atomic read/write operations
- Crash-safe signal state management

Used by ClientStrategy for live mode persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistSignalInstanceCtor

```ts
PersistSignalInstanceCtor: any
```

Constructor used to create per-context signal instances.
Replaceable via usePersistSignalAdapter() / useJson() / useDummy().

### getStorage

```ts
getStorage: any
```

Memoized factory creating one IPersistSignalInstance per (symbol, strategy, exchange) triple.

### readSignalData

```ts
readSignalData: (symbol: string, strategyName: string, exchangeName: string) => Promise<ISignalRow>
```

Reads persisted signal for the given context.
Lazily initializes the instance on first access.

### writeSignalData

```ts
writeSignalData: (signalRow: ISignalRow, symbol: string, strategyName: string, exchangeName: string) => Promise<void>
```

Writes signal data (or null to clear) for the given context.
Lazily initializes the instance on first access.

## Methods

### usePersistSignalAdapter

```ts
usePersistSignalAdapter(Ctor: TPersistSignalInstanceCtor): void;
```

Registers a custom IPersistSignalInstance constructor.
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

Switches to the default file-based PersistSignalInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistSignalDummyInstance (all operations are no-ops).
