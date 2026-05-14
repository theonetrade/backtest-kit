---
title: docs/type/TPersistSignalInstanceCtor
group: docs
---

# TPersistSignalInstanceCtor

```ts
type TPersistSignalInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) => IPersistSignalInstance;
```

Constructor type for IPersistSignalInstance.
Used by PersistSignalUtils.usePersistSignalAdapter() to register custom adapters.
