---
title: docs/class/BacktestLogicPublicService
group: docs
---

# BacktestLogicPublicService

Implements `TBacktestLogicPrivateService`

Public service for backtest orchestration with context management.

Wraps BacktestLogicPrivateService with MethodContextService to provide
implicit context propagation for strategyName, exchangeName, and frameName.

This allows getCandles(), getSignal(), and other functions to work without
explicit context parameters.

## Constructor

```ts
constructor();
```

## Properties

### loggerService

```ts
loggerService: { readonly methodContextService: { readonly context: IMethodContext; }; readonly executionContextService: { readonly context: IExecutionContext; }; ... 7 more ...; setLogger: (logger: ILogger) => void; }
```

### backtestLogicPrivateService

```ts
backtestLogicPrivateService: BacktestLogicPrivateService
```

### timeMetaService

```ts
timeMetaService: TimeMetaService
```

### frameSchemaService

```ts
frameSchemaService: FrameSchemaService
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
    frameName: FrameName;
}): AsyncGenerator<IStrategyTickResultScheduled | IStrategyTickResultOpened | IStrategyTickResultClosed | IStrategyTickResultCancelled, void, any>;
```

Runs backtest for a symbol with context propagation.

Streams closed signals as async generator. Context is automatically
injected into all framework functions called during iteration.
