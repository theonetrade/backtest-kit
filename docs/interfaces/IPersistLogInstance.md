---
title: docs/interface/IPersistLogInstance
group: docs
---

# IPersistLogInstance

Global log entry persistence instance interface.
Unlike other Persist instances, log storage has no context — there is
a single global instance per process.

Each log entry is keyed by its id and the read operation iterates over
all stored entries.

Custom adapters should implement this interface to override the default
file-based log storage behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize the global log storage.

### readLogData

```ts
readLogData: () => Promise<LogData>
```

Read all persisted log entries by iterating storage keys.

### writeLogData

```ts
writeLogData: (entries: LogData) => Promise<void>
```

Write log entries to storage. Each entry is keyed by its id.
Implementations should skip entries whose id already exists to keep
the log append-only.
