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

The `writeMemory` function lets you store data, like important observations or calculated values, within your trading strategy. Think of it as creating a named storage container for your strategy to remember things between calculations. It’s designed to associate that data with a specific signal, ensuring it's available only in the context of that signal’s execution. 

The function takes an object with several pieces of information: the name of the storage bucket, a unique identifier for the memory slot, the value you want to store, and a description to help you understand what's in that memory slot later.  The function handles figuring out whether the code is running in a backtest or live trading environment and uses the information from the execution context to handle any pending or scheduled signals appropriately.


## Function warmCandles

This function helps prepare your backtesting environment by pre-loading historical price data. It downloads and stores candlestick data (open, high, low, close prices) for a specific time period, making your backtests run faster because the data doesn't need to be fetched repeatedly. You provide a start and end date, along with the desired candlestick interval (e.g., 1-minute, 1-hour, daily), and the function takes care of downloading and caching that data for future use. This is especially useful for longer backtesting periods or when dealing with multiple strategies.

## Function waitForReady

This function helps ensure everything is set up correctly before you start trading, whether it's a backtest or a live session. It waits patiently, checking periodically, until all the necessary pieces – like the data registries for exchanges, frames (historical data), and strategies – are in place. 

For backtesting, it makes sure you have historical data (frames) available, while live trading only needs the exchange and strategy information.

Think of it as a brief pause during startup that prevents errors later on, and if things take too long to load, it won't hang indefinitely; it will simply let you know that something might be missing when you try to trade. You can control whether it checks for the historical data (frames) by using the `isBacktest` parameter.

## Function validate

This function helps you make sure everything is set up correctly before you start any backtesting or optimization runs. It checks if all the names you're using for things like exchanges, trading strategies, and risk management systems actually exist in the system.

You can tell it to check specific parts of your setup by providing arguments, or if you want a complete check, you can just run it without any arguments – it will validate everything it can find. The results of these checks are saved so they don’t need to be repeated unnecessarily, which helps keep things running smoothly. It's a good habit to use this to prevent errors down the line.


## Function stopStrategy

This function lets you pause a trading strategy's signal generation. 

It effectively tells the strategy to stop creating new trades. 

Any existing open trades will finish as planned.

The system will gracefully halt operations, either when it's idle or after a trade concludes, depending on whether it's in backtest or live mode.

You simply provide the trading pair symbol (like BTC/USDT) to specify which strategy to pause.


## Function shutdown

This function provides a way to properly end the backtesting process. It sends out a signal that tells all parts of the system to prepare for closing down, like saving data or releasing resources. This ensures everything wraps up cleanly when you need to stop the backtest, for example, when you press Ctrl+C.

## Function setSignalState

This function lets you update a specific value related to a trading signal, keeping track of it as the trade progresses. It's especially useful for strategies that collect details about each trade, like how long it’s open or its percentage gain.

The function automatically figures out whether you're in backtesting or live trading mode based on the environment it's running in.

If there isn't an active signal to associate the update with, it will let you know by displaying a warning.

Think of it as a way to store and update information about a trade’s performance—it’s designed to help you analyze how your strategies are doing over time.


## Function setSessionData

The `setSessionData` function lets you store information that's relevant to a specific trading setup – like a particular stock, the strategy you're using, the exchange it's on, and the timeframe. Think of it as a temporary storage space for things you need to remember between candles during a backtest or even while your bot is actively trading.

You can use this to hold intermediate calculations, results from complex AI models, or anything else that needs to be preserved and accessed across multiple candles.

If you need to clear out the stored data, simply pass `null` as the value.

This function automatically adapts to whether it's running a backtest or live trading session, so you don't have to worry about that.

The function takes the trading symbol as a string and the data you want to store.


## Function setLogger

You can now control how backtest-kit reports its activity. The `setLogger` function lets you plug in your own logging system, so you can send messages to a file, a console, or any other logging destination. 

This is really helpful for debugging and understanding what's happening during your backtests. 

The framework will automatically add important information like the trading strategy's name, the exchange being used, and the trading symbol to each log message, giving you a complete picture of the process. Just make sure your custom logger follows the `ILogger` interface.

## Function setConfig

This function lets you adjust the overall settings of the backtest-kit framework. You can use it to modify things like the default data source or other global parameters. Think of it as fine-tuning how the whole system behaves.  If you're running tests and need to bypass some safety checks, there's an `_unsafe` flag you can use, but be careful with that!

## Function setColumns

This function lets you customize the columns that appear in your backtest reports. It's all about tweaking the information presented in those reports to suit your specific needs. You can override the default column settings, essentially telling the system which data points are most important to highlight. Be aware that it checks your custom column definitions to make sure they’re structurally sound, but there’s a special flag (`_unsafe`) to skip these checks if you're using it in a testing environment.

## Function searchMemory

The `searchMemory` function lets you find relevant memory entries based on a search query. It’s designed to quickly locate information stored in your memory buckets.

It uses a smart ranking system called BM25 to determine the best matches for your query, ensuring the most relevant entries appear first. 

Behind the scenes, it figures out whether it's running in a backtest or live environment and automatically gets the current signal information, so you don't have to worry about those details.

You need to provide a bucket name and your search query as parameters. The function returns an array of results, each containing an ID, a score indicating how well it matches your query, and the content of the memory entry.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a backtest or live trading environment, but without actually needing a full backtest setup. This is perfect for testing individual components or functions that rely on things like the current time or exchange data.

You provide a function you want to run, and `runInMockContext` will temporarily set up a simplified environment for it.

You can customize this environment by providing values for things like exchange name, strategy name, symbol, or whether it's a backtest or live mode. If you don't provide these, it uses sensible defaults that create a basic live-mode context. Essentially, it's a way to get the benefits of a context without the overhead of a full backtest.

## Function removeMemory

This function lets you delete a specific memory entry associated with a signal. 
Think of it as cleaning up data that's no longer needed.

It automatically handles knowing whether you're running a backtest or a live trading environment. 
You just provide the bucket name and the unique ID of the memory entry you want to get rid of. 
The function takes care of the rest, resolving any pending signals that might be related to that memory.

## Function readMemory

The `readMemory` function lets you retrieve stored data from memory, specifically data tied to the current trading signal. Think of it as accessing a previously saved piece of information related to your trade. It automatically figures out whether you're in a backtesting environment or a live trading scenario, and it also finds the correct active signal for you.

You'll provide a simple object with the name of the memory bucket and the unique identifier of the specific memory item you want to retrieve. The function then returns a promise that resolves with the data you requested, shaped according to the type you specified.


## Function overrideWalkerSchema

The `overrideWalkerSchema` function lets you modify an existing walker configuration, which is crucial when you're comparing different strategies. Think of it as updating a pre-existing plan—you're not starting from scratch. Only the parts of the walker configuration you specify will be changed; everything else stays as it was. This provides a way to fine-tune how your strategies are evaluated and compared. It takes a partial walker configuration as input and returns a promise resolving to the updated walker schema.

## Function overrideStrategySchema

This function lets you modify a strategy that's already been defined within the backtest-kit framework. Think of it as a way to tweak an existing strategy without having to recreate it entirely. You provide a small piece of updated configuration, and only those specific settings will be changed in the original strategy’s definition; everything else stays the same. This is useful for making incremental adjustments to your trading strategies.


## Function overrideSizingSchema

This function lets you adjust how your position sizing works without completely replacing the original setup. Think of it like tweaking existing settings – you can change specific parts of a sizing schema, like the maximum size or risk percentage, while leaving the rest untouched. It’s useful when you want to fine-tune your sizing based on changing market conditions or testing different strategies without a full overhaul. You provide a partial sizing configuration, and this function updates the existing sizing schema with those changes.

## Function overrideRiskSchema

This function lets you adjust existing risk management settings within the backtest-kit framework. Think of it as a way to fine-tune a risk profile without completely rebuilding it. 

You provide a partial configuration—just the parts you want to change—and the function applies those changes to the existing risk schema. The rest of the settings remain as they were. It's useful for making incremental adjustments to your risk controls. 

The function returns a promise that resolves to the updated risk schema.

## Function overrideFrameSchema

This function lets you modify an existing timeframe configuration used for backtesting. Think of it as updating a specific part of a timeframe's setup without changing everything. You provide a partial configuration – only the settings you want to change – and the function updates the existing timeframe with those new values, leaving everything else as it was originally defined. This is useful if you need to tweak a timeframe’s details without redoing the entire setup.

## Function overrideExchangeSchema

This function lets you modify an existing exchange's data source within the backtest-kit framework. Think of it as a way to tweak a previously defined exchange without completely rebuilding it. You provide a partial set of changes – just the parts you want to update – and the function merges those changes into the original exchange schema, leaving everything else untouched. This is useful for making adjustments to your data sources on the fly.

## Function overrideActionSchema

This function lets you tweak existing action handlers—those pieces of code that respond to specific events during a backtest. Think of it as a way to adjust how your trading system reacts to things without completely rewriting it. You can update just the parts you need, like changing how a callback function works or adapting it for different testing environments. It’s particularly handy if you want to modify your strategy's behavior on the fly, or switch between different implementations of the same handler.  You provide a partial configuration object, and it merges that with the existing handler setup, leaving everything else untouched.

## Function listenWalkerProgress

This function allows you to track the progress of a backtest as it runs. It provides updates after each strategy finishes, letting you monitor how the backtest is proceeding.

The updates, or "events," are delivered in the order they happen, even if your processing of each update takes some time. To ensure smooth operation and prevent issues with multiple updates happening at once, it uses a system that queues and processes them one at a time.

You provide a function as input; this function will be called for each progress update. This lets you, for example, display progress bars, log results, or perform other actions based on the backtest's current state. The function you provide will also be called when the backtest completes.

To stop listening for these progress events, the function will return another function that, when called, unsubscribes from the events.


## Function listenWalkerOnce

The `listenWalkerOnce` function lets you monitor the progress of a walker, but only until a specific event happens. It's like setting up a temporary alert – you provide a rule to identify the event you're waiting for, and a function to run when that event occurs. Once that event is detected, the monitoring stops automatically. This is handy when you need to react to a particular condition within the walker's process but don’t want to keep listening indefinitely. 

You define what kind of event you're looking for using a filter function. Then, you specify the action – a callback function – that will be triggered when that event is found. The function automatically stops listening once the event has been processed, ensuring that you only react once.


## Function listenWalkerComplete

This function lets you listen for when a backtest run finishes. 
It's especially useful when you're using `Walker.run()` to test multiple strategies.
You'll get notified when the entire process is done, and the notification will be handled in a safe, sequential way, even if your callback function takes some time to process.
This ensures that events are processed in the order they come in, preventing unexpected behavior due to concurrent operations.
To stop listening, the function returns another function that you can call.

## Function listenWalker

The `listenWalker` function lets you keep track of what’s happening as your trading strategies run within a backtest. It's like setting up a listener that gets notified when each strategy finishes its execution during a backtest run. 

The notifications, or events, are delivered one after another, even if the code you provide to handle them takes some time to complete. To keep things orderly and prevent issues, it makes sure your code processes these notifications one at a time. 

You give it a function that will be called for each event, and it returns a function that you can use to unsubscribe from those notifications later.


## Function listenValidation

This function lets you keep an eye on potential problems during the risk validation process, which is a critical part of ensuring your trading strategies are safe. It will notify you when validation checks fail and throw errors.

Think of it as setting up an alert system for validation issues. The errors you receive will be handled one at a time, even if your error handling code involves asynchronous operations. This helps prevent a cascade of errors and makes it easier to track down what went wrong. You provide a function that will be called whenever a validation error occurs, allowing you to log it, report it, or take other corrective actions. The function returns a way to unsubscribe from the validation error events when you no longer need them.

## Function listenSyncOnce

This function lets you listen for specific events happening within the backtest kit, but only once. It’s handy when you need to coordinate with other systems – for example, ensuring something happens before or after a trade. You provide a filter to determine which events you're interested in, and a function to execute when that event occurs. Importantly, any trade actions are paused until your function finishes, guaranteeing synchronization.  Once the function runs and completes, the listener automatically stops, preventing further executions. The `warned` parameter allows for controlling warning messages.

## Function listenSync

This function lets you react to synchronization events within the backtest-kit framework, ensuring that your code runs alongside asynchronous operations. It’s designed to keep things in sync with external systems, like order execution platforms.

Essentially, you provide a function that gets called whenever a signal is being processed – think of signals being opened or closed.  If your provided function involves asynchronous operations (like promises), the backtest will pause and wait for those operations to finish before continuing. This prevents unexpected behavior or data inconsistencies that can arise when things don't happen in the correct order. There's a `warned` parameter which is currently not used, but could be used for future implementation.


## Function listenStrategyCommitOnce

This function lets you react to specific events related to strategy changes, but only once. Think of it as setting up a temporary listener that waits for something particular to happen, then runs your code and then stops listening. You provide a filter to define what events you're interested in, and a function to execute when that event occurs. Once that event is detected, the listener automatically disappears. This is handy when you need to react to a single, specific strategy change.

## Function listenStrategyCommit

This function lets you tap into events happening during strategy management, like when a signal is cancelled, closed, or when adjustments are made to stop-loss or take-profit levels. Think of it as subscribing to updates about your trading strategies. Importantly, these events are handled one at a time, even if your callback function takes some time to process, ensuring things don’t get messed up by simultaneous actions. You provide a function that will be called whenever one of these strategy events occurs, allowing you to react to these changes in real time. The function you provide will return a function that you can call to unsubscribe from these events.

## Function listenSignalOnce

This function lets you react to a specific signal event just once and then automatically stops listening. You provide a filter to define which events you're interested in, and a function to run when a matching event arrives. Think of it as setting up a temporary listener that only triggers and then disappears. It's perfect for situations where you need to wait for a particular condition to be met within your trading signals.


## Function listenSignalNotifyOnce

This function lets you react to specific trading signals just once and then automatically stop listening. You provide a filter – a function that determines which signals you're interested in – and a callback function that gets executed when a matching signal arrives. After that single execution, the listener quietly goes away, so you don’t have to manually unsubscribe.

It's helpful when you need to react to a signal once, like confirming a trade or triggering an alert, and don't want to continue monitoring it.


## Function listenSignalNotify

This function lets you tap into notifications about signals, specifically when a trading strategy shares a note related to an active position. Think of it as listening for custom messages from your strategy.

These messages are delivered one at a time, even if the code you provide to handle them takes some time to execute. This ensures things happen in the right order and avoids potential conflicts. You provide a function that will be called whenever a new signal notification arrives. When you're done listening, you can unsubscribe using the function that this function returns.

## Function listenSignalLiveOnce

This function lets you set up a listener that will only react to specific signal events coming from a live trading simulation. You provide a filter – a test to see if an event is what you're looking for – and a function to run when a matching event arrives. Once that function has executed once, the listener automatically stops, ensuring it doesn't keep running unnecessarily. This is great for a quick, targeted reaction to a particular market situation during a live test.

## Function listenSignalLive

This function lets you tap into the live trading signals generated when you’re running a backtest. It's designed for receiving events sequentially as they happen.

You provide a function (`fn`) that will be called whenever a new trading signal is available. This callback receives data about the signal, packaged in an `IStrategyTickResult` object.

Keep in mind that you'll only receive these signals when the backtest is actively running with `Live.run()`. 

The function returns another function – call that returned function when you're done listening. This helps clean up and prevent unwanted signals from continuing to be processed.


## Function listenSignalBacktestOnce

This function lets you tap into the signal events generated during a backtest, but only for a single event that matches your criteria. You provide a filter – a way to specify which events you're interested in – and a callback function that will be executed once a matching event occurs. Once that one event is processed, the subscription is automatically cancelled, ensuring it won't fire again. It's a simple way to react to a specific occurrence within your backtest run without needing to manage manual subscriptions.


## Function listenSignalBacktest

This function lets you tap into the events happening during a backtest run. Think of it as setting up a listener that gets notified whenever a signal is generated.

It’s particularly useful if you're building a system that needs to react to these signals in a reliable, sequential order, as the events are processed one after another.

To use it, you provide a function that will be called each time a new signal arrives from the backtest. This allows your code to observe and potentially respond to the backtesting process itself. 

This subscription is specifically linked to events produced by `Backtest.run()`.


## Function listenSignal

This function lets you listen for important updates from your trading strategy, like when it's idle, opens a position, is actively trading, or closes a position. It’s designed to handle these events one at a time, even if the code you provide to respond to the event takes some time to run. Think of it as setting up a listener that guarantees events are processed in the order they come in, preventing any potential conflicts that could arise from multiple actions happening at once. You provide a function that will be called each time a new signal event occurs, and this function will be given information about the event. When you're done listening, the function returns another function that you can call to unsubscribe.


## Function listenSchedulePingOnce

This function allows you to react to specific ping events within a schedule, but only once. Think of it as setting up a temporary listener that will execute your code when a particular condition is met, and then quietly disappear. You provide a filter to define what kind of ping events you're interested in, and a function to run when that event occurs. Once the event happens and the function runs, the listener stops listening, ensuring it only acts once. It's perfect for situations where you need to respond to a single, specific event and then move on.

## Function listenSchedulePing

This function lets you listen for periodic "ping" signals while a scheduled trading signal is being monitored, essentially waiting for it to become active. 

Think of it as a heartbeat signal confirming the signal is still in place and being tracked.

You provide a function that will be called each minute with details about the scheduled signal. This is useful if you need to log the signal's status, perform custom checks, or track its lifecycle. The function you provide will also unsubscribe from the events when it returns.


## Function listenRiskOnce

This function lets you temporarily listen for specific risk rejection events and react to them. You provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs. Once that single event triggers your function, the listener automatically stops, ensuring it doesn't interfere with other operations. It's a handy way to handle one-off situations or check for a particular condition related to risk management.

You define the criteria for what events you want to react to using a filter function. 

Then you specify what should happen when a matching event is detected. 

Finally, the function automatically takes care of stopping the listener after it's run once.


## Function listenRisk

The `listenRisk` function lets you set up a listener that gets notified whenever a trading signal is blocked because it violates risk rules. 

It's designed to be clean and efficient – you'll only receive these notifications when a signal is actively rejected, not when everything is okay.

This helps avoid unnecessary notifications.

The events are handled in the order they occur, and the system makes sure your callback function runs one at a time, even if it's asynchronous, so things don’t get messed up.

You provide a function that will be called with the details of the rejected risk event. The listener function you provide returns another function that, when called, will unsubscribe from receiving these risk rejection events.

## Function listenPerformance

The `listenPerformance` function allows you to monitor how long different parts of your trading strategy take to execute. It’s like having a performance detective for your backtest. 

You provide a function that gets called whenever a performance event occurs – think of it as a notification when something finishes running. This lets you pinpoint slow operations and optimize them. Importantly, these events are handled one at a time, ensuring the analysis isn't disrupted by other processes.


## Function listenPartialProfitAvailableOnce

This function lets you set up a listener that reacts to partial profit levels being reached, but only once. 
You provide a filter to specify which profit levels should trigger the reaction, and a function to execute when that level is met. 
Once the condition is met and the function is called, the listener automatically stops, so you don’t have to manage it yourself.
It’s great for situations where you need to react to a particular profit target just one time.

The `filterFn` lets you define precisely which partial profit events you want to be notified about.
The `fn` is what gets executed when the filtered event occurs, handling the specific action you want to take.


## Function listenPartialProfitAvailable

This function lets you track your trading progress as you reach certain profit milestones, like 10%, 20%, or 30% gain. 

It sends notifications whenever these milestones are hit. 

Importantly, it handles these notifications in a controlled way, ensuring events are processed one at a time, even if your response to an event takes some time. This prevents things from getting out of order or overloaded. You provide a function that gets executed when a milestone is reached, and this function receives information about the event.

## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to specific changes in partial loss levels. You provide a filter – a way to define exactly which changes you're interested in – and a function to execute when a matching change occurs. Once that matching event is found and your function runs, the listener automatically stops listening. It's a convenient way to react to a particular loss situation just once and then move on.

## Function listenPartialLossAvailable

This function lets you track how much of your trading capital has been lost during a backtest. 

It sends notifications when the loss reaches certain milestones, like 10%, 20%, or 30% of your initial balance.

The notifications are delivered one after another, even if your callback function takes some time to process. This helps avoid issues that can arise when multiple callbacks try to run at the same time. You provide a function that will be called with the details of each partial loss event. The function you provide will return a function to unsubscribe from the event.

## Function listenMaxDrawdownOnce

This function allows you to react to specific maximum drawdown events and then automatically stop listening. 

Think of it as setting up a temporary alert - you tell it what kind of drawdown you're looking for (using `filterFn`), and it will trigger a function (`fn`) once it sees that.

After that one trigger, the alert automatically turns off. It’s perfect if you need to react to a specific drawdown and then don't need to monitor it anymore.

You provide a filter to determine when the event is important, and a function that will execute when the filter is met. The function returns a cleanup function that can be called to unsubscribe manually.

## Function listenMaxDrawdown

This function lets you keep an eye on how much your trading strategy has lost from its peak value. It will notify you whenever a new maximum drawdown is reached. 

Importantly, it makes sure these notifications are handled one at a time, even if the processing takes a little while. This is great for things like adjusting your risk levels or recording key drawdown points as your strategy runs.

You provide a function that will be called each time a new maximum drawdown occurs, and this function receives information about the drawdown event. The function you provide also returns a function that you can use to unsubscribe from the drawdown events.

## Function listenIdlePingOnce

`listenIdlePingOnce` lets you react to infrequent system activity updates, but only once a specific condition is met. Think of it as setting up a temporary listener that only triggers when an idle ping event comes along that fits your criteria. You define what qualifies as that event with a filter function, and then specify what action to take when a matching event is found. Once that one event is handled, the listener automatically disappears, so you don't have to worry about cleaning it up yourself.

It takes two things: a filter that determines which events you care about, and a function to execute when a matching event arrives. This allows you to quickly respond to specific, infrequent system states without needing a persistent subscription.


## Function listenIdlePing

This function lets you set up a listener that gets notified whenever the backtest framework is completely idle – meaning no trades are pending or scheduled. It's like a signal saying "everything's quiet, nothing's happening right now." You provide a function that will be executed whenever this idle state is detected, and that function will receive information about the idle ping event. This is useful for things like pausing visualizations, running maintenance tasks, or simply observing periods of inactivity.  The function returns an unsubscribe function so you can stop listening later if you need to.

## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a particular trading event happens that meets certain criteria. Think of it as a temporary listener that waits for a specific profit condition to be met, then runs your code once and stops listening. You define what kind of event you're looking for with a filter, and then provide a function that will execute when that event is found. It automatically takes care of stopping the listening process after the event happens, so you don’t have to worry about managing subscriptions. 

It's perfect for situations where you only need to react to a specific occurrence.

Parameters:

You provide a filter function to specify which events you want to be notified about.
You also supply a function that will be run only once when an event matching the filter appears.

## Function listenHighestProfit

This function lets you monitor when a trading strategy achieves a new peak in profitability. It's like setting up an alert that triggers whenever your strategy hits a record high profit.

The alerts are delivered one at a time, even if the processing of one alert takes some time, ensuring things happen in the order they occur.

To use it, you provide a function that will be called each time a new highest profit is reached, allowing you to react to those milestones in your trading strategy. Think of it as a way to keep tabs on your strategy's best performance and adapt accordingly.

## Function listenExit

This function lets you set up a listener that gets notified when something goes seriously wrong and stops the entire process—like when background tasks fail. It's different from handling regular errors; these are the kind of problems that halt everything.

The listener function you provide will be called whenever a critical error occurs, and these errors are handled one after another, even if your listener function itself involves asynchronous operations. This ensures a controlled response to those critical failures. You can unsubscribe from these notifications at any time using the function that is returned.

## Function listenError

This function lets your strategy react to errors that happen during its operation, but aren't critical enough to stop the whole process. Think of it as a safety net for potential hiccups, like a failed API request. 

It allows you to define a function that gets called whenever one of these recoverable errors occurs. The events are handled in the order they happen, and even if the function you provide takes some time to run, the system makes sure it doesn’t interfere with other events. Effectively, it's a way to keep your trading system running smoothly even when things don’t go perfectly.


## Function listenDoneWalkerOnce

This function allows you to monitor when a background process finishes, but with a twist – it only triggers your code once and then stops listening. You provide a filter to specify which completed processes you're interested in, and a callback function that will be executed once a matching process finishes. It's perfect for situations where you need to react to a specific completion event just once and then move on, automatically cleaning up after itself.

## Function listenDoneWalker

This function lets you keep track of when background tasks within a Walker finish processing. 

It's like setting up a listener that gets notified when a certain job is done.

The callback function you provide will be called whenever a background task completes, and importantly, these calls happen one after another, even if your callback function itself takes some time to finish. This ensures events aren't missed or processed out of order. The system uses a special queuing mechanism to guarantee this sequential handling.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It's designed for situations where you need to do something just once when a background process completes.

You provide a filter—essentially a rule—to determine which completion events you’re interested in, and a function that will execute when a matching event occurs. The function will be triggered only once, and then automatically stops listening for these completion events, so you don't need to worry about manually unsubscribing. This is handy for things like confirming a specific calculation finished successfully.

## Function listenDoneLive

This function lets you listen for when background tasks within the backtest-kit framework finish running. Think of it as getting notified when a process completes, but with a twist—it handles those completions in a carefully managed sequence, even if the notification involves asynchronous actions.

It’s useful for scenarios where you need to react to the end of a background process, ensuring that any subsequent actions happen in the right order and avoiding any unexpected clashes or issues. You provide a function that gets called when a task is done, and the system takes care of the rest. The callback will be executed sequentially.


## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtests you're interested in – only backtests that match your filter will trigger the callback. Once the backtest completes and matches your filter, the provided function will be executed, and the listener automatically stops listening, ensuring you only get notified once. It's a simple way to handle completion events without lingering listeners.

## Function listenDoneBacktest

This function lets you be notified when a backtest finishes running in the background. 

Think of it as setting up a listener that gets triggered once the backtest is complete. 

The events are handled one after another, even if the function you provide takes some time to run, ensuring things stay organized and predictable. It's a reliable way to know when your backtest is truly done and you can move on to the next step. You just give it a function that will run when the backtest is finished.

## Function listenBreakevenAvailableOnce

This function helps you react to specific breakeven protection events, but only once. It lets you set a condition – a filter – to determine which events you’re interested in. 

Once an event matches your condition, the provided callback function is executed, and then the subscription automatically stops. 

Think of it as setting a watch for something to happen, responding to it briefly, and then letting go. It's handy when you need to know when a certain breakeven state is reached and then don’t need to listen anymore.

You define the event condition with `filterFn` and what to do when that event happens with `fn`.

## Function listenBreakevenAvailable

This function lets you be notified whenever a trade's stop-loss automatically adjusts to the entry price – essentially, when the profit covers all transaction costs. Think of it as a safety net; the trade is protected from minor losses.

It ensures these notifications are handled one at a time, even if your notification handling takes some time. To use it, you simply provide a function that will be called each time a breakeven event occurs, and it returns a function to unsubscribe from the events.

## Function listenBacktestProgress

This function lets you monitor the progress of a backtest as it runs. It provides updates during the background processing phase of a backtest. 

You give it a function that will be called with progress information. Importantly, these updates happen one at a time, even if your monitoring function takes some time to complete – this ensures things stay in order. Think of it as a way to get regular reports on how the backtest is doing.


## Function listenActivePingOnce

This function lets you react to specific active ping events, but only once. It's like setting up a temporary listener that fires a function when a certain condition is met, and then quietly disappears afterward. You define what constitutes that "certain condition" using a filter function, and the function handles the subscription and unsubscription automatically. This is great if you need to wait for a particular event to happen just one time and then move on.

## Function listenActivePing

This function lets you keep an eye on active signals within your backtesting environment. It listens for events that occur every minute, providing updates on the lifecycle of active signals. Think of it as a way to monitor what's happening with your strategies and adjust accordingly.

The function provides a way to subscribe to these events, and the events are handled one at a time, even if your callback function takes some time to process. This ensures a reliable and predictable flow of information.

You provide a function that will be called whenever a new active ping event occurs, and this callback will receive details about the event. The function returns a way to unsubscribe from these events when you no longer need to listen.

## Function listWalkerSchema

This function provides a way to see all the different trading strategies (walkers) that have been set up in your backtest-kit environment. It essentially gives you a list of all the registered strategies, allowing you to inspect them, understand what's available, or build tools to manage them. Think of it as a directory of all your trading methods – it's helpful for troubleshooting, creating documentation, or creating user interfaces that interact with these strategies. The result is a promise that resolves into an array, where each item describes a single strategy.

## Function listStrategySchema

This function lets you see a complete list of all the trading strategies you've added to the backtest-kit system. 

It's like looking up all the recipe cards in your cookbook. 

You can use this to check what strategies are available, to create a user interface that lets you pick strategies, or just to get a sense of what's going on behind the scenes. The function returns a promise that resolves to an array of strategy schema objects, which contain details about each strategy.

## Function listSizingSchema

This function lets you see all the different sizing strategies you've set up within your backtesting environment. It gathers information about how your positions are sized, essentially giving you a look under the hood at your position sizing configurations.  Think of it as a quick way to check if your sizing rules are what you expect or to generate a list for display. It returns a list of sizing schemas, allowing you to inspect or use this configuration information programmatically.

## Function listRiskSchema

This function lets you see all the risk configurations that are currently active within your backtest setup. Think of it as a way to peek under the hood and see how risk is being managed. It returns a list of these configurations, which can be helpful if you're troubleshooting, creating documentation, or want to build a user interface that dynamically displays risk settings. Basically, it's a convenient way to get a complete overview of the risk schemas that are in play.

## Function listMemory

This function helps you see all the stored memories associated with the current trading signal. 

It's designed to automatically figure out which signal you're working with and whether you're in a backtesting or live trading environment, so you don't have to specify those details manually. 

You provide a bucket name, and it returns a list of memories, each including a unique identifier and the actual data stored within that memory. Think of it as a way to peek at the history of decisions and information used by the system for your signal.


## Function listFrameSchema

This function gives you a look at all the different data structures (frames) your backtest is using. It's like a directory listing of all the templates for how your data is organized. You can use this to check what’s happening under the hood, help create documentation, or build tools that automatically adjust to the types of data you're working with. It returns a promise that resolves to an array of frame schema objects, providing a complete overview of your data's structure.

## Function listExchangeSchema

This function gives you a way to see all the different exchanges your backtest-kit is set up to work with. It essentially provides a catalog of all the exchanges you've told the system about.  Think of it as a quick way to check what data sources are available for testing or to build tools that automatically adapt to different exchanges.  It returns a list, so you can easily iterate through it programmatically.

## Function hasTradeContext

This function simply tells you whether the trading environment is ready for you to execute actions. 

It verifies that both the execution and method contexts are active. 

Think of it as a quick check to ensure you're in a state where you can safely use functions related to fetching data or formatting values within a trade. If it returns `true`, you’re good to go.


## Function hasNoScheduledSignal

This function helps you determine if a scheduled signal is currently active for a specific trading pair, like 'BTC-USDT'. It returns `true` if no signal is scheduled, and `false` if one exists. Think of it as the opposite of a function that checks *for* a scheduled signal. You can use it to make sure your system doesn't accidentally generate signals when one is already planned. It automatically figures out whether it's running in a backtesting environment or in a live trading scenario.


## Function hasNoPendingSignal

This function, `hasNoPendingSignal`, helps you determine if there's currently no pending signal for a specific trading pair. Think of it as the opposite of `hasPendingSignal` – if `hasPendingSignal` says there *is* a signal waiting, this function will tell you there isn't. It’s useful for controlling when new trading signals are generated; you might only want to create a new signal if there isn't one already in place. The framework will automatically adjust based on whether you're running a backtest or a live trading environment. You just provide the symbol, like "BTCUSDT", and it will return `true` if no signal is pending.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within your backtesting setup. Think of it like looking up the detailed instructions for how a particular trading bot operates. You simply provide the name of the walker you’re interested in, and this function returns a description of its structure and capabilities. This is useful for understanding what a walker does and how it's built.


## Function getTotalPercentClosed

`getTotalPercentClosed` helps you understand how much of your position in a particular trading pair remains open. It returns a percentage value – think of it like this, 100% means you haven’t closed any part of the position, while 0% means the entire position is closed.

This function is smart about how it calculates this percentage, even if you’ve used dollar-cost averaging (DCA) to enter into the trade and have made multiple buys at different prices.

You don't have to worry about specifying whether you're in backtest mode or live trading mode, it figures it out automatically. Just provide the symbol of the trading pair you're interested in.

## Function getTotalCostClosed

`getTotalCostClosed` helps you figure out how much money you've spent on a particular asset you're still holding. It’s especially useful if you've been buying in gradually (dollar-cost averaging) and closing out parts of your position along the way, as it keeps track of the cost even with those partial closures. The function will determine whether it’s running in a backtest or live trading environment automatically. You just need to tell it which symbol you’re interested in, like "BTCUSDT".


## Function getTimestamp

This function, `getTimestamp`, provides a way to retrieve the current time. It's essentially a tool to know what time it is within your trading simulation or live trading environment.

During a backtest, it tells you the timestamp associated with the specific timeframe you're analyzing. 

When you're trading live, it delivers the actual, real-time timestamp.

## Function getSymbol

This function allows you to find out which asset you're currently trading within your backtest or trading simulation. It's a simple way to get the symbol, like "AAPL" or "BTCUSDT," ensuring your code is working with the correct asset. The function returns a promise that resolves to the symbol as a string.

## Function getStrategySchema

The `getStrategySchema` function helps you find the blueprint for a specific trading strategy you've defined within the backtest-kit framework. It's like looking up the detailed specifications for a particular strategy. You provide the unique name of the strategy, and the function returns a structured description outlining its inputs, outputs, and how it's supposed to work. This lets you understand and work with your strategies in a more organized and predictable way.


## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade based on a given name. It's like looking up a pre-defined plan for determining trade sizes. You provide a name that identifies the sizing method, and the function returns the detailed configuration associated with that name, outlining how position sizes are calculated. This lets you access the sizing logic without needing to hardcode it yourself.

## Function getSignalState

This function helps you retrieve a specific value associated with an ongoing trading signal. It figures out which signal is currently active automatically.

If there's no active signal, it'll let you know with a warning and use a default value you provide.

It's designed to work seamlessly in both backtesting and live trading environments.

Think of it as a way to track metrics for each trade, particularly useful for complex strategies that might involve tracking things like how long a trade is open or its percentage gain, allowing you to dynamically adjust based on performance. The function's examples demonstrate how to manage trades with varying risk profiles and exit strategies based on these performance indicators.

You provide the trading symbol and an object that includes the name of the data bucket to use and an initial value for when no signal is active. It returns a promise that resolves to the retrieved value.

## Function getSessionData

This function lets you retrieve data that’s been saved for a specific trading setup – think of it as a temporary, shared memory. This data sticks around even if the backtest or live session restarts, which is perfect for storing things like complex calculations or the output from AI models you're using. You provide the trading symbol (like "BTC-USD") to identify the data you're looking for, and it returns the value or nothing if it doesn't exist. It automatically adjusts to whether you’re running a backtest or a live trading session.

## Function getScheduledSignal

This function helps you find out what scheduled signals are currently in effect for a specific trading pair. It looks for any pre-planned signals that might be influencing your strategy's actions.

If there aren't any scheduled signals active right now, it won't return anything—essentially, it’ll tell you there's nothing to see. 

It smartly figures out whether you're in a backtesting or live trading environment, so you don't need to worry about setting that manually.

You just need to tell it which trading pair (symbol) you're interested in, like 'BTCUSDT'.

## Function getRiskSchema

This function helps you find specific details about how a particular risk is being measured within your backtesting setup. It's like looking up a definition – you give it a name (the `riskName`), and it returns a structured description of that risk, outlining things like how it's calculated and what data it uses. Think of `RiskName` as a label you've given to a specific type of risk you're tracking. The result gives you all the information needed to understand and work with that risk.

## Function getRawCandles

This function helps you retrieve historical price data, specifically candles, for a given trading pair and timeframe. You can get a limited number of candles, or define a specific date range to pull data from. 

It's designed to work reliably within the backtest environment, ensuring the data you use for testing doesn't inadvertently look into the future.

You have several options for specifying your request: you can set both a start and end date along with a limit on the number of candles, just specify a start and end date, just specify an end date and limit, just specify a start date and limit, or simply request a certain number of candles starting from the most recent available data. The function takes care of calculating any missing parameters and validates that the end date is not beyond the current execution context.

Here's what the available parameters do:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT".
*   `interval`: The timeframe for the candles, options include "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", and "8h".
*   `limit`: The maximum number of candles to retrieve.
*   `sDate`: The starting date for the candles (in milliseconds).
*   `eDate`: The ending date for the candles (in milliseconds).


## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a pending trading signal has been waiting to be executed. It tells you the number of minutes the system has been holding back on a planned trade.

If there isn't a scheduled signal for the specified trading pair, the function will return null. 

You provide the trading pair symbol, like "BTCUSDT," to find out the waiting time for that particular asset.

## Function getPositionPnlPercent

To figure out how much your open positions are currently profiting or losing, use this function. It calculates the percentage of unrealized profit or loss for a specific trading pair.

This calculation considers factors like partial closes, dollar-cost averaging, slippage, and fees for a more accurate picture of your performance.

If there aren't any open positions currently being tracked, the function will return null. 

It intelligently determines whether it's running in a backtesting or live trading environment and automatically gets the latest price to make the calculation. You just need to provide the symbol of the trading pair, like "BTCUSDT".

## Function getPositionPnlCost

This function helps you understand the potential profit or loss on a trade that's still in progress. It figures out the unrealized profit or loss in dollars for a specific trading pair, based on the difference between your cost basis and the current market price.

The calculation takes into account various factors like how much you initially invested, any partial closes you've made, and even things like slippage and fees.

If there isn't an active trade in progress, the function will return null.

You don’t need to worry about getting the current market price yourself—this function handles that for you—and it adapts to whether you’re running a backtest or a live trading session.

To use it, you simply provide the trading pair symbol, like "BTC-USDT".

## Function getPositionPartials

This function allows you to see a history of partial profit or loss takes that have been executed for a specific trading pair. It essentially provides a breakdown of how your position has been incrementally closed out. If no trades are in progress, or if no partials have been taken, it will return either null or an empty array respectively.

The information returned for each partial close includes the type of partial (profit or loss), the percentage of the position that was closed, the price at which it was executed, the cost basis at the time, and the number of DCA entries included. You provide the symbol of the trading pair you want to check.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing out a position partially multiple times at roughly the same price. It checks if the current market price falls within a pre-defined range around any previously executed partial closes.

Think of it as a safeguard against accidentally triggering the same partial closing action repeatedly.

It determines if the `currentPrice` is close enough to a previously established partial close price, taking into account a tolerance range.

You provide the trading symbol and the current price, and optionally a configuration for the tolerance range (how close is "too close"). If no partial closes exist, or the current price is outside the range of all existing ones, it returns false.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out exactly when a specific trading position hit its lowest point, measured as a timestamp. It tells you the precise moment when the price dipped to its most unfavorable level for that position.

If there isn't a pending signal for the position, the function will return null, meaning it can't provide that drawdown information.

To use it, you'll need to specify the symbol of the trading pair you're interested in, like "BTC-USDT".


## Function getPositionMaxDrawdownPrice

This function helps you understand the potential downside risk of a specific trade you've made. It figures out the lowest price a position ever hit while it was open, effectively showing you the maximum drawdown experienced.

Think of it as identifying the biggest loss percentage the position faced from its highest point.

If there's no active trade for the specified symbol, the function will return null. You need to provide the symbol (like 'BTC/USDT') to get the drawdown information for that particular trading pair.


## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It tells you the percentage gain or loss (profit/loss) that occurred at the point when the position experienced its greatest drawdown. Essentially, it shows you how far in the red a position got at its lowest point.

The function requires you to specify the symbol of the trading pair you want to analyze, like 'BTC-USDT'.

If no open positions exist for the specified symbol, it won't return a value.


## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position's biggest loss. Specifically, it tells you how much money you lost (in the currency you're trading with, like USD or BTC) at the point when the position hit its lowest value. 

If there isn't a signal to analyze, the function will simply return null. You just need to provide the trading pair symbol, like "BTC/USDT," to get the information.

## Function getPositionMaxDrawdownMinutes

This function helps you understand how far back your trading position experienced its biggest loss. It tells you the number of minutes that have passed since the moment your position hit its lowest point. Essentially, it's a way to gauge how long ago the worst drawdown occurred, with zero meaning it just happened. If there's no active trading signal for a particular symbol, the function won’t return a value. You need to specify which trading pair symbol you are interested in to retrieve this information.

## Function getPositionLevels

getPositionLevels lets you check the prices at which your DCA (Dollar Cost Averaging) orders have been placed for a particular trading pair. It gives you a list of prices, starting with the initial price you bought at and including any additional prices you added later through commitAverageBuy. 

If there's no active trading signal, it will return nothing. If you bought only once, it will return a list containing just the original price. You provide the symbol, like "BTCUSDT", to specify which trading pair you're interested in.

## Function getPositionInvestedCount

This function tells you how many times you've added to a position using dollar-cost averaging (DCA) for a specific trading pair.

Essentially, it counts how many times you've used the `commitAverageBuy()` function to gradually build up your position.

A value of 1 means you only made the initial purchase; higher numbers indicate subsequent DCA additions.

If there's no ongoing trade (no "pending signal"), the function returns null.

You don't need to worry about whether the system is running a backtest or a live trade - it figures that out automatically.

You just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT".


## Function getPositionInvestedCost

This function helps you figure out how much you've invested in a particular trading pair, like BTC/USD. 

It calculates the total cost based on all the average buy prices used when establishing the position. 

Essentially, it adds up the costs associated with each buy order to give you a single number representing your total investment.

If there isn't a pending signal for that trading pair, the function will return null.

The function smartly adjusts its behavior based on whether you’re running a backtest or live trading. 

You just need to provide the trading pair symbol to get the cost.

## Function getPositionHighestProfitTimestamp

This function helps you find out exactly when a specific trading position made the most profit. 

It looks at a position for a particular trading symbol and tells you the timestamp—that's a record of when—the price reached its peak profit level for that position.

If there isn't a signal currently pending for that symbol, it will return null, meaning it can't determine the highest profit timestamp. 

You only need to provide the trading symbol, like "BTCUSDT", to get this information.

## Function getPositionHighestProfitPrice

This function helps you find the peak profit price achieved during a trading position. 

Think of it as tracking the best possible outcome so far. For long positions, it remembers the highest price above the entry price; for short positions, the lowest price below the entry price. 

It starts by noting the initial entry price when the position begins and gets updated as new price data comes in. It's a useful indicator for understanding how a trade has performed relative to its potential. If no trade is currently active, it won't return a value.


## Function getPositionHighestProfitMinutes

This function tells you how long ago a trading position reached its highest profit. 

Think of it as a measure of how far the position has fallen from its best point.

It returns the number of minutes that have passed since that peak profit was achieved.

If there’s no active trading signal, the function won’t return anything.

You provide the trading pair symbol, like 'BTCUSDT', to specify which position you're checking.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best-ever profit point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage, ensuring the result is always zero or positive. 

Essentially, it tells you how much "wiggle room" your trade has had to reach its peak profitability. 

If there’s no historical signal data available for the specified trading pair, the function won't return a value.

You’ll need to provide the trading pair’s symbol (like "BTCUSDT") to use this function.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its potential peak profit. It calculates the difference between the highest profit achieved so far and the current profit, but only considers the positive difference. Essentially, it tells you how much room there is for improvement in your trade, based on past performance.  You provide the trading symbol (like "BTCUSDT") and it returns a number representing that distance, or nothing if there's no pending signal to analyze.

## Function getPositionHighestProfitBreakeven

This function helps you determine if a trade ever reached a point where it could have broken even, even at its most profitable price. Essentially, it checks if, at the peak of a winning trade, the price would have allowed you to recoup your initial investment. 

It requires you to provide the trading symbol, like "BTCUSDT".

If there are no open or pending signals for that particular symbol, the function will let you know by returning null.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade has performed. It tells you the highest percentage profit achieved by a position for a given trading pair. Think of it as checking the peak performance of a trade – what was the biggest gain it ever saw? If there's no data available for that trade, it will return null. You need to provide the symbol of the trading pair you're interested in to use this function.

## Function getPositionHighestPnlCost

This function helps you find out the highest profit and loss cost incurred during a trading position's lifespan. It looks at a specific trading pair, like BTC-USD, and tells you the PnL cost when the best (most profitable) price was achieved. If there's no record of signals for that position, it will return null, meaning there's no data to report. Think of it as checking the peak of a position’s profitability – what was the cost associated with reaching that high point?


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand the riskiness of a trading position. It calculates how far your potential profit (represented as a percentage) is from the lowest point it reached during a drawdown – essentially, how much room there is for things to get worse before they get better. 

The result is a percentage value showing this distance.

If there isn’t a pending trade signal for the specified trading pair, the function won’t return a value.

You give it the symbol of the trading pair (like "BTCUSDT") to get the information.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your position is from its lowest point in terms of profit and loss. It calculates the difference between your current profit/loss and the lowest profit/loss you've experienced so far. 

Essentially, it shows you the "distance" from the bottom of the dip.

You provide the trading symbol (like BTC/USDT) to see the result for that specific pair. The function returns a numerical value representing that distance. If there isn't any trading activity yet, it won't return a value.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you understand how long a trading position is expected to last. It tells you the estimated duration, in minutes, based on the initial signal that created the position. 

Essentially, it reveals how much time remains before the position is considered "expired."

If there's no open position currently being managed, this function will return null. 

You provide the trading pair symbol (like 'BTC-USDT') to identify the position.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally entering multiple DCA positions at roughly the same price. It checks if the current market price is close enough to any of your existing DCA entry levels, within a defined tolerance. 

Essentially, it prevents you from accidentally triggering another DCA entry when the price is already within a range you've already targeted.

The function takes the trading pair symbol and the current price as input. You can also customize the acceptable tolerance range (how close the price needs to be) using the `ladder` parameter.

It returns `true` if the current price falls within your specified tolerance zone around any existing DCA entry level, and `false` if no such overlap exists.


## Function getPositionEntries

getPositionEntries lets you check the history of your DCA (Dollar-Cost Averaging) entries for a specific trading pair. It shows you the price and cost associated with each time your position was adjusted, whether it was the initial buy or a later DCA commitment. If no signal is pending, it will return nothing. If you made just one initial purchase and no additional DCA entries, it will return a list containing only that initial entry. The data provided includes the execution price and the amount spent for each step of your position building.

## Function getPositionEffectivePrice

This function helps you figure out the average price at which you've acquired a position in a trade, considering any dollar-cost averaging (DCA) adjustments. It calculates a weighted average based on the cost of each transaction, essentially showing you the effective entry price. 

If you've closed part of a position previously, the function intelligently factors in the cost basis of those partial closes. If no DCA has been applied, it simply returns the original opening price. 

If there's no pending trade currently, the function will indicate this by returning null. It automatically understands whether it’s running in a backtesting environment or a live trading scenario.

You provide the symbol of the trading pair (like BTC/USD) to get the price for that specific asset.


## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trade reached its highest profit point. It’s a way to track how far your position has fallen from its peak. 

Think of it like this: if the function returns zero, you’re at the exact point where you made the most money on that trade. As the price moves against you, this number increases.

It needs a symbol – the trading pair like 'BTCUSDT' – to know which position to analyze. If there's no active trade, it won't be able to give you a number and will return null.

## Function getPositionCountdownMinutes

This function tells you how much time is left before a trading position expires. It calculates this by looking at when the position was initially pending and comparing that to an estimated expiration time. 

The result will always be a positive number of minutes, meaning it won't show any negative time. If there's no pending signal for the position, the function will return null.

You provide the trading symbol, like 'BTC-USDT', to find the countdown for that specific position.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you understand how long a specific trading position has been open. It calculates the number of minutes the position has been active since its creation. 

If there isn't a pending signal related to the position, the function will return null. 

You need to provide the trading pair symbol as input, like "BTCUSDT", to check the active minutes for that position.


## Function getPendingSignal

This function lets you check if your trading strategy has a pending order waiting to be triggered. It gives you the details of that pending signal, like the price and quantity. 

If there isn't a pending signal currently active, it will tell you by returning nothing. 

It cleverly figures out whether it's running a backtest or a live trading session automatically. 

You just need to tell it which trading pair (like BTC/USDT) you're interested in.

## Function getOrderBook

This function retrieves the order book details for a specific trading pair, like BTCUSDT. 

It pulls the data from the exchange you're connected to.

You can optionally specify the depth, or how many levels of the order book you want to retrieve. If you don’t specify a depth, it will use a default value.

The function takes into account the current time context, which is important whether you're running a backtest or live trading. The exchange itself decides how to handle the time information.


## Function getNextCandles

This function helps you grab a chunk of future candles for a specific trading pair and timeframe. 

It's designed to work with the exchange you're using and gets candles that come *after* the current point in time of your backtest.

You tell it which trading pair you’re interested in (like BTCUSDT), what timeframe the candles should be (options include 1 minute, 30 minutes, 4 hours, and more), and how many candles you want to retrieve. The function then returns an array of candle data.


## Function getMode

This function simply tells you whether the backtest-kit is currently running a historical simulation (backtest mode) or a live trading session. It returns a promise that resolves to either "backtest" or "live", giving you a straightforward way to know which environment your code is operating in. This is useful for adjusting your strategies based on the context.

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. It's great for things like making sure you wait a certain amount of time before placing another trade after a stop-loss is triggered.

The function checks both your historical backtest data and live trading data to find the most recent signal. If no signals exist for the specified trading pair, it will return null.

It automatically handles whether you're in backtest or live trading mode, simplifying its use. You just need to provide the symbol of the trading pair you’re interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the riskiness of a trading strategy. It calculates the largest percentage difference between the highest profit and the lowest loss your positions have experienced. 

Essentially, it tells you the maximum “drawdown” – how far your profits could have fallen from their peak. 

You provide the trading pair, like "BTC-USDT," and the function returns this drawdown percentage. If there's no trading activity, it won't be able to calculate anything and will return null.


## Function getMaxDrawdownDistancePnlCost

This function calculates the maximum drawdown distance based on profit and loss. 

It essentially measures the difference between the highest profit point and the lowest point of loss a trading strategy experiences for a given trading pair. 

Think of it as a way to understand the potential risk exposure during a backtest - it tells you how far from its peak profit a strategy might fall.

The result is always zero or positive, as it considers the absolute distance.

You provide the symbol of the trading pair you want to analyze, and the function returns a numerical value representing that drawdown distance. If no trading signals exist for that symbol, the function will not return a value.


## Function getLatestSignal

This function helps you grab the most recent trading signal, whether it’s still active or has already closed. Think of it as checking the history of what your strategy has done. It’s particularly handy for things like preventing trades too soon after a loss – you can use the timestamp of the last signal to pause trading for a set period. The function looks in both the backtest records and the live trading data to find this signal, and will return nothing if no signals have been generated. It adapts to whether you’re running a backtest or a live trade without you having to specify. 

You provide the trading pair symbol (like BTCUSDT) to specify which signal you're looking for.

## Function getFrameSchema

This function helps you find the blueprint for a specific frame used in your backtesting strategy. Think of it like looking up the definition of a particular data structure. You give it the name of the frame you're interested in, and it returns a description outlining what data that frame contains and how it's organized. This is useful for understanding the expected format of data within your backtest.


## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that backtest-kit knows about. You provide the name of the exchange, like "binance" or "coinbase", and it returns a structured description of that exchange, including information about its data format and trading rules. Think of it as looking up the blueprint for how that exchange works within the backtesting system. This blueprint helps backtest-kit understand the exchange's data and simulate trading on it accurately. 

It requires you to know the exact name of the exchange you want to use.


## Function getDefaultConfig

This function gives you the default settings used by the backtest-kit framework. Think of it as a template or starting point for your own custom configurations. It provides a bunch of preset values for things like candle fetching, order placement, signal generation, and reporting, so you can quickly understand what’s possible to adjust and what the initial assumptions are. This is helpful if you're just starting out or want to double-check the framework's baseline behavior.

## Function getDefaultColumns

This function provides you with the standard set of column configurations used when generating reports. Think of it as a template showing all the possible columns you can include, like performance metrics, risk indicators, or strategy events. It returns a fixed set of definitions, so you can examine the available options and understand how they’re structured before customizing your own report layout. You’ll find details on columns for closed trades, heatmaps, live data, partial fills, breakeven points, and various performance and risk-related events.

## Function getDate

This function, `getDate()`, provides a way to retrieve the current date within your trading strategy. It's context-aware, meaning its behavior changes depending on whether you're running a backtest or live trading. When backtesting, it gives you the date associated with the timeframe you're currently analyzing. If you're trading live, it returns the actual current date.

## Function getContext

This function gives you access to the environment your current trading method is running in. Think of it as a snapshot of the method's surroundings. It returns an object containing details about the method execution, giving you valuable context for your trading logic.

## Function getConfig

This function lets you peek at the framework's global settings. Think of it as a way to see how the backtesting environment is set up – things like how often it checks prices, limits on slippage, or the maximum number of signals it can handle. Importantly, it gives you a copy of these settings, so you can look at them without changing the actual running configuration. It's useful for understanding how a backtest is behaving or for debugging.

## Function getColumns

This function provides a way to see what columns are being used to generate your backtest reports. It gives you a snapshot of the configurations for different report sections, like performance metrics, risk analysis, and strategy events. Think of it as peeking at the blueprint for how your report is structured. Importantly, it returns a copy, so any changes you make won’t affect the original column definitions used by the framework.

## Function getClosePrice

This function lets you quickly grab the closing price of the most recent candle for a specific trading pair and time interval. Think of it as a shortcut to see how a particular asset finished trading within a certain timeframe. You’ll need to provide the symbol, like "BTCUSDT" for Bitcoin against USDT, and the interval, such as "1h" for an hourly candle. The function will then return a promise that resolves to the closing price as a number.

## Function getCandles

This function allows you to retrieve historical price data, specifically candles, from a connected exchange. You provide the symbol of the trading pair, such as "BTCUSDT", along with the desired time interval for the candles (like 1 minute, 5 minutes, or 4 hours).  The function then fetches a specific number of candles, counting backwards from the current time. It leverages the exchange's built-in mechanism for getting candle data. Essentially, it's your way to access past price movements for a given trading pair and timeframe.


## Function getBreakeven

This function helps determine if a trade is profitable enough to cover transaction costs. It looks at the current price of a trading pair and compares it to a threshold that accounts for slippage and trading fees. If the price has moved sufficiently in a positive direction to cover these costs, the function returns true. It works whether you're in a backtesting environment or a live trading scenario, automatically adjusting to the context. You provide the symbol of the trading pair and the current price to check.

## Function getBacktestTimeframe

This function lets you find out the dates available for backtesting a specific trading pair, like BTCUSDT. It returns a list of dates, representing the timeframe for which historical data is available for that symbol. Essentially, it tells you what dates you can use when you're testing a trading strategy. You just need to provide the symbol of the trading pair you're interested in.

## Function getAveragePrice

This function helps you determine the Volume Weighted Average Price, or VWAP, for a specific trading pair like BTCUSDT. It looks at the last five minutes of trading data to calculate this price, considering both the price and the volume traded. If there's no trading volume, it will instead give you a simple average of the closing prices. You provide the symbol of the trading pair you're interested in, and the function returns a promise that resolves to the VWAP value.

## Function getAggregatedTrades

This function helps you retrieve a history of trades for a specific trading pair, like BTCUSDT. 

It pulls this data directly from the exchange your backtest uses.

You can ask for all trades within a certain timeframe (about an hour by default), or request a specific number of recent trades. Think of it like grabbing the most recent transactions to analyze how prices moved. 
If you don’t specify how many trades you want, it'll grab a manageable chunk from the past hour. If you *do* specify a number, it will get enough trades to meet that request.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your trading strategy. Think of it as looking up the rules and structure for a particular trade. You give it the name of the action you're interested in, and it returns a detailed description of what that action entails – what data it needs, what it expects, and how it's supposed to function. This is essential for understanding and validating your actions.

## Function formatQuantity

The `formatQuantity` function helps you ensure the quantity you're trading is presented correctly, following the rules of the specific exchange you're using. It takes the trading pair symbol – like "BTCUSDT" – and the numerical quantity you want to trade. Then, it automatically adjusts the number to show the correct number of decimal places, as required by the exchange. This makes sure your orders are valid and avoid any rejections due to formatting issues. It returns the formatted quantity as a string.

## Function formatPrice

This function helps you display prices in the correct format for a specific trading pair. It takes the symbol of the trading pair, like "BTCUSDT," and the raw price value as input. It then uses the exchange's rules to ensure the price is displayed with the right number of decimal places. This prevents you from having to manually figure out how many decimals are needed for each currency pair.


## Function dumpText

The `dumpText` function lets you record raw text data, like logs or analysis outputs, associated with a specific trading signal. Think of it as a way to permanently store information related to a particular moment in your backtest or live trading. 

It handles the technical details of knowing which signal you're working with and whether you're in a backtesting simulation or a live trading environment. 

You provide the function with a small object containing the bucket name, a unique ID for the dump, the actual text content, and a short description to help you remember what the data represents. It doesn't return a value, but it ensures the data is safely stored for later review or analysis.


## Function dumpTable

This function helps you display data in a clean, organized table format. It's designed to take an array of objects and present them as a table, making it easy to understand the data within your backtesting or live trading environment. The function intelligently handles the context of your backtest, whether it's a simulation or a real-time analysis. The table headers are generated automatically based on all the different data fields present in your data. You provide the function with the table's name, a unique identifier, the data itself (an array of objects), a brief explanation, and it handles the rest.


## Function dumpRecord

The `dumpRecord` function lets you save a piece of data – essentially a flat list of key-value pairs – associated with a specific signal. Think of it as creating a snapshot of information related to a trading signal.

It automatically handles the details of which signal this record belongs to and whether you’re running a backtest or live trading. 

You provide the function with information like the bucket name, a unique identifier for the dump, the record itself (the key-value pairs), and a description to explain what the data represents. This function simplifies the process of persisting data related to your trading activities.


## Function dumpJson

The `dumpJson` function lets you save a complex object—think of it as any data structure with nested information—as a formatted JSON string. This string is then associated with a specific signal, acting like a snapshot of the data at a particular point in your trading simulation or live trading. 

It's designed to be very convenient because it figures out the environment you're running in (whether it's a backtest or live trading) and automatically manages the signal handling, so you don’t have to worry about those details. You just provide the data, a unique identifier, a description, and it takes care of the rest.


## Function dumpError

This function helps you report and track errors that happen during your backtesting or live trading sessions. It packages up details about the error, including a description and a unique identifier, associating it with the specific trading signal involved. It figures out whether you're in a backtest or live environment automatically, streamlining the error reporting process. Think of it as a way to make sure errors are clearly logged and connected to the correct trading decisions. You provide the function with information about the error, and it takes care of the rest, making debugging and analysis much easier.


## Function dumpAgentAnswer

This function lets you output all the messages exchanged with the agent, specifically related to a particular signal. Think of it as a way to get a complete transcript of the agent's interaction for a given scenario. 

It automatically figures out where the process is running – whether it’s a backtest or a live trading session – and handles retrieving the correct signal information for you. You provide the function with details like the bucket name, a unique identifier for the dump, the actual messages, and a brief description to help you keep things organized. It's designed to be a straightforward way to review agent conversations for analysis or debugging.

## Function createSignalState

This function helps you manage the state of signals within your trading strategies. It provides a simple way to get and set the signal's state, and crucially, it figures out whether you're running a backtest or a live trade automatically – you don't need to manually specify the signal ID.

It's particularly useful for building sophisticated strategies, especially those driven by large language models, where you need to track detailed performance metrics for each trade, such as how long a trade is open and its peak profit. The aim is to create strategies that can handle drawdowns while aiming for substantial profits. Certain rules, like exiting a trade if it’s been open for a long time and hasn't reached a certain profit level, are often applied.

The `params` object configures the signal state.

## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade, regardless of the original take-profit setup. It essentially changes your trailing take-profit to a fixed price. The system figures out whether it's running a backtest or a live trade, and it automatically gets the current market price to ensure the calculation is accurate. You just need to provide the trading pair (like BTCUSDT) and the desired take-profit price.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit level for an existing trading signal. It's designed to adjust the take-profit distance based on a percentage change from the original take-profit level you set when the signal was created.

It’s important to understand that this adjustment is always calculated based on the initial take-profit distance, not any previously adjusted trailing take-profit. This prevents tiny errors from adding up over time and throwing off your strategy.

When you call this function, a percentage shift is applied to the original take-profit distance. A negative shift moves the take-profit closer to your entry price, making it more conservative. A positive shift moves it further away, making it more aggressive.

The function is smart; it only changes the take-profit if the new level is more conservative than the current one.  For long positions, it only allows the take-profit to move closer to the entry price, and for short positions, it only allows it to move further away.

Finally, this function automatically determines whether it’s being used in a backtest or a live trading environment.


## Function commitTrailingStopCost

This function lets you update the trailing stop-loss for a trade to a specific price. It's designed to simplify things by handling some of the calculations for you. It takes the trading symbol and the new desired stop-loss price as input.

The function figures out if you're running a backtest or a live trading environment and automatically gets the current market price to perform the necessary calculations. Essentially, it's a shortcut for setting a trailing stop-loss based on an absolute price, referencing the initial stop-loss distance.


## Function commitTrailingStop

The `commitTrailingStop` function lets you fine-tune the distance of a trailing stop-loss order. It's designed to help you dynamically manage your risk as a trade progresses.

It's important to understand that this function calculates adjustments based on the original stop-loss level you set, not the current, potentially adjusted trailing stop. This is key to preventing small errors from adding up over time.

You control the adjustment with `percentShift`: negative values move your stop closer to your entry price (tightening it), while positive values move it further away (loosening it).  The system is smart – it won’t move your stop in a way that reduces your protection; it only accepts improvements.

Think of it as a safety net; it’ll only tighten your stop if that tightening actually strengthens your position.

The function automatically adapts to whether you’re running a backtest or a live trade.

You provide the trading symbol, the percentage adjustment, and the current market price to the function.


## Function commitSignalNotify

This function lets you send out informational notifications related to your trading strategy. Think of it as a way to add custom messages or alerts during a trade – it won’t change your positions but will provide extra context. You can use it to log important events happening within your strategy, like when a specific indicator triggers, or to send out custom notifications. It simplifies the process by automatically pulling in details like the trading symbol, strategy name, exchange, and timeframe. It also grabs the current price for you, making it easy to include in your notifications. You can also add extra details to the notification using the payload option.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you take partial profits by specifying a dollar amount you want to close out. It’s a simpler way to manage your positions because it automatically calculates the percentage needed based on your initial investment.

Think of it as saying, "I want to close $150 worth of this position," and the function handles the rest.

It's designed to be used when the price is moving in a favorable direction towards your target profit level.

This function works in both backtesting and live trading environments without needing any extra setup, and it retrieves the current price for you, making the process even easier.


## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of your open trade when the price moves favorably, getting you closer to your target profit. It's designed to help you lock in some gains while still allowing the trade to potentially continue running. You specify the trading symbol and the percentage of the position you want to close, for example, closing 25% of the position. The function cleverly adjusts to whether it's being used in a simulated backtest or in live trading.


## Function commitPartialLossCost

This function helps you partially close a position when the price is moving in a losing direction. It lets you specify how much you want to close in dollar terms, and it automatically figures out what percentage of your position that represents. It simplifies the process by handling things like fetching the current price and automatically working whether you're in a backtest or live trading environment. 

Essentially, you tell it which trading pair you're dealing with and how many dollars you want to close, and it takes care of the rest to move towards your stop loss.


## Function commitPartialLoss

This function lets you partially close an open position when the price is moving in a direction that would trigger your stop loss. It's useful for reducing risk by closing a portion of your position at a predetermined loss level. You specify the trading symbol and the percentage of your position you want to close, with the percentage needing to be between 0 and 100. The framework automatically handles whether it's being used in a backtesting environment or a live trading scenario.

## Function commitClosePending

This function lets you finalize a previously initiated close order for a trading strategy without interrupting its normal operation. It essentially clears out a "pending" signal, effectively saying "yes, proceed with the closing of this position."

Think of it as confirming an action already in progress – it doesn’t pause the strategy, nor does it prevent it from generating new signals afterward.

You can optionally include extra information like an ID or a note with this confirmation, to help track the closing action. This function is smart enough to know whether it's running in a backtesting environment or a live trading scenario.

## Function commitCancelScheduled

This function lets you cancel a scheduled signal, essentially removing it from the queue, without interrupting your trading strategy's normal operation. Think of it as pausing a future action without stopping the entire process. It won't affect any signals that are already active, and it won't halt the strategy from generating new signals—it just clears the specific signal you’re targeting. The framework automatically handles whether it's running a backtest or a live trading session.

You provide the symbol of the trading pair, and optionally, a payload containing an ID and a note to help you track why the signal was cancelled.


## Function commitBreakeven

This function helps you automatically manage your stop-loss orders. It shifts your stop-loss to the entry price, effectively turning your position risk-free, once the price moves in a profitable direction. 

Specifically, this happens when the price gains enough to cover transaction fees and account for a small slippage allowance. The exact threshold for triggering this move is calculated based on those fees and slippage. 

The function handles the details of knowing whether it's running in a backtesting environment or live trading and automatically gets the current price needed for the calculation. You just need to tell it the trading pair symbol.


## Function commitAverageBuy

The `commitAverageBuy` function helps you add a new step in your dollar-cost averaging (DCA) strategy. It essentially records a purchase of an asset at the current market price and includes it in the history of your position. 

This function automatically figures out whether it's running a backtest or a live trade and gets the current price for you. You can optionally specify a cost for the buy, although it’s not always required. After adding the new purchase, it updates the average price you paid for the asset and announces an "average-buy commit" event.

## Function commitActivateScheduled

This function lets you trigger a scheduled trading signal to run before the price actually hits the price you originally set it for. 

Think of it as a way to manually advance the schedule. 

It’s designed to be flexible, automatically adapting to whether you're running a backtest or a live trading session. 

You specify the trading pair symbol and can optionally include extra details like an ID and note for your records. It sets a flag that the system will then recognize and act on during the next price update.

## Function checkCandles

The `checkCandles` function is designed to quickly verify if your historical candle data is already available and stored. It efficiently checks for the existence of candles within a specific timeframe. Instead of loading all your data, it performs a targeted check, making it much faster to determine if a backtest can proceed or if data needs to be fetched. It uses the persistence adapter to do this, leveraging a “hasValue” check on each expected timestamp, so even a single missing candle will flag the absence of complete data.

## Function addWalkerSchema

This function lets you register a "walker" – essentially a configuration – that will be used to run backtests and compare different trading strategies against each other. Think of it as setting up a system to automatically test out different approaches and see how they stack up.

The walker tells the backtest-kit how to run those comparisons, determining which strategies to evaluate and what metrics to use for judging their performance. You provide a configuration object (`walkerSchema`) to define this process.


## Function addStrategySchema

This function lets you tell the backtest-kit about a new trading strategy you've created. Think of it as registering your strategy so the framework knows how to use it. 

When you register a strategy, the framework automatically checks things to make sure it's set up correctly. This includes verifying the signals your strategy generates (like prices and take profit/stop loss rules) and making sure signals aren't sent too frequently. 

If you're running live tests, the framework will also make sure your strategy's information is safely saved even if something unexpected happens. 

You provide the framework with a configuration object describing your strategy when you call this function.

## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. You provide a configuration object that outlines your sizing strategy, including details like whether you want to use a fixed percentage, a Kelly Criterion approach, or ATR-based sizing. 

The configuration also specifies the risk parameters you're comfortable with, any limits on the trade size, and even a way to react to specific events during sizing calculations. Essentially, it’s where you define how much of your capital you’ll risk on each trade.


## Function addRiskSchema

This function lets you tell the backtest-kit framework about your risk management setup. It's how you define things like how many positions you can hold at once across all your strategies and set up custom checks to make sure your portfolio is behaving as expected. Importantly, this risk configuration is shared between all strategies, so you get a holistic view of your risk exposure. The framework keeps track of all your open positions, which you can use to build those custom checks and even decide whether to allow or reject incoming trading signals.


## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator it can use. Think of it as registering a way to create the specific time periods (like daily, weekly, or hourly) that your backtest will analyze.

You provide a configuration object describing the timeframe's behavior, including the start and end dates for your backtest, the interval between data points (e.g., one day), and a function to handle events related to timeframe generation. By registering these timeframes, the framework knows how to structure the data it uses for your backtest.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a specific cryptocurrency exchange you want to use for your simulations. You'll provide a configuration object that defines how to fetch historical price data (candles), how to format prices and trade sizes, and how to calculate a common indicator like VWAP (volume-weighted average price). Think of it as registering a new data source so the backtest can work with it. The `exchangeSchema` object holds all the necessary details for the backtest-kit to understand and interact with that exchange.

## Function addActionSchema

This function lets you tell backtest-kit about new actions your strategy can take. Think of actions as a way to extend your backtesting system to do things beyond just generating trades. They’re useful for things like sending alerts to a messaging service when a trade hits a profit target, logging detailed events to a file, or even sending data to a central analytics platform. 

Essentially, each time your strategy runs, it can trigger these actions, allowing you to react to specific events like a signal being generated or a trade reaching a certain profit level. You define the configuration for these actions when you call `addActionSchema`.
