---
title: docs/type/TPersistPartialInstanceCtor
group: docs
---

# TPersistPartialInstanceCtor

```ts
type TPersistPartialInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) => IPersistPartialInstance;
```

Constructor type for IPersistPartialInstance.
Used by PersistPartialUtils.usePersistPartialAdapter() to register custom adapters.
