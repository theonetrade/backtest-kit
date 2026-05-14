---
title: docs/type/TPersistBreakevenInstanceCtor
group: docs
---

# TPersistBreakevenInstanceCtor

```ts
type TPersistBreakevenInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) => IPersistBreakevenInstance;
```

Constructor type for IPersistBreakevenInstance.
Used by PersistBreakevenUtils.usePersistBreakevenAdapter() to register custom adapters.
