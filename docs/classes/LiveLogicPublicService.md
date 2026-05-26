---
title: docs/class/LiveLogicPublicService
group: docs
---

# LiveLogicPublicService

Implements `TLiveLogicPrivateService`

Public service for live trading orchestration with context management.

Wraps LiveLogicPrivateService with MethodContextService to provide
implicit context propagation for strategyName and exchangeName.

This allows getCandles(), getSignal(), and other functions to work without
explicit context parameters.

Features:
- Infinite async generator (never completes)
- Crash recovery via persisted state
- Real-time progression with Date.now()

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### liveLogicPrivateService

```ts
liveLogicPrivateService: LiveLogicPrivateService
```

### exchangeConnectionService

```ts
exchangeConnectionService: ExchangeConnectionService
```

## Methods

### run

```ts
run(symbol: string, context: {
    strategyName: StrategyName;
    exchangeName: ExchangeName;
}): AsyncGenerator<IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, unknown>;
```

Runs live trading for a symbol with context propagation.

Streams opened and closed signals as infinite async generator.
Context is automatically injected into all framework functions.
Process can crash and restart - state will be recovered from disk.
