---
title: docs/type/TPersistCandleInstanceCtor
group: docs
---

# TPersistCandleInstanceCtor

```ts
type TPersistCandleInstanceCtor = new (symbol: string, interval: CandleInterval, exchangeName: ExchangeName) => IPersistCandleInstance;
```

Constructor type for IPersistCandleInstance.
Used by PersistCandleUtils.usePersistCandleAdapter() to register custom adapters.
