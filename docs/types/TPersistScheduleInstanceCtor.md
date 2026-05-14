---
title: docs/type/TPersistScheduleInstanceCtor
group: docs
---

# TPersistScheduleInstanceCtor

```ts
type TPersistScheduleInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName) => IPersistScheduleInstance;
```

Constructor type for IPersistScheduleInstance.
Used by PersistScheduleUtils.usePersistScheduleAdapter() to register custom adapters.
