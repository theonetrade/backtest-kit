---
title: docs/type/TPersistMeasureInstanceCtor
group: docs
---

# TPersistMeasureInstanceCtor

```ts
type TPersistMeasureInstanceCtor = new (bucket: string) => IPersistMeasureInstance;
```

Constructor type for IPersistMeasureInstance.
Used by PersistMeasureUtils.usePersistMeasureAdapter() to register custom adapters.
