---
title: docs/class/PersistScheduleUtils
group: docs
---

# PersistScheduleUtils

Utility class for managing scheduled signal persistence.

Features:
- Memoized storage instances per strategy
- Custom adapter support
- Atomic read/write operations for scheduled signals
- Crash-safe scheduled signal state management

Used by ClientStrategy for live mode persistence of scheduled signals (_scheduledSignal).

## Constructor

```ts
constructor();
```

## Properties

### PersistScheduleInstanceCtor

```ts
PersistScheduleInstanceCtor: any
```

Constructor used to create per-context scheduled signal instances.
Replaceable via usePersistScheduleAdapter() / useJson() / useDummy().

### getScheduleStorage

```ts
getScheduleStorage: any
```

Memoized factory creating one IPersistScheduleInstance per (symbol, strategy, exchange) triple.

### readScheduleData

```ts
readScheduleData: (symbol: string, strategyName: string, exchangeName: string) => Promise<IScheduledSignalRow>
```

Reads persisted scheduled signal for the given context.
Lazily initializes the instance on first access.

### writeScheduleData

```ts
writeScheduleData: (scheduledSignalRow: IScheduledSignalRow, symbol: string, strategyName: string, exchangeName: string) => Promise<void>
```

Writes scheduled signal (or null to clear) for the given context.
Lazily initializes the instance on first access.

## Methods

### usePersistScheduleAdapter

```ts
usePersistScheduleAdapter(Ctor: TPersistScheduleInstanceCtor): void;
```

Registers a custom IPersistScheduleInstance constructor.
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

Switches to the default file-based PersistScheduleInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistScheduleDummyInstance (all operations are no-ops).
