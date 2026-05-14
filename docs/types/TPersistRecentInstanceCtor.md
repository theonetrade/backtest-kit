---
title: docs/type/TPersistRecentInstanceCtor
group: docs
---

# TPersistRecentInstanceCtor

```ts
type TPersistRecentInstanceCtor = new (symbol: string, strategyName: StrategyName, exchangeName: ExchangeName, frameName: FrameName, backtest: boolean) => IPersistRecentInstance;
```

Constructor type for IPersistRecentInstance.
Used by PersistRecentUtils.usePersistRecentAdapter() to register custom adapters.
