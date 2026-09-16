---
title: docs/function/getTotalPercentHeld
group: docs
---

# getTotalPercentHeld

```ts
declare function getTotalPercentHeld(symbol: string): Promise<number>;
```

Returns the still-held share of the position as a percentage.
100 = nothing has been closed (full position), 0 = fully closed.
Correctly accounts for DCA entries between partial closes.

Automatically detects backtest/live mode from execution context.

## Parameters

| Parameter | Description |
|-----------|-------------|
| `symbol` | Trading pair symbol |
