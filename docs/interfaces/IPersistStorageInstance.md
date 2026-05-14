---
title: docs/interface/IPersistStorageInstance
group: docs
---

# IPersistStorageInstance

Per-context signal storage persistence instance interface.
Scoped to either backtest or live mode (one instance per mode).

Each stored signal is keyed by its `signal.id` and the read operation
iterates over all stored entries to return them as an array.

Custom adapters should implement this interface to override the default
file-based signal storage behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this mode.

### readStorageData

```ts
readStorageData: () => Promise<StorageData>
```

Read all persisted signals by iterating storage keys.

### writeStorageData

```ts
writeStorageData: (signals: StorageData) => Promise<void>
```

Write signals to storage. Each signal is keyed by its `signal.id`.
