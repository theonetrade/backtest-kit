---
title: docs/class/MaxDrawdownReportService
group: docs
---

# MaxDrawdownReportService

Service for logging max drawdown events to the JSONL report database.

Listens to maxDrawdownSubject and writes each new drawdown record to
ReportWriter.writeData() for persistence and analytics.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### _lastWrittenPnl

```ts
_lastWrittenPnl: any
```

Last WRITTEN drawdown PnL percent per signal — state of the
CC_REPORT_MAX_DRAWDOWN_MIN_STEP_PERCENT write-gate. FIFO-bounded (see
MAX_DRAWDOWN_GATE_MAP_LIMIT).

### tick

```ts
tick: any
```

Handles a single `MaxDrawdownContract` event emitted by `maxDrawdownSubject`.

Writes a JSONL record to the `"max_drawdown"` report database via
`ReportWriter.writeData`, capturing the full signal snapshot at the moment
the new drawdown record was set:
- `timestamp`, `symbol`, `strategyName`, `exchangeName`, `frameName`, `backtest`
- `signalId`, `position`, `currentPrice`
- `priceOpen`, `priceTakeProfit`, `priceStopLoss` (effective values from the signal)

`strategyName` and signal-level fields are sourced from `data.signal`
rather than the contract root.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable<() => () => void>
```

Subscribes to `maxDrawdownSubject` to start persisting drawdown records.
Protected against multiple subscriptions via `singleshot` — subsequent
calls return the same unsubscribe function without re-subscribing.

The returned unsubscribe function clears the `singleshot` state and
detaches from `maxDrawdownSubject`.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Detaches from `maxDrawdownSubject`, stopping further JSONL writes.

Calls the unsubscribe closure returned by `subscribe()`.
If `subscribe()` was never called, does nothing.
