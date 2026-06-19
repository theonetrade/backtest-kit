---
title: docs/interface/ScheduledEvent
group: docs
---

# ScheduledEvent

Unified scheduled signal event data for report generation.
Contains all information about scheduled, opened and cancelled events.

## Properties

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds (scheduledAt for scheduled/cancelled events)

### action

```ts
action: "scheduled" | "cancelled" | "opened"
```

Event action type

### symbol

```ts
symbol: string
```

Trading pair symbol

### signalId

```ts
signalId: string
```

Signal ID

### position

```ts
position: string
```

Position type

### note

```ts
note: string
```

Signal note

### currentPrice

```ts
currentPrice: number
```

Current market price

### priceOpen

```ts
priceOpen: number
```

Scheduled entry price

### priceTakeProfit

```ts
priceTakeProfit: number
```

Take profit price

### priceStopLoss

```ts
priceStopLoss: number
```

Stop loss price

### originalPriceTakeProfit

```ts
originalPriceTakeProfit: number
```

Original take profit price before modifications

### originalPriceStopLoss

```ts
originalPriceStopLoss: number
```

Original stop loss price before modifications

### totalEntries

```ts
totalEntries: number
```

Total number of DCA entries (present when averageBuy was applied)

### totalPartials

```ts
totalPartials: number
```

Total number of partial closes executed (_partial.length)

### originalPriceOpen

```ts
originalPriceOpen: number
```

Original entry price before DCA averaging (present when averageBuy was applied)

### partialExecuted

```ts
partialExecuted: number
```

Total executed percentage from partial closes

### pnl

```ts
pnl: IStrategyPnL
```

Unrealized PNL at the moment of this event

### closeTimestamp

```ts
closeTimestamp: number
```

Close timestamp (only for cancelled)

### duration

```ts
duration: number
```

Duration in minutes (only for cancelled/opened)

### cancelReason

```ts
cancelReason: "timeout" | "price_reject" | "user"
```

Cancellation reason (only for cancelled events)

### cancelId

```ts
cancelId: string
```

Cancellation ID (only for user-initiated cancellations)

### pendingAt

```ts
pendingAt: number
```

Timestamp when position became active (only for opened events)

### scheduledAt

```ts
scheduledAt: number
```

Timestamp when signal was created/scheduled (for all events)
