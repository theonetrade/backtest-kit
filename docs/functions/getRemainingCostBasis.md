---
title: docs/function/getRemainingCostBasis
group: docs
---

# getRemainingCostBasis

```ts
declare function getRemainingCostBasis(symbol: string): Promise<number>;
```

Returns the remaining cost basis in dollars after partial closes.
Correctly accounts for DCA entries between partial closes.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
