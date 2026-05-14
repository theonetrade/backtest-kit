---
title: docs/type/TPersistIntervalInstanceCtor
group: docs
---

# TPersistIntervalInstanceCtor

```ts
type TPersistIntervalInstanceCtor = new (bucket: string) => IPersistIntervalInstance;
```

Constructor type for IPersistIntervalInstance.
Used by PersistIntervalUtils.usePersistIntervalAdapter() to register custom adapters.
