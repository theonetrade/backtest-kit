---
title: docs/interface/IPersistSignalInstance
group: docs
---

# IPersistSignalInstance

Per-context signal persistence instance interface.
Scoped to a specific (symbol, strategyName, exchangeName) triple.

Custom adapters should implement this interface to override the default
file-based signal persistence behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this signal context.

### readSignalData

```ts
readSignalData: () => Promise<ISignalRow>
```

Read persisted signal data for this context.

### writeSignalData

```ts
writeSignalData: (signalRow: ISignalRow) => Promise<void>
```

Write signal data for this context (null to clear).
