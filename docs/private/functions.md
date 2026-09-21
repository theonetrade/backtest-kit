---
title: private/functions
group: private
---

# backtest-kit api reference

![schema](../../assets/uml.svg)

**Overview:**

Backtest-kit is a production-ready TypeScript framework for backtesting and live trading strategies with crash-safe state persistence, signal validation, and memory-optimized architecture. The framework follows clean architecture principles with dependency injection, separation of concerns, and type-safe discriminated unions.

**Core Concepts:**

* **Signal Lifecycle:** Type-safe state machine (idle → opened → active → closed) with discriminated unions
* **Execution Modes:** Backtest mode (historical data) and Live mode (real-time with crash recovery)
* **VWAP Pricing:** Volume Weighted Average Price from last 5 1-minute candles for all entry/exit decisions
* **Signal Validation:** Comprehensive validation ensures TP/SL logic, positive prices, and valid timestamps
* **Interval Throttling:** Prevents signal spam with configurable intervals (1m, 3m, 5m, 15m, 30m, 1h)
* **Crash-Safe Persistence:** Atomic file writes with automatic state recovery for live trading
* **Async Generators:** Memory-efficient streaming for backtest and live execution
* **Accurate PNL:** Calculation with fees (0.1%) and slippage (0.1%) for realistic simulations
* **Event System:** Signal emitters for backtest/live/global signals, errors, and completion events
* **Graceful Shutdown:** Live.background() waits for open positions to close before stopping
* **Pluggable Persistence:** Custom adapters for Redis, MongoDB, or any storage backend

**Architecture Layers:**

* **Client Layer:** Pure business logic without DI (ClientStrategy, ClientExchange, ClientFrame) using prototype methods for memory efficiency
* **Service Layer:** DI-based services organized by responsibility:
  * **Schema Services:** Registry pattern for configuration with shallow validation (StrategySchemaService, ExchangeSchemaService, FrameSchemaService)
  * **Validation Services:** Runtime existence validation with memoization (StrategyValidationService, ExchangeValidationService, FrameValidationService)
  * **Connection Services:** Memoized client instance creators (StrategyConnectionService, ExchangeConnectionService, FrameConnectionService)
  * **Global Services:** Context wrappers for public API (StrategyGlobalService, ExchangeGlobalService, FrameGlobalService)
  * **Logic Services:** Async generator orchestration (BacktestLogicPrivateService, LiveLogicPrivateService)
  * **Markdown Services:** Auto-generated reports with tick-based event log (BacktestMarkdownService, LiveMarkdownService)
* **Persistence Layer:** Crash-safe atomic file writes with PersistSignalAdaper, extensible via PersistBase
* **Event Layer:** Subject-based emitters (signalEmitter, errorEmitter, doneEmitter) with queued async processing

**Key Design Patterns:**

* **Discriminated Unions:** Type-safe state machines without optional fields
* **Async Generators:** Stream results without memory accumulation, enable early termination
* **Dependency Injection:** Custom DI container with Symbol-based tokens
* **Memoization:** Client instances cached by schema name using functools-kit
* **Context Propagation:** Nested contexts using di-scoped (ExecutionContext + MethodContext)
* **Registry Pattern:** Schema services use ToolRegistry for configuration management
* **Singleshot Initialization:** One-time operations with cached promise results
* **Persist-and-Restart:** Stateless process design with disk-based state recovery
* **Pluggable Adapters:** PersistBase as base class for custom storage backends
* **Queued Processing:** Sequential event handling with functools-kit queued wrapper

**Data Flow (Backtest):**

1. User calls Backtest.background(symbol, context) or Backtest.run(symbol, context)
2. Validation services check strategyName, exchangeName, frameName existence
3. BacktestLogicPrivateService.run(symbol) creates async generator with yield
4. MethodContextService.runInContext sets strategyName, exchangeName, frameName
5. Loop through timeframes, call StrategyGlobalService.tick()
6. ExecutionContextService.runInContext sets symbol, when, backtest=true
7. ClientStrategy.tick() checks VWAP against TP/SL conditions
8. If opened: fetch candles and call ClientStrategy.backtest(candles)
9. Yield closed result and skip timeframes until closeTimestamp
10. Emit signals via signalEmitter, signalBacktestEmitter
11. On completion emit doneEmitter with { backtest: true, symbol, strategyName, exchangeName }

**Data Flow (Live):**

1. User calls Live.background(symbol, context) or Live.run(symbol, context)
2. Validation services check strategyName, exchangeName existence
3. LiveLogicPrivateService.run(symbol) creates infinite async generator with while(true)
4. MethodContextService.runInContext sets schema names
5. Loop: create when = new Date(), call StrategyGlobalService.tick()
6. ClientStrategy.waitForInit() loads persisted signal state from PersistSignalAdaper
7. ClientStrategy.tick() with interval throttling and validation
8. setPendingSignal() persists state via PersistSignalAdaper.writeSignalData()
9. Yield opened and closed results, sleep(TICK_TTL) between ticks
10. Emit signals via signalEmitter, signalLiveEmitter
11. On stop() call: wait for lastValue?.action === 'closed' before breaking loop (graceful shutdown)
12. On completion emit doneEmitter with { backtest: false, symbol, strategyName, exchangeName }

**Event System:**

* **Signal Events:** listenSignal, listenSignalBacktest, listenSignalLive for tick results (idle/opened/active/closed)
* **Error Events:** listenError for background execution errors (Live.background, Backtest.background)
* **Completion Events:** listenDone, listenDoneOnce for background execution completion with DoneContract
* **Queued Processing:** All listeners use queued wrapper from functools-kit for sequential async execution
* **Filter Predicates:** Once listeners (listenSignalOnce, listenDoneOnce) accept filter function for conditional triggering

**Performance Optimizations:**

* Memoization of client instances by schema name
* Prototype methods (not arrow functions) for memory efficiency
* Fast backtest method skips individual ticks
* Timeframe skipping after signal closes
* VWAP caching per tick/candle
* Async generators stream without array accumulation
* Interval throttling prevents excessive signal generation
* Singleshot initialization runs exactly once per instance
* LiveMarkdownService bounded queue (MAX_EVENTS = 25) prevents memory leaks
* Smart idle event replacement (only replaces if no open/active signals after last idle)

**Use Cases:**

* Algorithmic trading with backtest validation and live deployment
* Strategy research and hypothesis testing on historical data
* Signal generation with ML models or technical indicators
* Portfolio management tracking multiple strategies across symbols
* Educational projects for learning trading system architecture
* Event-driven trading bots with real-time notifications (Telegram, Discord, email)
* Multi-exchange trading with pluggable exchange adapters

**Test Coverage:**

The framework includes comprehensive unit tests using worker-testbed (tape-based testing):

* **exchange.test.mjs:** Tests exchange helper functions (getCandles, getAveragePrice, getDate, getMode, formatPrice, formatQuantity) with mock candle data and VWAP calculations
* **event.test.mjs:** Tests Live.background() execution and event listener system (listenSignalLive, listenSignalLiveOnce, listenDone, listenDoneOnce) for async coordination
* **validation.test.mjs:** Tests signal validation logic (valid long/short positions, invalid TP/SL relationships, negative price detection, timestamp validation) using listenError for error handling
* **pnl.test.mjs:** Tests PNL calculation accuracy with realistic fees (0.1%) and slippage (0.1%) simulation
* **backtest.test.mjs:** Tests Backtest.run() and Backtest.background() with signal lifecycle verification (idle → opened → active → closed), listenDone events, early termination, and all close reasons (take_profit, stop_loss, time_expired)
* **callbacks.test.mjs:** Tests strategy lifecycle callbacks (onOpen, onClose, onTimeframe) with correct parameter passing, backtest flag verification, and signal object integrity
* **report.test.mjs:** Tests markdown report generation (Backtest.getReport, Live.getReport) with statistics validation (win rate, average PNL, total PNL, closed signals count) and table formatting

All tests follow consistent patterns:
* Unique exchange/strategy/frame names per test to prevent cross-contamination
* Mock candle generator (getMockCandles.mjs) with forward timestamp progression
* createAwaiter from functools-kit for async coordination
* Background execution with Backtest.background() and event-driven completion detection


# backtest-kit functions

## Function writeMemory

The `writeMemory` function lets you store data within a specific, named memory space, associating it with the current trading signal. Think of it as creating a labeled container to hold information that your strategies can access later. 

It handles the technical details of knowing which signal is active and whether you're running a backtest or live trading, so you don’t have to worry about those aspects.

You provide a name for the memory bucket, a unique identifier within that bucket, the actual data you want to store (which can be any object), and a short description for documentation purposes. This function then persists that data in a way that’s accessible to your other signals and components within the trading system.


## Function warmCandles

The `warmCandles` function helps you prepare your backtesting environment by proactively downloading and saving historical candle data. Think of it as pre-loading the data you’ll need for your backtests. It downloads candles for a specific time range and interval, essentially grabbing all the data between a starting date (`from`) and an ending date (`to`). This is useful to reduce latency and improve performance during backtesting by ensuring the data is readily available. The function takes a set of parameters that define what candles to download and where to store them.

## Function waitForReady

This function ensures everything needed to start trading is properly set up before proceeding. It waits for important configuration pieces – schemas for exchanges, frames (historical data), and strategies – to become available. 

Think of it as a safety check at the beginning, preventing errors later on.

It periodically checks if these schemas are ready, and it does so for a limited time. 

When running a backtest (simulated trading), it makes sure all three types of schemas are present. For live trading, only the exchange and strategy schemas are required. 

If the necessary components aren't ready within the timeout period, the function finishes without raising an immediate error, allowing subsequent code to handle the missing dependencies gracefully.

## Function validate

This function helps you confirm that everything you're using in your backtests is set up correctly. It checks that all the names you're referencing for things like exchanges, trading strategies, and risk management are actually registered within the system.

You can choose to validate just specific parts of your setup, or let it check everything.

Think of it as a safety net—run this before you start backtesting or optimizing to catch any configuration errors early on. The system remembers the results of these checks, so it won't repeatedly validate the same things. 

To use it, you pass in a list of what you want it to check, but if you don't provide a list, it'll check everything that's registered.

## Function stopStrategy

This function lets you pause a trading strategy from creating new signals. 

It essentially tells the strategy to stop opening new trades. Any existing trades will finish up on their own. 

Whether you're running a backtest or a live trading session, the framework will gracefully stop the strategy at a convenient point, like when it's not actively trading or after a signal has closed.

You just need to specify the trading pair symbol – the framework figures out which strategy to stop based on the current context.

## Function shutdown

This function helps you cleanly end a backtesting run. It sends out a signal that lets all parts of your backtest know it's time to wrap up and do any necessary cleanup, like saving data or closing connections. Think of it as a polite way to say goodbye before the backtest finishes, making sure everything is in order. It's useful when you want to stop the backtest, for instance, if you press Ctrl+C.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it as a "pause" button for your automated trading.

When a strategy is paused, it won't react to new market signals, and any pending signal requests will remain in a queue until you resume the strategy.  Existing orders and open positions will still be managed as usual.

This pause state is saved, so it persists even if the system restarts. To unpause, you’ll need to explicitly call `setStrategyPaused` again, this time setting the paused state to `false`.

You’ll receive a notification when the pause state changes, allowing you to track when a strategy is paused or resumed. It works whether you're backtesting or running live trades.

The function requires you to specify the trading symbol and whether you want the strategy paused or not.

## Function setSessionData

This function lets you store data that lasts throughout a backtest or live trading session. Think of it as a handy place to hold temporary information like calculations from indicators, results from AI models, or anything else you need to remember across different candles. 

You can update this data for a specific trading pair (symbol).  If you want to clear something you’ve already stored, just pass `null` as the value. 

The framework automatically knows whether it's running a backtest or a live session, so you don't need to worry about that. It manages the storage for you based on the current context, which includes the trading pair, strategy, exchange, and timeframe.


## Function setLogger

You can control how backtest-kit reports its activity by providing your own logger. This function lets you plug in a logger that follows the `ILogger` interface. The framework will then send all its logging messages – things like strategy information, exchange details, and the symbol being traded – to your custom logger, giving you a way to see exactly what's happening. This is useful if you want to integrate with a specific logging system or want more control over the output.

## Function setConfig

This function lets you adjust the overall settings for the backtest-kit framework. You can provide a new configuration object with only the settings you want to change, leaving the rest untouched. It's a way to customize how the backtest kit behaves.  The `_unsafe` flag is a special option meant for testing environments, where you might want to bypass certain safety checks during configuration.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like when you generate a markdown report. You can change how the data is displayed by providing your own column configurations.  The framework checks to make sure your configurations are valid to prevent errors.  If you're working in a testing environment and need to bypass these validations, there's a special option you can use.

## Function searchMemory

The `searchMemory` function helps you find related memory entries based on a search query. 

It's designed to sift through your stored data and locate entries that match what you're looking for, using a technique called BM25 to rank the results by relevance. 

Think of it as a powerful search tool for your memory.

The function automatically adapts to whether you're in a backtesting environment or a live trading scenario, and it's capable of identifying the current signal based on your execution context.

You provide the function with a bucket name—essentially the container where the memory data is stored—and the search query itself.

It returns an array of results, each showing the memory ID, a score indicating its relevance, and the content of the memory entry.


## Function runInMockContext

This function lets you execute code as if it were running within a trading framework context, but without needing a full backtest setup. Think of it as a sandbox for your tests or quick scripts.

It’s especially handy when you need to access things like the current timeframe (`getBacktestTimeframe`) but don't want to run a complete backtest.

You can customize the "mock" environment by providing values for things like the exchange name, strategy name, symbol, and a timestamp (`when`). If you don't provide these, it will use default values that create a simple, live-mode environment. 

Essentially, it provides a controlled environment to simulate context-dependent behavior for testing and experimentation.

## Function removeMemory

This function helps clean up your backtest data by deleting specific memory entries. Think of it as permanently removing a record associated with a particular signal. 

It takes two pieces of information: the name of the bucket where the memory is stored and a unique identifier for the memory entry you want to delete.

The function smartly handles whether you're running a backtest or live trading simulation, and it takes care of resolving any pending or scheduled signals automatically, saving you some manual work.


## Function readMemory

The `readMemory` function lets you retrieve data that’s been stored in memory, associating it with the current trading signal. It's designed to be flexible, automatically figuring out whether you're in a backtesting environment or live trading.

You provide the name of the memory "bucket" and a unique identifier ("memoryId") for the specific piece of data you want.

The function returns a promise that resolves with the stored data, and the type of the data is inferred from the structure you define when you call the function, making it type-safe. 


## Function overrideWalkerSchema

This function lets you tweak an existing walker configuration, which is used for comparing strategies. Think of it as a way to modify a pre-existing setup rather than creating a whole new one. You provide a partial configuration – just the bits you want to change – and the function merges those changes with the original walker configuration. The parts of the walker configuration you *don't* specify will remain as they were.


## Function overrideSweepSchema

This function lets you modify a sweep configuration that’s already been set up within the backtest-kit. Think of it as tweaking an existing plan instead of creating a new one from scratch. It allows you to change specific parts of a sweep, like its parameters or settings, while keeping everything else as it was. Keep in mind that changes made this way won't immediately affect existing connections – you might need to refresh them for the updates to take effect.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already set up within the backtest-kit framework. Think of it as a way to tweak a strategy without rebuilding it from scratch. You can provide only the parts you want to change – things like parameters or configurations – and the rest of the strategy will stay exactly as it was. It’s a handy shortcut for adjustments and refinements. 

The function takes a piece of the strategy's configuration as input, allowing you to precisely control what gets updated.


## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy. Think of it as fine-tuning – you're not creating a whole new strategy, but rather modifying an existing one. You can selectively change specific parts of the sizing schema, like the order size or the risk percentage, while leaving the rest untouched. It's a way to adapt your sizing approach without rewriting everything from scratch. This function returns a promise that resolves to the modified sizing schema.

## Function overrideRiskSchema

This function lets you adjust existing risk management settings within the backtest-kit framework. Think of it as a way to fine-tune a risk profile you've already set up – you're not creating a completely new one, just making some targeted changes.  You provide a set of updated parameters, and those specific fields in the existing risk configuration will be modified. The rest of the risk configuration remains untouched. Essentially, it offers a controlled way to make incremental adjustments to how risk is managed during backtesting.

## Function overrideMCPSchema

This function lets you adjust the settings of an existing MCP, which is essentially a blueprint for how your trading model communicates with the backtest system. Think of it as fine-tuning a pre-existing setup - you don’t have to rebuild the whole thing. You only need to specify the parts you want to change, and everything else stays as it was. It’s a promise-based function, meaning it returns a promise that resolves with the updated MCP configuration.

## Function overrideFrameSchema

This function lets you modify a timeframe's configuration that's already being used for backtesting. Think of it as making targeted changes to a timeframe – you specify what you want to update, and everything else stays as it was. It’s useful when you need to adjust certain aspects of a timeframe without completely redefining it. You provide a partial configuration, and the function updates the existing timeframe with just those changes.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange. Think of it as making tweaks, not a complete rebuild. You provide a partial configuration – just the bits you want to change – and the rest of the exchange's settings stay as they were before. This is useful for adjusting things like API keys or data refresh rates without having to redefine the whole data source.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without having to completely replace them. Think of it as a way to make targeted adjustments – just provide the parts of the action handler’s configuration you want to change, and everything else stays the same. This is handy for things like updating how events are handled, adapting to different environments (like development versus production), or even swapping out the logic used in a handler, all while keeping the core strategy intact. It’s particularly helpful when you need flexibility without a full re-registration process.

You provide a partial configuration object, representing the updates you want to apply to the existing action handler.

## Function listenWalkerProgress

This function lets you keep track of how a backtest is progressing. It's designed to receive updates after each trading strategy finishes running within the backtest.

Essentially, you provide a function that will be called with information about the progress – think of it as a notification system.

The system ensures that these updates are handled one at a time, even if your provided function takes a little time to process, preventing any unexpected issues from multiple updates happening simultaneously. This helps guarantee a smooth and reliable progress monitoring experience.


## Function listenWalkerOnce

This function lets you react to events happening within a trading strategy's "walker," but only once. You provide a filter that defines what kind of event you're interested in, and a function to execute when that event occurs. Once the event is processed, the function automatically stops listening, making it ideal for situations where you need to monitor progress and perform an action based on a particular condition. It's a handy way to ensure you don't get stuck listening for events you no longer need.


## Function listenWalkerFilter

This function lets you listen for events as the backtest progresses, but with a specific filter. You provide a function (`filterFn`) that determines whether an event should be passed on. Only events that satisfy this filter will trigger the callback function (`fn`) you define. The listener will remain active, continually sending you matching events as they occur. Think of it as a targeted way to monitor the backtest's journey, focusing only on the events you care about.


## Function listenWalkerComplete

This function lets you listen for when a backtest run finishes. 
It's designed to handle events one at a time, even if the function you provide needs to do something asynchronously. 
Essentially, it guarantees that the completion events are processed in the order they arrive, preventing any potential conflicts from happening simultaneously. You provide a function that will be called when the backtest is complete, and this function returns another function to unsubscribe from these events.

## Function listenWalker

The `listenWalker` function lets you keep track of what's happening as your trading strategies run within a backtest. It’s like setting up a notification system that tells you when each strategy finishes its analysis.

You provide a function that will be called after each strategy completes, and this function receives information about the strategy’s progress. Importantly, these notifications are handled in a specific order, and any asynchronous operations within your notification function won’t disrupt the sequence. This ensures that you’re receiving updates reliably and in the intended order.


## Function listenValidation

This function lets you keep an eye on potential problems during risk validation – that's when the system is checking if your trading signals are safe. 

It's like setting up an alert system. Whenever a validation check finds an error, this function will call your provided callback. 

The callback lets you log these errors, send notifications, or trigger other actions to help with debugging and monitoring. Importantly, errors are handled one at a time, even if your callback takes some time to process. This prevents issues caused by running multiple error handlers simultaneously. You provide a function, and it returns another function which is a cleanup function.


## Function listenSync

The `listenSync` function lets you react to order synchronization events, which happen when signals are being opened or closed. It's a special way to get notified about these events, and it handles potential errors in a specific way to ensure things run smoothly.

If something goes wrong during the process – like an error or a rejected order – `listenSync` will manage how the system responds. For example, if there's a temporary problem, it will retry opening or closing the order a certain number of times. But, if an order is permanently rejected, it will immediately cancel it.

You provide a function to this listener that will be called whenever a synchronization event occurs. This function can handle the event data, and it gives you a chance to influence what happens next. It's designed to be synchronous, ensuring that the signal processing waits until your function finishes before continuing.

## Function listenStrategyCommitUnique

This function helps you keep track of when a strategy makes a commitment. Think of it as a way to listen for significant changes in your trading strategy.

It’s designed to avoid overwhelming you with repeated events for the same signal; it only notifies you about the first occurrence of a matching event.

You provide a filter – a way to specify which events you’re interested in – and a callback function that gets executed when a relevant event happens. The function returns a way to unsubscribe from these events when you no longer need them.


## Function listenStrategyCommitOnce

This function lets you react to specific changes in your trading strategy, but only once. You provide a filter that defines what kind of changes you're interested in, and a function that will run when a matching change happens. Once that one event is processed, the function automatically stops listening, which is great for tasks like initializing a state based on an initial strategy configuration. Think of it as setting up a temporary listener that disappears after its job is done.

## Function listenStrategyCommitFilter

This function lets you monitor changes to your trading strategies, but with a twist: you can specify a filter to only receive updates about the strategies you're most interested in. It’s like setting up a notification system where you only get alerts for specific types of strategy changes. 

You provide a filter function that determines whether an event should be passed on, and a callback function that gets executed whenever a matching event occurs. The subscription you create using this function will continue to deliver events as they happen, keeping you up-to-date with strategy modifications.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a listener that gets notified whenever things change, like a stop-loss being adjusted or a partial trade being closed.

The listener will process these events one at a time, even if your notification code takes some time to run. This ensures changes are handled in a controlled and sequential manner.

You provide a function that gets called each time a relevant event occurs, allowing you to react to changes in your strategy's settings or status. It will notify you about events like cancellations, closures, profit/loss adjustments, and trailing stops.


## Function listenSignalWaitingUnique

This function lets you listen for specific events related to trading signals that are currently in a "waiting" state – essentially, signals that are paused and awaiting further action. It’s designed to trigger only the *first* time a waiting signal meets a certain condition you define. Think of it as a way to react to the initial confirmation of a waiting signal, and then ignore subsequent updates for that same signal.

You provide two things: a filter function that determines which waiting events are important to you, and a callback function that gets executed when a matching event occurs. This is particularly useful when you want to track the initial occurrence of a waiting signal without being bombarded with every single update it receives. The function returns a cleanup function that you can call to unsubscribe.

## Function listenSignalWaiting

This function lets you tap into a stream of data during backtesting and live trading, specifically when a signal is scheduled to activate in the future. It provides updates on every tick while a signal is still waiting to be triggered. 

Think of it as getting a real-time pulse on what's happening before a trade actually executes.

Because this happens frequently for each waiting signal, it can generate a lot of data. If you're dealing with many signals, you might consider using the `listenSignalWaitingUnique` function to reduce the number of callbacks you receive.

You provide a function (`fn`) that will be called with data about each of these "waiting" ticks.

## Function listenSignalUnique

This function helps you listen for trading signals but with a twist – it ensures you only receive each unique signal once. It first checks if a signal meets your criteria using a filter function you provide. Then, it combines signals that have the same identity and signal ID, guaranteeing that your callback function is only triggered when a truly new signal arrives. Signals indicating inactivity (where the signal is null) are skipped entirely, so you're always working with signals that represent actual trading opportunities.


## Function listenSignalScheduledUnique

This function lets you listen for scheduled tick results, but it only triggers once for each unique signal ID, whether you're in a live trading environment or backtesting. You provide a filter function to decide which tick results you're interested in – this acts like a selector. Then, you define a callback function that will be executed for each new, unique signal ID that passes your filter. The function returns an unsubscribe function so you can stop listening when you no longer need it.

## Function listenSignalScheduled

This function lets you react to signals that are scheduled to trigger when a specific price level is reached. It's useful for strategies that anticipate future price movements.

Whenever a new signal is created and set to wait for a specific price, this function will notify you. You’ll receive updates as these signals "wait" for their target price.

You provide a function that gets called with information about the scheduled signal event. The function you provide also returns a function that you can use to unsubscribe from these events later.


## Function listenSignalOpenedUnique

This function lets you listen for events when a trading signal is opened, but only once for each unique signal ID. 

You provide a filter function to specify which events you're interested in, and then a callback function that gets executed whenever a new, unique signal is opened that matches your filter. This is useful when you only want to react to the initial opening of a signal, avoiding repeated notifications for the same signal. The function returns an unsubscribe function that you can call to stop listening.

## Function listenSignalOpened

This function lets you monitor when new positions are opened, whether they’re created directly or triggered by a scheduled signal. Think of it as setting up a listener that gets notified whenever a trade begins. You provide a function (`fn`) that will be called each time a position opens, and this function receives an event containing details about that opening. The function you provide returns another function that you can call to unsubscribe from these notifications, allowing you to stop listening when you no longer need to.

## Function listenSignalOnce

This function lets you set up a listener that will react to a specific type of signal event just once. You provide a filter – a condition that determines which events you're interested in – and a function to execute when that condition is met. The listener will automatically stop working after the first match, making it perfect for situations where you need to react to something specific and then move on. It’s like a one-time alert that disappears after it goes off.


## Function listenSignalNotifyUnique

This function lets you keep track of new signals coming in, ensuring you only process each unique signal ID once, even if the system sends multiple notifications for the same one. You provide a filter to decide which signals you're interested in, and then a function that gets called whenever a new, unique signal is detected. It's designed to prevent duplicate processing of signals that might be sent repeatedly. The function returns an unsubscribe function that you can use to stop listening.

## Function listenSignalNotifyOnce

This function lets you set up a one-time listener for specific signal events. You provide a filter—a function that checks if an event is interesting to you—and a callback that will be executed exactly once when a matching event occurs. Once that one event has been processed, the listener automatically stops listening, so you don't need to worry about manually unsubscribing. It's a convenient way to react to a single signal event and then move on.


## Function listenSignalNotifyFilter

This function lets you focus on specific signal events by setting up a filter. You provide a function that decides which signals you're interested in, and then a callback function that gets executed only when those filtered signals arrive. It's like setting up an ongoing alert system for particular types of signals. The subscription stays active, so you'll continue to receive matching events until you explicitly cancel it.

## Function listenSignalNotify

This function lets you keep track of what’s happening with your trading strategy’s signals. Whenever your strategy uses `commitSignalInfo()` to send a notification about a trade, this function will alert you.

It makes sure that these alerts are handled one at a time, even if the way you handle them takes some time. This prevents any potential problems with processing them all at once.

Essentially, you provide a function that will be called whenever a new signal notification arrives, and it will return a function to unsubscribe from the signal.


## Function listenSignalLiveWaitingUnique

This function lets you listen for specific signals coming from live trading executions, ensuring you only get notified once for each signal. It's particularly useful when dealing with "waiting" signals, which occur repeatedly until a trading condition is met.

The system cleverly prevents duplicate notifications; it only calls your callback function the very first time a signal meets the criteria you define. This avoids being overwhelmed with updates.

Importantly, this functionality works exclusively with live trading data, not historical backtests.

The signal filtering is based on a combination of factors like the strategy, exchange, frame, mode, and symbol, which means parallel strategies won’t interfere with each other’s notifications.

Before the deduplication process, a filter function is applied, allowing you to specify exactly which events you’re interested in, and ensuring no events are missed.

## Function listenSignalLiveWaiting

This function lets you react to signals that are waiting to be triggered during a live trading execution. Think of it as a heads-up before an order actually goes through.

It provides information about the pending signal, including what the entry would look like and a theoretical profit and loss calculation. 

Importantly, this callback only fires during live executions, not when you're replaying historical data. This makes it a safe place to do things that interact with the outside world like sending notifications or mirroring orders.

You'll receive these updates frequently, once for each tick while the signal is still waiting. The data is structured so you don't need extra checks to understand what action is happening. 

The function returns an unsubscribe function, which you’ll use to stop receiving these signals when you no longer need them.


## Function listenSignalLiveUnique

This function lets you listen for incoming signals from a live trading simulation. 

It's designed to give you a notification each time a new signal appears, ensuring you only receive events from active simulations, and it skips any signals that are null. 

You can filter these signals using a provided function to only receive the ones you're interested in. The function you provide will be called once for each new, unique signal ID. To stop listening, the function returns a cleanup function that you can call.


## Function listenSignalLiveScheduledUnique

This function lets you listen for specific tick results during live trading executions. It ensures you only receive each signal once, acting as a safety measure to prevent duplicate notifications.

It's designed to work exclusively with live trading scenarios, so you won’t get triggered results from backtesting.

To avoid conflicts between strategies, the function uses a unique identifier for each execution, preventing simultaneous strategies from interfering with each other.

The provided filter function is evaluated first; events that don’t meet the filter's criteria are simply ignored and won’t be remembered, so they won’t impact later events. You provide a function to decide which signals to handle and a callback function that gets executed when a matching signal is found.

## Function listenSignalLiveScheduled

This function lets you listen for signals generated during live trading sessions when a strategy is waiting for a specific price to be reached. 

Think of it as a starting bell – it rings only once when a strategy initiates a trade request and the system begins waiting for market conditions to align. 

It’s specifically designed for live trading, not backtesting, which means you can safely use it for things that have real-world effects, like sending alerts or mirroring orders. 

The information delivered is tailored to the specific type of signal, so you don’t need extra checks to understand what's happening.

Essentially, it signals the beginning of a waiting period for a trade, not the ongoing updates of that wait.

## Function listenSignalLiveOpenedUnique

This function lets you listen for when a new trading position is opened during live trading. It ensures you only receive each opening event once, even if the system tries to send it multiple times.

Think of it as a way to react specifically to the start of a trade, and only when it's happening live, not during a historical backtest.

It keeps track of which trades it has already processed, so you don't get duplicate notifications, but in a smart way – it's unique to each individual trade based on factors like the strategy, exchange, and the asset being traded.

The function accepts a filter to selectively receive events and a callback function to be executed for each unique, filtered opening event.

## Function listenSignalLiveOpened

This function lets you listen for when a trading position actually begins, based on live executions.

You’ll get notified whenever a new position is opened, whether it’s from an immediate signal or a scheduled action.

The notification includes details like the signal's data, entry price, and stop-loss/take-profit levels – essentially, the moment the position starts incurring costs.

It's specifically for live trading sessions, so it's safe to use for actions like placing orders, sending alerts, or other real-world operations because backtests won't trigger this.

You don't need to check the event type as it only contains the "opened" action.


## Function listenSignalLiveOnce

This function lets you set up a listener that only reacts to specific signal events happening during a live trading simulation. It's designed to execute your callback function just once, when a particular condition is met. Think of it as a temporary alert – it listens for signals, triggers your code when it sees something it’s looking for, and then quietly stops listening.

You tell it what kind of signal events to watch for using a filter function. The callback function you provide then runs only on those matching events. After the callback executes once, the listener automatically turns off, ensuring it doesn't interfere with other parts of your application.


## Function listenSignalLiveIdle

This function lets you listen for moments when your live trading strategy isn't actively doing anything – it's not in a position and has nothing scheduled. Think of it as a way to get notified when your strategy is "idle."

You’ll receive a notification for each tick during these quiet periods. Importantly, the `signal` data will always be `null` in these events, so you only need to look at things like the current price, the trading symbol, and details about the strategy, exchange, and time frame.

It’s a safe place to put actions that need to happen in the real world, such as sending alerts or logging heartbeat signals, because this event only happens during live executions, not during backtesting replays. You don't need to check the event's action type before using the data.

To use it, you provide a function (`fn`) that will be called whenever this idle state is detected. The function you provide will be returned, and you can call that returned function to unsubscribe from the event.

## Function listenSignalLiveFilter

This function lets you listen for live trading signals, but with a twist – you can specify a filter to only receive signals that meet certain criteria. It's like setting up a specific alert based on your strategy's results.

You provide a function (`filterFn`) that checks each incoming signal. If the signal passes your filter, then another function (`fn`) is called to handle it.

This function ensures you only deal with the signals that are relevant to your current focus and keeps delivering those signals as they arrive. It returns a function you can call to stop listening.

## Function listenSignalLiveClosedUnique

This function lets you react to specific closed positions in live trading executions. It ensures you only get notified about a closed position once, even if the signal repeats.

Essentially, it acts as a safety net against unexpected duplicate events, but importantly, it only works with data coming from live executions – not historical backtests.

The function uses a filter to determine which closed positions you're interested in. This filter is checked *before* the deduplication process, meaning if it rejects an event, it won't be remembered, preventing it from potentially blocking a later, relevant event.

To make it safe for multiple strategies running in parallel, it deduplicates based on a unique identifier that includes the strategy, exchange, frame, mode and symbol. 

You provide a function to filter the closed events and another to be executed when a unique, filtered closed event is received. The return value of the function is a function that can be called to unsubscribe.

## Function listenSignalLiveClosed

This function lets you listen for when a live trading position closes. 

It’s specifically for positions managed by `Live.run()`, not backtesting.

You'll get notified when a position closes due to a take profit, stop loss, time expiration, or a manual close.

The notification includes details like the reason for closing, the timestamp, and the profit/loss calculation (including fees and slippage). 

Think of this as the end of the story for that particular trade – no more updates will be sent after this notification.

Because it's isolated to live trades, this is a safe place to put actions that affect the real world, like sending alerts or placing mirror orders.

## Function listenSignalLiveCancelledUnique

This function lets you listen for when a trading signal is cancelled during a live execution. It ensures you only receive each cancellation notification once, even if the system tries to notify you multiple times.

It's specifically designed to work with live trading, not historical backtests.

The function uses a smart system to prevent duplicate notifications based on the details of the trade (strategy, exchange, timeframe, mode, and asset). This means if you have multiple strategies running, they won’t interfere with each other’s cancellation notifications.

You provide a filter function to select which cancellation events you're interested in, and a callback function that will be called for those events. Importantly, the filter runs *before* any deduplication, so you'll never miss an event that initially matches your filter.

## Function listenSignalLiveCancelled

This function lets you set up a listener to be notified whenever a live trading signal is cancelled before it results in a position being opened. Think of it as getting a heads-up when something you planned to trade didn't go through, like if the price moved unexpectedly or you decided to cancel it yourself.

It's important to note that this only works with live executions, not when you're running backtests on historical data. This makes it a safe place to put actions that interact with the real world, such as sending alerts or updating your order book.

The information you receive includes the reason for the cancellation and, if it was a user-initiated cancellation, a unique ID for that cancellation. It simplifies handling the event because the details are already separated by action type, so you don't need to check which action it represents before accessing the data.


## Function listenSignalLiveActiveUnique

This function lets you listen for specific events happening during live trading, ensuring you only get notified once for each unique signal. Think of it as a way to get alerts for milestones in a trade, like when it hits a certain profit level.

It only works with live executions, so you won't receive anything during backtesting.

To prevent duplicate notifications, it remembers the last signal it processed for each trade, and ignores any repeats. The filter function you provide is checked *before* this deduplication, meaning it always has a chance to flag a potentially important event. You can use this to focus on specific situations during a trade's lifecycle.


## Function listenSignalLiveActive

This function lets you hook into live trading activity. It provides real-time updates on your positions, including profit and loss (`pnl`), and how close the price is to your take-profit or stop-loss levels.

Think of it as a constant stream of information while your trades are running, telling you exactly how they're performing.

It’s designed specifically for live executions, and importantly, it *won’t* fire during backtesting runs, so it’s safe for tasks like sending notifications or placing orders elsewhere.

You provide a function that gets called with each update, and the function itself returns another function that you can use to unsubscribe from these live updates.

## Function listenSignalLive

This function lets you listen for live trading signals generated during a backtest. It’s a way to tap into the real-time data flow as the backtest is running.

You provide a function that gets called whenever a signal event occurs. The function receives an object containing details about that signal.

Importantly, signals are delivered one at a time, ensuring they are processed in the order they happened. This is exclusive to signals from `Live.run()` executions. 

The function returns another function that, when called, will unsubscribe you from receiving these live signals.


## Function listenSignalIdle

The `listenSignalIdle` function lets you monitor your trading strategy for periods of inactivity. It essentially tells you when the strategy isn’t actively making any trades or holding any positions. 

You provide a function that will be called each time this idle state occurs. Each time the callback runs, you'll receive data like the current price and information about the strategy, exchange, and data frame being used. Think of it as a way to know when your strategy is just observing the market without taking action.


## Function listenSignalFilter

This function lets you continuously listen for specific trading signals. You provide a filter that determines which signals you’re interested in, and then a callback function to handle those signals. Unlike some other functions, this one keeps the subscription active, meaning it will continue to deliver signals that match your filter indefinitely. It's similar to listening once, but the listening continues.

## Function listenSignalEventUnique

This function lets you listen for specific lifecycle events related to trading signals. It’s designed to handle situations where you only want to react to a signal once, even if it has multiple events. The filter function allows you to precisely control which events trigger your callback—for example, you might only want to react to the "opened" signal events. The callback function will then be executed only once for each unique signal ID, preventing repeated processing. This is useful for tracking individual signals or performing actions only when a signal initially appears.

## Function listenSignalEventOnce

This function lets you listen for specific trading signals and react to them just once. Think of it as setting up a temporary alert – it triggers a callback function when a signal you're looking for arrives, and then it stops listening. It’s really handy if you need to wait for a particular order to be filled or a position to close, and then perform an action based on that event. You provide a filter to define which signals you're interested in, and a function to execute when a matching signal occurs. Once that signal appears, the listener automatically goes away.

## Function listenSignalEventFilter

This function lets you set up a persistent listener for specific trading signals. Think of it as a way to only react to signals that meet certain criteria you define. You provide a filter – a test to see if a signal is interesting – and then a function to run whenever a signal passes that test. The listener continues to work as long as signals continue to match your filter, giving you ongoing, focused attention to the signals you care about.


## Function listenSignalEvent

This function lets you keep an eye on what's happening with your trading signals, both when they first start and when they finish. You'll get notified when a signal is opened – whether it's a new one, an immediate order, or something scheduled – and again when it’s closed because of a take-profit, stop-loss, or time expiry. 

It's useful for tracking the entire lifecycle of your signals during backtesting or live trading. The events are handled one after another, even if your notification function needs to do something that takes some time.

You provide a function that gets called whenever a signal event happens, and this function returns another function that you can use to unsubscribe from those notifications later on.

## Function listenSignalClosedUnique

This function lets you listen for closed trading signals, but it's clever – you only get notified for each unique signal ID. 

It’s designed to filter these signals; you provide a function (`filterFn`) to decide which closed signals you're interested in.

Then, for each distinct signal that closes, your callback function (`fn`) will be executed once. This is useful when you want to track the final state of each trading signal independently, regardless of how many times it might close. The function returns an unsubscribe function.

## Function listenSignalClosed

This function lets you listen for events that happen when a trading position closes, whether it's a live trade or a backtest simulation. Whenever a position is closed, the function will call a callback you provide. This callback gets information like the profit and loss (`pnl`), the reason for the closure (`closeReason`), and the exact time the position was closed (`closeTimestamp`). Think of it as getting notified every time a trade finishes. You can unsubscribe from these notifications by returning the function returned by `listenSignalClosed`.

## Function listenSignalCancelledUnique

This function lets you listen for cancelled tick results – those situations where a trade was cancelled before it could fully execute. It’s designed to provide updates when a new signal ID is encountered, meaning you'll only receive notifications for distinct cancellation events. You provide a filter function to specify which cancelled events you’re interested in, and a callback function that will be triggered each time a new signal ID is cancelled based on your filter. The function returns an unsubscribe function, so you can easily stop listening when you no longer need it.

## Function listenSignalCancelled

This function lets you be notified when a trading signal is cancelled before a trade ever happens. 

Think of it as getting an alert when something prevents a planned trade from going through.

The `fn` you provide will receive information about *why* the signal was cancelled, which can be helpful for debugging or understanding market conditions. It's specifically for situations where a signal is dropped before a position is ever opened.


## Function listenSignalBacktestWaitingUnique

This function lets you listen for specific signals generated during backtesting, but with a clever twist: it ensures you only receive each signal once.

Imagine a resting order; it waits for a condition to be met. This function focuses on those "waiting" periods, handling situations where the same order might trigger multiple times.

It only works with backtesting, so you won't encounter signals from live trading.

The system keeps track of signals for each unique combination of strategy, exchange, timeframe, mode, and symbol, preventing the same signal from being processed repeatedly.

Importantly, your filtering function is checked *before* the signal is deduplicated, guaranteeing that even if a signal initially fails your filter, it won't block a potentially relevant signal later on. 

You provide a function to determine which signals you're interested in and another function that will be executed once for each matching signal.

## Function listenSignalBacktestWaiting

This function lets you listen for special updates during backtesting, specifically when a trading signal is waiting to be triggered. Think of it as getting previews of what *would* happen if a trade were to execute.

You’ll receive events for each tick while a signal is waiting, showing the potential entry details and theoretical profit/loss. It's useful for analyzing how signals behave during the waiting period without the noise of live trading data.

This only works within backtest simulations, never during actual live trading. The updates are clean and specific, designed for detailed replay analysis and reporting. You don’t need to filter the events based on action type because they are already separated. 

The function returns an unsubscribe function to stop listening.

## Function listenSignalBacktestUnique

This function lets you tap into the stream of signals generated during a backtest. It's designed to give you information about each unique signal as it comes through.

You provide a filter function to specify which signals you're interested in. Then, you supply a callback function that will be executed whenever a new, unique signal arrives.

It only works with signals produced during the `Backtest.run()` process and skips any signals that are null. This way, you only receive relevant information about the active trading signals. You can think of it as a way to specifically track and react to each distinct signal generated by your backtest.


## Function listenSignalBacktestScheduledUnique

This function lets you listen for specific tick results during backtesting, ensuring you only get each signal once. 

It’s designed to be a safety measure against repeated events, especially useful when dealing with backtest executions.

The events you receive are limited to those generated by `Backtest.run()`, guaranteeing that live trading won't trigger them.

You provide a filter function that determines which events you're interested in; this filter runs *before* any deduplication happens, meaning it can’t accidentally hide later events.

The function provides a way to unsubscribe from the event stream when it's no longer needed.

## Function listenSignalBacktestScheduled

This function lets you listen for specific events that happen during a backtest when a strategy is waiting for a market price to reach a target. 

Think of it as a notification that a strategy has requested a trade at a certain price, and the backtest engine is now observing the market to see if that price is hit. 

It’s designed for analyzing backtest results and generating reports, because it only provides information from backtest runs, not live trading. 

You provide a function (the `fn` parameter) that will be called whenever this "scheduled" event occurs, giving you access to data about what's happening during that moment in the backtest. This signal marks the beginning of the waiting period, not subsequent updates.


## Function listenSignalBacktestOpenedUnique

This function lets you listen for when a new trading position is opened during a backtest. It guarantees you’ll only receive this notification once for each unique trading opportunity.

Essentially, it’s a safety net to ensure you don’t get spammed with repeated notifications for the same trade.

You provide a filter function to decide which position openings you’re interested in and a callback function that will be executed for those openings.

Because it only works with backtest data, you don't have to worry about it firing during live trading sessions. 

It's designed to be safe: the filter runs first, so it won't accidentally block a potentially relevant event, and it remembers which signals it has already processed.

## Function listenSignalBacktestOpened

This function lets you listen specifically for when a trading position is opened during a backtest. It’s like getting a notification the moment a trade actually starts, whether it's from an immediate signal or a scheduled entry. 

You’ll receive details like the signal’s data, entry price, and stop-loss/take-profit levels.  

This is ideal for analyzing backtest results or generating reports, because it only provides data from backtests – you won't get these notifications when you're actually live trading. 

You don't need to filter the event type – the information you need is readily available. It’s a clean and direct way to track the beginning of each trade within your backtest simulations.


## Function listenSignalBacktestOnce

This function lets you listen for specific signals generated during a backtest, but it's designed to only react once. You provide a filter that determines which events you’re interested in, and then a function that will be executed when a matching event occurs. After the callback runs once, it automatically stops listening, preventing further unnecessary executions. It's perfect for tasks like logging a specific event or performing a single action based on a signal.


## Function listenSignalBacktestIdle

This function lets you tap into the backtest process to monitor periods of inactivity. 

It's specifically for when your trading strategy isn't actively holding any positions and has nothing scheduled to do. You'll receive notifications during these "idle" moments.

The data you get is focused on the basics – the current price, the trading symbol, and details about your strategy, exchange, and the data frame being used. The `signal` field will always be null, so you don’t need to check it.

Think of it as a way to track how often your strategy is silent, perhaps for logging purposes or for creating detailed reports about backtest performance. This is only triggered during backtest runs, keeping your reporting clean from live trading data.

## Function listenSignalBacktestFilter

The `listenSignalBacktestFilter` function lets you focus on specific trading signals during a backtest. Think of it as setting up a filter – you provide a condition (`filterFn`) that determines which signals you want to see. Only the signals that meet that condition will trigger your custom action (`fn`). This ensures you're not overwhelmed with irrelevant data and can concentrate on the most pertinent events for your analysis. Importantly, this subscription remains active, continuously processing signals as the backtest progresses. It's a filtered version of `listenSignalBacktest`, providing a more targeted approach to signal handling.


## Function listenSignalBacktestClosedUnique

This function lets you listen for signals when a backtest completes, ensuring you only get each signal once. It's a safety measure to avoid receiving duplicate notifications, especially in complex backtesting scenarios.

You provide a filter function to decide which closed position events you're interested in; this filter is applied before any deduplication happens.

The callback function you provide will then be triggered for each unique, closed position that meets your filter criteria. This only works with backtest runs, not live trading.

It uses a clever system to track which signals have already been processed, preventing repeat notifications even if the same backtest is run multiple times. This allows different strategies to run in parallel without interfering with each other's signal handling.

## Function listenSignalBacktestClosed

This function lets you keep an eye on when positions are closed during backtesting. 

It's like setting up a notification system that alerts you whenever a trade is finished – whether it's due to reaching a profit target, a stop-loss, time expiration, or manual closure. 

You'll get details like the reason for closure, the exact time it happened, and the profit and loss including fees and slippage. 

Crucially, this only works for backtest scenarios. It's perfect for analyzing past performance and generating reports, keeping things clean from real-time trading data. You don’t need to filter events by action – the data you receive is already specific to closed positions.

To use it, you provide a function that will be called each time a position closes during a backtest. The function you provide will be returned and can be called to unsubscribe.

## Function listenSignalBacktestCancelledUnique

This function lets you listen for specific cancelled trade events during backtesting, ensuring you only receive each event once. Think of it as a way to react to situations where a trade wasn't executed as planned, but only when you’re testing a strategy against historical data. It's designed to be a safety measure, preventing duplicate notifications if something goes wrong.

Because it’s tied to a particular backtest execution, it won't trigger during live trading.

It uses a clever system to avoid sending the same cancellation notification multiple times during a single backtest run, while still allowing unique events to be processed.  You can also use a filter to only process certain cancelled events. This filter is checked before any deduplication takes place, so it won’t prevent valid, subsequent events from being delivered. 

You provide a filter function to narrow down which cancellation events you care about, and a callback function that gets executed once for each matching event. The function returns a way to unsubscribe from the listener.


## Function listenSignalBacktestCancelled

This function lets you monitor when a trading signal is dropped during backtesting, specifically before a trade ever starts. 

Think of it as a way to keep track of signals that didn't result in an actual trade – maybe the price moved too quickly, or a timer ran out. 

You'll get a notification with details like the reason for cancellation and a unique ID if the user cancelled it. This is purely for backtesting analysis, so it won't trigger during live trading. 

It's designed to give you clean, focused data for backtest reporting and debugging. You provide a function to be called when a cancellation occurs, and that function will receive all the relevant information about the cancelled signal.


## Function listenSignalBacktestActiveUnique

This function lets you react to specific events during backtesting, ensuring you only get notified once for each trading signal. Think of it as setting up a one-time alert for a particular trade condition, like when a position reaches a certain profit level.

It works by filtering tick results—the data points generated during a backtest—and only triggering your callback function when a specific condition is met. The callback is guaranteed to run only the very first time that condition arises for a given trade, then it stops until a new signal appears.

This method is exclusive to backtesting; it won't be activated during live trading. It's designed to handle situations where you want to track unique events within a backtest execution, and it prevents multiple strategies from interfering with each other's notifications. The filter you provide is checked before any deduplication happens, ensuring no events are missed.


## Function listenSignalBacktestActive

This function lets you tap into the real-time data generated during backtesting sessions.

It’s like having a direct line to the backtest’s activity, specifically when a trade is open. You'll receive updates for each tick, including the current profit and loss (P&L), and information about how close the price is to hitting your take-profit or stop-loss levels.

This is designed solely for analyzing backtest results - you won't see this data during live trading. Think of it as a clean channel for deep dives into how your strategies perform in simulated environments.

The data you get is already organized, so you don’t need to filter it; the relevant information about the active position is readily available. 

To use it, you provide a function (the `fn` parameter) that will be called whenever a new tick event occurs during a backtest with an active position. The function you provide will receive an object containing details about that tick. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalBacktest

This function lets you tap into the flow of a backtest and get notified whenever a signal is generated. It's designed to handle events from the `Backtest.run()` process.

Think of it as setting up a listener that gets triggered whenever the backtest produces a signal.

You provide a function (`fn`) that will be called each time a signal appears. This function receives information about the signal as an `IStrategyTickResult`. 

Crucially, these signals are processed one at a time, in the order they're received, so you can be sure of the sequence. The function you provide will also return a function that you can call to unsubscribe from these notifications when you no longer need them.

## Function listenSignalActiveUnique

This function lets you keep an eye on specific active trading signals. It's designed to react to active ticks—those moments when a position is open and meeting certain criteria—but only once for each unique signal. 

Imagine it like this: when a new trade is triggered and meets your defined condition, the callback function will run. After that initial trigger, it won’t fire again for that same signal, avoiding repetitive notifications.

You define what constitutes a "match" using a filter function, which determines which active tick events you're interested in. The provided callback function is then executed once for each signal that passes that filter. This allows you to perform actions or log data based on these specific active signal occurrences.


## Function listenSignalActive

This function lets you tap into real-time updates during active trades, both live and in backtests. 

It sends you information like profit and loss (pnl), and progress towards take profit and stop loss levels for each open position, with every tick. Because of this frequent reporting, you’ll get a lot of events—one for each tick and each open position. If you're dealing with multiple positions, consider using `listenSignalActiveUnique` to reduce the volume of these updates. The function returns an unsubscribe function, so you can stop listening when you don’t need it anymore.


## Function listenSignal

This function lets you listen for updates from your trading strategy—think of it as getting notified whenever something significant happens, like a trade being opened, closed, or becoming active. It ensures these updates are handled one at a time, even if the code you provide takes some time to process each update. You give it a function that will be called with details about the event, and it returns a function you can use later to unsubscribe from these notifications.

## Function listenSchedulePingUnique

This function lets you listen for signals triggered by your backtest's schedule. Think of it as a way to react to events happening within your trading strategy's timing.

It's designed to handle situations where the same signal might fire repeatedly, collapsing those into a single notification for each unique signal.

You provide two pieces of information: a filter to select which events you want to process and a callback function to execute when a relevant event occurs. This lets you build responses to specific, unique signals within your backtest’s schedule.


## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific "ping" events and then stops listening afterward. Think of it as a temporary observer that only cares about one particular instance of an event. You provide a way to identify the events you're interested in, and then a function to run when a matching event occurs. Once that event is processed, the listener automatically disappears, ensuring it doesn’t keep running unnecessarily.

It's great for situations where you need to wait for a certain condition to be met by a ping event and then take action only once.

The `filterFn` defines which events will trigger the callback.
The `fn` is the function that actually does something when the right event happens.


## Function listenSchedulePingFilter

This function lets you set up a continuous listener for schedule ping events, but with a crucial twist: you can specify a filter. Only schedule ping events that meet your defined criteria will trigger the callback function you provide. Think of it as a specialized version of another listener, designed to handle only the events you’re specifically interested in, ensuring you don't get overwhelmed by irrelevant data. The listener persists, continually monitoring for and responding to matching events.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals as they wait to become active. Think of it as a way to receive regular "ping" updates, roughly every minute, while a scheduled signal is being monitored. 

You provide a function that will be called each time a ping is received. This allows you to build custom logic to monitor the signal’s lifecycle and do whatever you need based on these updates. The updates are handled asynchronously, so your code won't block while processing them. The function returns another function that you can call to unsubscribe from these ping events when you no longer need them.


## Function listenRiskOnce

The `listenRiskOnce` function lets you watch for specific risk rejection events and react to them just once. It’s like setting up a temporary listener – it will trigger your provided function when the first event matching your criteria appears, and then it automatically stops listening. This is really handy when you need to wait for a particular risk condition to be met and then take action, without having to manually manage the subscription. You define a filter to specify which events you're interested in, and a function to execute when that event occurs.


## Function listenRiskFilter

This function lets you set up a persistent listener for risk-related events within the backtest environment. You provide a filter function (`filterFn`) that determines which events you're interested in – only events that pass this filter will trigger the callback function (`fn`) you also provide. Think of it as a way to focus on specific risk signals and react to them as they happen during a simulated trade. The listener continues to run and deliver matching events until it’s explicitly stopped.

## Function listenRisk

The `listenRisk` function lets you get notified whenever a trading signal is blocked because it doesn't meet risk criteria. 

It's designed to only alert you about rejected signals, avoiding unnecessary notifications for signals that are approved. These notifications happen one after another, ensuring that your response to each rejection isn't rushed or interferes with processing others. You provide a function that will be executed when a risk rejection event occurs, allowing your application to react accordingly. This provides a way to monitor and potentially adjust your risk parameters based on observed rejections.


## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how long different parts of your trading strategies take to run. It essentially signs you up to receive updates about performance metrics as your strategy executes.

These updates, which are called `PerformanceContract` events, can help you find slow spots or bottlenecks that are impacting your strategy's speed.

Importantly, the function makes sure these updates are processed one at a time, even if the callback you provide involves some asynchronous operations. This prevents issues caused by multiple callbacks trying to run simultaneously. To stop receiving these performance updates, the function returns another function which you can call.

## Function listenPauseOnce

This function lets you react to a specific pause event just once and then automatically stops listening. You provide a filter to identify which pause events you're interested in, and then a function to handle that event. Once a matching event is found and processed, the listener is removed, so you won't receive any more notifications. It's a convenient way to perform a one-time action based on a pause state change. 


## Function listenPauseFilter

This function lets you listen for changes in a trading contract's paused state. 

You provide a filter function that determines which pause events you're interested in, and a callback function that executes when a matching event occurs. 

Unlike other listening functions, this one maintains the subscription, so you’ll continue receiving events until you manually unsubscribe. Essentially, it provides a way to selectively receive pause state updates and react to them.

## Function listenPause

The `listenPause` function lets you keep track of when your trading strategies are paused and resumed. It's designed to notify you when the pause status changes – meaning when a strategy starts or stops allowing new trades. Think of it as a way to get user-friendly updates about these changes, like sending a notification to a user that trading has been temporarily stopped.

It guarantees that these updates are handled one at a time, even if the update process itself takes some time. This ensures that events are processed in the order they are received, preventing any unexpected behavior. You provide a function that will be called whenever the pause state changes, and that function will receive details about the pause event.


## Function listenPartialProfitAvailableUnique

This function lets you monitor when partial profit levels are reached in your trades. It’s designed to avoid sending duplicate notifications – you’ll only receive the first matching profit level for each trading signal. 

If you need to react to *every* profit level for a signal, you’ll have to manage that yourself using the standard `listenPartialProfitAvailable` function, or refine the `filterFn` to isolate a specific level.

You provide a function (`filterFn`) to determine which events you want to receive, and another function (`fn`) that gets executed when a matching event occurs. The function returned by `listenPartialProfitAvailableUnique` is used to stop the subscription.


## Function listenPartialProfitAvailableOnce

This function lets you react to specific profit milestones reached in your trades, but only once. You provide a condition – a filter – that defines when you want to be notified, and a function that will execute when that condition is met. Once the condition is true and the function runs, the subscription is automatically cancelled, so you won’t receive further notifications. It’s perfect for scenarios where you need to take a single action based on a particular profit level being hit.

You tell it what to look for using the `filterFn`, which is a test or condition. The `fn` is what actually happens when the condition is met.

## Function listenPartialProfitAvailableFilter

This function lets you set up a persistent listener for partial profit events, but with a special twist: you can specify a filter. The `filterFn` you provide determines which profit events trigger the callback. This means you only receive notifications for the events that meet your specific criteria. The callback function, `fn`, then handles those filtered events as they occur, ensuring you're always up-to-date with the relevant profit levels. This provides a way to focus on specific profit signals and avoid unnecessary processing.

## Function listenPartialProfitAvailable

This function lets you keep track of when your backtest reaches specific profit milestones, like 10%, 20%, or 30% gain. 

It provides a way to react to these achievements without worrying about things happening too fast or out of order. The backtest framework will make sure events are handled one at a time, even if your reaction needs a little bit of time to complete. 

You provide a function that will be called whenever a new profit level is reached and that function receives information about the event.  When you're done, you can unsubscribe from these notifications.

## Function listenPartialLossAvailableUnique

This function lets you keep an eye on when partial losses occur, but it’s designed to only give you the initial signal for each loss level. It’s like setting up a notification system that only tells you about the first instance of a specific type of loss.

You provide a filter to narrow down which loss events you care about, and a function that gets executed when a matching loss event is detected. The function ensures you won't receive duplicate notifications for the same signal's loss level.

If you need to track every single partial loss signal, be sure to specify your filter to account for that.


## Function listenPartialLossAvailableOnce

This function lets you monitor for specific changes in partial loss levels and react to them, but only once. You provide a filter that defines what kind of change you're looking for, and a function to execute when that change happens. After the function runs once, it automatically stops listening, making it ideal for situations where you need to react to a single event. Essentially, it's a way to set up a temporary alert for a particular loss condition.


## Function listenPartialLossAvailableFilter

This function lets you keep an eye on changes related to partial losses in your trading system. You provide a filter – a way to specify exactly which changes you're interested in – and a callback function that gets executed whenever a matching change happens. It’s a continuous subscription, meaning you’ll receive updates as new partial loss levels are reached. This is useful for reacting to specific risk scenarios as they unfold.

## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost along the way during a backtest. It will notify you whenever the loss reaches specific milestones, like 10%, 20%, or 30% of the initial capital. 

The events are handled one at a time to avoid any confusion or problems caused by running multiple events simultaneously, even if your notification code takes some time to complete. To stop listening for these events, the function returns another function that you can call to unsubscribe. You provide a function that will be called with details about the partial loss event each time a milestone is hit.

## Function listenOrderStop

This function lets you monitor the lifecycle of order checks, specifically when they reach a terminal state—meaning they're either permanently removed or have failed too many times. It's like setting up a listener for when things go wrong or are no longer needed with order checks.

Think of it as being linked to a related process; when one of these terminal events happens, this function will notify you. You’ll receive a notification immediately *before* the order check is shut down.

This isn’t a decision point; if your listener encounters an error, it's handled silently, and the process continues without interruption. The `event.attempt` field tells you how many times the check failed consecutively before reaching that terminal state.

It's important to know this only works during live testing, not backtesting scenarios.

## Function listenOrderScheduleUnique

This function lets you react to specific, scheduled events related to trading signals. It’s designed to give you a notification whenever a new signal is scheduled or cancelled, but it makes sure you only get one notification per unique signal ID. You can use a filter function to specify exactly which kinds of events you're interested in, like only receiving notifications for signals that are being scheduled, or only those that are being cancelled. Essentially, it's a way to stay informed about the lifecycle of your trading signals without being overwhelmed by unnecessary updates.

## Function listenOrderSchedule

This function lets you keep an eye on the lifecycle of scheduled orders, like when an order is planned and when it's canceled. 

You'll receive notifications when a scheduled order is created, meaning the system is waiting for the market to reach a specific price, and also when those orders are canceled – whether it's due to a timeout, price rejection, or user action.

Keep in mind, it doesn't notify you when a scheduled order actually turns into an active order. That’s reported through the usual signal listeners.

Think of it as the same stream that the trading framework itself uses to manage orders.  It’s a central hub for order status updates.

It's intended for monitoring purposes – things like logging, notifications, or audits – rather than direct integration with exchanges.

Events happen in the order they're received, even if your callback function takes some time to process.


## Function listenOrderReject

This function lets you listen for order rejections that happen when the exchange definitively refuses an order – meaning it won’t be retried. It’s a notification about rejected orders, not a way to control the process.

Think of it as a final confirmation that an order was rejected by the exchange, after all other attempts to fulfill it have failed.

If you provide a function (named `fn`) to this `listenOrderReject` function, it will be called whenever a rejection occurs. Importantly, any errors thrown by your function are handled internally and won't impact the overall system. This makes it safe to use for things like sending notifications to external services, such as sending messages to a telegram bot or audit logs. If your callback function returns a promise, the processing will happen one after another to avoid overwhelming the system.


## Function listenOrderFill

The `listenOrderFill` function allows you to receive notifications when orders are definitively filled by the broker. It’s like a final confirmation that your order has actually been executed or placed on the exchange.

You'll only get these notifications after the order has been fully confirmed by the broker, ensuring you're working with accurate information. This distinguishes it from earlier order updates that might be temporary or rejected.

The notifications tell you what happened: whether a new position was opened, a resting order was placed, or an existing position was closed.

Keep in mind that this is a notification only—any errors that occur within your listener won't interrupt the backtest’s flow. It’s designed to be safe for external services like Telegram bots or audit logs.

To use it, provide a function to handle these confirmed fill events; if your function returns a promise, the processing will be handled sequentially.

## Function listenOrderContinue

This function lets you monitor what happens to your orders *after* a check is performed. It’s like a second look to see if an order is still valid or if a temporary problem needs to be watched.

Think of it as a follow-up to an initial check – if everything’s fine, the order stays active. If there's a minor issue, it's noted, and the system keeps an eye on it.

This monitoring happens continuously while the order is still relevant.

It's important to know that this only operates during live trading; backtesting doesn’t involve these checks. Any errors within your monitoring code won’t stop the overall process—they’ll be logged and handled internally.

You provide a function that will be called each time this event occurs. If that function returns a promise, it will handle the event processing in a queue.

## Function listenMaxDrawdownUnique

This function lets you track maximum drawdown events, but with a smart twist. It focuses on unique signal IDs, ensuring you only receive information about the initial drawdown for each signal.

Imagine you're monitoring multiple trading strategies; this function avoids overwhelming you with repetitive drawdown data, reporting only the first significant drop for each strategy.

You provide two key ingredients: a filter to specify which drawdown events you're interested in, and a callback function that gets triggered whenever a unique drawdown event meets your criteria. The function returns a cleanup function that you can use to unsubscribe when you no longer need the subscription.


## Function listenMaxDrawdownOnce

This function lets you watch for specific maximum drawdown events and react to them just once. You provide a filter to define which drawdown events you're interested in, and a function to run when that event happens. Once the event occurs and your function runs, the subscription automatically stops, so you won't get notified again. It’s perfect for scenarios where you need to respond to a particular drawdown condition and then move on.

You specify a condition (filter) to identify the relevant drawdown events.
Then, you define the action (callback function) to take when the condition is met.
The function then listens, triggers the action only once when the filter matches, and then automatically stops listening.

## Function listenMaxDrawdownFilter

This function lets you continuously monitor for specific maximum drawdown events within your trading backtests. You provide a filter that defines which events you're interested in, and a callback function that will be executed each time an event passes that filter. Unlike other monitoring options, this one ensures you receive updates for every drawdown event that meets your criteria, even if it’s a deeper drawdown related to the same signal. Think of it as setting up a persistent alert for significant drawdown changes based on your custom rules.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It's like setting up an alert that goes off whenever your strategy experiences a deeper loss than it has before. 

The alerts are delivered one at a time, even if the callback function you provide takes some time to process. This is designed to make sure things don't get out of order or overloaded.

You can use this to monitor your strategy's performance and adjust your risk controls as needed. To stop listening for these events, you simply call the function that's returned by `listenMaxDrawdown`.

It takes a function as input, and that function will be called whenever a new maximum drawdown is detected.

## Function listenIdlePingOnce

This function lets you set up a listener that reacts to idle ping events, but only the *first* event that matches your criteria. 

You provide a filter function that determines which idle ping events should trigger the action. Then, you define a callback function that executes when an event passes the filter. 

Importantly, the listener stops working after the first successful match, so it's great for one-off tasks. The function returns an unsubscribe function which can be used to stop the listener immediately.

## Function listenIdlePingFilter

This function lets you listen for specific idle ping events – think of them as signals indicating inactivity – and react to them. It's like setting up a focused alarm that only goes off when certain conditions are met. You provide a filter that decides which events trigger the alarm, and a callback function that executes when a matching event arrives. The system keeps the connection active, so you'll continuously receive these events as long as they fit your criteria. It's a refined way to monitor inactivity compared to a broader monitoring approach.

## Function listenIdlePing

This function lets you be notified when your backtest kit is completely idle, meaning it's not actively processing any trades or signals. It's like getting a signal that everything is quiet and ready for the next instruction.

You provide a function that will be called whenever this idle state is detected. 

The function you provide will receive an `IdlePingContract` object, which contains information about the idle ping event.

To stop listening for these events, the function returns another function that you can call to unsubscribe.

## Function listenHighestProfitUnique

This function lets you track and react to instances of the highest profit achieved for each trading signal. It's designed to prevent repeated notifications for the same signal – once a signal hits its peak profit according to your criteria, you'll only receive the notification once. You provide a filter to specify which events are interesting, and a callback function to handle those events. Think of it as a way to get notified only about the very first best profit achieved for each individual signal.

## Function listenHighestProfitOnce

This function lets you set up a listener that reacts to specific events related to highest profit achieved in your trading backtest. It’s designed to only trigger once when a matching event occurs. 

Think of it as setting a watch – you specify a condition (the filter) and when that condition is met, your specified function (the callback) runs just one time. After that, the listener is automatically removed. 

You provide a filter function that decides which events should trigger the callback, and then you define the callback function itself, which executes when the filter condition is satisfied. It's a handy way to react to particular profit milestones without ongoing monitoring.

## Function listenHighestProfitFilter

The `listenHighestProfitFilter` function lets you focus on only the most profitable trading signals. It's like setting up a special alert that only goes off when a particular condition is met—you define that condition with `filterFn`. Every time a profitable signal appears that matches your criteria, the provided callback function `fn` will be triggered. Importantly, this subscription sticks around, so you'll continue to receive alerts for each new peak of a matching signal.

It's a more refined version of `listenHighestProfit`, allowing for targeted monitoring of the most promising opportunities.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. It's like setting up an alert that triggers whenever your strategy makes more money than it ever has before. 

The alerts are delivered in the order they happen, and even if your callback function takes some time to process, the system makes sure events don’t get missed or jumbled. 

You can use this to monitor your strategy’s performance, adjust parameters, or react to significant profit milestones in a controlled and reliable way. To use it, you provide a function that will be called whenever a new highest profit is achieved.


## Function listenExit

This function lets you monitor for serious, unrecoverable errors that can halt the backtest-kit processes like those running in the background. Think of it as an emergency alert system for your backtesting.

When a critical error occurs that stops a process, this function will notify you through a callback. Importantly, these errors are handled one at a time, ensuring they're processed in the order they happen, even if your callback involves asynchronous operations. The queued wrapper makes sure your error handling doesn't cause even more issues.

You provide a function (`fn`) that will be called when a fatal error happens, allowing you to react and potentially log or report the issue. The function you provide will also return a function that can be called to unsubscribe from these alerts.

## Function listenError

This function helps you catch and manage unexpected errors that happen while your trading strategy is running, especially those that can be recovered from. Think of it as a safety net – if something goes wrong with an API call or a calculation, this lets you handle it without stopping the whole process. The errors are handled one at a time, in the order they occur, and the provided function is used to deal with them. It’s designed to make sure your strategy keeps running smoothly even when things don't go perfectly.


## Function listenDoneWalkerOnce

This function lets you react to when a background process finishes, but only once. You provide a filter – a way to specify which finished processes you're interested in – and then a function to run when a matching process concludes. The function automatically stops listening after it has executed your callback once, so you don't need to worry about manually unsubscribing. Think of it as a quick, single notification for a specific type of background task completion.


## Function listenDoneWalkerFilter

This function lets you listen for when a trading walker finishes, but with a specific filter. You provide a function (`filterFn`) that decides which completion events you're interested in. Only those events that pass this filter will trigger the callback function (`fn`) you provide. Importantly, the listener stays active, continuously receiving and processing matching completion events. It's a way to react to specific walker completions without being overwhelmed by all of them.

## Function listenDoneWalker

This function lets you listen for when background tasks within the backtest kit are finished. It's useful for coordinating actions that need to happen after a specific background process completes.

Essentially, you provide a function (`fn`) that will be called when a background process finishes.

The important thing is that the events are processed one at a time, so your callback function will always be executed in the order they're received, even if your callback itself involves asynchronous operations. This prevents things from getting out of sync.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. Think of it as setting up a listener that gets notified only when a specific type of background job is done.

It’s designed to be simple: you provide a filter to identify which completion events you're interested in, and then a callback function that will run just once when a matching event occurs.  The listener automatically cleans itself up after it's fired, so you don’t have to worry about manually unsubscribing. This is particularly useful for things like ensuring certain data is processed before continuing your backtest.


## Function listenDoneLiveFilter

This function lets you continuously monitor for completed trading events, but only reacts to those that meet specific criteria. You provide a filter function that decides which events you're interested in. 

The callback function you provide will then be triggered every time a completed event passes that filter. 

Importantly, this subscription is persistent - it continues to listen for matching events until you explicitly unsubscribe. Think of it as setting up a focused alert system for specific trading outcomes.

## Function listenDoneLive

This function lets you keep track of when background tasks run by Live finish. It provides a way to react to the completion of these tasks as they happen. Importantly, it ensures that your responses to these completions happen one after another, even if the callback you provide involves asynchronous operations. This prevents any unexpected conflicts that could arise from running callbacks simultaneously. You give it a function, and it will call that function whenever a background task completes, giving you the information about that completed task. When you no longer need to listen, you can use the function returned by `listenDoneLive` to unsubscribe.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter – a test to see if the finished backtest matches what you’re looking for – and a function to run when a matching backtest concludes. The function then automatically stops listening after it’s executed once, so you don't need to worry about cleaning up your subscription. This is perfect for single, targeted reactions to completed backtests. 

It’s useful when you need to do something specific only after a particular backtest concludes, without constantly monitoring for future completions.


## Function listenDoneBacktestFilter

This function allows you to react to when a backtest finishes, but with a twist – you can filter which completions trigger your reaction. It’s like setting up a notification system for backtest results, but only getting notified about the ones that meet specific criteria. You provide a function that decides whether an event should be processed, and a function that handles the events that pass the filter. Importantly, this subscription is persistent, so you’ll keep receiving matching events until you explicitly unsubscribe.

## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Think of it as subscribing to an event that triggers when a backtest completes.

It's particularly useful if you need to perform actions after a backtest, like updating a display or saving results.

The event processing is designed to be orderly – even if your notification handler does something complex and takes time, the events will be handled one after another. This helps avoid unexpected behavior from multiple events happening at once. To achieve this, it uses a queuing system to manage the execution of your callback.


## Function listenCheck

The `listenCheck` function lets you monitor the status of your orders with the backtest kit. It's like having a constant check-up to ensure your orders are still valid on the exchange.

Essentially, it listens for signals and tells you whether the associated order is still active or a scheduled resting order. This happens continuously while a signal is monitored, before the final evaluation.

If something goes wrong during this check, you can handle errors in a couple of ways:

*   **Transient Errors:**  Minor issues, like temporary network problems, are tolerated. The system will keep trying, up to a certain number of attempts, to prevent a small hiccup from prematurely closing your position.
*   **Deleted Errors:**  If the order is confirmed to be missing (the exchange says it doesn't exist anymore), the process stops.
*   **Rejected Errors:** Protocol errors that occur here are treated as temporary problems.

You provide a callback function to `listenCheck`, which will be called whenever a check event occurs. The callback receives information about the event, like the signal ID and the type of check (active or scheduled). If your callback returns a promise, the processing waits until the promise resolves.

## Function listenBreakevenAvailableUnique

This function lets you monitor for situations where a breakeven point is reached in your trading strategy. 

It's designed to be responsive, triggering a callback function only when a *new* signal is generated and meets a specific condition you define. 

You provide a filter function to specify which events you're interested in, and then a callback function that will be executed whenever a matching breakeven event occurs. The function returns a cleanup function that you can use to unsubscribe from the events when you no longer need to listen.


## Function listenBreakevenAvailableOnce

This function allows you to react to specific breakeven protection events, but only once. It sets up a listener that checks if an event meets your criteria (defined by `filterFn`). Once a matching event is found, the provided callback function (`fn`) is executed, and the listener automatically stops. This is handy if you need to perform an action only when a particular breakeven condition is met, and then you don’t need the listener anymore.

You provide a function that determines which events you're interested in, and another function that handles the event when it arrives. The listener will then execute your handling function just once and automatically clean itself up.

## Function listenBreakevenAvailableFilter

This function lets you focus on only the breakeven events that truly matter to your strategy. It's like setting up a filter – you provide a condition (`filterFn`) and only events that meet that condition will trigger the action you define (`fn`).  The good news is that once you set it up, it keeps listening for those specific events continuously. It’s a handy way to react to specific breakeven situations without getting overwhelmed by all the available data. You'll receive a function that you can call to unsubscribe.

## Function listenBreakevenAvailable

This function lets you monitor when a trade's stop-loss automatically adjusts to the original entry price – essentially, it's protecting your profits. 

It’s triggered when a trade has gained enough profit to cover the costs of the transaction.

You provide a function that will be called whenever this breakeven protection occurs, and that function can be asynchronous. The framework ensures these calls happen one after another to avoid any conflicts.


## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts, but only once. You provide a filter—essentially a rule—to define which events you're interested in, and a function that will run when that event occurs. Once the function executes, it automatically stops listening, so you don't have to worry about cleaning up.

It's useful for things like setting initial conditions or performing one-time calculations before the backtest process begins.

The filter function decides if an event is relevant, and the callback function handles the event once the filter matches.


## Function listenBeforeStartFilter

This function lets you set up a listener that gets triggered just before a backtest starts, but only for specific conditions you define. You provide a filter – a test that determines which events should actually trigger the listener.  The callback function you provide will then be executed for each event that passes your filter. Importantly, this listener stays active, continually processing any matching events that occur. It's a filtered version of a standard listener, allowing you to focus on just the most relevant "before start" moments.

## Function listenBeforeStart

This function lets you tap into events that happen right before a trading strategy begins running for a specific asset. Think of it as a notification system: you provide a function, and it gets called just before a new strategy starts its work. Importantly, these notifications are handled one at a time to prevent conflicts or unexpected behavior, even if your function takes some time to process the information. You can unsubscribe from these notifications when you no longer need them.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It provides updates as the backtest progresses, allowing you to monitor its status. The updates are delivered one at a time, even if your update handler takes some time to process, ensuring things stay orderly. Essentially, it's a way to get real-time feedback on the backtest's execution. You give it a function that will be called with these progress updates, and the function returns another function to unsubscribe from these updates when you're done.


## Function listenAfterEndOnce

The `listenAfterEndOnce` function lets you react to specific events that happen after a trading period concludes. You tell it what kind of event you're interested in using a filter – essentially, a rule to decide which events should trigger your response. Once an event matching your rule arrives, it runs the code you provide in the callback function. Importantly, after that single execution, the subscription is automatically cancelled, so you won't receive any further notifications.

This is useful for actions you only want to perform once per trading period, such as updating a specific indicator or triggering a report.

The function returns a function that you can call to unsubscribe manually if needed.


## Function listenAfterEndFilter

The `listenAfterEndFilter` function lets you subscribe to after-end events, but with a twist – it filters those events first. You provide a function (`filterFn`) that decides whether an event should be passed on to your callback function (`fn`). Think of it as a gatekeeper: only events that meet your criteria will trigger the callback. This function ensures that you only handle the specific types of after-end events you're interested in, keeping your code focused and efficient. The subscription remains active, so it will continue to deliver events that match your filter.


## Function listenAfterEnd

This function lets you hook into what happens *after* a trading strategy finishes running for a particular asset. Think of it as a notification system that tells you when the engine is completely done with a strategy’s work. 

Importantly, the notifications are handled one at a time, even if your callback function takes some time to complete – this prevents conflicts and keeps things orderly. You provide a function that will be executed whenever this "after end" event occurs, and this function will return a way to unsubscribe from these events later.

## Function listenActivePingUnique

This function lets you monitor active ping events, but in a special way. It's designed to ensure you only react once per unique signal.

Think of it as a way to react to a condition being first met for a specific position – then, you can ignore further updates for that same condition.

You provide a filter to determine which events you’re interested in, and a callback function that gets executed once for each newly identified signal. This is particularly useful when you want to respond to an event just once for each position fulfilling a certain criterion.

## Function listenActivePingOnce

This function allows you to temporarily subscribe to active ping events, but only until you find one that meets your criteria. You provide a condition – a function that checks if an event is the one you’re looking for – and a callback function that runs when that event is detected. Once the matching event occurs, the subscription is automatically cancelled, preventing further processing of similar events. It's a handy way to react to a specific, one-time occurrence of an active ping. 

The `filterFn` specifies the condition that must be met. The `fn` function is executed when an event satisfies this condition.

## Function listenActivePingFilter

This function lets you continuously listen for specific active ping events. You provide a filter—a function that decides whether an event is interesting—and a callback function to handle those interesting events. The listener stays active, so it continues to deliver matching events as they happen. It’s a handy way to react to a subset of all active ping events without missing any that fit your criteria.

## Function listenActivePing

This function lets you keep an eye on active signals within the backtest kit. It listens for events that are sent out every minute, giving you a regular update on the status of your signals.

Think of it as a way to monitor the lifecycle of your signals and react to changes in real-time.

The events are handled one after another, even if your callback function takes some time to process, ensuring a predictable order.  To prevent any hiccups, it uses a queuing system to make sure your callback runs smoothly without interfering with itself.

You provide a function that will be called whenever a new active ping event occurs, and this function receives information about that event. The function returns another function that can unsubscribe from these events.

## Function listWalkerSchema

This function gives you a peek into all the trading strategies or analysis tools (walkers) that are currently set up within the backtest-kit framework. Think of it as a way to see a complete list of what's available to use. It’s really handy if you’re trying to figure out what's going on behind the scenes or if you need to create a user interface that displays all the different ways you can analyze your trading data. The result is a list of descriptions for each walker.

## Function listSweepSchema

This function provides a way to see all the different sweep strategies that are currently set up within your backtest. It essentially gives you a list of all the configurations you’ve registered for sweeping through different parameters. Think of it as a way to inspect what options are available for automated testing and optimization. This can be incredibly helpful when you’re troubleshooting your backtest setup or if you want to create tools that dynamically display these available sweep configurations.

## Function listStrategySchema

This function gives you a look at all the trading strategies you've set up within the backtest-kit framework. It essentially provides a list of all the strategies you've defined and made available for backtesting. Think of it as a way to see what strategies are ready to be used, which is helpful for checking things out, generating documentation, or creating user interfaces that let you choose from different strategies. It’s a convenient way to manage and understand your available strategies.


## Function listSizingSchema

This function lets you see all the sizing configurations that are currently active within your backtest environment. Think of it as a way to peek under the hood and understand how your trades are being sized. It returns a list of these sizing setups, making it valuable for troubleshooting, documenting your setup, or building custom user interfaces that dynamically display sizing information. Essentially, you're getting a view of all the rules that determine how much of an asset you trade at any given time.

## Function listRiskSchema

This function lets you see all the risk configurations that your backtest kit is using. Think of it as a way to peek under the hood and get a list of all the different risk profiles you’ve set up. It’s handy if you need to double-check your settings, create a guide for your system, or build a user interface that displays these risk profiles. The function returns a list of these configurations, allowing you to inspect and manage them.


## Function listMemory

This function helps you see all the saved memory entries related to your current signal. 

Think of it as a way to peek into the history of data associated with a specific signal. It figures out which signal you're working with and whether you're in a testing or live environment all on its own.

You provide a bucket name, and it returns a list of memory entries, each containing a unique ID and the actual data stored within.

## Function listMCPSchema

This function helps you discover all the different data models (called MCP schemas) that your backtesting system is using. It essentially gives you a comprehensive list of how data is structured and shared within your trading strategies and environment. Think of it as a way to see all the "blueprints" for your data. This can be invaluable for understanding how everything fits together, troubleshooting issues, or automatically creating interfaces to interact with your data.

## Function listFrameSchema

This function helps you discover all the different data structures (called "frames") that your backtesting system understands. It's like getting a catalog of all the kinds of information your system can process. You can use this to check what's available, build tools to explore the data, or just make sure everything is set up correctly. It gives you a list of these frames, allowing you to see their details.


## Function listExchangeSchema

This function gives you a complete list of all the exchanges your backtest-kit is currently using. Think of it as a way to see exactly what markets and data sources are available for your simulations. It's really handy if you’re trying to figure out what’s going on behind the scenes, need to generate a documentation guide, or want to build a user interface that automatically adapts to the exchanges you’ve configured. The function returns a promise that resolves to an array containing details about each registered exchange.

## Function hasTradeContext

This function simply tells you whether the trading environment is ready for actions. It confirms that both the execution and method contexts are active. You’ll need this to be true before you can use functions that interact with the exchange, like getting candle data or formatting prices. Think of it as a quick check to make sure everything is set up correctly before proceeding.

## Function hasNoScheduledSignal

This function helps you quickly check if a trading signal is currently scheduled for a specific asset, like "BTCUSDT."

It returns `true` if there isn’t a scheduled signal – essentially, it confirms that no signal is waiting to be triggered.

Think of it as the opposite of `hasScheduledSignal`; it’s useful for making sure your trading logic doesn't run prematurely when a signal hasn't been set up yet.

The function understands whether it's running in a backtesting environment or live trading, so you don’t have to worry about configuring that.

You provide the symbol (the trading pair) as input, for example "BTCUSDT," and it will tell you if a signal is pending for that specific asset.

## Function hasNoPendingSignal

This function checks if there’s currently a signal waiting to be triggered for a specific trading pair. It’s the opposite of `hasPendingSignal`, so you can use it to make sure you're not generating new signals when one is already in progress. The function figures out whether you’re in backtesting mode or live trading mode automatically, so you don't need to worry about that.

You just give it the symbol of the trading pair (like "BTCUSDT") and it will tell you if there's a pending signal for that pair.


## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtesting setup. Think of it as looking up the definition of a particular trading method. You provide the name of the walker you're interested in, and the function returns a detailed description of how that walker operates – what data it needs, what calculations it performs, and how it generates trading signals. This allows you to understand and potentially customize your trading strategies.


## Function getTotalPercentHeld

This function helps you understand how much of a particular asset you still hold in your trading position. It tells you the percentage – so 100% means you haven't closed any of your position, while 0% means it's completely closed.

It's smart about how it calculates this, even if you've added to your position over time with dollar-cost averaging (DCA) and closed it partially.

You don't need to worry about whether you're in a backtest or a live trading environment; the function figures it out automatically.

To use it, simply provide the trading pair symbol, such as "BTCUSDT".

## Function getTimestamp

This function, `getTimestamp`, provides a simple way to get the current time within your trading simulations or live trading environment. It returns a number representing the timestamp.

When you’re running a backtest, the timestamp reflects the moment in time that the simulation is currently evaluating.  If you're running in a live trading scenario, the timestamp will be the actual, real-time clock value. Essentially, it provides a consistent way to track time regardless of whether you're testing past strategies or actively trading.


## Function getSymbol

This function retrieves the symbol you're currently trading, like 'BTCUSDT' or 'ETHUSD'. Think of it as checking which asset your backtest or live trading is focused on. It returns a promise that resolves to the symbol as a string.

## Function getSweepSchema

This function lets you find the configuration details for a specific sweep you've set up within the backtest-kit framework. Think of it as looking up the blueprint for how a particular sweep will run. You provide the name of the sweep, and the function returns a structured object that describes all the settings and parameters associated with it. This is useful for understanding or dynamically adjusting how your backtesting sweeps are performed.

## Function getStrategyStatus

This function lets you peek at what's happening behind the scenes of your trading strategy. It gives you a snapshot of things like pending orders, any actions that haven't been processed yet, and the next signal ID to be used. You can use it to understand the current state of your strategy’s execution. The function smartly figures out whether it's running a backtest or live trading. You simply provide the trading pair symbol, like "BTC/USDT," to get the relevant status information.

## Function getStrategySchema

The `getStrategySchema` function helps you find information about a specific trading strategy you're using. It takes the strategy's unique name as input. 
This function returns a detailed description of the strategy, outlining its inputs, outputs, and how it works internally. Essentially, it provides a blueprint of how that strategy is structured and what it requires to run within the backtest-kit framework. You can use this to understand and potentially modify strategies.

## Function getStrategyPaused

This function lets you check if a particular trading strategy is currently paused. When a strategy is paused, it won’t place any new orders – the `getSignal` function isn't called, and any new trade requests are held until the strategy is resumed. However, any existing orders that are already in progress, like pending or scheduled signals, will continue to be managed and closed as normal. The system automatically figures out whether it's running in a backtest or a live trading environment. You provide the trading pair symbol, like "BTCUSDT," to specify which strategy's paused status you want to know.

## Function getSizingSchema

The `getSizingSchema` function helps you find the specific rules used to determine how much of an asset to trade. Think of it as looking up a pre-defined plan for position sizing. You provide a name – a unique identifier – for the sizing method you're interested in, and the function returns the detailed configuration associated with that sizing strategy. This lets you access and understand the logic behind how your trades are sized.

## Function getSessionData

This function lets you retrieve information that’s specifically saved for a particular trading setup – think of it as a temporary storage space for the current strategy, exchange, and timeframe. This stored data sticks around even if your backtest or live trading session restarts, which is great for things like holding onto the results of complex calculations or intermediate steps needed across multiple candles. It simplifies sharing data between different points in your trading logic without needing to recompute everything each time. You just need to tell it which trading symbol you're looking for, and it will fetch the related data or return null if nothing is stored.


## Function getScheduledSignal

This function lets you retrieve the signal that’s currently scheduled for a specific trading pair. Think of it as checking what signal your strategy is programmed to execute right now. If there isn’t a scheduled signal active, it won't return anything – it'll come back as null. It handles whether you're in a backtesting simulation or live trading automatically, so you don’t have to worry about that.

You just need to tell it which symbol (like BTC/USDT) you’re interested in.


## Function getRuntimeInfo

This function provides essential information about your current trading simulation or live run. It tells you things like which asset you’re trading, the exchange being used, the timeframe of your data, and the strategy that’s currently active. Think of it as a quick status report on what's happening in your trading environment, useful for debugging or ensuring everything is configured as expected. It gives you a promise that resolves to a comprehensive set of runtime details.

## Function getRiskSchema

This function helps you access predefined risk management blueprints within the backtest-kit framework. Think of it as looking up a specific template for how to assess and handle risk – you provide a unique name identifying that template, and it returns the details of that risk schema. It's useful when you need to work with or customize a particular risk management approach already built into the system. You simply give it the risk's identifier, and it gives you the schema describing how that risk is handled.


## Function getRemainingCostBasis

This function helps you figure out how much of your initial investment remains for a particular trading pair. It’s especially useful if you've sold off some of your holdings – it takes into account any previous sales to calculate the remaining cost basis. 

The function automatically adjusts its behavior depending on whether you're running a backtest or a live trading environment.

To use it, simply provide the symbol of the trading pair you're interested in. For example, "BTC-USD". The result will be the remaining cost basis expressed as a dollar amount.

## Function getRawCandles

The `getRawCandles` function helps you retrieve historical candlestick data for a specific trading pair and timeframe. You can easily fetch a limited number of candles or define a custom date range. The function intelligently handles date calculations and ensures the retrieved data avoids look-ahead bias, crucial for accurate backtesting. 

You have a lot of flexibility in how you request the data: you can specify a limit, a start date and end date, just the end date with a limit, or just a limit to fetch from the most recent data. The function will adjust the start date automatically when needed, ensuring all date parameters are valid.


## Function getPositionWaitingMinutes

This function helps you check how long a trading signal has been waiting to be put into action. It tells you the number of minutes it's been on standby, waiting for its go-ahead. 

If there isn't a signal currently waiting, the function will return null to let you know.

To use it, you simply need to provide the trading pair's symbol – like "BTCUSDT" – and the function will do the rest.

## Function getPositionPnlPercent

This function helps you understand how profitable your open positions are right now. It calculates the unrealized percentage profit or loss based on the difference between your entry price and the current market price. 

It's designed to be accurate, considering factors like partially closed positions, dollar-cost averaging, any slippage you might have experienced, and trading fees.

If you don't have any open positions that are waiting for a signal, the function will let you know. 

It figures out whether you're running a backtest or a live trade automatically and grabs the current market price for you as well, so you don't have to worry about those details. 

You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionPnlCost

This function lets you check the unrealized profit or loss in dollars for a trade you're currently holding. 

It figures this out by looking at the percentage gain or loss of the trade, and comparing that to the total amount you've invested. 

The calculation takes into account things like partial trades, averaging down (DCA), any price differences (slippage), and trading fees.

If you don't have any active trades, the function will let you know. 

It works seamlessly whether you're running a backtest or live trading, and automatically gets the current market price for the trade. You just need to give it the symbol of the trading pair (like BTC/USDT).

## Function getPositionPartials

getPositionPartials lets you see a history of how your position has been partially closed, whether it was for profit or loss. It provides a list of events detailing each partial close, including the percentage closed, the price at which it happened, and the accounting cost basis at the time. 

You'll need a pending signal for this function to work. If no partial closes have been executed, it simply returns an empty list. The function shows exactly what happened when you used commitPartialProfit or commitPartialLoss. It needs the symbol of the trading pair you're working with.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing parts of your positions at the same price level repeatedly. It checks if the current market price falls within a small range around any previously executed partial close prices for a specific trading pair. 

Think of it like a safety net to prevent accidental double-ups.

It calculates a tolerance zone based on the partial close price and percentages you define. If the current price falls within that zone, the function returns true, letting you know a partial close might be redundant. If no partial closes exist yet, or the current price is outside any defined zones, it returns false. You provide the trading symbol, the current price to check, and optionally a custom tolerance zone configuration.


## Function getPositionMaxDrawdownTimestamp

getPositionMaxDrawdownTimestamp lets you find out when a specific trading position experienced its biggest loss during its existence. It's like looking back to see the exact moment a trade hit its lowest point. You'll need to provide the symbol of the trading pair (like "BTC-USDT") to retrieve this information. If no trading signals are active for that position, it won't be able to provide the data and will raise an error.


## Function getPositionMaxDrawdownPrice

This function helps you understand the most significant loss a specific trade has experienced. It reveals the lowest price reached while the position was open, essentially showing how far "in the red" it went. To get this information, you'll need to specify the trading symbol, like "BTC/USDT". Keep in mind, it requires that a signal exists for that trade, or it will let you know something's missing.


## Function getPositionMaxDrawdownPnlPercentage

This function lets you check the lowest point of profitability for a specific trade. It calculates and returns the percentage of profit or loss that occurred at the time the position experienced its greatest drawdown. Essentially, it tells you how far in the red a trade got at its worst point. 

You’ll need to provide the trading pair symbol (like 'BTC-USDT') to get this information. 

Keep in mind, this function won't work if there aren't any active trading signals associated with the symbol.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a particular trade. It calculates the total cost in terms of the quote currency (like USD or EUR) that was incurred when the position hit its lowest point. Essentially, it tells you how much you lost at the worst time for that trade.

To use it, you just need to provide the trading pair symbol, such as "BTC-USDT".

Keep in mind, the function will let you know if there isn't a signal available for the position you are checking.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back in time your trading position's biggest loss occurred. It tells you, in minutes, how long ago you reached the lowest point in your position's performance. The value will be zero if the lowest point happened right when you asked for the information. If there's no active trading signal for the symbol you're checking, the function won’t work and will let you know. You'll need to specify the symbol, like 'BTCUSDT', to get the drawdown time.

## Function getPositionLevels

getPositionLevels helps you see the prices at which you've bought into a trade using dollar-cost averaging (DCA). It gives you a list of prices, starting with the initial price when the trade began.

If you've added more buy orders later, you’ll see those prices in the list as well.

If there's no trade in progress, it will return just the initial price. 

You need to provide the symbol (like "BTCUSDT") to get this information. If there are no pending signals, the function will let you know.


## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a position using dollar-cost averaging (DCA) for a specific trading pair. It returns a number representing the count; a value of 1 means it’s just the initial investment, while higher numbers show subsequent DCA buys. If you try to check the count when there's no ongoing order, it will let you know. The function knows whether it's running in a backtest or live trading environment automatically. You need to provide the trading symbol like "BTCUSDT" to query.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a specific trading pair, like BTC/USD, for the current trade. It adds up all the costs associated with buying into that position.

Think of it as a quick way to see your total investment cost in dollars, based on the prices and quantities used when you initially placed those buy orders.

It uses the default cost setting if you didn’t explicitly specify it when you made those buy orders.

If there's no active trade happening, the function will let you know. 

It automatically adjusts its behavior depending on whether you're running a backtest or a live trading session.

You just need to provide the symbol of the trading pair you’re interested in, like 'BTC' or 'ETH'.

## Function getPositionHighestProfitTimestamp

This function helps you find the exact moment a trading position achieved its peak profit. It looks back at the position's history and tells you the timestamp – essentially, the date and time – when it was most profitable. You provide the trading pair's symbol, like "BTCUSDT," and it returns that timestamp. If there's an issue, like a missing signal, it will let you know with an error.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has achieved while making a profit. 

It starts by remembering the price when you first opened the position. 

Then, as the market moves, it constantly updates this record: for long positions, it looks for the highest price above your entry price, and for short positions, it tracks the lowest price below your entry price. 

You'll always get a value back – at the very least, it will be the initial entry price – and it will tell you how well your position has performed in terms of profit potential. It requires an active trading signal to work.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been below its best performance. It calculates the time, in minutes, since the position reached its highest profit. 

Essentially, it tells you how far the position has fallen from its peak.

The function requires a symbol, like "BTCUSDT", to identify the trading pair you're interested in. It will provide a number representing the minutes since that highest profit was achieved. If no trading signal exists for that symbol, the function will let you know.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your position is from its best performance. It calculates the difference between the highest profit percentage you've seen so far and the current profit percentage, ensuring the result is never negative. Think of it as measuring how much room you potentially have to improve on your current trading outcome for a specific asset. To use it, you simply need to provide the trading pair symbol, like "BTCUSDT." It requires a pending signal to be present and functioning.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your position is from its potential best performance. It calculates the difference between the highest profit you could have made (peak profit) and the profit you've currently made, but only considers positive differences (meaning it ignores losses). Think of it as a measure of how much room there is for your trade to improve. It requires there to be a pending signal for the given trading pair to work. You provide the symbol of the trading pair (like 'BTC-USDT') to the function to get the result.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade could have reached a breakeven point at its most profitable moment. 

Essentially, it checks if achieving breakeven was mathematically possible based on the highest price the trade reached.

You provide the trading pair symbol, like 'BTCUSDT', and the function will tell you yes or no.

Keep in mind, it requires there to already be an active trade signal for that symbol; otherwise, it will flag an error.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading pair, like BTC-USD, performed during its most profitable moment. It looks back at the position's history and tells you the percentage gain achieved when the price hit its peak. You provide the trading pair symbol as input. Keep in mind, it won't work if there aren't any pending signals to analyze.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It tells you how much profit or loss was incurred when the position achieved its peak profitability. The result is expressed in the currency associated with the trade (like USD or ETH). 

You’ll need to provide the trading pair symbol, such as "BTC-USD", to identify the position you’re interested in. 

Keep in mind, it requires there to be a pending trading signal already. If not, the function will let you know it can't proceed.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk exposure of a specific trading pair. It calculates how far the current profit of the position is from its lowest point during a drawdown, expressed as a percentage. Essentially, it tells you the maximum loss you would have experienced from the peak profit to the trough of a drawdown. If no trades have been made for the symbol, the function will let you know by throwing an error. You only need to provide the symbol of the trading pair you want to analyze, like "BTC-USDT."

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position has lost relative to its lowest point. It calculates the difference between your current profit and loss and the lowest profit and loss reached during the position's life. Essentially, it tells you how far your position has fallen from its peak.

You provide the symbol of the trading pair (like "BTC-USDT") to get this information. The result is a number representing the PnL cost of the maximum drawdown. 

If there are no active trading signals for the specified symbol, the function will raise an error.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It gives you an estimate in minutes, based on the original plan for the position when it was created. This estimate is taken from the signal that triggered the trade, specifically the `minuteEstimatedTime` value. If there isn't a currently active trading plan, the function won't work and will let you know. You'll need to provide the symbol of the trading pair you're interested in.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing multiple DCA orders at very similar price levels. 

It checks if the current market price aligns with any of your existing DCA entry points, considering a tolerance range around each entry level. 

Essentially, it helps prevent "overlap" where you might unintentionally execute an order too close to a previously placed one.

The function returns `true` if the current price falls within that defined tolerance zone around any of your existing DCA levels, signaling a potential overlap. Otherwise, it returns `false`.

You can customize the tolerance zone by providing a `ladder` configuration, which defines the percentage range above and below each DCA level that's considered overlapping. If no pending signal exists, the function returns false.

## Function getPositionEntries

getPositionEntries lets you see the details of how a position was built up, especially if you used a Dollar Cost Averaging (DCA) strategy. It gives you a list showing each individual buy order that contributed to the current open position. 

You'll find the price at which each buy was executed, along with the total dollar amount spent on that particular buy. 

If no trades were made, you’ll get an array with just one element. If there are no signals, the function will let you know. This is useful for understanding the history of your position and verifying the costs associated with each step of the build-up. You simply provide the symbol of the trading pair you are interested in.

## Function getPositionEffectivePrice

This function calculates the effective average price you've paid for a position, taking into account any buy or sell orders. It's essentially a weighted average that considers both the price and the quantity at each transaction.

If you've made partial closes on your position, it will accurately factor those in, combining the cost basis from each partial close with any subsequent DCA (dollar-cost averaging) entries.

If you haven't used DCA or partial closes, the effective price will match the initial price at which you entered the trade.

The function will tell you if it can’t find a pending signal to calculate the price for. It will figure out whether it's running in a backtesting or live trading scenario automatically.

You provide the trading symbol (like BTC-USDT) as input to determine the effective price.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your trading position reached its best profit point. Think of it as a measure of how far the price has fallen from that high. The value will start at zero when your position is created and will increase as the price moves lower than your peak profit. If there's no active trading signal, it won't be able to calculate this drawdown. You'll need to provide the symbol, like "BTCUSDT," to specify which position you're interested in.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes helps you figure out how much time you have left on a trading position. It calculates this by looking at when the position became pending and comparing it to an estimated expiration time. 

The result tells you the remaining minutes, but it will never show a negative number - if the time has already passed, it reports zero.

If there's no record of a pending position, this function will let you know with an error.

You just need to provide the trading symbol (like 'BTC-USDT') to see the countdown.

## Function getPositionActiveMinutes

This function, `getPositionActiveMinutes`, tells you how long, in minutes, a specific trading position has been open. 

It takes the trading symbol (like "BTCUSDT") as input and returns a number representing the active time. 

Keep in mind, it won't work if there isn't an active signal for that position – it will let you know with an error in that case. This helps you understand how long your positions have been running.


## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. 

It tells you the details of that pending order, if one exists. 

If there’s nothing waiting, it simply returns a null value. 

You don't need to worry about whether you're in a backtest or live trading environment – the function figures that out on its own. 

The only thing you need to provide is the symbol of the trading pair, like "BTCUSDT".

## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. It essentially asks the connected exchange for the current order book data. 

You can specify how many levels of the order book you want to retrieve; if you don't provide a depth, it uses a default setting. The function automatically handles the timing based on the current execution context, meaning the exchange decides whether to use the timing information for backtesting or live trading.


## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. It’s designed to pull data that comes *after* the current time within your backtesting environment, so you're looking ahead. You tell it which symbol you're interested in (like BTCUSDT), the candle interval (like 5 minutes), and how many candles you want to retrieve. The function then uses the underlying exchange connection to get those candles.

## Function getMode

This function tells you whether your trading strategy is running in backtesting mode or live trading mode. It returns a simple promise that resolves to either "backtest" or "live", letting you adjust your code’s behavior based on the context. Think of it as a way to check if you’re testing past data or actively trading with real money.

## Function getMinutesSinceLatestSignalCreated

This function tells you how long ago, in minutes, the most recent trading signal was generated for a specific trading pair. 

It doesn't care if that signal is still active or has already ended; it just looks at the creation date of the latest signal. This can be helpful for things like setting up delays after a stop-loss order.

It looks for the signal information first in your historical backtest data, and if it can't find it there, it checks your current, live trading data. If no signals exist for the specified pair, the function will let you know by throwing an error. It smartly figures out whether it’s running in a backtest or live environment without you needing to specify. The only input it requires is the symbol, like "BTCUSDT".

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk exposure of a trading strategy by calculating the maximum drawdown in percentage terms. It determines the difference between the highest profit achieved and the largest subsequent loss, ensuring the result is never negative. Essentially, it gives you a single number reflecting the potential downside risk you might face. To use it, you simply provide the trading symbol (like BTC-USDT) you're interested in, and it returns the drawdown percentage. It will notify you if there's a problem finding signals for that symbol.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the riskiness of a trading strategy by calculating the largest potential loss from its peak profit. It figures out the difference between the highest profit you could have made and the lowest point after that. 

Essentially, it shows you how far your profits could fall before hitting zero. 

You need to provide the symbol of the trading pair (like 'BTCUSDT') to get the drawdown distance. 

If the strategy hasn't generated any signals yet, it won't be able to calculate this and will let you know.


## Function getMCPSchema

This function lets you fetch the blueprint, or schema, for a specific Model Context Protocol (MCP) you've registered within your backtesting environment. Think of it as looking up the defined structure and rules for a particular data exchange format.  You provide the name of the MCP you want to know about, and it returns the detailed description of that MCP. This allows your code to understand and work with the data being passed around between different components of your backtesting system.


## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, like "BTCUSDT". 

It grabs whatever signal happened most recently – whether it's an ongoing trade or one that's already finished. 

You can use it to implement rules, such as preventing new trades for a certain period after a stop-loss event by checking the last signal's timestamp. 

The function looks for signals first in your backtesting data and then in live data, and it will alert you if no signals are found. It adapts automatically to whether you're running a backtest or a live trade. You just need to provide the asset's symbol as input.

## Function getFrameSchema

The `getFrameSchema` function helps you find the structure and definition of a specific frame within your backtesting environment. Think of it like looking up the blueprint for a particular type of data you're working with. You provide the name of the frame you're interested in, and the function returns an object describing its expected layout and contents. This allows your code to interact with the frames in a predictable and type-safe manner.


## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how a particular exchange works within the backtest environment. You provide the name of the exchange, and it returns a structured description defining things like its data format and API endpoints. This is useful for understanding and customizing how your strategies interact with different exchanges during backtesting.


## Function getDefaultConfig

This function provides you with a starting point for configuring your backtests. It returns a set of default values for various settings that control how the backtest kit operates. Think of it as a cheat sheet—it shows you all the possible settings and what their reasonable initial values are. You can use this to understand what options are available to tweak and customize your backtesting environment.

## Function getDefaultColumns

This function provides a starting point for defining the columns that will appear in your backtest reports. It returns a set of pre-configured column definitions, covering various aspects like closed trades, heatmaps, live data, partial fills, breakeven points, performance metrics, risk events, scheduled tasks, strategy events, synchronization data, maximum profit, maximum drawdown, walker signals, and overall strategy results. Think of it as a template – explore the structure and options to customize your reports with the precise data you need. It’s a great resource for understanding what kind of information can be displayed and how it’s organized by default.

## Function getDate

This function, `getDate`, retrieves the date relevant to your trading simulation or live execution. If you're running a backtest, it will return the date associated with the specific timeframe being analyzed. Otherwise, when running live, it provides the current, real-time date. It’s a simple way to access the date information within your trading logic, regardless of whether you're testing historical data or trading actively.

## Function getContext

This function allows you to access details about the current process within your backtest. Think of it as a way to peek behind the curtain and understand the environment your code is running in. It provides a context object that holds information related to the method execution, letting you potentially adapt your strategies based on the situation. It’s useful for debugging, logging, or adapting behavior based on the surrounding execution context.

## Function getConfig

This function, `getConfig`, lets you peek at the framework’s global settings. Think of it as getting a snapshot of all the internal knobs and dials that control how backtesting and trading runs.  It provides values for things like how often to check for new signals, retry limits for fetching data, maximum numbers of rows in reports, and many other operational parameters. Importantly, it returns a *copy* of these settings, so you can look at them without risk of unintentionally changing the actual running configuration. This is helpful for understanding the system's behavior or for debugging.

## Function getColumns

This function provides access to the configuration defining the columns used in your backtest kit reports. It returns information about the columns used for various data types, including closed trades, heatmaps, live ticks, partial fills, breakeven events, performance metrics, risk events, scheduled tasks, strategy actions, synchronization events, highest profit indicators, maximum drawdown, walker panel profit/loss, and overall strategy results. The returned object is a copy, ensuring that any changes you make won't affect the original configuration within backtest-kit. This is helpful for understanding how data is structured in your reports or for programmatically checking what data is being displayed.

## Function getClosePrice

To grab the most recent closing price for a trading pair, use the `getClosePrice` function. You'll need to specify the symbol of the trading pair, like "BTCUSDT", and the candle interval you're interested in, such as "1m" for one-minute candles or "4h" for four-hour candles. The function will then return a promise that resolves to the closing price of the last available candle for that symbol and interval. This is useful for quickly checking the latest price action without fetching the entire candle history.

## Function getCandles

This function lets you retrieve historical price data, also known as candles, for a specific trading pair like BTCUSDT. 

You tell it which pair you’re interested in, the time interval for the candles (like 1-minute, 1-hour, etc.), and how many candles you want to retrieve. 

The function then pulls this data from the exchange you’re connected to. Think of it as getting a historical snapshot of price movements to analyze past performance. The candles are provided backwards from when the code is currently running.

## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover the costs associated with it. It looks at the current price of a trading pair and compares it to a calculated threshold that accounts for slippage and trading fees. If the price has moved sufficiently in a positive direction to surpass this threshold, the function returns true, indicating breakeven has been achieved. It automatically adapts to whether the system is running a backtest or a live trading environment. You provide the trading pair symbol and the current price to get this breakeven status.

## Function getBacktestTimeframe

This function lets you find out the dates included in a backtest for a specific trading pair, like BTCUSDT. It essentially tells you the timeframe the backtest is covering. You provide the symbol of the trading pair you're interested in, and it returns an array of dates representing the start and end points of that backtest period. This is useful for understanding the scope of the historical data used in your backtest.

## Function getAveragePrice

This function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading pair. It looks back at the five most recent one-minute candles to figure this out. The calculation involves finding the typical price of each candle (average of high, low, and close) and then weighing it by the volume traded. If there's no trading volume available, it will simply average the closing prices instead. You just need to provide the symbol of the trading pair, like "BTCUSDT," to get the result.

## Function getAggregatedTrades

This function lets you retrieve historical trades for a specific cryptocurrency pair, like BTCUSDT. 

It pulls this data directly from the exchange you're using.

You can request all trades within a defined timeframe or specify a maximum number of trades to retrieve, allowing you to control the amount of data fetched. The function automatically handles paging through the trades to ensure you get the desired quantity. Trades are returned in reverse chronological order.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it like looking up a recipe – you give it the name of the action (like "placeOrder" or "closePosition"), and it returns the details of how that action should be structured.  It’s useful when you need to validate or dynamically create actions. The function requires a unique identifier for the action you’re looking for.

## Function formatQuantity

This function helps you display the right amount of a trading asset. It takes a trading symbol like "BTCUSDT" and a raw quantity number as input. Then, it automatically applies the specific formatting rules of that exchange, ensuring the quantity is shown with the correct number of decimal places. This way, you don’t have to worry about the details of how different exchanges handle quantity display.


## Function formatPrice

This function helps you display price values in a way that matches the specific rules of the exchange you're working with. It takes a trading pair symbol, like "BTCUSDT," and the raw price as input. The function then returns a formatted price string, ensuring the correct number of decimal places are shown based on the exchange's standards. This is useful for presenting prices in a user-friendly and accurate manner.


## Function dumpText

The `dumpText` function lets you write raw text data—like logs, reports, or detailed information—tied to a specific signal within your trading system. Think of it as a way to record events with context.

It takes an object containing the bucket name, a unique dump identifier, the actual text content, and a description of what the data represents. 

The function handles the details of associating the data with the correct signal, and it adapts its behavior depending on whether you're running a backtest or a live trading session, making it easy to use in either scenario.


## Function dumpTable

This function helps you display data in a structured table format. It takes an array of objects and presents them as a table, automatically adapting to whether you're running a backtest or live trading.

It figures out which signal to associate the table with, making it easy to see which signal the data belongs to. The table's column headings are dynamically generated based on the data itself, so you don't have to manually define them. 

Essentially, it's a convenient way to visualize and inspect your trading data within the backtest-kit framework.


## Function dumpRecord

The `dumpRecord` function allows you to save a record of data, essentially a flat collection of key-value pairs, associated with a particular bucket and identified by a unique dump ID. This function is useful for persisting information related to a specific signal, which can be either one that's already in progress or one that's planned for the future. It handles the complexities of knowing which signal is active, and whether you're running a backtest or a live trading scenario, so you don't have to worry about those details. You simply provide the record itself, a descriptive label, and the function takes care of the rest.


## Function dumpMCPStatus

This function helps you capture and record a snapshot of the Model Context Protocol (MCP) status. It’s useful for understanding what's happening within your trading system during a backtest or live trading session.

The function automatically figures out which signal is currently active, and it adapts to whether you’re running a backtest or live trading.

When using the standard markdown output, it will decode any images encoded in base64 and save them as PNG files, and create a single markdown file containing the MCP status, with images linked properly.  You can also choose to silence this output or use a memory-only version for searching.

You provide a data object that includes the bucket name, dump ID, messages, and a descriptive text to label the snapshot.


## Function dumpJson

The `dumpJson` function lets you output complex data structures as formatted JSON within your trading strategies. Think of it as a way to create nicely readable logs of your data. It automatically adapts to whether you're running a backtest or a live trading session.

You provide the function with a name for the data (`bucketName`), a unique identifier (`dumpId`), the data itself as a JavaScript object (`json`), and a brief explanation (`description`).  The function handles saving this data in a specific format, linked to the current signal being processed. It takes care of the technical details of determining the execution environment, so you don’t have to.


## Function dumpError

This function helps you record and track errors that happen during your backtesting or live trading. It takes details about the error—like where it occurred, a unique identifier, a description of the problem, and the error content itself—and stores them. The function automatically figures out whether you're running a backtest or a live trading session, so you don't have to specify that. It also handles connecting the error report to the specific trading signal involved, streamlining debugging and analysis. 

Here's a breakdown of what it does:

*   **Error Reporting:** Stores detailed information about errors.
*   **Signal Association:** Links errors to the relevant trading signal.
*   **Mode Detection:**  Recognizes whether you are backtesting or in a live environment.
*   **Automatic Resolution:** Automatically resolves the current signal.


## Function dumpAgentAnswer

This function lets you save the complete conversation history with the agent, tied to a specific signal. Think of it as creating a detailed log of the interaction for review or debugging. It smartly figures out which signal the conversation belongs to and whether you're in a backtest or a live trading environment, so you don't have to worry about those details. You provide the function with a data object containing the bucket name, a unique identifier for the dump, the actual message history (as an array of `MessageModel`), and a short description of what the dump represents. The function then handles the rest, saving the data appropriately.


## Function commitTrailingTakeCost

This function lets you set a specific price for your take-profit order, overriding the existing trailing take-profit. It's handy when you want to lock in a profit at a particular level.

Essentially, it simplifies changing your take-profit to a fixed price, handling some of the calculations behind the scenes. 

The function automatically figures out if you're in a backtest or live trading environment and also gets the current market price to make the necessary adjustments. You just need to provide the symbol of the trading pair and the desired take-profit price.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit distance for a trading signal that’s already placed. It’s designed to work by adjusting the original take-profit level you set initially, rather than the current, potentially adjusted trailing stop.

Think of it as a way to subtly nudge your take-profit, but it’s important to remember that it always references the original target. It’s built to prevent errors from building up each time you adjust it.

When you specify a percentage shift, the function prioritizes being more cautious – it only adjusts the take-profit *closer* to your entry price. For long positions, it'll only move the take-profit down. For short positions, it'll only move it up. The function automatically figures out whether it’s running in a backtest or live trading environment.

You’ll need to provide the trading symbol, the percentage adjustment you want to make to the original take-profit distance, and the current market price.


## Function commitTrailingStopCost

This function lets you set a new, specific price for your trailing stop-loss order. It's a shortcut that automatically calculates the percentage shift needed to achieve that price, based on your original stop-loss distance. 

It handles whether you're running a backtest or a live trade and figures out the current price for you. 

You simply provide the symbol of the trading pair and the desired new stop-loss price. The function will then adjust the trailing stop-loss accordingly and return a promise that resolves to a boolean indicating success or failure.


## Function commitTrailingStop

This function lets you adjust a trailing stop-loss order that’s already been set up. It’s important to remember that calculations are always based on the original stop-loss distance you initially set, not any adjustments that have been made since.

To prevent errors, only adjust the trailing stop-loss by a percentage change – the function will only move the stop-loss in a direction that provides better protection for your profits.

Think of it like this: if you want to tighten your stop-loss (move it closer to your entry price), use a negative percentage. To loosen it (move it further away), use a positive percentage.

The function has a clever feature: it only updates the stop-loss if the new position is actually *better* than the current one – for long positions, it will only move it higher, and for short positions, only lower. It handles whether you're in backtest or live trading mode automatically. 

You’ll need to provide the symbol of the trading pair, the percentage adjustment, and the current market price to ensure the stop-loss is being triggered correctly.

## Function commitSignalNotify

This function lets you send out informational notifications related to your trading strategy. Think of it as a way to leave notes about what your strategy is doing – like when a specific indicator triggers or a certain event happens during a trade. It doesn’t change your open positions, but it does provide a way to monitor and understand your strategy's behavior.

The function automatically knows which trading pair it's dealing with, the name of your strategy, the exchange, and the timeframe it’s operating on. It also includes the current price in the notification.  You can also add extra details to these notifications with the optional payload.

## Function commitPartialProfitCost

This function helps you automatically close a portion of your trading position when you've reached a specific profit level, measured in dollar amounts. It's designed to simplify the process of taking profits gradually, working towards your overall target profit.

Essentially, you tell it how much money you want to take in profit (like $150), and it handles the calculations to determine what percentage of your position needs to be closed to achieve that. The price needs to be heading in a profitable direction for this to work.

It's easy to use because it adapts to whether you're running a backtest or a live trade, and it figures out the current market price for you, so you don't have to. To use it, you just need to provide the trading symbol and the desired dollar amount of profit to take.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price is moving in a profitable direction, essentially moving you closer to your take profit target. It allows you to lock in some gains along the way. You specify the symbol of the trading pair and the percentage of the position you want to close, with the percentage ranging from 0 to 100. The framework handles whether it’s running in a backtesting environment or a live trading environment.


## Function commitPartialLossCost

This function helps you close a portion of your trading position when it's experiencing a loss, using a specific dollar amount. It's designed to gradually move your position toward your stop-loss level.

Essentially, it simplifies the process of partially closing a trade – it calculates the percentage of your position needed to cover the specified dollar amount.

The function automatically handles whether you're in a backtesting or live trading environment and gets the current market price to ensure the trade executes in the correct direction (towards your stop loss).

You provide the trading symbol and the dollar amount you want to use to close a portion of the position.


## Function commitPartialLoss

This function lets you close a portion of an open trade when the price is moving in a direction that would trigger your stop-loss. It's designed to help you manage risk by taking some profits or limiting losses on a trade. You specify the symbol of the trading pair and the percentage of the position you want to close, for example closing 25% of your position. The system figures out whether it’s running in a testing environment or a live trading scenario automatically.


## Function commitCreateTakeProfit

This function lets you tell backtest-kit that a take-profit order for a position has been filled on the exchange, even if it didn't happen exactly as the framework initially predicted.  It's useful because sometimes orders get filled quickly based on price movements (like hitting a high or low) that bypass the framework's VWAP-based take-profit calculations. 

Essentially, it synchronizes the framework's internal state with what actually happened on the exchange.

The function only does something if there’s a pending signal for the specified trading pair. It automatically knows if it’s running a backtest or a live trading session. You can optionally include extra information, like an order ID or a note, when you call this function.

## Function commitCreateStopLoss

This function lets you tell the backtest framework that a stop-loss order you previously set up has been filled by the exchange. It’s used when the exchange executes the order based on price levels (like a candle high or low) rather than waiting for the framework's specific conditions.

Think of it as confirming that the stop-loss has triggered and a trade has occurred, even if it didn’t happen exactly as the framework initially predicted.

The framework acknowledges this by recording the trade with a "stop_loss" reason.  It's designed to work seamlessly whether you’re running a backtest or a live trading scenario and won't do anything if there isn't an existing stop-loss order to acknowledge.

You can also include extra information about the commit, like a transaction ID or a note, if needed.

## Function commitCreateSignal

This function lets you manually send signals into the backtest or live trading process, bypassing the usual signal retrieval mechanism.

You can provide a signal DTO that contains all the necessary information for a trade.

If you don't specify a target price (`priceOpen`), the signal will execute immediately at the current price.

If you *do* specify a target price, the system will try to execute the trade right away if that price has already been reached; otherwise, it will schedule the trade to execute when that price is achieved.

The function checks to ensure that no other signals or actions are already pending, and it validates the signal DTO to catch any potential errors.

It automatically determines whether it's running in a backtest or live environment.

You provide the symbol of the trading pair and the signal DTO as input.


## Function commitClosePending

This function allows you to finalize a pending order that was previously opened by your trading strategy. Think of it as confirming a signal that’s been waiting to be executed. Importantly, it doesn't interrupt your strategy's normal operation—it won't stop it from generating new signals or running scheduled ones.

You can optionally include extra information like an ID or a note with this commit.

The function will automatically determine whether it's running in a backtesting or live trading environment.


## Function commitCancelScheduled

This function lets you cancel a scheduled trading signal without interrupting your strategy's overall execution. It's like hitting the pause button on a specific plan. 

It removes the signal that was waiting to be triggered by the next price opening, but it doesn't affect any other active orders or the strategy’s ongoing operation. Importantly, it won't trigger a stop to the strategy, allowing it to continue creating new signals. The framework intelligently adapts to whether you’re running a backtest or a live trading session.

You can optionally include extra information like an ID or a note when you cancel the signal.

## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss order. 

It moves the stop-loss to the original entry price, essentially eliminating risk, once the trade has gained enough profit. This profit needs to cover the transaction fees and a small buffer to account for slippage.

The function figures out whether it's running in a backtest or a live trading environment on its own, and it also gets the current price automatically, so you don’t have to worry about those details. You simply tell it which trading pair (like BTC/USD) you want to apply this to.


## Function commitAverageBuy

The `commitAverageBuy` function allows you to add a new buy order to your trading strategy's history, representing a piece of a dollar-cost averaging (DCA) approach. It essentially records a purchase at the current market price, helping to build out a more gradual entry into a position. 

This function automatically adjusts its behavior based on whether you're running a backtest or a live trade, and it handles getting the current price for you.

You provide the symbol (like BTCUSDT) to identify the asset being traded, and optionally a cost value. The function then calculates an average price based on all entries made so far and triggers a signal event.


## Function commitActivateScheduled

This function allows you to trigger a previously scheduled signal to activate immediately. 

Normally, a scheduled signal waits for the price to reach a specific level.  `commitActivateScheduled` lets you bypass that wait and force the signal to activate right away.

Think of it as manually giving the signal a thumbs up.

It works for both backtesting and live trading environments automatically, so you don't need to worry about adapting the code for different modes.

You can optionally include extra details like an ID and a note with the activation, which can be helpful for tracking and analysis.


## Function checkCandles

The `checkCandles` function verifies if your historical candle data already exists and is correctly stored. It efficiently checks for the presence of candles in your data storage (using a persist adapter). Instead of downloading the entire dataset, it only performs a quick check to see if the expected candles for specific timestamps are available. This helps avoid unnecessary data downloads, making the process faster and more resource-friendly.

It takes a set of parameters to guide the check.


## Function cacheCandles

This function helps you make sure you have the historical candle data you need for a particular trading symbol and timeframe. It essentially verifies that the data is already saved and, if not, fetches it and saves it for future use. Think of it as a way to pre-load data to speed up backtesting or live trading, by checking if the data exists, and if not, downloading and re-validating it to ensure accuracy. You can provide callbacks to track the start of the check and warm-up processes.

## Function addWalkerSchema

This function lets you add a walker to the backtest-kit system. A walker essentially defines how different trading strategies will be run and compared against each other. It allows you to specify how the backtests will be executed, using the same historical data for each strategy, and then evaluate their performance based on a chosen metric. You provide a configuration object, called `walkerSchema`, which details the walker's setup and behavior.

## Function addSweepSchema

This function lets you define and register a sweep, which is essentially a way to systematically test and evaluate different trading strategies. A sweep involves running your trading idea across a range of possible parameter combinations, using a single candle to evaluate each set. 

It allows you to train the system with a whitelist/ban list based on the simulated range, and then assesses how different entry and exit point parameters perform. 

You provide a configuration object that outlines the sweep's details, and the framework handles the rest, intelligently applying default bounds to any optional parameters you might leave unspecified. This helps you analyze your trading strategy’s performance under various conditions.


## Function addStrategySchema

This function lets you register a new trading strategy within the backtest-kit framework. Think of it as telling the system about a new way you want to trade. When you register a strategy, it will automatically check things like the quality of the price data it uses and that trading signals are sent at appropriate times to avoid problems.  Furthermore, it ensures your strategy’s settings and state are saved safely, even if there's an unexpected interruption during live trading. You provide a configuration object, called `strategySchema`, which describes how the strategy operates.


## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. Think of it as defining your risk management rules.

You provide a sizing schema, which includes details like whether you want to size based on a fixed percentage of your capital, a Kelly criterion, or ATR (Average True Range).

The schema also contains important parameters such as the percentage of your capital you’re willing to risk, multipliers for Kelly calculations, and limits on how large any single position can be. You can even provide a custom function to be called during the sizing process. Essentially, it's all about defining how much you'll bet on each trade.


## Function addRiskSchema

This function lets you define how your trading system manages risk. Think of it as setting up guardrails to prevent your strategies from taking on too much exposure.

You can specify limits on the number of simultaneous trades across all your strategies. It also allows for sophisticated, custom checks – like monitoring portfolio metrics or correlations – to make sure your risk profile stays within acceptable bounds.

The system shares a single risk manager across all your strategies, meaning it can assess risk across all trading activity, not just one strategy at a time. This provides a unified view of your overall risk exposure.

Essentially, it gives you fine-grained control over the rules your strategies must follow.


## Function addMCPSchema

This function lets you connect your trading strategy to an external system using the Model Context Protocol, or MCP. Think of it as a way to expose your strategy's performance and allow external commands to influence its trading. 

When you register a schema with this function, the framework will share information like the strategy's status and allow it to receive position adjustments from the MCP.  You can customize how the information is presented to the external system, or use the default rendering which provides simple text messages for each traded symbol. Essentially, it’s the mechanism that allows external tools and systems to interact with and monitor your trading strategies.

## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe generator you want to use during backtesting. Think of it as registering a new way to slice up your historical data. 

You provide a configuration object, which specifies the start and end dates for your backtest, the interval at which you want timeframes to be generated (like daily, weekly, or hourly), and a function to handle any events that happen during the timeframe generation process. Essentially, it's how you customize the timeframe data used for your backtest.


## Function addExchangeSchema

This function lets you tell the backtest-kit about a new data source for exchange information. Think of it as registering where the framework should look to find historical price data, understand how prices and volumes are formatted for a specific exchange, and perform calculations like VWAP. You provide a configuration object that defines the exchange’s properties and how it behaves within the testing environment. Essentially, it’s how you integrate real-world exchange data into your backtesting process.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want to perform during your backtesting. Think of actions as little tasks or notifications that happen based on what’s going on in your trading strategy.

These actions can do a lot of things, like update a state management system (like Redux), send notifications to platforms like Telegram or Discord, log events, or even track analytics. 

Essentially, every time your strategy is running, and something significant happens (like a new signal or profit), you can trigger one of these registered actions. This gives you a powerful way to connect your backtesting to external systems and track its performance in detail.

You provide an `actionSchema` object which defines how that action is configured and executed.
