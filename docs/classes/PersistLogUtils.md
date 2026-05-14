---
title: docs/class/PersistLogUtils
group: docs
---

# PersistLogUtils

Utility class for managing log entry persistence.

Features:
- Cached storage instance
- Custom adapter support
- Atomic read/write operations for LogData
- Each log entry stored as separate file keyed by id
- Crash-safe log state management

Used by LogPersistUtils for log entry persistence.

## Constructor

```ts
constructor();
```

## Properties

### PersistLogInstanceCtor

```ts
PersistLogInstanceCtor: any
```

Constructor used to create the global log instance.
Replaceable via usePersistLogAdapter() / useJson() / useDummy().

### _logInstance

```ts
_logInstance: any
```

Cached singleton log instance. Lazily created on first access.
Reset to null by clear() and usePersistLogAdapter().

### getLogInstance

```ts
getLogInstance: any
```

Returns the cached log instance, creating it on first access.

### readLogData

```ts
readLogData: () => Promise<LogData>
```

Reads all persisted log entries.
Lazily initializes the instance on first access.

### writeLogData

```ts
writeLogData: (logData: LogData) => Promise<void>
```

Writes log entries (append-only — duplicates by id are skipped).
Lazily initializes the instance on first access.

## Methods

### usePersistLogAdapter

```ts
usePersistLogAdapter(Ctor: TPersistLogInstanceCtor): void;
```

Registers a custom IPersistLogInstance constructor.
Drops the cached instance so the next access uses the new adapter.

### clear

```ts
clear(): void;
```

Drops the cached log instance.
Call when process.cwd() changes between strategy iterations.

### useJson

```ts
useJson(): void;
```

Switches to the default file-based PersistLogInstance.

### useDummy

```ts
useDummy(): void;
```

Switches to PersistLogDummyInstance (all operations are no-ops).
