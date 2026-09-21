---
title: docs/interface/IPersistDictionaryInstance
group: docs
---

# IPersistDictionaryInstance

Per-context dictionary persistence instance interface.
Scoped to a specific (signalId, dictionaryName) pair.

Used by DictionaryPersistInstance for crash-safe per-signal dictionary storage.
Custom adapters should implement this interface to override the default
file-based dictionary behavior.

## Methods

### waitForInit

```ts
waitForInit: (initial: boolean) => Promise<void>
```

Initialize storage for this dictionary context.

### readDictionaryData

```ts
readDictionaryData: () => Promise<DictionaryData>
```

Read persisted dictionary snapshot for this context.

### writeDictionaryData

```ts
writeDictionaryData: (data: DictionaryData, when: Date) => Promise<void>
```

Write dictionary snapshot for this context.

### dispose

```ts
dispose: () => void
```

Release any resources held by this instance.
Default implementations may treat this as a no-op.
