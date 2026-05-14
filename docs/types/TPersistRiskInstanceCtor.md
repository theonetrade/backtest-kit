---
title: docs/type/TPersistRiskInstanceCtor
group: docs
---

# TPersistRiskInstanceCtor

```ts
type TPersistRiskInstanceCtor = new (riskName: RiskName, exchangeName: ExchangeName) => IPersistRiskInstance;
```

Constructor type for IPersistRiskInstance.
Used by PersistRiskUtils.usePersistRiskAdapter() to register custom adapters.
