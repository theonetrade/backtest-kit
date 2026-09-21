---
title: docs/type/TPersistDictionaryInstanceCtor
group: docs
---

# TPersistDictionaryInstanceCtor

```ts
type TPersistDictionaryInstanceCtor = new (signalId: string, dictionaryName: string) => IPersistDictionaryInstance;
```

Constructor type for IPersistDictionaryInstance.
Used by PersistDictionaryUtils.usePersistDictionaryAdapter() to register custom adapters.
