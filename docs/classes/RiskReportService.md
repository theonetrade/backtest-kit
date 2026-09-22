---
title: docs/class/RiskReportService
group: docs
---

# RiskReportService

Service for logging risk rejection events to SQLite database.

Captures all signal rejection events from the risk management system
and stores them in the Report database for risk analysis and auditing.

Features:
- Listens to risk rejection events via riskSubject
- Logs all rejected signals with reason and pending signal details
- Stores events in ReportWriter.writeData() for risk tracking
- Protected against multiple subscriptions using singleshot

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

Logger service for debug output

### _lastWritten

```ts
_lastWritten: any
```

Last written EVENT timestamp per execution identity — the write-throttle
state for CC_REPORT_RISK_REJECTION_TTL_MS. FIFO-bounded (see
RISK_THROTTLE_MAP_LIMIT).

### tickRejection

```ts
tickRejection: any
```

Processes risk rejection events and logs them to the database.

Throttled by CC_REPORT_RISK_REJECTION_TTL_MS: a risk rejection rolls back
the generation throttle, so a strategy stuck against a limit re-emits a
rejection every tick — only the first row per execution identity
(symbol/strategy/exchange/frame) is written per interval, regardless of
the rejection reason. The interval is measured by the EVENT timestamp
(virtual time in backtest, tick time in live), never the wall clock.

### subscribe

```ts
subscribe: (() => () => void) & ISingleshotClearable<() => () => void>
```

Subscribes to risk rejection emitter to receive rejection events.
Protected against multiple subscriptions.
Returns an unsubscribe function to stop receiving events.

### unsubscribe

```ts
unsubscribe: () => Promise<void>
```

Unsubscribes from risk rejection emitter to stop receiving events.
Calls the unsubscribe function returned by subscribe().
If not subscribed, does nothing.
