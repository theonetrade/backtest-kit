---
title: docs/interface/InitialDispatchContractBase
group: docs
---

# InitialDispatchContractBase

Base fields shared by both variants of the initial-dispatch payload.
Carries the resolved execution context of the state access.

## Properties

### symbol

```ts
symbol: string
```

Trading pair symbol (e.g., "BTCUSDT").

### strategyName

```ts
strategyName: string
```

Strategy name owning the signal.

### exchangeName

```ts
exchangeName: string
```

Exchange name where this strategy is running.

### frameName

```ts
frameName: string
```

Frame name (if backtest)

### currentPrice

```ts
currentPrice: number
```

Current market price of the symbol at the moment of state init.

### backtest

```ts
backtest: boolean
```

Execution mode flag.
- true: Event from backtest execution (historical candle data)
- false: Event from live trading (real-time tick)

### timestamp

```ts
timestamp: number
```

Event timestamp in milliseconds since Unix epoch.

Timing semantics:
- Live mode: when.getTime() at the moment of state init
- Backtest mode: candle.timestamp of the candle being processed

### when

```ts
when: Date
```

Event time as a `Date` instance.

- Backtest mode: virtual execution time — `candle.timestamp` of the candle
  being processed (not wall-clock time).
- Live mode: wall-clock time at the moment of state init.

Always equal to `new Date(timestamp)`.
