---
title: docs/class/PersistLogInstance
group: docs
---

# PersistLogInstance

Implements `IPersistLogInstance`

Default file-based implementation of IPersistLogInstance.

Features:
- Each log entry stored as separate JSON file keyed by entry.id
- Read iterates all keys via PersistBase.keys()
- Append-only: existing keys are skipped on write
- Crash-safe via atomic writes

## Constructor

```ts
constructor();
```

## Properties

### _storage

```ts
_storage: any
```

Underlying file-based storage for log entries

## Methods

### waitForInit

```ts
waitForInit(initial: boolean): Promise<void>;
```

Initializes the underlying PersistBase storage.

### readLogData

```ts
readLogData(): Promise<LogData>;
```

Reads all persisted log entries by iterating storage keys.

### writeLogData

```ts
writeLogData(logData: LogData): Promise<void>;
```

Writes log entries append-only — skips entries whose id already exists
so the log file is never overwritten.
