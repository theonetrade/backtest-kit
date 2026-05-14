---
title: docs/type/TPersistMemoryInstanceCtor
group: docs
---

# TPersistMemoryInstanceCtor

```ts
type TPersistMemoryInstanceCtor = new (signalId: string, bucketName: string) => IPersistMemoryInstance;
```

Constructor type for IPersistMemoryInstance.
Used by PersistMemoryUtils.usePersistMemoryAdapter() to register custom adapters.
