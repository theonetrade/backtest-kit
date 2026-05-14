---
title: docs/type/TPersistStorageInstanceCtor
group: docs
---

# TPersistStorageInstanceCtor

```ts
type TPersistStorageInstanceCtor = new (backtest: boolean) => IPersistStorageInstance;
```

Constructor type for IPersistStorageInstance.
Used by PersistStorageUtils.usePersistStorageAdapter() to register custom adapters.
