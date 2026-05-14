---
title: docs/type/TPersistStateInstanceCtor
group: docs
---

# TPersistStateInstanceCtor

```ts
type TPersistStateInstanceCtor = new (signalId: string, bucketName: string) => IPersistStateInstance;
```

Constructor type for IPersistStateInstance.
Used by PersistStateUtils.usePersistStateAdapter() to register custom adapters.
