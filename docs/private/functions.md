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

This function lets you store data, like trading decisions or indicators, in a special memory space that's tied to a specific trading signal. Think of it as saving a note related to a particular trade. 

It handles the technical details of knowing which signal it belongs to, and whether you're in a testing environment or live trading. You provide a name for the memory bucket, a unique ID within that bucket, the actual data you want to save, and a brief explanation of what the data represents.  The function then takes care of saving this data for later retrieval.

## Function warmCandles

This function helps speed up backtesting by proactively fetching and storing historical candlestick data. It downloads all the candles for a specified time period, from a starting date to an ending date, using a particular timeframe (like 1-minute, 5-minute, daily, etc.). This pre-loading of data means the backtesting process doesn't have to wait to download the candles during the simulation, leading to faster and more efficient backtests. The data is stored in a persistent storage location, so it's readily available for future use. You provide parameters to define the start date, end date, and the interval of the candles you want to download.


## Function waitForReady

This function ensures everything needed for trading is set up before you start. It waits, checking essential services – those handling exchanges, trading frames, and strategies – until they're fully ready. 

Think of it as a safety check at the beginning of your trading process.

It specifically takes longer and looks for more components when running a backtest (historical data) versus live trading.

If the setup takes too long, it doesn't throw an error, but it's up to you to handle any problems that arise later if something isn’t quite right. 

You can tell it whether you’re running a backtest or not, which affects what it checks for. By default, it assumes a backtest and waits for all components to be ready.

## Function validate

This function helps ensure your trading setup is correct before you run any tests or optimizations. It checks if all the entities you're using – like exchanges, strategies, and risk managers – are properly registered and exist within the system. 

You can tell it to validate specific entity types, or if you leave it blank, it will check everything. This makes it easy to do a complete sanity check on your whole backtesting configuration. Think of it as a quick way to catch potential errors before they impact your results.

## Function stopStrategy

This function lets you halt a trading strategy's signal generation. It's useful when you need to pause or interrupt a strategy’s activity. 

The strategy won't create any new trading signals after you call this function, but any existing signals will finish their process. Whether it's a backtest or a live trading session, the system will pause at a convenient time, typically when it's idle or a signal has finished executing. You specify which trading pair – for example, BTC-USDT – to stop the strategy for when calling this function.


## Function shutdown

This function lets you properly finish a backtest run, even if it’s being stopped unexpectedly. It signals to all parts of the backtest that it's time to wrap things up and clean up any temporary files or connections. Think of it as a way to say goodbye before the testing environment closes down, ensuring everything is left in a tidy state. It's particularly useful when handling interruptions like pressing Ctrl+C.

## Function setSignalState

This function lets you update a specific data value related to a trading signal, kind of like saving a temporary note associated with that signal. It's designed to work with strategies that track details about each trade, like how long it was open or its maximum profit.

The function automatically figures out if you’re in a backtesting environment or a live trading situation.

It handles finding the currently active signal; if one isn't found, it'll just let you know and won't do anything.

Think of it as a tool for sophisticated trading strategies that need to carefully monitor and adjust trades based on various factors, particularly those involving large language models. It's built to keep track of important metrics during each trade.

Here's a quick rundown of the input:

*   `symbol`: The trading pair you're dealing with (e.g., BTC/USD).
*   `dispatch`: A way to pass data along, depending on how your strategy is structured.
*   `dto`: A container holding the new data value and the name of a “bucket” where it’s stored.

## Function setSessionData

The `setSessionData` function lets you store information that's specific to a particular trading setup – like a symbol, strategy, exchange, and timeframe combination. This data sticks around even as new candles come in during a backtest or live trading session, and it can even survive if the program restarts. Think of it as a way to remember things between candles or between program runs, such as the results of complex calculations or data that you want to reuse. You can clear out this stored data by passing `null` as the value. The function figures out whether it's running in backtest or live mode automatically.


## Function setLogger

You can now control how backtest-kit reports its activity by providing your own logging system. This lets you direct messages to a file, a database, or any other logging destination you prefer. The framework will automatically include useful information like the strategy name, exchange, and the asset being traded alongside each log message, making it easier to understand what's happening during backtesting. Simply provide an object that follows the `ILogger` interface to this function, and backtest-kit will use it for all its logging needs.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates. Think of it as tweaking the settings to suit your specific testing needs. You can modify various framework behaviors by providing a configuration object, which allows you to selectively change only the settings you want.  There's also an "unsafe" option, mainly used for testing scenarios where you need to bypass some of the usual checks.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports. Think of it as tailoring the report to show exactly the data you care about.

You can provide a new configuration to override the default column definitions used for any report.

The system will automatically check your new column configuration to make sure it’s structurally sound – unless you use the `_unsafe` flag, which is mainly for testing purposes when you need to bypass this check.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system. Think of it as a powerful search tool for your backtest or trading environment. You provide it with a bucket name – essentially, the category of memory you’re looking in – and a search query. 

It uses a sophisticated technique called BM25 to rank the results, ensuring you get the most relevant entries first. 

The function intelligently determines whether it's running in a backtest or live environment, and it automatically figures out the current signal it's working with from its surroundings. The result is an array of memory entries, each including an ID, a score representing its relevance to your query, and the content itself. You can specify the type of content you expect (using generics) to make TypeScript happy.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a trading framework environment, but without actually needing a full backtest setup. Think of it as creating a pretend environment for testing or quickly accessing things like the current timeframe.

You can customize this mock environment by providing details like the exchange name, strategy, timeframe, and even whether it's a live or backtest mode. If you don't specify these, it will use default placeholder values, effectively creating a very basic live trading context.

This is particularly helpful when you want to use functions that depend on the trading context (like getting the current time or accessing data) without setting up a complicated backtest. Essentially, it simplifies testing and experimentation.

## Function removeMemory

This function lets you clear out old memory entries associated with a specific signal. Think of it as tidying up your signal's history to keep things running efficiently.

It automatically figures out whether you're running a backtest or a live trading session, so you don't have to worry about that.

You provide two pieces of information: the name of the bucket (where the memory is stored) and the unique ID of the memory entry you want to remove.  This function takes care of the details of actually removing that memory.


## Function readMemory

The `readMemory` function lets you retrieve data that's been stored in memory, specifically linked to the current signal being processed. Think of it as accessing a saved value that's relevant to what's happening right now.  It figures out whether you’re in a backtesting or live trading environment on its own, so you don't have to tell it. 

To use it, you provide a small object that includes the bucket name (where the data is stored) and the memory ID (a unique label for the specific piece of data). It then returns a promise that resolves with the data, which will be in a format you specify as the generic type `T`.

## Function overrideWalkerSchema

This function lets you tweak existing walker configurations, which are used for comparing strategies. Think of it as a way to modify a strategy’s settings without rebuilding it entirely. You provide a partial configuration – just the settings you want to change – and the function returns a complete, updated walker schema. This is useful when you need to make small adjustments to a walker for more targeted comparisons.

## Function overrideStrategySchema

This function lets you modify a trading strategy that’s already set up within the backtest-kit framework. Think of it as making targeted adjustments – you can update specific parts of a strategy's configuration without having to redefine the entire thing. It's helpful when you want to tweak a strategy's settings after it’s been initially registered. You just provide the parts you want to change, and the rest of the strategy stays as it was. This allows for flexible and incremental strategy adjustments.


## Function overrideSizingSchema

This function lets you tweak existing position sizing rules within the backtest kit. Think of it as a way to make small adjustments to a sizing strategy without completely replacing it. You provide a partial configuration – just the parts you want to change – and the function merges these changes with the original sizing schema. It's useful for fine-tuning your trading system's risk management.

## Function overrideRiskSchema

This function lets you modify a risk management setup that's already in place. Think of it as making tweaks, rather than starting from scratch.  You provide a piece of a new configuration – just the parts you want to change – and it updates the existing one, leaving the rest untouched. It's useful for adjustments and fine-tuning your risk controls. The function returns a promise that resolves to the updated risk schema.

## Function overrideFrameSchema

This function lets you tweak an existing timeframe configuration used in your backtests. Think of it as a way to adjust specific parts of a timeframe without having to redefine the entire thing. You provide a partial configuration – just the things you want to change – and it updates the original timeframe settings. Any settings you don't specify remain as they were. It returns the modified, complete timeframe configuration.

## Function overrideExchangeSchema

This function lets you modify an already set-up data source for an exchange. Think of it as tweaking an existing exchange’s settings instead of building one from scratch.  You can update specific parts of the exchange configuration, like its data format or trading rules. The parts you *don't* specify will stay the same. It’s a handy way to adjust settings without completely redefining the exchange connection.


## Function overrideActionSchema

This function lets you tweak an existing action handler within the backtest-kit framework. Think of it as a way to make small adjustments to how actions are handled without needing to completely replace the original setup. You can update specific parts of the configuration, like callbacks or logic, while leaving everything else untouched. This is really handy for things like making environment-specific changes, dynamically switching handlers, or adjusting how actions behave without altering the core trading strategy. It takes a partial action configuration as input, letting you specify precisely what you want to modify.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs through different strategies. It calls your provided function after each strategy finishes executing, giving you a chance to monitor what's happening. To ensure smooth operation, the function handles events one at a time, even if your callback function takes some time to process. This makes it a reliable way to get updates on your backtest's journey. The function returns an unsubscribe function so you can stop listening to these updates when you no longer need them.

## Function listenWalkerOnce

The `listenWalkerOnce` function lets you temporarily listen for events from a walker and react to the first one that meets certain conditions. Think of it as setting up a temporary listener that automatically goes away after it hears the first matching event. You define a filter to specify which events you're interested in, and then provide a callback function that will be executed only when the first matching event arrives. This is great for situations where you need to wait for a specific state or trigger within the walker’s progress and then take action. Once that event is processed, the listener is automatically removed.

It takes two arguments: a filter function that determines which events to listen for, and a callback function to execute when a matching event is found. The filter function receives a `WalkerContract` object representing the event, allowing you to filter based on its properties. The callback function also receives the same `WalkerContract` and is executed once with that event data. The function returns an unsubscribe function that can be called to manually stop the listener before it naturally unsubscribes.

## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes. It's designed to handle completion events from the testing process, ensuring events are processed one after another, even if your notification function takes some time to complete. Essentially, it’s a way to know when all your strategies have been tested and results are ready. You provide a function that will be called when the backtest is done, and that function will be executed safely without interrupting other processes.


## Function listenWalker

The `listenWalker` function lets you keep an eye on how a backtest is progressing. It's like subscribing to updates as each trading strategy finishes running within the backtest. These updates, called "WalkerContract" events, are delivered one at a time, even if the code you provide to handle them takes some time to execute. To ensure things stay organized, it uses a queue to prevent multiple updates from happening at once. You give it a function – this is the code that will be called whenever a strategy completes, receiving information about that strategy's outcome. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenValidation

This function lets you keep an eye on potential issues during risk validation – specifically, when those validation checks encounter errors. Think of it as a way to be alerted when something goes wrong during the signal checking process.

It allows you to set up a listener that gets triggered whenever a validation error occurs. This is incredibly helpful for tracking down and fixing problems in your validation logic. 

Importantly, any errors are handled one at a time to prevent unexpected behavior caused by simultaneous processing. You can provide a function to handle these errors, and this function will be executed whenever a risk validation error surfaces. It returns a function you can call to unsubscribe from receiving these notifications.

## Function listenSyncOnce

This function lets you listen for specific synchronization events and run a piece of code just once when those events happen. Think of it as setting up a temporary listener that only reacts once. It's handy when you need to make sure something happens in sync with an external system or process, because the trading system will pause until your code finishes running. You provide a filter to determine which events should trigger your code, and then your code will execute, handling the matched event. If your code takes some time to complete, like if it involves promises, the trading system will wait for it to finish before continuing.

## Function listenSync

This function lets you hook into the backtest-kit framework's signal synchronization process, allowing you to perform actions that need to happen alongside the trading signals. It's particularly helpful when you need to coordinate with external systems or services during the opening or closing of trades.

Essentially, it registers a callback function (`fn`) that gets triggered whenever a signal synchronization event occurs – for example, when a signal is about to be opened or closed.

Importantly, if the provided callback function (`fn`) returns a Promise, the framework will pause the trading execution until that Promise resolves. This ensures that any async operations related to the signal synchronization are completed before moving forward.  A `warned` parameter is available, but its purpose is not documented.

The function returns a function that, when called, will unsubscribe the listener.


## Function listenStrategyCommitOnce

This function lets you set up a listener that reacts to changes in your trading strategy, but only once. 

You provide a filter to specify which changes you're interested in, and a function to execute when that specific change occurs. 

Once the matching change happens, the listener automatically stops listening – it's a quick and clean way to handle a one-time reaction to a strategy event. Think of it like setting up a brief alert for a particular strategy action.


## Function listenStrategyCommit

This function lets you keep a close eye on what's happening with your trading strategies. It's like setting up a notification system that tells you whenever something significant changes, such as a signal being cancelled, a trade being closed, or adjustments to stop-loss and take-profit levels. Importantly, the notifications happen one at a time, ensuring that any actions you take in response to these events are processed safely and in the correct order.

You provide a function that will be called whenever one of these strategy events occurs. This callback function receives information about the specific event that triggered it.

The function returns another function that you can call to unsubscribe from these events, effectively silencing the notifications.


## Function listenSignalOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. It's like saying, "Hey, I want to know when this specific thing happens, but I only care about it once." After the condition you define is met, the listener automatically stops listening – no need to manually unsubscribe. This is particularly handy if you need to perform an action based on a certain signal appearing just one time.

You provide a filter function that checks each incoming signal to see if it matches what you're looking for. Then, you provide a function that will be executed *only* when the filter function finds a match. The function will return a cleanup function which can be used to manually unsubscribe.

## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once and then automatically stop listening. You provide a filter to define which signals you're interested in, and a function to run when a matching signal arrives. The function handles the setup and cleanup for you, ensuring that the callback only runs one time for the first matching signal. It's useful for tasks like validating a signal or triggering a one-off action based on a particular event.


## Function listenSignalNotify

This function lets you be notified whenever a trading strategy sends out a custom message related to an open trade. Think of it as a way to eavesdrop on the strategy’s communication about its positions. 

It works by giving you a callback function that gets triggered whenever a signal event happens. Importantly, these events are handled one at a time, ensuring that your code doesn't get overwhelmed even if there are a lot of events happening quickly. This sequential processing is designed to keep things orderly and prevent conflicts if your callback involves asynchronous operations. You can unsubscribe from these notifications when you no longer need them by calling the function returned from `listenSignalNotify`.

## Function listenSignalLiveOnce

This function lets you listen for specific trading signals coming from a live backtest execution. You provide a filter that defines which signals you're interested in, and a function to handle those signals. Once the filter matches a signal, your function will run just once, and then the subscription will automatically stop, keeping things tidy. It's designed for single-use scenarios when you need to react to a particular event during a live backtest.

## Function listenSignalLive

This function allows you to listen for real-time trading signals generated during a live backtest run. It's designed to handle events that come directly from the `Live.run()` process. When a signal arrives, it's processed one at a time, ensuring signals are handled in the order they're received. To use it, you provide a function that will be called whenever a new signal event occurs, and this function will receive detailed information about the event. This provides a way to react to live trading activity as it happens.


## Function listenSignalBacktestOnce

This function lets you temporarily "listen in" on the results of a backtest run, but only for a single event that meets specific criteria. You provide a filter – a rule that decides which events you’re interested in – and a function to execute when that event happens. Once the matching event is found and the callback runs, the listener automatically stops, ensuring it doesn’t keep running in the background. It’s perfect for quickly checking a particular signal or anomaly during a backtest without needing to manage subscriptions manually.


## Function listenSignalBacktest

This function lets you listen for signals generated during a backtest. It's like setting up an alert that gets triggered whenever the backtest produces a new data point.

The data you receive will be from events created by the `Backtest.run()` function.

Importantly, these events are handled one after another, ensuring they're processed in the order they occur.

To use it, you provide a function (`fn`) that will be called whenever a new signal event happens, and that function will receive the `IStrategyTickResult` object containing the event data. The function will return a function that, when called, will unsubscribe you from the backtest signal events.


## Function listenSignal

This function lets you listen for updates from your trading strategies. It’s like setting up an alert system that tells you when a strategy is idle, has opened a position, is actively trading, or has closed a position. The important thing to know is that these updates are handled one at a time, even if your alert code takes some time to run – this helps prevent unexpected issues. You provide a function that gets called whenever a signal event happens, and that function receives information about the event. When you're done listening, the function returns another function that you can call to unsubscribe.

## Function listenSchedulePingOnce

This function lets you set up a listener that reacts to specific ping events and then automatically stops listening after it triggers once. You provide a filter—a way to identify the exact events you're interested in—and a function to execute when a matching event arrives. It’s like creating a temporary observer that’s perfect for handling one-off situations or waiting for a particular event to happen. Once the event occurs and your function runs, the listener quietly goes away, ensuring you don't continue to process irrelevant data.


## Function listenSchedulePing

This function lets you keep an eye on scheduled signals – those signals that haven't been activated yet. It sends out a "ping" every minute while a signal is waiting to become active, giving you a chance to monitor its status and do custom checks. You provide a function that gets called each time a ping is received, and that function lets you respond to these pings as needed. It’s a way to track the lifecycle of these signals and make sure everything's working as expected.


## Function listenRiskOnce

This function lets you set up a temporary listener to react to specific risk rejection events. 

It's like setting a one-time alert – it listens for events that match your criteria, runs a function once when it finds one, and then quietly stops listening. This is handy when you need to wait for a certain risk condition to occur and then take action.

You provide a filter to define what events you're interested in, and a function that will be executed when a matching event happens. The listener automatically removes itself after the function has run once.

## Function listenRisk

This function lets you be notified when a trading signal is blocked because it doesn't meet the defined risk rules. 

Think of it as a listener specifically for rejected signals – you won't receive notifications for signals that are approved.

The notifications happen one at a time, ensuring that your code handling the rejection happens in the order signals were received.

To use it, you provide a function that will be called when a signal is rejected, and the function will return another function that will unsubscribe you from the risk rejection events.

## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how your trading strategies are performing in real-time. It’s like a performance tracker that listens for events related to the timing of different operations within your strategy. 

You provide a function (`fn`) that gets called whenever a performance event happens. This function receives information about the event, letting you analyze things like how long different parts of your strategy take to execute. 

A key feature is that these events are handled in order, even if your callback function takes some time to process. This prevents things from getting out of sync and ensures a stable view of your strategy's performance.


## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific partial profit condition is met during a backtest. You provide a filter that defines what conditions you're looking for, and a callback function that will run just once when that condition is met. Think of it as a "wait for this to happen, then do this and be done" kind of setup. Once the event you're looking for occurs, the function automatically stops listening.

## Function listenPartialProfitAvailable

This function lets you get notified whenever a trading strategy reaches a certain profit milestone, like 10%, 20%, or 30% gain. It makes sure these notifications happen one at a time, even if your code takes some time to process each notification, preventing any unexpected issues. You provide a function that will be called each time a milestone is reached, and this function will receive details about the profit event. It’s a way to keep track of progress and react to key moments in your backtesting strategy.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that waits for a specific kind of loss event to happen, and then it does something once. It’s perfect if you need to react just one time to a particular loss condition – after that reaction, the listener automatically stops listening. You tell it what kind of loss event you're looking for using a filter, and then provide a function that gets executed when that specific event occurs. Once the event happens and the function runs, the listener goes away, ensuring you don’t keep processing the same information repeatedly.


## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost, in stages. You’ll get notified whenever a loss level is reached, like 10%, 20%, or 30% loss.

It's designed to handle these notifications one at a time, even if your notification handling involves some asynchronous processing. This ensures that events are processed in the order they come in, preventing any potential issues from running things out of sequence.

You simply provide a function that will be called each time a loss level milestone is hit, and the function will receive information about that loss event. The function you provide will also be automatically unsubscribed when you are done.


## Function listenMaxDrawdownOnce

This function lets you react to specific maximum drawdown events and then automatically stop listening. You provide a filter that defines which drawdown events you're interested in, and then a function that will run just once when a matching event occurs. It's perfect if you need to do something only when a certain drawdown threshold is hit and don't want to keep monitoring afterward.

You specify a filter function to identify the events you want to track.
Then, you give it a callback function to execute once a matching event is found.
After that single execution, the listener is automatically turned off.


## Function listenMaxDrawdown

The `listenMaxDrawdown` function lets you keep an eye on how much your trading strategy has lost from its highest point. It’s like setting up an alert that triggers whenever the drawdown reaches a new low.

This function makes sure events are handled one at a time, even if your alert logic takes some time to complete.

You provide a function that gets called whenever a drawdown event happens, allowing you to monitor and react to changes in risk exposure. Think of it as a way to build systems that adjust risk based on how much potential loss is currently present.


## Function listenIdlePingOnce

`listenIdlePingOnce` lets you react to specific idle ping events – those signals that tell you the system hasn't been actively used recently. Think of it as setting up a temporary alert.

You provide a filter – a way to choose which idle ping events you care about – and a function that will run *only once* when a matching event arrives.

Once that one event is handled, the subscription automatically stops, so you don’t need to worry about cleaning up. It returns a function that you can call to unsubscribe manually if needed.


## Function listenIdlePing

This function lets you listen for moments when the backtest system isn't actively processing any trading signals. 

Think of it as a notification when things are quiet – no orders being placed or data being analyzed. 

You provide a function that will be called whenever this "idle" state is detected.

The function you provide receives an `IdlePingContract` object containing details about the idle event.

To stop listening for these events, the function returns a cleanup function that you can call.


## Function listenHighestProfitOnce

This function lets you set up a temporary listener to react to specific trading events that represent the highest profit achieved so far. You provide a filter—a rule to identify the exact kind of event you're interested in—and a function that will be executed *once* when an event matches that filter. After that one execution, the listener automatically stops, so you don't need to worry about cleaning up. It's a simple way to respond to a particular profit milestone and then move on.

Essentially, you define what constitutes a “highest profit” event and what you want to do when it happens, and this function handles the listening and unsubscribing for you.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategy hits a new peak profit level. It’s like setting up an alert that triggers whenever your profits climb to a new high.

The alerts are delivered one at a time, even if the callback you provide takes some time to run. This ensures things happen in order and avoids any unexpected issues from multiple alerts firing at once.

You can use this to monitor your strategy's performance and adjust things as needed, for example, to adjust risk parameters when reaching certain profit targets. 

To use it, you give it a function (a callback) that will be called whenever a new highest profit is achieved, and it returns a function to unsubscribe.

## Function listenExit

This function lets you react to the most serious errors that can halt your backtest or live trading process. It’s designed to catch problems that stop the whole thing from continuing, like issues within background tasks. Think of it as an emergency alert for your trading system. 

These errors are handled one at a time, ensuring events are processed in the order they happen, even if the error handling itself involves asynchronous operations. The system makes sure the callback function doesn't run at the same time as another, which can prevent unexpected conflicts. You provide a function that gets called when a fatal error occurs, and this allows you to implement recovery steps or log critical information. The function returns an unsubscribe function, allowing you to stop listening to these events when it is no longer needed.

## Function listenError

This function allows you to monitor and respond to errors that might occur while your trading strategy is running, but aren't severe enough to stop the entire process. Think of it as a way to catch and manage hiccups like temporary API connection problems. 

It ensures that these errors are handled one at a time, in the order they happen, even if your error-handling code takes some time to complete. This prevents a cascade of issues and helps keep your strategy running smoothly.

You provide a function that will be called whenever such an error arises, giving you the opportunity to log it, retry the operation, or take other corrective actions. The function you provide will return another function you can call to stop listening to those errors.

## Function listenDoneWalkerOnce

This function lets you react to when a background process within the backtest-kit framework finishes, but only once. You provide a filter to specify which finishing events you're interested in, and a function to execute when a matching event occurs. The function then automatically stops listening after it has run the callback function once, preventing it from triggering again. Think of it as setting up a single, temporary alert for a specific event.


## Function listenDoneWalker

This function lets you be notified when a background task managed by the Walker framework finishes. 

Think of it as setting up a listener that waits for a specific job to complete. 

When the job is done, it calls the function you provide. Importantly, these notifications are handled one at a time, making sure things don't get out of order or overwhelmed, even if your notification function itself takes some time to process. You can unsubscribe from these notifications by returning the function returned from `listenDoneWalker`.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running.

You provide a filter – a way to specify which completion events you're interested in – and a function to execute when a matching event occurs.

The function automatically handles unsubscribing after it runs once, so you don't have to worry about cleaning up your listeners. It's a convenient way to perform actions immediately after a background process concludes.


## Function listenDoneLive

This function lets you be notified when background tasks run by Live are finished. It's useful for tracking the progress of longer operations. 

Think of it as subscribing to updates when these background jobs are done. The updates happen one at a time, even if the function you provide takes a while to complete, ensuring things don't get mixed up. It's designed to keep things orderly and prevent unexpected behavior from multiple callbacks running simultaneously. You simply give it a function to call when the background task is complete.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you’re interested in, and a function to run when a matching completion occurs. After the callback executes, the subscription is automatically removed, ensuring it doesn't trigger again. This is perfect for actions that need to happen exactly once when a specific backtest finishes.


## Function listenDoneBacktest

This function lets you be notified when a background backtest finishes running. 

Think of it as subscribing to an event that fires when a backtest is done.

It ensures that when the backtest completes, your code gets triggered in a safe and orderly fashion, even if your code takes some time to process the completion. This prevents unexpected issues from multiple callbacks running simultaneously. You provide a function that will be executed when the backtest is complete, and the function returns another function that you can call to unsubscribe.

## Function listenBreakevenAvailableOnce

This function lets you set up a listener that waits for a specific breakeven protection event to happen and then automatically stops listening after that one event. You provide a filter to define what kind of event you're interested in, and a callback function that will be executed exactly once when that event occurs. Think of it as a quick, temporary alert for a particular breakeven condition. It's really handy when you only need to react to something happening once.


## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss automatically adjusts to the entry price – essentially, when the profit covers the transaction costs. 

It provides a way to react to these breakeven events in your trading strategy.

The function guarantees that your response to these events happens one at a time, even if the callback you provide takes some time to complete. You pass in a function that will be called with details about the trade that hit the breakeven point. The function returns another function that you can call to unsubscribe from receiving these notifications.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts. 

You provide a filter – essentially, rules that define which events you're interested in. 

Then, you give it a function that will run *once* when an event matches those rules. 

After that single execution, it automatically stops listening, keeping things clean and efficient. Think of it as a one-time alert for a particular situation before the simulation kicks off.


## Function listenBeforeStart

This function lets you tap into the moment right before a trading strategy begins running for a specific asset. It's like setting up an alert that triggers just before the engine kicks off a new strategy execution. You provide a function that will be called with details about that upcoming execution. Importantly, the order of these alerts is maintained, and even if your function takes some time to complete, the next alert will wait its turn – so you avoid any potential conflicts from running things at the same time. You can unsubscribe from these alerts whenever you no longer need them.

## Function listenBacktestProgress

The `listenBacktestProgress` function lets you keep an eye on what's happening during a backtest. It gives you updates as the backtest runs, specifically during the `background()` phase. These updates are delivered one at a time, even if the function you provide to handle them takes some time to complete. Think of it like receiving notifications about the backtest's journey—you'll get them in the order they happen, ensuring a smooth and reliable flow of information.

You give it a function that will be called each time an update is available, and it returns another function you can call later to stop listening for updates.


## Function listenAfterEndOnce

This function lets you set up a listener that only runs *once* for specific events after a backtest finishes. You provide a filter – a way to identify which events you're interested in – and a function to execute. The listener will trigger that function once when a matching event occurs and then automatically stops listening. This is useful for performing actions based on a single, specific event after the backtest concludes without needing to manually unsubscribe.

## Function listenAfterEnd

This function lets you hook into what happens after a trading strategy has finished running for a specific asset. It's like getting a notification when the engine is completely done with its work on a symbol.

Importantly, the notifications will be handled one at a time, even if your code takes some time to process them. This helps prevent conflicts and ensures things run smoothly.

You provide a function that will be called with information about the completed strategy execution, and the function returns another function. This second function allows you to unsubscribe from receiving these after-end notifications when you're done with them.


## Function listenActivePingOnce

This function allows you to react to specific active ping events, but only once. You provide a filter that defines which events you’re interested in, and then a function that will be executed when a matching event occurs. Once that one event is processed, the subscription automatically stops, which is handy when you need to react to something specific and then move on. Think of it as setting up a temporary alert for a particular condition.


## Function listenActivePing

This function lets you keep an eye on active trading signals. It listens for events that happen roughly every minute, giving you information about the status of your signals.

Think of it as a way to monitor what's happening with your signals in real-time. 

You provide a function that will be called whenever a new active ping event occurs. Importantly, these events are handled one at a time, ensuring that your callback function isn't overwhelmed even if it needs to perform asynchronous tasks. You can unsubscribe from this listener whenever you no longer need it.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies or "walkers" that are currently set up within the backtest-kit framework. It essentially gives you a complete list of all the strategies you’ve added. This is helpful when you're troubleshooting, want to create documentation, or build a user interface that needs to display available strategies. It returns a list of schemas, each describing a specific trading approach.

## Function listStrategySchema

This function helps you see all the different trading strategies that have been set up within the backtest-kit system. It's like getting a complete inventory of your available strategies. You can use this to check what's been registered, create helpful documentation, or build a user interface that lets you choose from various strategies. It provides a straightforward way to access a list of all registered strategy schemas.


## Function listSizingSchema

This function gives you a list of all the sizing strategies that have been set up within the backtest kit. It's like a directory of how different strategies determine the size of trades. You can use this to check what's going on, create documentation, or even build tools that automatically display these configurations. It returns a promise that resolves to an array of sizing schema objects.

## Function listRiskSchema

This function lets you see all the risk configurations currently set up in your backtest. 

Think of it as a way to peek under the hood and understand how risks are being managed within your trading simulation. 

It returns a list of all the risk schemas, which can be helpful for troubleshooting, generating documentation, or creating interfaces that adapt to different risk setups. Basically, it provides a complete view of your risk settings.


## Function listMemory

This function helps you retrieve a list of stored data, often referred to as "memory," associated with your trading signal. Think of it as a way to see what information your system has remembered for later use. 

It handles the technical details of knowing which signal you're working with and whether you're in a testing or live trading environment, so you don't have to worry about those specifics. 

You provide a bucket name to specify where the data is stored, and it returns a list of objects containing a unique identifier and the content of each memory entry. It's a convenient way to check what's been saved and referenced.

## Function listFrameSchema

This function gives you a peek at all the different "frames" your backtest kit is using. Think of frames as pre-defined structures for holding data during a backtest. It pulls together a list of all these frames, letting you see what data they contain and how they're organized. This is especially helpful when you're trying to understand how your backtest is set up, creating helpful tools, or just ensuring everything is working as expected.

## Function listExchangeSchema

This function helps you discover all the exchanges your backtest-kit is set up to work with. It's like getting a directory of available trading platforms. You can use this to check what exchanges are available, to help build tools that display exchange information, or simply to verify that your configuration is correct. The function returns a promise that resolves to an array of exchange schemas, giving you the details for each.

## Function hasTradeContext

This function simply tells you whether the environment is set up to execute trading operations. It confirms that both the execution context and the method context are available. You'll need this to be true before you can use things like fetching historical data (candles), calculating averages, formatting numbers for display, or getting the current date – basically, any operation that involves a live or simulated trading scenario. Think of it as a quick check to make sure everything's ready to trade.


## Function hasNoScheduledSignal

This function helps you determine if there's currently a scheduled trading signal for a specific asset, like "BTCUSDT." It returns a simple yes or no – true if no signal is scheduled, false if one exists. Think of it as the opposite of `hasScheduledSignal`. It’s handy for making sure your trading logic only runs when it’s supposed to, preventing unexpected actions. The function understands whether it’s running in a backtesting environment or a live trading scenario, so you don't have to worry about that detail. 

You provide the trading pair symbol as input, such as "BTCUSDT", and it tells you if a scheduled signal is pending for that pair.


## Function hasNoPendingSignal

This function checks if there's a pending signal currently active for a specific trading pair, like 'BTCUSDT'. It returns `true` if there isn't a pending signal, and `false` if there is. Think of it as the opposite of `hasPendingSignal`; you might use it to make sure you're not generating new signals when one is already waiting. It handles whether you're in a backtesting environment or live trading automatically. You simply provide the symbol of the trading pair you’re interested in.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint or definition of a specific trading strategy or component within the backtest-kit framework. Think of it like looking up the instructions for a particular building block.

You provide the name of the strategy or component you're interested in, and this function returns the schema describing its structure, inputs, and outputs.

This is useful for understanding how a strategy is designed or for validating its configuration. 

The `walkerName` parameter is the unique identifier for the strategy or component you want to inspect.

## Function getTotalPercentClosed

This function helps you understand how much of your position remains open for a specific trading pair. It tells you the percentage of the original position that hasn’t been closed, ranging from 100% (meaning the entire position is still open) to 0% (meaning everything has been closed). 

It intelligently handles situations where you've added to your position through dollar-cost averaging (DCA) while also closing parts of it.

You don't need to worry about whether the backtest is running in a live or historical mode, as it figures that out automatically. Just provide the symbol of the trading pair you're interested in, and it will give you the percentage.

## Function getTotalCostClosed

This function helps you figure out how much you've spent on a particular trading pair, like BTC/USD, that you still own. It calculates the total cost basis, meaning it takes into account any dollar-cost averaging (DCA) that happened when you bought the asset in smaller amounts over time.  Importantly, if you’ve already closed parts of the position, it still accurately reflects the cost of the remaining holdings. The function automatically determines whether it's running in a backtesting or live trading environment. You just need to provide the symbol of the trading pair you're interested in, like "BTC/USD".

## Function getTimestamp

This function provides a way to retrieve the current timestamp within your trading strategy. 

It’s useful for things like logging events or synchronizing actions. 

During backtesting, it will give you the timestamp associated with the historical data point you're currently analyzing.  If you're running in a live trading environment, it returns the actual, real-time timestamp.


## Function getSymbol

This function simply retrieves the symbol you're currently trading, like fetching the ticker for a stock or cryptocurrency. It returns a promise that resolves to the symbol as a string. Think of it as a way to confirm which asset your backtest or trading strategy is focused on.

## Function getStrategyStatus

This function lets you peek at the current state of a trading strategy while it's running in a backtest or live environment. It provides a snapshot of what's happening behind the scenes—things like signals that are waiting to be processed, actions that have been queued, and user-initiated actions that are still pending. You'll get information about the trading pair, like 'BTC-USDT,' allowing you to understand the strategy's immediate situation. It handles whether it's running a backtest or live trading, so you don’t need to worry about that.


## Function getStrategySchema

The `getStrategySchema` function helps you find information about a specific trading strategy that's been set up within the backtest-kit framework. Think of it as looking up the blueprint or definition of a strategy. You provide the unique name of the strategy, and the function returns a detailed description of its structure, including what data it expects and how it's configured. This is useful for understanding and validating strategy implementations.


## Function getSizingSchema

This function helps you fetch the details of a specific sizing strategy that’s been set up within the backtest kit. Think of sizing as how much of an asset you're trading in each transaction. You give it a name – a unique identifier for the sizing strategy – and it returns all the information about that strategy, like how it calculates trade sizes. It’s a handy way to understand the sizing rules being used in your backtest.


## Function getSignalState

This function helps you fetch a specific state value related to a trading signal. It figures out which signal is active based on the current environment (backtest or live).

If there's no active signal, it will alert you and return a default starting value. 

This is particularly useful for advanced strategies, like those using AI, where you want to track data like how long a trade is open or its maximum profit, across multiple trades within a single signal. 

It’s designed to work with strategies that aim for modest profits while limiting losses and sometimes even avoiding positive returns in certain scenarios.

You provide the trading symbol and a container with an initial value for your state.

## Function getSessionData

This function lets you retrieve information that's specific to a trading symbol and is saved during a backtest or live trading session. Think of it as a place to store temporary data, like results from complex calculations or intermediate states of indicators, that you need to keep track of across multiple price candles. This data sticks around even if the backtest or live trading process restarts, making it great for things like caching or remembering where you left off.

You provide the trading symbol (like 'BTC-USD') to the function, and it returns the stored data for that symbol if it exists, otherwise it returns null. The data can be any JavaScript object, allowing for flexible storage of varied information.

## Function getScheduledSignal

This function allows you to retrieve the signal that's currently scheduled for a specific trading pair. Think of it as checking what instructions your strategy has queued up to execute. It will give you the details of the signal, or return nothing if there isn't one scheduled. It smartly figures out if you're running a test or a live trading session without you needing to specify. You just need to tell it which symbol, like 'BTCUSDT', to look for.

## Function getRuntimeInfo

This function lets you peek under the hood and find out important details about how your backtest or trading strategy is running right now. It tells you things like which symbol you're trading, which exchange you're using, the timeframe of your data, and what strategy is in place. It also clarifies if you're running a backtest simulation or a live trading session. Essentially, it’s a quick way to check your environment's configuration.


## Function getRiskSchema

This function helps you find the specific details of a registered risk, like how it's measured and calculated. You give it a unique name to identify the risk, and it returns a structured description of that risk, allowing you to understand its parameters and behavior within your backtesting system. Think of it as looking up the blueprint for a particular type of risk.

## Function getRawCandles

The `getRawCandles` function lets you retrieve historical candle data for a specific trading pair and time interval. You have a lot of control over the data you get – you can specify a number of candles to fetch, or define a start and end date for your data range. 

It's designed to be reliable and ensures that the data you’re using doesn't give you an unfair advantage by looking into the future.

Here's how you can use the different combinations of parameters:

*   You can specify both a start and end date along with a limit.
*   Just providing a start and end date will automatically determine the number of candles needed for that range.
*   You can limit the number of candles and let the system choose the start date.
*   You can provide a start date and a limit, which will define the end date.
*   If you just want a specific number of candles, the system will determine the start date relative to the current execution context.

The function requires you to provide the trading pair symbol (like “BTCUSDT”) and the candle interval (like "1m", "5m", "1h", etc.). You can optionally provide a start date, end date, and the number of candles you want to retrieve. The function ensures that your end date isn't in the future.

## Function getPositionWaitingMinutes

This function helps you check how long a signal has been waiting to be triggered for a specific trading pair. 

It essentially tells you if a planned trade is on hold.

If no signal is currently waiting, the function will return null.

To use it, you simply provide the symbol of the trading pair you're interested in, like "BTCUSDT." 

The function will then return the waiting time in minutes, or null if nothing is waiting.

## Function getPositionPnlPercent

This function helps you figure out how much your current open position is potentially making or losing, expressed as a percentage. It considers factors like how much of your position is still open, any average prices used when entering the position, potential slippage when trading, and any trading fees. 

If you don't have any active positions, it will return null. 

It intelligently determines if it's running a backtest or a live trading session and automatically gets the current market price to calculate the percentage. You only need to tell it which trading pair you’re interested in.


## Function getPositionPnlCost

This function helps you understand the unrealized profit or loss, expressed in dollars, for a trading position that's currently waiting for a signal. It considers factors like the percentage profit/loss, the total cost of your investment, any partial closes you've made, and even potential slippage and fees. If there's no active signal to calculate the PNL for, the function will return null. It's designed to work seamlessly in either backtesting or live trading environments and automatically retrieves the current market price for accurate calculations. You just need to provide the symbol of the trading pair, like 'BTC-USDT'.

## Function getPositionPartials

This function lets you peek into how your trading position has been partially closed. It provides a history of any profit or loss takeouts you’ve performed, whether using the standard or cost-based methods.

You’ll receive a list of events, each detailing the type of partial (profit or loss), the percentage of the position closed, the price used for the partial, the cost basis at the time, and how many DCA entries were combined at that point.

If you don't have any pending signals, the function returns null. If you *do* have a signal but haven't executed any partial closes yet, you’ll get an empty list back.

It requires you to specify the trading symbol (like BTC-USDT) to retrieve the partials.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing positions partially multiple times at nearly the same price. It checks if the current market price is close enough to a previously executed partial closing price, within a defined tolerance range. 

Essentially, it's a safety measure to ensure price accuracy and prevent unintended actions.

The function takes the trading symbol and the current price as input. You can also optionally specify a custom tolerance range. If the current price falls within the calculated range around a previous partial closing price, it returns true; otherwise, it returns false, indicating that a partial close is likely safe to proceed with.


## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a particular trade (identified by its symbol) experienced its biggest loss during its entire lifespan. It essentially tells you the timestamp associated with the lowest point of that trade. If there's no active trade associated with the symbol you're looking for, it will return null, indicating that no such information is available. You provide the symbol of the trading pair (like "BTC-USDT") to retrieve this historical drawdown timestamp.

## Function getPositionMaxDrawdownPrice

This function helps you understand how badly a specific trade performed. It tells you the lowest price the trade hit while you were holding it. 

Essentially, it reveals the maximum drawdown experienced by that position.

You need to provide the symbol of the trading pair (like BTC-USD) to get this information. 

If no signal is pending for the trade, the function won't be able to provide a drawdown value and will return null.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand how much your trading position lost at its lowest point. It calculates the percentage of profit or loss relative to the initial investment when the biggest drawdown occurred for a specific trading pair. If there's no active trading signal for that pair, the function will return null. You provide the symbol, like "BTC-USD", and it will return a number representing that drawdown percentage.

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of your trading decisions. It calculates the total cost in terms of profit and loss, specifically looking at the point when your position experienced its largest drawdown. Think of it as revealing how much money you lost at the worst possible moment for that particular trade. 

It only works if there's a pending trading signal for the specified symbol. If not, it won't return any data. You provide the trading pair symbol, such as "BTC-USDT," to get this information for that specific trade.

## Function getPositionMaxDrawdownMinutes

getPositionMaxDrawdownMinutes tells you how long ago your position experienced its biggest loss. 

It calculates the time in minutes since the lowest price point was reached for a specific trading pair. 

The longer the number, the further back in time your most significant drawdown occurred.

If no trades are currently open for that symbol, the function will return null. You need to specify the trading pair symbol to get this information.

## Function getPositionLevels

This function helps you retrieve the prices at which you've entered a trade using dollar-cost averaging (DCA). It gives you a list of prices, starting with the original price you paid when you first initiated the trade.

If you haven’t used DCA and only bought once, you'll get an array containing just the original entry price.

If no trade is currently in progress, this function will return null. 

You provide the trading pair symbol (like BTCUSDT) to specify which trade you're inquiring about.

## Function getPositionInvestedCount

This function lets you check how many times you’ve added to a trade using dollar-cost averaging (DCA) for a specific trading pair. It tells you the total number of entries, starting at 1 for the initial trade and increasing with each subsequent DCA buy. If there isn’t an active trade pending, it will return null. The system figures out whether it's running a backtest or a live trading session automatically. To use it, you simply need to provide the trading pair symbol, like 'BTCUSDT'.

## Function getPositionInvestedCost

This function helps you determine how much money you've invested in a particular trading pair, like BTC-USD. 

It calculates the total cost based on the entry costs recorded when you added positions—essentially, how much you paid to acquire the assets.

If there’s no open or pending trade for that symbol, the function will return null. 

It figures out whether you're in a backtesting or live trading environment automatically, so you don't have to worry about configuring that.  You just give it the symbol, and it tells you the total invested cost.


## Function getPositionHighestProfitTimestamp

This function helps you pinpoint exactly when a specific trade (identified by its symbol) achieved its highest profit. 

It looks back at the trade's entire history and returns the timestamp – that precise moment in time – when it was most profitable.

If there isn't a trade with a signal associated, it won't be able to find a timestamp and will return null. You'll need to provide the symbol of the trading pair to identify which trade you’re interested in.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your open position has reached while potentially making a profit. 

Think of it as tracking the best-case scenario for your trade so far. 

For long positions, it remembers the highest price above your entry price. For short positions, it tracks the lowest price below your entry price.

It will always give you a number representing that highest profit price, even if it's just the initial entry price of the trade.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trade has been running since it reached its best possible profit. 

It tells you the number of minutes that have passed since the price was at its highest profit level for a specific trading pair.

Think of it as a way to see how far a trade has fallen from its peak – it’s essentially the same as measuring the drawdown time.

If there's no active trade signal for that trading pair, the function will return null.

You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its most profitable point. It calculates the difference between the highest profit percentage achieved and the current profit percentage. Think of it as measuring how much room there is to potentially lose from a peak gain. If no trading signal is currently active, the function won't return a value. You provide the trading pair symbol – like 'BTCUSDT' – to specify which position's performance you're investigating.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit point. It calculates the difference between the highest profit achieved so far and the current profit, ensuring the result is always a positive value (or zero if the current profit is already the peak). If there's no active trading signal, the function will return null. You provide the trading symbol, like 'BTC-USD', and the function tells you the distance, measured in profit and loss cost, from your current position to that peak profit.


## Function getPositionHighestProfitBreakeven

This function helps determine if a trading position could have reached a breakeven point at its peak profitability. 

It checks if achieving breakeven was possible based on the price data.

If there isn't an active trading signal for the specified trading pair, it will return null, indicating that the calculation can't be performed.

You provide the trading pair symbol as input, like 'BTCUSDT', and the function will analyze the position to see if breakeven was attainable at the highest profit level.

## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trading position performed. It looks back at the history of a position for a particular trading pair and finds the highest percentage profit it ever achieved at any point. Think of it as identifying the peak performance moment for that trade. If the position hasn't generated any trading signals yet, the function won't have data to work with and will return null. You provide the trading pair symbol, like "BTC-USD," to specify which position you're interested in.

## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a specific trade. It calculates the highest profit and loss cost experienced by a position for a given trading pair, like BTC-USDT. Think of it as identifying the point where the position was most profitable before potentially incurring losses. If there isn’t any trade data available, it will return null. You provide the trading symbol – the pair being traded – to this function to get the result.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the potential risk of a trading position. It calculates how far the position's profit has fallen from its peak, expressed as a percentage. Essentially, it tells you the biggest "dip" the position has experienced.

The result represents the difference between the position's current profit percentage and the lowest profit percentage it reached during its lifespan.

If the position hasn't generated any signals yet, the function will return null, as there's no drawdown to measure. You provide the trading symbol (like "BTCUSDT") to specify which position's drawdown you want to analyze.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how much your trading position is currently down from its peak performance. It calculates the difference between the current profit and loss (PnL) and the lowest PnL reached during a drawdown period. Think of it as measuring how far you are from your best possible outcome for a given trade. It will return null if there's no active trading signal for that specific trading pair. You provide the trading pair symbol, like "BTCUSDT", and it will give you a number representing that drawdown risk.

## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It tells you the originally planned duration, measured in minutes, for a pending trade. 

Think of it as checking the expected lifespan of an order you’ve placed. 

If there's no active pending order, the function will let you know by returning null. You'll need to provide the symbol of the trading pair (like BTC-USDT) to get the estimate.


## Function getPositionEntryOverlap

This function helps you avoid accidentally making multiple DCA entries at roughly the same price. It checks if the current market price falls within a small range around your existing DCA entry levels.

If the current price is too close to a previously established DCA level, the function returns true, indicating you shouldn't make another entry there. Otherwise, if no entry levels exist, it returns false.

You can customize how close is "too close" by providing a configuration object that defines the allowable tolerance around each DCA level. This helps manage your DCA strategy more precisely and prevent redundant entries. The function takes the trading symbol and current price as input, and optionally a configuration to define the tolerance.

## Function getPositionEntries

getPositionEntries lets you peek at the details of how a position is being built up, especially when using Dollar-Cost Averaging (DCA). It gives you a list of entries – each one showing the price at which a portion of the position was bought and how much money was used for that buy. 

If there's no current trade happening, you won't get anything back. If you bought a single chunk of the asset, you’ll get a list with just one entry. This function is really helpful for understanding the steps involved in building your position over time. 

You just need to tell it which asset you're interested in, like 'BTCUSDT'.


## Function getPositionEffectivePrice

This function helps you determine the average price at which you've acquired a position, taking into account any dollar-cost averaging (DCA) adjustments. It calculates a weighted average, considering the cost of each purchase and the price at which it was made.

If you've made partial sales of your position, the calculation factors in the cost basis at the time of each partial sale.  It also incorporates any additional DCA entries that occurred after the last partial closure. 

If there's no active trade signal, the function will return null, signifying that there's nothing to calculate the price for. It works seamlessly whether you’re running a backtest or a live trading session because it figures out the environment automatically. You just need to provide the trading pair symbol.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. 

Think of it as a measure of how far your trade has fallen from its best performance.

It starts at zero when the trade first hits a profit, and then increases as the price moves down from that peak.

If there's no active trade, the function won't be able to calculate this and will return a value indicating that.

You'll provide the trading pair symbol, like "BTCUSDT", to specify which trade you're interested in.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left until a position expires. It figures this out by looking at when the position was initially pending and comparing that to an estimated expiration time.

If the estimated time has already passed, it returns 0, meaning the position has essentially expired. 

You won’t get a countdown if there isn't a pending signal for the given trading pair.

The function needs the symbol of the trading pair (like "BTC-USDT") to work. It returns the countdown in minutes, and it's always a non-negative number.

## Function getPositionActiveMinutes

getPositionActiveMinutes helps you figure out how long a particular trade has been open. It tells you the number of minutes since the trade started. 

If there’s no ongoing signal for that trade, the function won't return a number; instead, it will return null.

You just need to provide the trading pair's symbol, like "BTCUSDT", to get the active minutes.


## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be filled. 

It returns information about that pending order, like the price and quantity, if one exists. 

If there isn't a pending order, it simply tells you that by returning null.

You don't need to worry about whether you're in a backtest or a live trading environment because the function automatically figures it out for itself.

To use it, you just need to provide the symbol of the trading pair you’re interested in, like "BTCUSDT".

## Function getOrderBook

This function allows you to retrieve the order book for a specific trading pair, like BTCUSDT. It pulls data from the connected exchange. 

The function will automatically use the current time settings from your backtest environment, ensuring the order book data aligns with the simulation. You can also specify how many levels of the order book you want to see; if you don’t specify a depth, it will use a default setting.


## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. 

Think of it as saying, "Give me the next 'X' number of candles for Bitcoin against USDT, using a 5-minute chart."

It uses the underlying exchange’s ability to fetch future data, so it’s retrieving candles that happen *after* the current time being used by your backtest.

You’ll need to provide the symbol (like BTCUSDT), the interval (like 1m for one-minute candles), and how many candles you want in the batch.


## Function getMode

This function lets you easily check whether your code is running in a backtesting environment or in a live trading scenario. It returns either "backtest" or "live," providing a straightforward way to adapt your trading logic based on the current context. You can use this to conditionally execute certain actions, like disabling real-order placement during backtests.

## Function getMinutesSinceLatestSignalCreated

This function tells you how long, in minutes, it's been since the most recent trading signal was generated for a specific trading pair. 

It doesn't care if that signal is still open or has already closed; it just looks at the last signal created. This is handy if you need to implement a waiting period after a loss, for example. 

If no signals exist for a particular symbol, the function will return null. It will look for this signal information first in the backtest data and then in live data, adapting to whether you're in backtesting or live trading mode. You just need to provide the symbol of the trading pair you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown in terms of percentage profit. It essentially measures the biggest drop from the highest point of profit to the lowest point.

The result shows the difference between the highest percentage profit achieved and the largest percentage loss experienced during the backtest, ensuring a value of zero or greater.

To use it, you simply provide the trading symbol you're interested in, and it will return the drawdown percentage. If there’s no trading data available, it will return null.


## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the maximum difference between the highest profit and the lowest loss experienced during a backtest. 

Think of it as measuring how far a trading strategy could fall from its peak before recovering.

The result represents the potential cost in PnL terms if you were to experience this drawdown. If no trading signals exist for the specified symbol, the function will not return a value. You provide the trading pair symbol (like "BTC-USDT") as input to get this information.

## Function getLatestSignal

This function helps you retrieve the most recent signal generated for a specific trading pair. It doesn't matter if the signal is still active or has already closed; it just gives you the very latest one. This is handy for things like implementing cooldowns – you could prevent new trades for a certain period after a stop-loss by looking at the timestamp of the last signal. The function checks both the historical backtest data and live data to find this signal and will return nothing if no signal exists. It automatically figures out whether it's running in backtest or live mode.

You provide the symbol of the trading pair (e.g., BTCUSDT) to specify which signal you’re looking for.


## Function getFrameSchema

The `getFrameSchema` function lets you look up the blueprint for a specific frame used in your backtesting strategy. Think of it as a way to get the details – like what data it expects and how it should be structured – for a frame you've already defined. You simply provide the name you gave the frame when you registered it, and the function returns that frame's schema, which is a description of its structure. This helps ensure your data and frames are set up correctly.


## Function getExchangeSchema

This function lets you look up the details of a specific cryptocurrency exchange that's been set up within the backtest-kit framework. Think of it as finding the blueprint for how a particular exchange works, including things like its trading rules and how orders are handled. You provide the name of the exchange you're interested in, and the function returns a set of information describing that exchange. This information is crucial for accurately simulating trading on that exchange during a backtest.

## Function getDefaultConfig

This function provides you with a set of default settings for the backtest-kit framework. Think of it as a starting point for configuring your trading strategies. It gives you a read-only object containing numerous parameters that control various aspects of the backtesting process, like how often data is fetched, limits on calculations, notification settings, and flags for enabling certain features. Examining these default values helps you understand all the available configuration options before you customize them for your specific needs.

## Function getDefaultColumns

This function provides a set of pre-defined columns that you can use to structure your trading reports. 

It gives you a ready-made configuration for displaying different types of data, like closed trades, heatmap rows, live ticks, partial fills, breakeven events, performance metrics, risk assessments, schedules, strategy events, synchronization status, maximum profit events, drawdowns, and walker performance data. 

Think of it as a template – you can inspect the structure and understand the possible columns before customizing them for your specific reporting needs.

## Function getDate

This function simply retrieves the current date. 

It behaves differently depending on whether you're running a backtest or live trading. During a backtest, it gives you the date associated with the current historical timeframe you're analyzing. When running live, it returns the actual, real-time date.

## Function getContext

This function gives you access to the details about where and how your trading strategy's methods are being executed. Think of it as a way to peek behind the scenes and see things like which strategy is running, the time, and other relevant data for the current step in your backtest. It returns a promise that resolves to an object holding this context information, allowing you to adapt your strategy’s behavior based on the specific conditions.


## Function getConfig

This function lets you peek at the system's settings. It provides a snapshot of all the global configuration values, like how often certain checks run, limits on data processing, and flags controlling various features. Think of it as reading the rulebook for how the backtest kit operates. Importantly, it gives you a copy of these settings, so you can look at them without changing the actual running configuration.

## Function getColumns

This function gives you a peek at how your backtest data will be displayed in the markdown report. It essentially lists all the columns that will be included, like profit/loss, risk metrics, and strategy events. Think of it as getting a snapshot of the data structure used for creating reports – it allows you to see what information is being tracked and how it's organized without changing anything. This function provides a safe way to examine the column definitions, ensuring you won't accidentally alter the report's structure.

## Function getClosePrice

This function lets you fetch the closing price of the most recent candle for a specific trading pair and timeframe. 

You provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the timeframe, which can be intervals like 1 minute, 5 minutes, or 4 hours. 

It returns a promise that resolves to the closing price as a number. Essentially, it's a quick way to get the latest closing price for a given trading pair at a specific frequency.


## Function getCandles

This function retrieves historical price data, or "candles," for a specific trading pair like BTCUSDT. You tell it which pair you're interested in, how frequent the data should be (e.g., every minute, every hour), and how many data points you want to receive. The function pulls this data from the connected exchange and provides it back to you. It fetches the data from the past, based on the current time. Essentially, it's a way to get a history of price movements for a particular asset.


## Function getBreakeven

This function helps determine if a trade has become profitable enough to cover associated costs. It checks if the current price of a trading pair has moved beyond a threshold calculated to account for slippage and trading fees. The function figures out whether you're in a backtest or live trading environment. To use it, you provide the trading symbol and the current price, and it returns true if the breakeven point has been cleared.

## Function getBacktestTimeframe

This function lets you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates that represent the timeframe for which historical data is available. Think of it as checking what dates you can actually use when you're testing a trading strategy. You provide the symbol of the trading pair, and it gives you back an array of dates to work with.

## Function getAveragePrice

This function, `getAveragePrice`, helps you find the VWAP (Volume Weighted Average Price) for a specific trading symbol like BTCUSDT. It looks at the last five minutes of trading data to figure this out.

The calculation involves using the high, low, and closing prices of those candles to determine a typical price, then weighting that price by the volume traded at each point.

If there's no trading volume during that period, it simply averages the closing prices instead. You just need to provide the symbol you're interested in.

## Function getAggregatedTrades

This function retrieves historical trade data for a specific trading pair, like BTCUSDT. 

It pulls this data from the exchange that's been configured within the backtest-kit system.

By default, it fetches trades within a defined time window, but you can specify a `limit` to get only the most recent 'n' trades. If you don't set a limit, it retrieves trades from within a one-hour window. The trades are retrieved in reverse chronological order, going back from the present time.

## Function getActionSchema

This function helps you find the detailed blueprint for a specific action within your trading strategy. Think of it like looking up the instructions for a particular step in your trading plan. You provide the action’s unique name, and it returns a description of what that action entails, including the expected data it uses. This is helpful for understanding and validating your trading logic.

## Function formatQuantity

This function helps you display the correct quantity of an asset when you're placing orders or showing account balances. It automatically adjusts the number of decimal places based on the specific trading pair, like BTCUSDT or ETHBTC, ensuring your values match the exchange's requirements. You provide the symbol (the pair being traded) and the raw quantity as a number, and it returns a formatted string. 

For example, it knows that BTCUSDT requires different decimal places than ETHBTC.


## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the symbol of the trading pair, like "BTCUSDT," and the raw price value as input. Then, it uses the exchange's rules to ensure the price is displayed with the correct number of decimal places. This is really useful for making sure your output looks consistent with how the exchange itself shows prices.


## Function dumpText

The `dumpText` function lets you save raw text data, like logs or reports, associated with a specific trading signal. Think of it as a way to record important information during a backtest or live trading session. It takes an object that includes the bucket name, a unique ID for the data, the text content itself, and a description to help you understand what it is. The function handles the details of figuring out whether you’re in backtest mode or live trading, and it also automatically connects the data to the current signal being executed. It's a simple way to keep track of what’s happening as your strategies run.

## Function dumpTable

This function helps you display data in a clear, organized table format, perfect for examining the results of your trading strategies. It takes an array of data objects and presents them as a table, automatically adjusting its behavior depending on whether you're in a backtesting or live trading environment. 

The function figures out the column headers on its own by looking at all the different keys used in your data, so you don't need to specify them. Think of it as a quick way to visualize and understand the details of your trading runs. It also handles the signal context automatically.


## Function dumpRecord

This function helps you save a record of data – think of it as a snapshot – to a specific location, linked to a particular trading signal. It's designed to work seamlessly within the backtest-kit framework, figuring out the correct environment (whether you're running a test or a live trading session) without you needing to specify it.  You provide the data you want to save, a name for the data storage location, a unique identifier for the dump, a description, and the function handles the rest, ensuring the record is properly stored and associated with the right signal. This allows you to easily examine and analyze historical trading data.

## Function dumpJson

This function lets you save complex data structures, like nested objects, as JSON blocks associated with a specific signal. Think of it as a way to record detailed information about a trade or event, ensuring it’s organized and accessible. It handles the technicalities of figuring out where this data should be saved, whether you're running a test or a live trading scenario, and automatically resolves any relevant signals. You provide the function with a name for the bucket, a unique ID for the dump, the JSON data itself, and a short description to explain what the data represents.


## Function dumpError

This function helps you report detailed error information within your trading strategies. It allows you to associate an error with a specific data bucket and a unique dump identifier, making it easier to track down issues. The function intelligently handles whether you're in a backtesting or live trading environment, simplifying your error reporting process. It also takes care of resolving any active signals automatically, saving you from manual signal management.


## Function dumpAgentAnswer

This function lets you save a complete record of an agent's conversation—all the messages exchanged—linked to a specific signal. It's useful for detailed analysis or debugging.

The function automatically figures out which signal it’s working with and whether you're running a backtest or a live trading session, so you don’t have to specify that.  You provide a set of messages, a descriptive text, and identifiers for where this data should be stored.


## Function createSignalState

This function helps you manage and track the state of your trading signals, especially when working with complex strategies. It creates two functions, `getState` and `setState`, which allow you to retrieve and update the signal's information. The really nice part is that you don’t need to manually specify the signal ID because it figures out the context automatically.

It's designed to be particularly useful when developing strategies that analyze many trades over time, like those driven by AI, where you might want to record specific metrics for each trade.

Think of it as a way to create a focused container for your signal data, keeping everything organized and making it easier to monitor performance.


## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It’s a handy shortcut for adjusting your trailing take-profit—it figures out how much the price needs to shift relative to your original take-profit distance to reach the new price you want. The function knows whether it's running a backtest or a live trading session, and it automatically gets the current market price to make the calculation. To use it, you simply provide the trading pair symbol and the absolute take-profit price you want.

## Function commitTrailingTake

The `commitTrailingTake` function helps manage your take-profit levels for ongoing trades. It allows you to fine-tune the distance between the current price and your take-profit target.

It's important to remember that this function always calculates adjustments based on the original take-profit price you set initially. This avoids any small errors from building up over time.

If you want to move your take-profit closer to the entry price, use a negative percentage shift. To move it further out, use a positive shift.

The function is smart about updates. It only changes the take-profit if the new level is more conservative, meaning closer to the entry price for long positions and closer to the entry price for short positions. It won't make your take-profit more aggressive.

It automatically knows if it’s running in a backtest or a live trading environment.

You'll need to provide the symbol of the trading pair, the percentage shift you want to apply, and the current market price to help determine if the take-profit needs adjustment.

## Function commitTrailingStopCost

This function lets you change the trailing stop-loss price to a specific value. It handles some of the behind-the-scenes work for you, like figuring out the correct percentage shift based on the original stop-loss distance and getting the current price to calculate that shift. It works whether you're running a backtest or a live trading session, simplifying the process of adjusting your stop-loss orders. You just need to provide the symbol of the trading pair and the new desired stop-loss price.

## Function commitTrailingStop

The `commitTrailingStop` function helps you dynamically manage the trailing stop-loss distance for your trading signals. It lets you adjust the stop-loss based on a percentage shift, always referencing the original stop-loss distance to ensure accuracy.

Think of it like this: you're fine-tuning the protection for your existing trade.

The function only makes changes that improve your protection—it won’t move your stop-loss closer to your entry price if it’s already well-placed.  For long positions, it will only widen the stop-loss, and for short positions, it will only tighten it. The function automatically recognizes whether it's running in backtest or live trading mode. 

You provide the symbol of the trading pair, the percentage adjustment you want to apply, and the current market price.


## Function commitSignalNotify

This function lets you send out informational messages about your trading strategy. Think of it as a way to leave notes for yourself, or to trigger external alerts based on what's happening in your strategy.

It allows you to broadcast details about decisions made within your strategy – for example, when a specific indicator reaches a certain level.

You don't need to worry about many details like the strategy name or exchange; the function automatically picks those up. It will also grab the current price for you.

You can also add extra information to your notification using the optional `payload` parameter.


## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you partially close a trading position when you’ve made a certain profit, measured in dollars. It simplifies the process by automatically calculating the percentage of your position to close based on the dollar amount you specify. 

This function works by taking the current price into account and ensures the price movement aligns with your take profit goal. 

You just need to tell it which trading pair you're dealing with (`symbol`) and how much profit in dollars you want to lock in (`dollarAmount`). The function handles the rest, adapting to whether you're in a backtesting or live trading environment.

## Function commitPartialProfit

This function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially moving you closer to your target profit. You specify the trading symbol and the percentage of the trade you want to close – for example, closing 25% of your position. It's designed to work seamlessly whether you're testing your strategy or using it for live trading, figuring out the mode automatically. This is a simple way to lock in some profits as the trade moves favorably.


## Function commitPartialLossCost

This function lets you partially close a position to limit losses, specifically when the price is trending in the direction of your stop-loss. It's a shortcut; it figures out the percentage of your position to close based on the dollar amount you specify.  You tell it the symbol you're trading and how much money you want to recover. The function handles the details of calculating the percentage and takes care of retrieving the current price for accurate execution. It also automatically adjusts based on whether you're running a backtest or a live trade.

## Function commitPartialLoss

This function allows you to partially close an open position when the price is moving in a losing direction, essentially stepping toward your stop loss. You specify the symbol of the trading pair and the percentage of the position you want to close, with values ranging from 0 to 100. It's designed to handle both backtesting and live trading environments automatically, so you don't need to worry about configuring it differently for each. This is useful for reducing risk and managing potential losses on a trade.


## Function commitCreateSignal

This function lets you send custom trading signals into the backtest or live environment. Think of it as a way to inject your own logic instead of relying solely on the framework's built-in signals.

You provide a symbol (like "BTC-USDT") and a data object (DTO) containing details about the signal.

If you include a `priceOpen` value in the signal data, the system will either execute the signal immediately if that price is already met, or schedule it to run when that price is reached. If you don’t provide a `priceOpen`, the signal executes immediately using the current price.

The system also validates the signal data to ensure it's correctly formatted and prevents you from triggering multiple signals at the same time. The system automatically determines whether it's running in a backtest or a live trading environment.


## Function commitClosePending

This function lets you cancel a pending trade order without interrupting your strategy’s overall operation. It essentially clears a signal that was already set to be executed, like hitting the pause button on a trade. It’s useful when you want to adjust a trade idea but don't want to completely halt the strategy's signal generation or execution. The function works seamlessly whether you’re running a backtest or a live trading strategy, so you don’t have to worry about different configurations. You can optionally add a note to the canceled order for record keeping.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal without interrupting your trading strategy. Think of it as a way to clear a pending order that hasn't yet been triggered. It won't impact any orders that are already active, and it won't halt your strategy's ability to generate new signals – your strategy will keep running as usual. The framework intelligently handles whether you're in a backtesting or live trading environment automatically. 

You can optionally include extra information like an ID and note with the cancellation if you need to.

## Function commitBreakeven

This function helps you manage your risk by automatically adjusting your stop-loss order. It moves your stop-loss to the entry price – essentially, a zero-risk position – once the price has moved favorably enough to cover any transaction fees and a small slippage buffer.

The threshold for this move is calculated to account for both the fees you paid and a little extra to protect against slippage. 

The function is designed to work seamlessly whether you’re backtesting strategies or trading live, and it automatically retrieves the current price needed for the calculation. You just need to specify the trading symbol you want this action to apply to.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new purchase order to your dollar-cost averaging (DCA) strategy for a particular trading pair. 

It automatically calculates the current price and adds a new entry to the trading history, keeping track of the average entry price. 

This function also signals that a new average buy has occurred, which can be useful for monitoring and reporting. You can optionally provide a cost value, though it's not strictly required.

## Function commitActivateScheduled

This function lets you manually trigger a scheduled trading signal before the price actually hits the expected level. Think of it as a way to jumpstart a planned trade if you have a specific reason to do so. 

It sets a flag on the signal, and the strategy will then process it during the next price update. The system intelligently figures out whether it's running a backtest or a live trade.

You provide the symbol of the trading pair, and optionally, you can add a note and an ID to the commit payload to keep track of why you activated the signal early.


## Function checkCandles

The `checkCandles` function is designed to quickly verify if your historical price data (candles) are already stored and available. It efficiently checks for the existence of candles in your persistent storage, like a database, without needing to load the entire dataset.

It works by sending a request to the persistence adapter to see if each expected timestamp has a corresponding candle. If even one candle is missing or misaligned, the entire check will fail. This targeted approach makes it much faster than loading all the data just to check for its presence.

You provide parameters to the function, detailing what to check.

## Function cacheCandles

The `cacheCandles` function helps make sure your historical price data is available where it needs to be, specifically in the persistent storage your backtesting system uses. It works by first checking if the data already exists. If it doesn't, it will download the missing price data and then verify that the data is available. This process is designed to be robust, with a built-in retry mechanism to handle potential issues. You provide details like the trading symbol, time interval, the start and end dates of the data you need, and the exchange it's from. You can also include optional callbacks to track the progress of the check and warm-up stages.

## Function addWalkerSchema

This function lets you register a walker, which is essentially a way to run and compare multiple trading strategies simultaneously using the same historical data. Think of it as setting up a competition between strategies – the walker will execute each strategy's backtest and then evaluate how they performed based on a metric you define. You provide the walker's configuration, which tells the system how to run and analyze the comparison.

## Function addStrategySchema

This function lets you tell backtest-kit about a new trading strategy you've built. Think of it as registering your strategy so the framework knows how to use it. 

When you register a strategy this way, the framework will automatically check to make sure it's set up correctly, for things like the prices, take profit/stop loss logic, and timestamps. It also helps prevent your strategies from sending too many signals at once and ensures your strategy's data remains safe even if something unexpected happens.

You provide the framework with a configuration object that defines your strategy's specifics, and that’s all there is to it.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. 

It’s how you define your position sizing strategy – whether you want to use a fixed percentage of your capital, a more sophisticated method like the Kelly Criterion, or something based on the Average True Range (ATR).

You'll provide a configuration object that details your sizing approach, including risk parameters, limits on position size, and even custom logic for calculating sizes during the backtest. Think of it as setting the rules for how much money you'll risk on each trade.

## Function addRiskSchema

This function lets you define how your trading system manages risk. It’s like setting up rules to prevent overexposure and ensure stability.

You can tell the system the maximum number of trades you want running at once. 

It also supports complex risk checks – things like monitoring portfolio correlations or custom metrics – and even provides a way to react to signals that are flagged as too risky.

Importantly, all your trading strategies will share the same risk management rules, allowing for a holistic view of your overall risk exposure. This shared system keeps track of all active positions so you can make informed decisions.


## Function addFrameSchema

This function lets you tell backtest-kit about a new timeframe generator you want to use in your backtesting. Think of it as registering a new way to slice up your historical data into the time periods your trading strategy will analyze.

You provide a configuration object that specifies things like the beginning and end dates of your backtest, the timeframe interval (e.g., 1-minute, 1-day), and a function that will handle events related to generating those timeframes. This allows you to customize how your backtest data is organized and processed.


## Function addExchangeSchema

This function lets you tell backtest-kit about a new data source for an exchange, like Binance or Coinbase. 

Think of it as registering the exchange so the framework knows where to find historical price data and how to interpret it. 

The exchange schema you provide will define things like how to fetch candlestick data, how to format prices and quantities, and even how to calculate things like the VWAP (volume-weighted average price). This enables the backtest kit to use that exchange’s data in your simulations.


## Function addActionSchema

This function lets you tell the backtest-kit framework about a new action you want to trigger during your backtesting process. Actions are really useful for connecting your backtest to external systems – think sending notifications to Discord when a trade hits a profit target, or logging key events to a database. You can use them to manage your strategy's state, send real-time updates, track performance, or even trigger completely custom logic.

Essentially, each action gets created independently for every strategy run and receives all the important signals and data points generated during execution. You provide a configuration object defining how this action should work.
