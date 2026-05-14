---
title: docs/interface/IPersistScheduleInstance
group: docs
---

# IPersistScheduleInstance

Per-context scheduled signal persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName) triple.

Custom adapters should implement this interface to override the default
file-based scheduled signal persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this scheduled signal context.

### readScheduleData

```ts
readScheduleData: () => Promise<IScheduledSignalRow>
```

Read persisted scheduled signal for this context.

### writeScheduleData

```ts
writeScheduleData: (row: IScheduledSignalRow) => Promise<void>
```

Write scheduled signal for this context (null to clear).
