---
title: docs/class/PersistScheduleInstance
group: docs
---

# PersistScheduleInstance

Implements `IPersistScheduleInstance`

Default file-based implementation of IPersistScheduleInstance.

Features:
- Wraps PersistBase for atomic JSON writes
- Uses symbol as entity ID within a per-context PersistBase
- Crash-safe via atomic writes

## Constructor

```ts
constructor(symbol: string, strategyName: string, exchangeName: string);
```

## Properties

### symbol

```ts
symbol: string
```

### strategyName

```ts
strategyName: string
```

### exchangeName

```ts
exchangeName: string
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

### readScheduleData

```ts
readScheduleData(): Promise<IScheduledSignalRow | null>;
```

Reads the persisted scheduled signal using `symbol` as the entity key.

### writeScheduleData

```ts
writeScheduleData(row: IScheduledSignalRow | null): Promise<void>;
```

Writes the scheduled signal (or null to clear) using `symbol` as the entity key.
