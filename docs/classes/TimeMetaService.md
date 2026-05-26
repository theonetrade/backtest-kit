---
title: docs/class/TimeMetaService
group: docs
---

# TimeMetaService

Service for tracking the latest candle timestamp per symbol-strategy-exchange-frame combination.

Maintains a memoized BehaviorSubject per unique key that is updated on every strategy tick
by StrategyConnectionService. Consumers can synchronously read the last known timestamp or
await the first value if none has arrived yet.

Primary use case: providing the current candle time outside of a tick execution context,
e.g., when a command is triggered between ticks.

Features:
- One BehaviorSubject per (symbol, strategyName, exchangeName, frameName, backtest) key
- Falls back to ExecutionContextService.context.when when called inside an execution context
- Waits up to LISTEN_TIMEOUT ms for the first timestamp if none is cached yet
- clear() disposes the BehaviorSubject for a single key or all keys

Architecture:
- Registered as singleton in DI container
- Updated by StrategyConnectionService after each tick
- Cleared by Backtest/Live/Walker at strategy start to prevent stale data

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: any
```

### executionContextService

```ts
executionContextService: any
```

### getSource

```ts
getSource: any
```

Memoized factory for BehaviorSubject streams keyed by (symbol, strategyName, exchangeName, frameName, backtest).

Each subject holds the latest createdAt timestamp emitted by the strategy iterator for that key.
Instances are cached until clear() is called.

### hasTimestamp

```ts
hasTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => boolean
```

Checks if a timestamp exists for the given symbol and context.

### getTimestamp

```ts
getTimestamp: (symbol: string, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<number>
```

Returns the current candle timestamp (in milliseconds) for the given symbol and context.

When called inside an execution context (i.e., during a signal handler or action),
reads the timestamp directly from ExecutionContextService.context.when.
Otherwise, reads the last value from the cached BehaviorSubject. If no value has
been emitted yet, waits up to LISTEN_TIMEOUT ms for the first tick before throwing.

### next

```ts
next: (symbol: string, timestamp: number, context: { strategyName: string; exchangeName: string; frameName: string; }, backtest: boolean) => Promise<void>
```

Pushes a new timestamp value into the BehaviorSubject for the given key.

Called by StrategyConnectionService after each strategy tick to keep
the cached timestamp up to date.

### clear

```ts
clear: (payload?: { symbol: string; strategyName: string; exchangeName: string; frameName: string; backtest: boolean; }) => void
```

Disposes cached BehaviorSubject(s) to free memory and prevent stale data.

When called without arguments, clears all memoized timestamp streams.
When called with a payload, clears only the stream for the specified key.
Should be called at strategy start (Backtest/Live/Walker) to reset state.
