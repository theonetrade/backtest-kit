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

The `writeMemory` function lets you store data, like trading decisions or important observations, in a named memory location. Think of it as creating a labeled note that your trading system can access later. 

This function automatically handles the details of where and when this data is saved, whether you're running a test backtest or a live trading session.

It takes an object with a few key pieces of information: the name of the "bucket" where the memory lives, a unique identifier for the memory itself, the data you want to store (which can be any type of object), and a description to help you remember what the data represents. It's like labeling your notes so you understand them later.


## Function warmCandles

This function helps speed up backtesting by pre-loading historical price data, also known as candles. It downloads candles for a specified date range and stores them, so they're readily available when running a backtest. Essentially, it prepares your data in advance, preventing delays caused by fetching it during the backtest itself. The `params` object tells it where to start, where to end, and what timeframe (interval) to retrieve.

## Function validate

This function helps ensure everything is set up correctly before you start any backtesting or optimization. It checks that all the entities you're using – like exchanges, strategies, and risk managers – actually exist and are properly registered within the system. 

You can tell it to validate specific parts of your setup by providing arguments, or let it check *everything* for a complete sanity check. It remembers the results of previous validations so it doesn't have to repeat the work unnecessarily. Think of it as a quick check to prevent errors from unexpected missing entities.

## Function stopStrategy

This function allows you to halt a trading strategy's signal generation. 

Essentially, it tells the strategy to stop creating new trading opportunities. 

Any existing open signals will finish their process, but no new ones will be started. 

The system will gracefully stop the backtest or live trading session at a suitable moment, like when it's idle or after a signal has completed. 

You provide the trading pair symbol (like BTCUSDT) to specify which strategy to stop.


## Function shutdown

This function provides a way to cleanly stop the backtesting process. It signals that the backtest is ending, giving all parts of the system a chance to finish up any tasks and save data before everything closes. Think of it as a polite way to tell the backtest to wrap up and exit gracefully, especially when you need to interrupt it.

## Function setSignalState

This function helps manage and update data related to a specific trading signal. It’s designed to be used when you're building strategies where you need to track information across individual trades, like how long a trade stays open or the highest percentage gain it reaches. 

It automatically handles whether you're in backtesting mode or live trading.

If no active signal is found, it will notify you, but won't proceed with the update.

Essentially, it's a tool to keep track of performance metrics for your trading strategies, especially useful when you want to make decisions based on accumulating data from multiple trades. You need to provide the symbol, a way to dispatch data, and a data transfer object containing initial values and bucket name for storing data.


## Function setSessionData

The `setSessionData` function lets you store information that's specific to a particular trading setup – like the symbol being traded, the strategy used, the exchange, and the timeframe. This data sticks around even as new candles come in, and it can even persist if your program restarts while you're actively trading.

Think of it as a place to hold temporary calculations or results, such as caching results from AI models or storing the state of a technical indicator. 

You can also clear out any existing session data by passing `null` as the value. The function automatically knows whether it's running a backtest or live trading.

It takes two pieces of information: the trading symbol (like "BTCUSDT") and the value you want to store. The value can be any object, or you can clear it by setting the value to null.

## Function setLogger

You can now control how backtest-kit reports its activity. This function lets you plug in your own logging system, allowing you to see exactly what’s happening during backtests in a format that works best for you. 

The framework will automatically include important details like the trading strategy, exchange, and symbol being tested alongside each log message.

Simply provide a logger that follows the `ILogger` interface to get started.

## Function setConfig

This function lets you adjust the overall settings of the backtest-kit framework. You can provide a new set of configuration values to override the default ones. 

Sometimes, particularly in testing environments, you might need to bypass certain safety checks during configuration. The `_unsafe` flag enables this, but use it with caution. Essentially, it allows you to directly set the configuration even if it might not immediately seem completely valid.

## Function setColumns

This function lets you customize the columns displayed in your backtest reports, particularly when generating markdown reports. Think of it as tailoring the report to show exactly the data you need. You can override the default column settings by providing your own configuration.  The system checks to make sure your custom columns are set up correctly, but there's a special "unsafe" mode to bypass these checks if you're using it in a testing environment.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system. Think of it as a powerful search tool for your trading strategies.

You provide a bucket name (where the data is stored) and a search query, and it returns a list of matching memory entries.

The function uses a smart scoring system (BM25) to rank the results, so the most relevant entries appear first. It handles the complexities of understanding whether your code is running in a backtest or live environment and automatically identifies the active signal, making your life easier.


## Function runInMockContext

The `runInMockContext` function lets you execute pieces of code as if they were running within a backtest-kit environment, but without needing a full, running backtest.

This is really handy for testing, or for situations where you want to use context-dependent features like getting the current timeframe, but don't need the overhead of a complete backtest.

You provide a function you want to run, and `runInMockContext` sets up a fake environment around it – think of it as a controlled playground.

You can customize this fake environment by providing values for `exchangeName`, `strategyName`, `frameName`, `symbol`, `backtest` (to simulate live or backtest mode), and `when` (the time to align to), but if you don't specify anything, it defaults to a minimal setup with placeholder names and the current minute.


## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. Think of it like cleaning up old data. 

It takes two pieces of information: the name of the "bucket" where the memory is stored and a unique ID that identifies the memory entry you want to remove.

The function handles the complexities of knowing whether you’re in a backtesting or live trading environment and automatically resolves any active signals linked to the memory. It simplifies the process of managing historical data for your signals.

## Function readMemory

The `readMemory` function lets you retrieve data that's been saved in memory, associating it with a specific signal. Think of it as fetching a stored value linked to a particular trading signal. It handles the complexities of figuring out which signal is currently active and whether you're in a backtesting or live trading environment, so you don't have to worry about those details. 

You provide the name of the memory bucket and the unique identifier of the memory you want to read.

The function returns a promise that resolves with the data, assuming you specify the expected type when calling it.


## Function overrideWalkerSchema

This function lets you tweak an existing trading strategy's walker configuration, which is how the backtest kit analyzes and compares strategies. Think of it like making a small adjustment to a running plan, rather than starting from scratch. You provide a partial configuration – only the parts you want to change – and the function will merge those changes with the original walker, leaving everything else untouched. It's useful for experimenting with different analysis settings without having to redefine the whole walker.

## Function overrideStrategySchema

This function lets you modify a strategy that's already been set up within the backtest-kit framework. Think of it as a way to fine-tune an existing strategy without having to recreate it entirely. You provide a new configuration—just the parts you want to change—and it updates the strategy accordingly, leaving everything else untouched. It's useful for adjustments and iterative improvements to your trading logic.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing setup. Think of it as making small adjustments to a configuration that's already in place—you don’t need to recreate the entire thing.  You just provide the parts you want to change, and the rest of the sizing configuration stays as it was originally defined. This is helpful for fine-tuning how your positions are sized without a full overhaul. The configuration you provide should be a partial object containing the settings you want to update.

## Function overrideRiskSchema

This function lets you tweak a risk management setup that's already in place. Think of it as making small adjustments – you specify the parts you want to change, and the rest of the original risk configuration stays the same. You provide a partial configuration object, and it updates the existing one. This is handy if you need to refine your risk parameters without rebuilding the whole thing from scratch.

## Function overrideFrameSchema

This function lets you tweak how your backtest handles different timeframes, like changing the size of each bar. It's like making small adjustments to an existing timeframe setup instead of starting from scratch. You provide a partial configuration – just the bits you want to change – and the function merges those changes with the original timeframe definition. This allows for flexible customization of your backtesting environment.

## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange. Think of it as making small tweaks to how the framework understands a particular exchange – you're not starting from scratch, just updating specific parts. 

You provide a new, partial configuration, and it will merge that with the existing configuration. Only the information you give it will change; everything else stays the same. This is useful for making adjustments without having to redefine the entire exchange setup.

## Function overrideActionSchema

This function lets you adjust how a specific action is handled within the backtest-kit framework without completely replacing the existing setup. Think of it as a targeted update—you can modify certain aspects of an action's configuration, like its logic or callbacks, while keeping everything else the same. It's handy when you need to tweak behavior for different environments (like development versus production) or dynamically change how actions are processed. You can use this to change how an event is handled without needing to rewrite the entire strategy. The function takes a partial configuration object, meaning you only need to provide the parts you want to change.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs, specifically as each trading strategy finishes. It provides a way to be notified after each strategy is complete.

Importantly, the updates are handled in a controlled manner—they're processed one at a time, even if your callback function does some asynchronous work. This helps to keep things stable and predictable during the backtest.

You give it a function (the `fn` parameter) that will be called whenever a strategy finishes. When you’re done listening for these updates, the function returns another function that you can use to unsubscribe.


## Function listenWalkerOnce

This function lets you set up a one-time listener for events coming from a walker. You provide a filter – a function that decides which events you're interested in – and a callback function that will run *only once* when a matching event appears. Once the callback has executed, the listener automatically stops, so you don't need to worry about cleaning up manually. It’s perfect for situations where you need to react to a specific condition happening within the walker's progress. 

You define what events you want to capture with the `filterFn`.
Then, when the right event arrives, your `fn` function will be called just once, and it will automatically unsubscribe.


## Function listenWalkerComplete

This function lets you listen for when a backtest run finishes. It’s useful for knowing when all your trading strategies have been tested.

When you subscribe, you’ll get notified as soon as the backtest is complete. 

Importantly, the events are handled one at a time, even if your callback function takes some time to process—this helps prevent issues from running things concurrently. To stop listening, simply call the function that’s returned.


## Function listenWalker

The `listenWalker` function lets you observe the progress of your backtesting simulations. It's like setting up an observer that gets notified whenever a strategy finishes running within the backtest. 

You provide a function (`fn`) that will be called for each completed strategy. This function receives an event object detailing the strategy’s progress.

Importantly, the events are delivered one at a time, and the callback function is wrapped to ensure it executes sequentially, even if it’s an asynchronous operation, which makes handling them simpler and prevents unexpected issues. This ensures everything runs in a predictable order.


## Function listenValidation

The `listenValidation` function allows you to keep an eye on potential problems during risk validation. It’s a way to catch errors that happen when your trading signals are being checked. 

Think of it as setting up a listener that gets notified when something goes wrong during this process. The notification comes in the form of an error message.

You provide a function that will be called whenever a validation error occurs. This function will receive the error details, allowing you to debug or monitor these failures.

Importantly, errors are handled one at a time, in the order they occur, to ensure stability, even if the provided error handling function needs some time to complete.


## Function listenSyncOnce

The `listenSyncOnce` function lets you react to specific signal synchronization events, but only once. It’s great for situations where you need to make a one-time adjustment or confirm something with an external system before continuing. The function will wait for any promises returned from the callback to resolve before proceeding with any further trading actions. You provide a filter to select which events you're interested in, and a function to handle that single event.

## Function listenSync

This function lets you listen for events related to signal synchronization, which is helpful when your trading system needs to communicate with other services. Think of it as a way to make sure everything is in sync before actions happen. If an error occurs during the synchronization process, it will pause the opening or closing of positions until the problem is resolved. It’s particularly useful for coordinating with external systems or ensuring a specific order of operations. The function you provide will be called with details about the synchronization event, and if that function returns a promise, the trading process will wait for that promise to resolve before continuing.

## Function listenStrategyCommitOnce

This function lets you react to strategy management events, but only once. You provide a filter – a way to specify exactly which events you're interested in. When an event that matches your filter arrives, the provided callback function runs just one time, and then the subscription stops automatically. It's perfect when you need to respond to a specific action related to a strategy and don’t want to keep listening afterwards. 

You define which events you want to react to with `filterFn`, and the code that handles that event goes into `fn`. 


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies – things like canceled signals, closed positions, and adjustments to stop-loss and take-profit levels. It's like setting up a notification system that tells you whenever a specific action happens related to your strategies.

The function gives you a way to react to these actions and guarantees that any code you write to respond happens one at a time, even if it involves delays. You provide a function that will be called whenever one of these events occurs, and this function receives data about the event that triggered it. To stop listening, the function returns another function that you can call to unsubscribe.


## Function listenSignalOnce

This function lets you react to a specific signal event just once and then automatically stops listening. Think of it as setting up a temporary listener that only fires when a certain condition is met. You provide a filter to define what kind of signal you're interested in, and a function that will run when that signal appears. Once the signal is processed, the listener is automatically removed, so you don't have to worry about cleaning up. It's great for situations where you need to wait for a particular event to happen and then take action. 

Here’s how it works:

*   You give it a way to identify the signal you want to react to (the `filterFn`).
*   You provide a function (`fn`) that will be executed when the signal matches the filter.
*   The listener is activated, waits for the signal, runs the function once, and then automatically stops listening.

## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once. It's like setting up a temporary alert. 

You provide a filter to identify the signals you're interested in, and a function to execute when a matching signal arrives. The function will then automatically stop listening after that single event. Think of it as a "one-and-done" signal listener. 

It’s helpful for things like immediately triggering an action based on a particular signal and then forgetting about it.


## Function listenSignalNotify

This function lets you listen for notifications whenever a trading strategy sends out a signal note about an open position. Think of it as a way to be alerted to custom messages coming from your strategies. 

These notifications are handled one at a time, even if the function you provide to process them takes some time to complete, ensuring that they are delivered in the order they were generated. 

To use it, you simply provide a function that will be called whenever a new signal note is available. When you're finished listening, the function returns another function you can call to unsubscribe.

## Function listenSignalLiveOnce

The `listenSignalLiveOnce` function lets you temporarily hook into a live trading simulation and react to specific events as they happen. It’s perfect for situations where you only need to do something once, like capturing a single data point or triggering a one-off action based on a condition.  You provide a filter to specify which events you’re interested in, and a function that gets executed just once when a matching event occurs. After that single execution, the subscription automatically stops, preventing further callbacks. This keeps your code clean and focused on that one-time action.


## Function listenSignalLive

The `listenSignalLive` function lets you set up a listener to receive real-time trading signals directly from a running backtest. It’s designed for situations where you need to react to signals as they happen during a live simulation. The signals are delivered one after another, ensuring they're processed in the order they arrive. You provide a function that gets called whenever a new signal arrives, and this function receives data about the signal event. When you're finished listening, the function returns another function that you can call to unsubscribe.


## Function listenSignalBacktestOnce

This function lets you tap into the stream of events generated during a backtest, but with a twist – it only listens once. You provide a filter to specify which events you’re interested in, and a function to handle those specific events. Once the filter matches an event, your function runs, and the listener automatically stops, ensuring it doesn’t keep processing events after its job is done. It's useful when you need to react to a single, specific signal during a backtest run.


## Function listenSignalBacktest

This function lets you tap into the backtest process and react to what's happening as the backtest runs. You provide a function that will be called whenever a signal event occurs during a backtest run, like a trade being executed or a new data point arriving. Importantly, these signals are processed one at a time, so you don't have to worry about handling them concurrently. Keep in mind that this only works with events generated by the `Backtest.run()` method. The function returns another function that you can call to unsubscribe from these signal events when you're finished.

## Function listenSignal

This function lets you listen for updates from your trading strategy. 

Whenever the strategy changes – like when it's idle, opening a position, actively trading, or closing a position – this function will call a callback you provide.

It handles these events one at a time and processes them in the order they arrive, even if the callback you provide takes some time to complete. This makes sure things happen in a predictable sequence. You give it a function, and it returns another function that you can use to unsubscribe from these updates later.

## Function listenSchedulePingOnce

This function lets you set up a temporary listener that reacts to specific ping events. Think of it as waiting for a particular condition to be met. It takes a filter – a way to identify the events you're interested in – and a function to execute when that event is found. Once the event matches your filter and the function runs, the listener automatically stops listening, so you don't have to worry about managing it yourself. It's perfect for situations where you need to react to something happening just once.

You provide a test to see if the event matches your need, and a function to run when it does. The function will only run once for the matching event, then it stops listening.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals as they wait to become active. Think of it as a way to receive regular "ping" updates – once a minute – while a signal is being monitored. You provide a function that gets called with these ping events, allowing you to track the signal’s progress or run custom checks during this waiting period. It’s useful for understanding the status of signals that haven't started trading yet and to implement any specific monitoring you might need. The function you provide will be executed asynchronously. When you’re finished, you can unsubscribe from these ping events by calling the function that `listenSchedulePing` returns.

## Function listenRiskOnce

This function lets you react to specific risk rejection events just once and then automatically stop listening. Think of it as setting up a temporary alert—it waits for a particular condition to be met, triggers your code once it happens, and then quietly goes away. You provide a filter to define what kind of risk rejection event you're interested in, and a function to execute when that event is detected. It's handy for situations where you need to respond to a one-time event and don't want to keep listening indefinitely.


## Function listenRisk

This function lets you be notified whenever a trading signal gets rejected because it violates a predefined risk rule. 

Think of it as a watchful eye on your trading decisions – you'll only hear from it when something goes wrong with the risk assessment.

It ensures that these notifications are handled one at a time, in the order they come in, preventing a flood of updates and allowing each event to be processed properly, even if your callback function takes some time to complete. To stop listening for these risk rejection events, the function returns another function you can call.


## Function listenPerformance

This function lets you keep an eye on how long different parts of your trading strategy take to run. It's like having a detective for your code, constantly monitoring the timing of operations. Whenever an operation finishes, it sends a notification (a `PerformanceContract`) to a function you provide.

This is especially helpful for spotting slowdowns or inefficiencies in your strategy – those performance bottlenecks that can hold you back. The events are handled one at a time, even if your callback function takes some time to process, ensuring everything stays in order. It’s a safe and reliable way to understand where your strategy might be struggling.

## Function listenPartialProfitAvailableOnce

This function lets you react to a specific situation related to partial profit levels in your trading strategy, but only once. You provide a way to identify the exact event you're interested in, and then a function that will run when that event happens. After the function runs once, it automatically stops listening, so it's perfect for situations where you need to trigger something based on a single occurrence of a profit condition. It's a clean way to ensure you only respond to that condition once and then move on.

## Function listenPartialProfitAvailable

This function lets you be notified when your backtest reaches specific profit milestones, like 10%, 20%, or 30% gain. It ensures these notifications are handled one at a time, even if your notification logic takes some time to complete. Think of it as a way to react to progress in your trading strategy as it’s being tested. You simply provide a function that will be called each time a new profit level is achieved, and it takes care of the rest, making sure things don't get jumbled up.


## Function listenPartialLossAvailableOnce

This function lets you react to specific changes in partial loss levels and then automatically stop listening. 

It works by letting you define a filter – a rule that says “I only care about events that meet this condition.”

Then, it will call a function you provide only once when that condition is met. 

Once that single event is handled, the listening stops, ensuring you don't get unnecessary notifications. This is great for situations where you need to react to a particular loss situation just one time.

You're given a filter function to specify exactly which loss events should trigger your reaction, and a callback function that will be executed only once when a matching event is detected.


## Function listenPartialLossAvailable

This function lets you keep track of when your trading strategy hits certain loss milestones, like losing 10%, 20%, or 30% of its initial capital. It’s designed to notify you as these loss levels are reached, one at a time, ensuring events are processed in the order they happen. Importantly, even if your callback function takes some time to complete (like making an API call), the next event won't be triggered until the previous one is fully handled, preventing issues caused by simultaneous processing. You provide a function that gets called whenever a partial loss level is hit, and this function returns another function that can unsubscribe you from receiving these notifications.

## Function listenMaxDrawdownOnce

This function allows you to react to specific maximum drawdown events and then automatically stop listening. 

You provide a filter that determines which drawdown events you’re interested in, and a function that will be executed when a matching event occurs. 

Once the event is handled, the subscription is automatically cancelled, so you don't have to worry about manually cleaning up listeners. It's ideal for situations where you need to react to a drawdown condition and then move on.

The filter function examines each drawdown event, and your callback function is only triggered for the first event that passes the filter.

## Function listenMaxDrawdown

This function lets you keep an eye on when your trading strategy hits new drawdown lows. It’s like setting up an alert that triggers whenever your strategy experiences a deeper loss than it has before.

The alerts are handled in order, even if the callback function takes some time to complete. To prevent any hiccups, it makes sure only one alert processing happens at a time.

This is particularly useful if you want to monitor your strategy's risk exposure and adjust your approach accordingly. You provide a function, and it gets called whenever a new maximum drawdown is detected.


## Function listenIdlePingOnce

This function lets you listen for specific "idle ping" events – these are signals that your system is still running and responsive.  You can define a filter to only react to certain kinds of idle pings, and then specify a function that will run *once* when a matching ping is received.  Essentially, it's a way to react to a single event and then stop listening. The function returns a cleanup function that you should call to stop listening.


## Function listenIdlePing

This function lets you be notified when the backtest simulation is in a quiet, "idle" state – meaning no trades are currently being processed or scheduled. It’s perfect for tasks that need to run only when the system isn't actively trading, like periodic data updates or long-running calculations.

You provide a function that will be called each time this idle state occurs.  The function receives information about the idle ping event itself.

To stop listening for these idle events, the function returns another function that you can call.


## Function listenHighestProfitOnce

This function lets you watch for specific moments when your trading strategy achieves the highest profit so far. 

You provide a rule to identify those special events – for example, "profit is greater than $1000."

Once an event matches your rule, the function will run the code you specify, and then automatically stop listening. It's a handy way to react to a particular profit milestone without constantly monitoring. 

The function returns an unsubscribe function that you can call to stop listening earlier than expected. 

It takes a filter function that determines which events to listen for, and a callback function that runs when a matching event is found.


## Function listenHighestProfit

This function lets you monitor when a trading strategy hits a new peak in profit. 

It's like setting up an alert that goes off each time the strategy earns more than it ever has before.

Importantly, it handles these alerts in a specific order, one at a time, even if the alert processing takes some time.

This is great for things like keeping track of progress or adjusting your trading strategy based on how well it’s performing.

You provide a function that will be called with details about the new highest profit achieved. 


## Function listenExit

This function lets you be notified when something goes critically wrong and stops the program. It's designed to catch those "fatal" errors that can happen during background processes like running live trading, backtesting, or walking through data. These aren’t errors you can usually recover from; they halt the current operation.

The errors you receive are handled one at a time, in the order they occur, even if your error handling function takes some time to run. This helps avoid unexpected behavior due to overlapping error processing.

You provide a function (called `fn`) that will be executed when a fatal error happens. This function receives an `Error` object to provide details about the problem. The `listenExit` function returns a function that you can call later to unsubscribe from these notifications.


## Function listenError

The `listenError` function allows you to monitor and respond to errors that occur during your trading strategy's execution. It’s designed to catch those recoverable errors – like issues connecting to an API – so your strategy doesn't abruptly stop. 

Essentially, it sets up a listener that gets triggered when an error happens. You provide a function that describes how you want to handle the error, and this function will be called whenever a recoverable error occurs. 

The errors are handled one at a time, in the order they happen, even if your error-handling function takes some time to run, preventing unexpected behavior. This function also returns an unsubscribe function to stop listening to these errors when you no longer need to.

## Function listenDoneWalkerOnce

This function lets you react to when a background task within your backtest completes, but only once. You provide a filter – a function that determines which completion events you're interested in – and then a callback function that gets executed when a matching event happens. After that single execution, the subscription is automatically removed, preventing further callbacks. It's perfect for scenarios where you need to perform a one-time action based on a specific background task finishing.

## Function listenDoneWalker

This function lets you monitor when background tasks initiated by a Walker finish processing. It's essentially a way to get notified when something runs in the background and is done. 

You provide a function (`fn`) that will be called when a background task is complete. 

Importantly, the notifications happen one at a time, even if your provided function does something asynchronous – this ensures things happen in the intended order and prevents potential conflicts. It wraps your callback to keep things running smoothly and sequentially.

## Function listenDoneLiveOnce

This function helps you react to when a background task finishes running. 

It lets you specify a condition to check for – only when that condition is met do you get notified about the task's completion. 

The callback function you provide will only be triggered once and then the subscription will automatically stop, so you don’t need to worry about cleaning up. This is useful for things like confirming a background process is done before proceeding. You give it a test to see if the event matches what you want, and then tell it what to do when it does.


## Function listenDoneLive

This function lets you react to when background tasks run by the Live component finish. It's like setting up a listener that gets notified when a long-running process completes. The notifications happen one after another, ensuring that your response to each completion is handled in order. To avoid any problems with multiple things happening at once, it uses a queuing system to process these completion notifications carefully. You provide a function that will be called whenever one of these background tasks is done, and this function receives details about the completed task. When you're finished listening, you can unsubscribe with the function that is returned.

## Function listenDoneBacktestOnce

The `listenDoneBacktestOnce` function lets you react to when a background backtest finishes, but only once. You provide a filter function to specify exactly which backtest completions you're interested in. Once a matching backtest completes, the provided callback function will be executed with details about the finished backtest, and then the listener will automatically stop listening. This is useful for things like displaying a completion message or performing a single cleanup action after a specific backtest is done.


## Function listenDoneBacktest

This function lets you get notified when a background backtest finishes running. 

Essentially, you provide a function (the `fn` parameter) that will be called once the backtest is complete. 

It makes sure those notifications happen one at a time, even if your function does some asynchronous work, so things don’t get messy. This is helpful for tasks like saving results or triggering other actions once the backtest is fully done.


## Function listenBreakevenAvailableOnce

This function allows you to set up a one-time alert for when a specific breakeven condition is met. It lets you define a filter, like a certain price level, and then specify a function that should run *only once* when that condition is triggered. Once the function executes, the subscription is automatically canceled, so you don’t need to worry about manually unsubscribing. Think of it as a way to react to a particular breakeven event and then forget about it.

You provide a function to identify the events you're interested in, and a function to run when a matching event occurs. The system listens for events, applies your filter, and when it finds a match, it runs your function *just once* before stopping.


## Function listenBreakevenAvailable

This function lets you keep an eye on when a trade's stop-loss automatically adjusts to the initial entry price – that’s your breakeven point. It’s triggered when the price moves enough in your favor to cover all the costs associated with the trade. 

Think of it as a notification system; you provide a function, and whenever a trade reaches this breakeven level, your function gets called. 

Importantly, the events are handled one at a time, so your function’s execution won’t be interrupted, even if it takes a bit longer to run. This ensures that events are processed in the order they happen.

## Function listenBacktestProgress

This function lets you listen for updates as a backtest is running. It provides progress information during the background processing of a backtest. 

The information is delivered as events, and they're handled in the order they arrive, even if your handling function takes some time to complete.

To use it, you provide a function that will be called with the progress updates; this function will be called sequentially to prevent issues from overlapping execution. The function will return a function that you can call to unsubscribe from these updates.

## Function listenActivePingOnce

This function lets you temporarily listen for specific active ping events and react to them just once. You provide a filter to define which events you're interested in, and a function to execute when a matching event occurs. After that one execution, the listener automatically stops, so you don't have to worry about managing subscriptions. It’s perfect for situations where you need to respond to a specific condition triggered by an active ping and then move on.


## Function listenActivePing

This function lets you keep an eye on active signals within the backtest-kit system. It’s like setting up a notification system that tells you whenever a signal becomes active. 

You’ll receive these notifications roughly every minute.

The function provides a way to react to these events and dynamically adjust your trading strategies based on the signals’ status – whether they are active or not.

Importantly, it handles the notifications one at a time, ensuring that if your reaction to one signal takes some time, it won't interfere with processing the next notification. To stop listening, simply call the function that's returned by `listenActivePing`. 


## Function listWalkerSchema

This function provides a way to see all the different trading strategies or "walkers" that are currently set up and ready to be used within the backtest-kit framework. It's essentially a list of all the registered strategies, allowing you to inspect them, understand what's available, or build tools that automatically adapt to the strategies in use. Think of it as a directory listing of your trading strategies. You can use it to check your work or create interactive displays of available strategies.


## Function listStrategySchema

This function allows you to see a complete list of all the trading strategies that have been set up within your backtest-kit environment. Think of it as a way to view all the different trading approaches you’ve defined. It's particularly helpful if you’re trying to understand what strategies are available, creating documentation, or building an interface that needs to display a selection of strategies. It fetches the registered strategy schemas, giving you a clear overview of your trading system’s options.


## Function listSizingSchema

This function lets you see all the sizing strategies currently set up in your backtest kit. It essentially provides a complete inventory of how your trades will be sized. You can use this to check your configurations, create documentation, or build tools that adapt to different sizing methods. It returns a list containing details about each sizing schema.

## Function listRiskSchema

This function lets you see all the risk configurations your backtest setup uses. 

Think of it as a way to peek under the hood and understand how your trading strategies are assessing risk. 

It returns a list of these risk configurations, which can be helpful when you're troubleshooting or want to document your setup. You can even use this list to build interactive tools that adapt based on the registered risk schemas.


## Function listMemory

This function helps you retrieve a list of stored data related to your trading signal. Think of it as looking through a collection of saved memories for your strategy. 

It automatically figures out which signal you're working with and whether you're in a backtesting or live trading environment.

You provide the name of the storage bucket where the memories are kept, and it returns a list of entries, each containing a unique ID and the data itself. This is useful for examining past decisions or reconstructing a signal's state.

## Function listFrameSchema

This function gives you a look at all the different "frames" – think of them as data structures – that are currently being used in your backtest. It pulls together a list of these frames, so you can inspect them, understand what data is available, or even build tools that react to the specific frames being used. Essentially, it's a way to see the blueprint of how your backtest is organized and what data it's working with. This is handy when you're troubleshooting, documenting your work, or creating user interfaces that need to adapt to the frames in use.

## Function listExchangeSchema

This function helps you discover all the exchanges that your backtest-kit is currently set up to work with. Think of it as a way to see a complete list of the supported exchanges – maybe you want to double-check what's been configured, or you're building a user interface that needs to display options for different exchanges. It returns a promise that resolves to an array of exchange schema objects, giving you all the details about each registered exchange.

## Function hasTradeContext

This function lets you quickly see if your trading environment is ready for action. It verifies that both the execution and method contexts are active. Think of it as a quick check to ensure you have the necessary permissions and setup before trying to retrieve data or perform actions related to your trades. If it returns true, you can safely use functions like `getCandles` or `formatPrice`.

## Function hasNoScheduledSignal

This function helps you check if a scheduled trading signal exists for a specific trading pair, like "BTCUSDT". It returns `true` when there isn't a signal currently scheduled. Think of it as the opposite of checking *for* a scheduled signal – you can use this to make sure your system only generates signals when it's supposed to. The function intelligently figures out whether it's running in a backtesting environment or a live trading setup. 

It accepts a symbol representing the trading pair as input.

## Function hasNoPendingSignal

This function checks if there's a signal currently waiting to be triggered for a specific trading pair, like 'BTCUSDT'. It returns `true` if no signal is pending, and `false` if one exists. Think of it as the opposite of `hasPendingSignal`; you might use it to make sure a new signal isn't created when one is already in progress. It smartly figures out whether you're running a backtest or live trading environment. To use it, you simply provide the symbol of the trading pair you want to check.

## Function getWalkerSchema

The `getWalkerSchema` function is your way to find out the details of a specific trading strategy (or "walker") that's been registered within the backtest-kit framework. Think of it as looking up the blueprint for a particular trading approach. You simply give it the name of the walker you're interested in, and it returns a description of what that walker does and how it works – essentially, its schema. This helps you understand and work with different trading strategies in a structured way.

## Function getTotalPercentClosed

This function, `getTotalPercentClosed`, helps you understand how much of your position in a specific trading pair remains open. It gives you a percentage value – think of it as a snapshot of your holdings. A value of 100 means you haven’t closed any part of your position, while 0 means it’s completely closed. 

It cleverly takes into account any Dollar-Cost Averaging (DCA) entries you’ve made along the way, providing an accurate view even with partial closures. 

You simply need to provide the symbol of the trading pair you’re interested in (like BTCUSDT), and it will tell you the percentage of that position that’s still active. The system automatically adjusts to whether you're in a backtesting or live trading environment.


## Function getTotalCostClosed

This function helps you figure out how much you've spent on a position you're currently holding. It calculates the total cost basis in dollars, taking into account any dollar-cost averaging (DCA) entries and partial closing actions. It's smart enough to determine whether it's running in a backtest or a live trading environment without you having to tell it. You just need to provide the trading pair symbol, like "BTCUSDT," and it will return the calculated cost.

## Function getTimestamp

The `getTimestamp` function provides a way to retrieve the current timestamp. It’s handy for knowing exactly when an event occurred within your trading strategy. When you're running a backtest, it gives you the timestamp related to the specific timeframe being analyzed. However, if you're using it in a live trading environment, you'll get the actual, real-time timestamp.


## Function getSymbol

This function retrieves the symbol you're currently trading with, based on the environment it's running in. Think of it as getting the "ticker" for the backtest. It returns a promise that resolves to the trading symbol as a string.

## Function getStrategySchema

This function lets you look up the details of a trading strategy you've defined within the backtest-kit framework. It’s like asking, "Hey, can you tell me everything about this particular strategy?" You provide the strategy's unique name, and the function returns a description of it, including things like the inputs it takes and the calculations it performs. This is useful for understanding how a strategy is structured and what its requirements are. Essentially, it provides a blueprint for a specific trading strategy.


## Function getSizingSchema

This function helps you find the rules for determining how much of an asset to trade based on its name. It's like looking up a recipe – you give it the name of a sizing strategy, and it gives you back the detailed instructions for how that strategy works. This allows your backtesting system to apply the correct sizing logic when simulating trades. You need to provide a unique identifier for the sizing strategy you’re looking for.

## Function getSignalState

This function helps you retrieve a specific value related to a trading signal. It automatically figures out which signal is active and uses that information.

If no active signal is found, it'll give you a warning and return a default starting value you provide.

It's designed to be used when you're building strategies that track performance on a per-trade basis – particularly useful for those involving large language models and strategies that want to accumulate information like how long a trade is open or its maximum gain.

The function adapts to whether you're in a backtesting or live trading environment.

You provide the trading symbol and a default value, and the function handles the rest, providing the signal's state information.

## Function getSessionData

This function allows you to retrieve data that's specifically saved for a particular trading symbol during a backtest or live trading session. Think of it as a temporary storage space that remembers information across multiple candles within a single run, and can even last if the program restarts.

It’s perfect for things like storing the results of complex calculations, keeping track of intermediate steps in your trading strategy, or caching the output of AI models. 

The function automatically figures out if it's running a backtest or a live trade, so you don’t have to worry about setting that up yourself.  You simply provide the symbol (like "BTC-USD") to access the associated session data. If there's no data for that symbol, it will return null.

## Function getScheduledSignal

This function lets you retrieve the signal that's currently set up to run on a schedule. Think of it as checking what automated signal is active right now for a specific trading pair. 

If no scheduled signal is running, it won't return anything – it'll be like it doesn't exist. 

It cleverly figures out whether you're running a test or a live trading scenario automatically.

You just need to tell it which trading pair (like BTC/USDT) you're interested in.

## Function getRiskSchema

This function helps you find the specific details of a risk measure you've already set up in your backtesting environment. Think of it like looking up a definition - you give it the name of the risk you’re interested in, and it returns all the information associated with that risk. This is useful when you need to understand the calculations or parameters involved in a particular risk assessment. The name you provide must be a unique identifier you've previously defined.

## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candle data for a specific trading pair and timeframe. It's designed to be flexible, allowing you to specify the number of candles you want, as well as start and end dates. 

You can control how far back the data goes using the `sDate` and `eDate` parameters, or just request a specific number of candles with the `limit` parameter. The function automatically handles calculations for the date range or starting date when you only provide some parameters.

Importantly, the function is designed to respect the execution context and prevent any potential issues with looking into the future when analyzing trading strategies.

Here's what you can do with the parameters:

*   Specify a start date, end date, and a limit.
*   Provide only a start date and end date, and it will figure out the number of candles.
*   Just give an end date and a limit, and it calculates the start date.
*   Give a start date and a limit, and it will fetch candles up to that point.
*   If you only give a limit, it will use the current execution time as a reference point to fetch candles backward.

The function returns an array of candle data objects. 

You'll need to provide the symbol (like "BTCUSDT") and a valid timeframe (like "1h" or "30m").

## Function getPositionWaitingMinutes

This function helps you understand how long a trading signal has been waiting to be executed. It tells you the number of minutes a signal has been pending, which can be useful for assessing the responsiveness of your trading system. 

If there isn't a scheduled signal for the given trading pair, the function will return null.

To use it, you simply provide the symbol of the trading pair you’re interested in, like "BTCUSDT," and it will return the waiting time or null.

## Function getPositionPnlPercent

This function lets you quickly see how your open positions are performing in terms of unrealized profit or loss, expressed as a percentage. It takes the trading symbol (like "BTC/USDT") as input. 

It cleverly considers factors that impact real trading, such as partial position closures, dollar-cost averaging, slippage, and trading fees. If you don't have any open positions based on pending signals, it will return null. The function also automatically figures out whether you're in a backtesting or live trading environment and fetches the current market price for accurate calculations.


## Function getPositionPnlCost

This function helps you understand the current unrealized profit or loss on a trade you're holding. It essentially tells you how much money you've gained or lost if you were to close your position right now, based on the current market price. 

It takes into account a lot of factors that impact actual profitability, like any partial closes you've made, the cost of your initial investments (including slippage and fees), and uses the average price to calculate this value. 

If you don't have an active trade open, the function will return null. Importantly, it figures out whether you're running a backtest or a live trade automatically and gets the current price for you. You just need to tell it the symbol of the trading pair you're interested in.


## Function getPositionPartials

getPositionPartials lets you check the history of partial profit or loss closures for a specific trading pair. It gives you a list of events detailing when and how much of a position was closed using functions like commitPartialProfit or commitPartialLoss. If no trades are currently in progress, it will return null. If partial closures have happened, it'll provide an empty array. 

Each entry in the list tells you the type of closure (profit or loss), the percentage of the position closed, the price at which it was executed, the cost basis at the time, and the number of entries included at that point. To use it, you simply provide the symbol of the trading pair you're interested in.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing a partial position twice at roughly the same price. It examines existing partial close orders and sees if the current price you’re considering falls within a defined range around those prices. 

Essentially, it's a safety check to prevent issues where multiple partial closes trigger very close together.

You provide the trading symbol and the current price you want to check.  Optionally, you can customize the allowable tolerance range around the existing partial close prices, but if you don’t, it defaults to a 1.5% range above and below the existing price. The function tells you whether the current price falls within that tolerance zone of any existing partials. If there are no partials or signals, it returns false.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trade (identified by its symbol) experienced its biggest loss. It tells you the exact timestamp – the date and time – when the price reached its lowest point during that trade's existence. 

If there's no active trade for that symbol, the function won't be able to provide a timestamp and will return null.

You simply need to provide the trading symbol (like 'BTCUSDT') to this function to get the timestamp.


## Function getPositionMaxDrawdownPrice

This function helps you understand the risk associated with a specific trading position. It calculates the lowest price your position experienced while it was open. Essentially, it shows you the maximum drawdown, revealing how far your position’s value dipped during its lifetime.

If there's no active signal for the specified trading pair, the function will return null, meaning it can't provide drawdown information.

You provide the trading pair symbol, like "BTCUSDT", to identify the position you're interested in.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It tells you the percentage of profit or loss you experienced at the point when the position reached its biggest drawdown. Essentially, it's looking back at the worst moment for that trade and giving you a snapshot of the PnL at that time. You need to provide the trading pair symbol (like 'BTCUSDT') to use this function. If there aren't any active trading signals, it won’t return a value.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position's worst performance. It calculates the profit and loss (expressed in the quote currency) that occurred when the position hit its lowest point. Think of it as a way to quantify the 'pain' of a drawdown.

If there are no signals related to this position, the function will indicate that by returning null. You simply provide the trading pair symbol, like 'BTC-USDT', to get this drawdown-related cost for that specific position.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back in time your position experienced its biggest loss. It tells you the number of minutes that have passed since the lowest point in your trading position's value.

Think of it as a way to measure how long ago things got really tough for your trade.

The value will be zero if the position just hit its lowest point.

If there’s no active trade currently running for the specified symbol, the function will return null.

You provide the trading pair symbol, like "BTCUSDT", to get the drawdown time for that particular position.

## Function getPositionLevels

`getPositionLevels` helps you check the prices at which you've entered a position using dollar-cost averaging (DCA). It gives you a list of prices – the initial entry price is always first, followed by any prices added later through the `commitAverageBuy` function. 

If there's no active trading signal, this function will return nothing. If you made just the initial entry and no further DCA buys, it will return an array containing only the original entry price. You provide the trading pair symbol, like "BTCUSDT," to identify the position you're inquiring about.

## Function getPositionInvestedCount

This function tells you how many times a DCA (Dollar-Cost Averaging) has been used for a specific trading pair.

It essentially counts up the number of times you've added to your position after the initial buy.

A value of 1 means it was just the original buy, while a higher number means you've layered in additional buys.

If there's no active trade happening, the function will return null. 

You need to provide the symbol, like 'BTCUSDT', to check the DCA count for that specific trading pair.


## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair, like BTC-USDT. 

It calculates the total cost based on all the times you’ve bought into that position, using a default cost value if one wasn't explicitly set.

If there are no open buy orders or signals, it will return null. 

The function knows whether it's running in a backtest or a live trading environment, so you don’t need to worry about that. 

You simply provide the trading symbol as input, and it gives you the dollar amount.


## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position reached its peak profit. It looks at a given trading pair, like BTCUSDT, and tells you the exact timestamp – a date and time – when that position made the most money. 

If there's no trading signal associated with the position, the function will return null, meaning it can’t determine a profit peak. 

You provide the symbol of the trading pair you’re interested in to the function.


## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It essentially remembers the best price for your trade – whether you're buying (long) or selling (short) – since it started.

Initially, it starts with the price you bought or sold at and the time you did it. 

As new price data comes in, it constantly updates that "best price" based on how your position is performing. For a long position, it looks for the highest price above your entry price. For a short position, it searches for the lowest price below your entry price.

You'll always get a value back – it will never be empty when a position is open.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a particular trade has been trending away from its best possible profit. It calculates the time, in minutes, since the trade reached its highest profit level. 

Think of it as a way to see how far a trade has fallen from its peak – a zero value means it's currently at its best, while a larger number indicates it's moved down from that point.

If no trade signals are active, this function won't return any data. You need to provide the symbol of the trading pair you're interested in to get this information.


## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its most profitable point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage. Essentially, it tells you how much room there is for improvement or how much potential loss might be lurking. If there's no active trading signal for the specified trading pair, the function won't return a value. You'll need to provide the trading pair's symbol (like "BTCUSDT") to get the information.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your trading position is from its potential peak profit. It calculates the difference between the highest profit you could have made and what you've made so far, ensuring the result is never negative. If there isn't a pending trade signal for the specified trading pair, the function won't return a value. You simply need to provide the trading pair's symbol, like 'BTC-USDT', and it will give you a number representing that profit distance.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have realistically reached its highest potential profit while still breaking even. 

It checks a specific trading pair, like BTC/USD, and determines if, based on the price data, it was possible for the trade to reach its peak profit level without incurring a loss.

If there are no active trading signals for that pair, the function will let you know by returning null. 

You just need to provide the trading symbol as input.

## Function getPositionHighestPnlPercentage

This function lets you peek into a past trade to see the highest percentage profit it ever reached. It tells you the point where the trade was doing the absolute best, during its entire lifespan. 

To use it, you simply provide the trading pair symbol, like "BTCUSDT". 

The function will return a number representing that peak profit percentage. If there’s no available data for the position, it will return null.

## Function getPositionHighestPnlCost

This function helps you understand the financial performance of a specific trading position. It tells you the profit and loss cost, expressed in the currency of the traded asset, that occurred when the position was at its most profitable point. Think of it as pinpointing the cost associated with reaching the peak of your trading gains for a particular symbol. If there’s no signal available, it will return null. You just need to specify the trading pair symbol you are interested in.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the risk exposure of a trading position. It calculates how far your potential profits are from the lowest point (the "trough") of any losses you’ve experienced. Essentially, it shows you the buffer you have against further declines.

The result is expressed as a percentage – a higher percentage means a greater safety margin.

If there isn’t any activity yet for the specified trading pair, the function won't be able to provide a value.

You just need to provide the symbol of the trading pair you're interested in, like 'BTCUSDT'.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position is currently exposed to potential losses compared to its lowest point. It calculates the difference between your current profit and loss and the lowest profit and loss reached during the trading period. Essentially, it reveals the distance you've recovered from your most significant drawdown. If no trading signals exist for the specified symbol, the function won't return a value. You just need to provide the trading pair symbol to get this insight.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you understand how long a trading position is expected to last. It gives you an estimated duration in minutes based on the initial signal that created the position.

If there isn’t a current, active trading signal, it will return null.

To use it, you simply provide the trading pair symbol, like "BTC-USDT". The function then returns a promise that resolves to the estimated duration in minutes, or null if no signal exists. It's useful for tracking and anticipating the expected lifetime of a position.

## Function getPositionEntryOverlap

This function helps you avoid accidentally placing multiple DCA entries at very similar price points. It checks if the current market price falls within a defined range around your existing DCA levels. 

Think of it as a safety net: it makes sure you’re not triggering a new DCA entry when the price is already close to a previous one.

The function returns `true` if the current price sits within the allowed tolerance around any of your existing DCA levels, meaning you should probably hold off on another entry. If there are no existing DCA levels, it returns `false`.

You can customize how wide that tolerance zone is using the `ladder` parameter, which lets you define the percentage range above and below each level.

## Function getPositionEntries

getPositionEntries helps you see how a trading position was built up, especially if you're using dollar-cost averaging (DCA). It provides a list of each time the position was adjusted—whether it was the initial buy or a later DCA commit.

You'll get details like the price at which each buy happened and the amount of money spent for each one.

If there’s no active trading signal, it will return nothing.  If a single buy was made without any DCA, you'll receive a list with only one entry. 

It requires the symbol of the trading pair you’re interested in to find the position entries.


## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position, taking into account any previous trades or adjustments. It essentially calculates a weighted average price, also known as DCA (Dollar-Cost Averaging) price, for your current open trade.

If you've made partial sales or added to your position over time, this function considers those changes when determining the effective price. If no trades have been made, it simply returns the original opening price. 

It's useful for tracking your overall cost basis and performance. The function will automatically determine if you're running a backtest or a live trading scenario. You just need to provide the trading pair symbol to get the price. If there's no open position to calculate, it will return null.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit. 

Think of it as a measure of how far your trade has fallen from its peak. 

The value will be zero right when the trade hits its best price, and then steadily increase as the price moves down. 

It uses the trading pair symbol to identify the specific trade you're interested in. 

If there's no active trade for that symbol, it won't return a value.

## Function getPositionCountdownMinutes

This function helps you figure out how much time is left before a trading position expires. It calculates this by looking at when the position became pending and comparing it to an estimated expiration time. 

If the estimated time has already passed, it tells you zero minutes remain.

It won't return a negative number, and if there’s no pending signal related to the position, it will return null. 

You need to provide the symbol of the trading pair (like BTC-USDT) to get the countdown time.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you understand how long a specific trading position has been open. It calculates the total minutes a position has been active, giving you insight into its duration. 

To use it, simply provide the symbol of the trading pair for which you want to know the active time.

If there's no active signal related to that position, the function will return null, indicating no relevant data to display.

## Function getPendingSignal

This function lets you check if your trading strategy has a pending order waiting to be triggered. 

It finds the signal that's currently set up but hasn't been acted upon yet.

If there's no pending signal, it'll tell you by returning nothing.

You just need to provide the symbol of the trading pair (like "BTCUSDT") to use it. It figures out whether it's running in backtesting or live trading automatically.

## Function getOrderBook

This function retrieves the order book details for a specific trading pair, like BTCUSDT. It pulls data from the connected exchange.

You can specify how many levels of the order book you want to see; if you don't provide a number, it will default to a maximum depth. 

The function considers the current timing of the backtest or live trading environment when gathering this information, although the way the exchange uses that timing can vary.

## Function getNextCandles

This function helps you grab a batch of historical candles for a specific trading pair and timeframe. 

Think of it as requesting a set of candles that come *after* the current point in time that your backtest is using.

You provide the symbol like "BTCUSDT," choose a candle interval (e.g., "1h" for one-hour candles), and specify how many candles you want to retrieve.

It uses the underlying exchange's mechanism for fetching future candles, ensuring you get data consistent with how the exchange provides it.


## Function getMode

This function tells you whether the backtest-kit is currently running a simulation (backtest mode) or is actively trading in a live environment. It returns a simple indication: either "backtest" or "live". This is helpful for adapting your trading logic to different scenarios. Essentially, it lets your code know whether it's practicing or performing.


## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific asset, like BTC/USDT. It's handy for things like pausing your trading strategy after a loss to avoid impulsive decisions. 

It checks both your historical backtest data and your current live data to find that last signal. If there’s been no signal at all, it will return nothing. The function knows whether it's running a backtest or live trading environment, so you don't need to tell it. 

You just need to provide the symbol of the asset you’re interested in.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the riskiness of a trading strategy. It calculates the maximum difference between the highest profit and the lowest loss experienced by a position.

Think of it as measuring how far a trading strategy falls from its peak.

The result is expressed as a percentage, and it will always be zero or positive.

If there's no active trading signal, the function won't be able to compute this value and will return null.

You just provide the trading pair symbol (like BTC-USDT) to get the drawdown percentage.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss your position experienced.

Essentially, it tells you the maximum 'hit' you could have taken before your profits started to recover.

The result represents a monetary value, showing the potential downside risk. 

To get this value, you specify the trading pair, like 'BTC-USDT', and the function will do the calculation. If no trading signals are available, it won't provide a result.

## Function getLatestSignal

This function helps you find the most recent signal, whether it's a pending order or a completed trade, for a specific trading pair. It doesn't care if the signal is still open or already closed; it simply grabs the one that was recorded most recently. This is really handy for things like setting up cooldown periods – for instance, preventing new trades immediately after a stop-loss event, regardless of how the trade ended.

The function checks both your historical trading data and your live trading data to find this latest signal. If no signals exist for that pair, it will return null. You don't need to worry about whether you’re running a backtest or a live trade; the function figures that out automatically.

You just need to provide the symbol, like "BTCUSDT", to identify which trading pair you’re interested in.

## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint for a specific frame within your backtest setup. Think of it like looking up a template – you give it the frame's name, and it returns the detailed schema defining that frame's structure and data. This function is essential when you need to understand the exact format and expected data types for a particular frame. It uses a unique identifier (frame name) to pinpoint the correct schema.

## Function getExchangeSchema

This function lets you fetch details about a specific cryptocurrency exchange that backtest-kit knows about. It's like looking up the blueprint for how that exchange works within the framework. You provide the name of the exchange you're interested in, and it returns a set of instructions describing its data format and capabilities. This is useful for understanding how to work with data from different exchanges within your backtesting strategies.

## Function getDefaultConfig

This function gives you a set of default settings to use as a starting point when configuring your trading backtests. It provides a read-only object filled with numbers and boolean flags that control various aspects of the framework’s behavior, like how often it checks prices, limits on data requests, and settings for generating reports. Think of it as a template – you can look at this to understand all the potential adjustments you can make and what they do by default. It's useful to review if you are unsure how to set up your backtest environment.

## Function getDefaultColumns

This function provides you with a set of predefined columns that can be used to build reports, specifically for backtesting and related events. 

It gives you a ready-made structure for columns displaying information like closed trades, heatmap data, live market data, partial fills, breakeven points, performance metrics, risk events, scheduled tasks, strategy events, synchronization status, profit tracking, maximum drawdown, walker signals and strategies. 

Think of it as a template for organizing and presenting data within your trading analysis reports. You can look at the returned configuration to understand the possible columns and how they're initially set up.

## Function getDate

This function provides a way to get the date relevant to your trading simulation or live execution. 

When you're backtesting, it returns the date associated with the timeframe you're currently analyzing. If you’re running a live trade, it gives you the real-time date. It’s useful for synchronizing your logic with the correct timeline.


## Function getContext

This function retrieves information about the current method's environment. Think of it as getting a snapshot of where the code is running within your backtest. It provides a context object containing details that can be useful for advanced scenarios or debugging. You can use this to access specific details about the method's execution.

## Function getConfig

This function lets you peek at the framework's global settings. It provides a snapshot of all the configuration values, like how often things are checked, limits on data processing, and whether certain features are turned on or off.  Importantly, it gives you a copy of the settings, so changing what you see won't actually change how the framework runs. Think of it as a read-only view into how everything is set up.

## Function getColumns

This function gives you a peek at how your backtest data will be displayed in the markdown report. It gathers all the column definitions used for different parts of the report – like the closed trades, heatmap data, live data, partial fills, breakeven points, performance metrics, risk events, scheduling, strategy events, synchronization, highest profits, maximum drawdowns, walker profit/loss, and strategy results. Think of it as a way to see the blueprint of your report columns before it's actually built, ensuring everything is set up correctly. It returns a copy so you don’t change the original configuration unintentionally.

## Function getClosePrice

This function lets you quickly retrieve the closing price from the most recent candle for a specific trading pair and timeframe. 

Need to know what price a trade closed at? This is your tool.

You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the timeframe you're interested in, such as "1m" for one-minute candles or "4h" for four-hour candles. The function then promises to return just the closing price as a number.

## Function getCandles

This function lets you retrieve historical candlestick data from an exchange you’ve connected to your backtesting system. You can specify a trading pair, like "BTCUSDT," and choose a time interval like "1h" for hourly candles.  It returns a promise that resolves to an array of candle data points, allowing you to analyze past price movements. You can control how many candles you request with the `limit` parameter. The function automatically fetches data going backwards from the current time the backtest is using.


## Function getBreakeven

This function helps you determine if a trade has become profitable enough to cover the fees and potential slippage associated with it. It takes the trading pair symbol and the current market price as input. The function will then calculate a breakeven threshold based on pre-defined constants that represent slippage and fees. If the current price has moved beyond this threshold, indicating a profit sufficient to cover those costs, it returns true. This is useful for understanding if a trade has essentially "paid for itself." The function figures out if you're in a backtesting or live trading environment automatically.

## Function getBacktestTimeframe

This function lets you find out the historical dates available for testing a specific trading pair, like BTCUSDT. It returns a list of dates, representing the timeframe that's been set up for your backtest. Essentially, it tells you which dates your backtesting simulation will cover for the chosen trading pair. You provide the symbol of the trading pair you’re interested in, and it gives you back the date range.

## Function getAveragePrice

This function, `getAveragePrice`, helps you figure out the average price of a trading pair like BTCUSDT. It uses a method called VWAP, which considers both price and trading volume. Specifically, it looks at the last five minutes of trading data, calculating a "typical price" from the high, low, and closing prices, and then weighting those prices by the volume traded. If there’s no trading volume for a period, it simply averages the closing prices instead. You just need to provide the symbol of the trading pair to get the average price.

## Function getAggregatedTrades

This function retrieves historical trade data for a specific trading pair, like BTCUSDT. It pulls this information from the connected exchange. 

You can request a limited number of trades by specifying a `limit`, or if you leave it out, it will retrieve all trades within a defined time window. The trades are fetched in reverse chronological order, going back from the current time. Essentially, it helps you access past trading activity for a given symbol.

## Function getActionSchema

This function lets you look up the details of a specific action within your backtest. Think of it as finding the blueprint for how a particular trading decision should be executed. You provide the action's unique name, and it returns a description of what that action involves – the data it uses and the steps it performs. This helps ensure consistent and well-defined trading logic in your backtests.


## Function formatQuantity

This function helps you display the correct number of decimal places when showing how much of a specific asset you're trading. It takes the trading pair (like BTCUSDT) and the raw quantity as input. It then automatically figures out the correct formatting based on the exchange’s rules to ensure the number looks right. Ultimately, it returns a string representation of the quantity.

## Function formatPrice

This function helps you display prices correctly for different trading pairs. It takes a symbol like "BTCUSDT" and a price value as input.

It then formats the price according to the specific rules of that exchange, ensuring the right number of decimal places are shown. This makes your displayed prices look consistent and accurate.

## Function dumpText

The `dumpText` function lets you record raw text data, like logs or analysis, associating it with a specific signal within your backtesting or live trading environment. Think of it as a way to save notes related to a particular trade or event. It handles the details of which signal it's connected to and whether you're in a backtest or live trading scenario, so you don't have to worry about those complexities. 

You provide the function with information like a bucket name, a unique identifier for the data, the actual text content, and a short description to help you understand what it represents later. The function then takes care of the rest, ensuring the data is correctly stored and linked to the appropriate signal.


## Function dumpTable

This function helps you display data in a clear, table format. It takes an array of objects, essentially rows of data, and presents them neatly.

Think of it as a way to quickly inspect the results of a backtest or trading simulation.

It automatically figures out whether you're running a backtest or live trading, and uses the current signal to organize the output.

The table headers are dynamically generated based on all the different keys found in your data, ensuring all relevant information is visible. You just need to provide the data, a bucket name, a dump ID, a description, and it handles the rest.


## Function dumpRecord

This function lets you save a specific piece of data, essentially a record of key-value pairs, related to a particular trading signal. Think of it as archiving details for later inspection or analysis. It cleverly figures out whether you're running a test or a live trading scenario all by itself, based on its environment.  You provide the data you want to save, a name for the data "bucket," a unique identifier for the dump, and a brief explanation of what the record represents.  It handles the complexities of the signal process, making it straightforward to store relevant information about your trades.


## Function dumpJson

The `dumpJson` function helps you record data during your backtesting or live trading sessions. It takes a JavaScript object and turns it into a formatted JSON block, associating it with a specific identifier and description. This function is designed to automatically handle the context of your execution – whether you're running a backtest or a live trade – and seamlessly manage signals, making it easy to track and review your trading activity. You provide the function with a bucket name, a unique identifier, the object you want to dump as JSON, and a descriptive message for clarity.


## Function dumpError

This function helps you report detailed error information, linking it to a specific data bucket and a unique dump ID. Think of it as a way to create a structured error report that's easy to track and understand within the backtest or live trading environment. It automatically handles the context of where the error occurred, so you don’t have to manually specify signal details. This makes debugging and understanding issues much simpler.


## Function dumpAgentAnswer

This function helps you examine detailed conversations between the agent and the system. It essentially creates a snapshot of the message history associated with a specific task or signal.

You provide information like the bucket name, a unique dump ID, the actual messages exchanged, and a short description to identify the dump.

The function is clever; it figures out whether you're running a backtest or a live trading session automatically, simplifying the process. It also resolves the signal associated with the dump, making it easier to correlate messages with specific trading events. This is especially useful for debugging and understanding agent behavior.


## Function createSignalState

This function helps you manage and track the state of your trading signals in a structured way. It generates a pair of functions, `getState` and `setState`, that are tied to a specific "bucket" and an initial value you provide. 

The neat thing is, you don't need to manually specify a signal ID – it automatically figures out whether you're in backtest or live mode. 

It's particularly useful for strategies that want to collect data about each trade, like how long a trade stays open or its peak profit, which is really helpful for more complex strategies driven by AI. The examples given show strategies that aim for modest profits with limited risk and specific exit rules based on trade duration and peak performance.


## Function commitTrailingTakeCost

This function lets you manually set the take-profit price for a trade. It simplifies adjusting the take-profit, figuring out the correct percentage shift from the original take-profit distance. The framework handles the details of knowing whether you're in a backtesting or live trading environment, and gets the current price to calculate everything accurately. You just need to tell it the symbol and the desired take-profit price.

## Function commitTrailingTake

The `commitTrailingTake` function helps you manage your trailing take-profit levels for open trades. It recalculates the take-profit price based on a percentage shift applied to the original take-profit distance you set when the trade was initially placed. 

It’s really important to remember that it always calculates from that original take-profit, not any intermediate adjustments you've made along the way – this prevents compounding errors.

The percentage shift you provide will be applied as an adjustment; if you’re trying to make the take-profit more conservative, use a negative shift. A positive shift will make it more aggressive. 

The system is designed to be careful about changes. It will only update the take-profit if the new value is more conservative. For long positions, it only accepts take-profits closer to the entry price, and for short positions, it only accepts take-profits further from the entry price. This ensures you're not accidentally loosening your stop too much.

Finally, this function intelligently knows whether it's running in a backtest or live trading environment based on how it’s being used. 

It needs the trading symbol, the percentage shift you want to apply, and the current price of the asset.

## Function commitTrailingStopCost

This function helps you update a trailing stop-loss order to a specific price. 

Essentially, it takes the price you want your stop-loss to be at and figures out how to adjust the trailing stop-loss to achieve that.

It's designed to simplify the process - it handles things like determining whether you’re in a backtest or live trading environment, and retrieving the current price to make the calculation. You just tell it the symbol you're trading and the desired stop-loss price.


## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune the distance of a trailing stop-loss order. Think of it as an ongoing adjustment to protect your profits.

It’s important to know that this function calculates adjustments based on the *original* stop-loss distance you set initially, not the current, potentially adjusted one. This helps avoid small errors from building up over time.

The percentage shift you provide determines whether the stop-loss gets tighter (negative shift) or looser (positive shift). When you adjust it, the system will only accept changes that actually improve your protection—it won't move the stop-loss closer to your entry unless it's truly a better position.

For long positions, the stop-loss can only move higher, and for short positions, it can only move lower.

This function handles automatically whether it's running in a backtest or a live trading environment.

You'll need to provide the trading pair's symbol, the percentage adjustment you want to make, and the current market price.

## Function commitSignalNotify

The `commitSignalNotify` function lets you send out informational messages related to your trading strategy. Think of it as a way to leave notes or alerts about what's happening during a trade, without actually changing your positions.

It’s helpful for things like logging important decisions made by your strategy, triggering external notifications, or just keeping track of events within a trade.

The function automatically pulls in key details like whether you’re in backtest or live mode, the name of your strategy, the exchange, and the timeframe – so you don’t have to specify them. It also automatically grabs the current price for the symbol. You can add extra information to these notifications using the `payload` parameter to make them even more informative.

## Function commitPartialProfitCost

This function lets you automatically close a portion of your trade when you've reached a specific profit level, measured in dollars. It's a handy shortcut, as it figures out how much of your position to close based on the dollar amount you specify. 

Essentially, you tell it how much money you want to lock in as profit, and it handles the calculations to determine the corresponding percentage of your position to close. 

The system assumes the price is moving in a favorable direction toward your take profit target. It determines the current market price to execute the partial close, and it adjusts based on whether you're running a backtest or a live trade.

You'll need to provide the symbol of the trading pair and the dollar amount you want to realize as profit.

## Function commitPartialProfit

This function lets you automatically close a portion of your open trade when the price moves in a profitable direction, essentially taking some profits along the way. It’s like setting up a little safety net to secure gains as your trade moves towards your target profit. You specify the trading symbol and the percentage of your position you want to close, and the function takes care of the rest, adapting to whether it's being used in a backtesting simulation or a live trading environment. It's designed to help you manage risk and lock in profits as your trades progress.


## Function commitPartialLossCost

This function lets you partially close a trading position when the price is moving towards your stop loss, and you want to limit your losses by a specific dollar amount. It simplifies the process by automatically calculating the percentage of your position to close based on your initial investment cost. You just tell it the symbol you're trading and the dollar amount you want to close, and it handles the rest, even adapting to whether you're in a backtesting or live trading environment. It also automatically finds the current price to ensure accurate execution.


## Function commitPartialLoss

This function lets you partially close an open position when the price is moving in a losing direction. It's useful for managing risk and reducing potential losses on a trade. You specify the symbol of the trading pair and the percentage of the position you want to close, up to 100%. The system automatically figures out whether it's running in a backtesting environment or a live trading environment.

## Function commitClosePending

This function lets you clear a pending order signal without interrupting your trading strategy. Think of it as manually cancelling a pending order that’s already been placed. It won't affect any scheduled signals or how your strategy operates, and it won't trigger a stop – your strategy will keep generating signals as normal. The system automatically knows whether it’s running in a backtest or live trading environment. You can optionally add a note or ID to the commit if you want to keep track of why you cleared the pending order.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal without interrupting your trading strategy’s operation. Think of it as a way to retract a signal you've prepared for future execution. It specifically clears the signal that's waiting for the price to reach a certain point (priceOpen activation). It's important to know that this action doesn't affect any signals that are already active, nor does it halt the strategy from creating new signals. The system will automatically adjust its behavior depending on whether you're running a backtest or a live trade.

You can optionally include extra information, like an ID or a note, with the cancellation, which can be helpful for tracking purposes.


## Function commitBreakeven

The `commitBreakeven` function helps you automatically manage your stop-loss orders. It's designed to shift your stop-loss to the entry price – essentially making your position risk-free – once the price has moved in your favor enough to cover transaction fees and a small slippage buffer. 

Think of it as a safety net; it guarantees you won't lose money on fees if the price moves slightly against you after a profitable move.

The function handles the details, figuring out the exact price threshold to use for the move and grabbing the current price for calculations. You just need to tell it which trading pair (symbol) you want to apply this to.


## Function commitAverageBuy

The `commitAverageBuy` function helps you add a new buy order to your trading strategy, specifically designed for dollar-cost averaging (DCA). It automatically calculates the current market price and incorporates it into your position's record, essentially creating a new "entry" for your averaging strategy. This function also keeps track of the average price you've paid for your position, and lets other parts of your system know that a buy has been made, which is useful for reporting or other actions. You specify which trading pair (`symbol`) you're buying, and the function takes care of the rest.

## Function commitActivateScheduled

This function lets you trigger a scheduled order to execute before the price actually hits the intended entry price. It’s useful when you want to proactively adjust your strategy based on market conditions. 

Think of it as a way to give a signal a little nudge—you're essentially telling it, "Hey, go ahead and activate now!"

The function takes the trading symbol as input. You can optionally provide additional information, such as a commit ID and a note for tracking purposes.  The framework will automatically handle whether you’re in a backtesting or live trading environment.


## Function checkCandles

The `checkCandles` function is designed to verify that your historical candle data aligns properly with the intended trading intervals. It performs a direct check of the timestamps stored in your persisted data, essentially confirming that the data is consistent. This process bypasses any intermediary layers when accessing your saved candle data. It’s a useful tool for ensuring the integrity of your backtesting data and identifying potential issues with how your candles were originally generated or stored.

## Function addWalkerSchema

This function lets you register a new "walker" to be used when comparing different trading strategies. Think of a walker as a way to run multiple strategies simultaneously against the same historical data. It then assesses how well each strategy performed, typically using a defined metric.

Essentially, you provide a configuration object that defines how this walker operates, and the framework remembers it for later use in your backtesting and comparison processes. This is crucial when you want to systematically evaluate and contrast various strategies.


## Function addStrategySchema

This function lets you register a trading strategy within the backtest-kit framework. When you add a strategy, the system will automatically check it for common issues like signal data problems, makes sure signals aren't being sent too frequently, and ensures it can safely handle situations where the system might unexpectedly restart. You provide a configuration object describing your strategy, and the framework takes care of the rest. This is a key step in setting up your trading strategy for backtesting or live trading.

## Function addSizingSchema

This function lets you tell the backtest-kit framework how to determine the size of your trades. Think of it as registering a plan for how much capital you want to risk on each trade. 

You provide a sizing schema, which is a configuration that outlines the strategy for sizing positions. This configuration includes details like whether you're using a fixed percentage of your capital, a more complex Kelly Criterion approach, or a method based on Average True Range (ATR). 

It also covers important risk parameters, sets boundaries for your position sizes, and allows for custom calculations through a callback function, giving you fine-grained control over how your trades are sized.


## Function addRiskSchema

This function lets you tell the backtest-kit framework about your risk management rules. 

Think of it as setting up guardrails for your trading strategies. 

It defines things like how many trades you can have running at once, and allows for more complicated checks, such as looking at how different strategies affect each other. 

Because different strategies use the same risk management system, it helps you see the overall risk of your entire portfolio. The framework keeps track of all your open trades, allowing you to use this information to decide whether a new trading signal should be executed.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe you want to use for your analysis. Think of it as defining a schedule for how your historical data will be organized into periods.

You provide a configuration object describing the timeframe – things like the start and end dates of your backtest, the interval (like daily, weekly, or monthly), and a function that will be called when new timeframes are generated. This lets you customize exactly how your data is chunked up for backtesting.


## Function addExchangeSchema

This function lets you tell backtest-kit about a new data source for an exchange, like Binance or Coinbase. Think of it as registering where your historical price data is coming from.

The exchange you register needs to be able to provide things like historical candlestick data, correctly format prices and quantities, and even calculate VWAP (a common trading indicator).

You pass in an object that describes how to access and use that exchange's data. This makes backtest-kit aware of your specific exchange and its characteristics.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want to use. Actions are a really powerful way to connect your trading strategy to other systems—think of it as a way to automate responses to events happening during a trade. 

You can use actions to do things like automatically update a state management system like Redux, send notifications to a Discord channel, log events, track metrics, or even kick off custom logic.

Each time your strategy runs, a new instance of your action is created, and it gets access to everything that’s happening – signals, profits, losses, and more.

To register a new action, you pass in an object describing its configuration to this `addActionSchema` function.
