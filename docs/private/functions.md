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

The `writeMemory` function lets you store information persistently during a trading simulation or live execution. Think of it as writing data to a labeled container, identified by a unique name and ID. This function simplifies things by automatically figuring out whether you're in a test run or a live trading environment and adapts accordingly. You provide the container's name, a unique identifier for the data within that container, the data itself (which can be any object), and a brief description to help you remember what's stored. It’s a convenient way to save and retrieve key information throughout your trading process.


## Function warmCandles

This function helps speed up your backtesting by pre-loading historical price data. It downloads candles (open, high, low, close prices and volume) for a specified time period, from a starting date to an ending date, and stores them for quick access. Think of it as preparing the data in advance, so your backtest doesn't have to repeatedly fetch it during the simulation. You define the start and end dates, and the time interval (e.g., 1-minute, 1-hour) for the data you want to download and store. This function makes backtesting more efficient, particularly when dealing with large datasets or frequent testing.


## Function waitForReady

This function ensures that all necessary components are fully loaded and ready before you begin trading, whether you're running a backtest or a live trading session. It periodically checks if the registries for exchanges, frames (for backtesting), and strategies have been populated.

If you're doing a backtest, it waits for all three – exchange, frame, and strategy – to be ready. For live trading, it only requires the exchange and strategy registries. 

Think of it as a safety net to prevent errors that can occur when components are still loading; it prevents your trading system from starting prematurely. The function will pause until everything is in place, and if it can't get everything ready within a set time, it moves on quietly, letting you handle any missing components later.


## Function validate

This function helps ensure everything is set up correctly before you run your backtests or optimizations. It checks if all the entities you're using – things like exchanges, trading strategies, and risk management components – actually exist in the system.

You can tell it to validate specific entities, or if you leave it blank, it will check *everything*. 

It's a quick way to catch potential errors early, saving you time and headaches later on. The results of these checks are saved so it's fast to run multiple times.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. 

Think of it as putting the strategy on hold. It won't create any new trading signals. 

Any existing signals will finish up normally, and the system will gracefully stop at a suitable point, whether it's in backtesting or live trading. 

You just need to tell it which trading pair – the symbol – you want to pause.

## Function shutdown

This function provides a way to safely end the backtesting process. It signals to all parts of the system that a shutdown is happening, giving them a chance to clean up their work and save any necessary data. Think of it as a gentle way to tell the backtest to stop, rather than abruptly ending it. This is useful when you need to stop the backtest, like when you press Ctrl+C.

## Function setSignalState

This function helps you manage and track the state of a trading signal. It’s particularly useful when you're building strategies that react to ongoing trades, like those driven by AI. 

The function updates the state value for a specific trading symbol, keeping track of things like how long a trade has been open or its maximum gain.

It automatically handles figuring out whether you're in a backtesting or live trading environment.

If there's no active signal to apply the state to, it will let you know by showing a warning.

Think of this as a way to accumulate details about each trade—like the highest percentage gain—to help you refine your trading approach. The design is meant for AI strategies that analyze performance over multiple trades to optimize performance.

## Function setSessionData

This function lets you store data that's specific to a particular trading symbol, strategy, exchange, and time frame. Think of it as a temporary holding place for information you need to keep track of as you process candles.

It's great for remembering things like the results of complex calculations or the state of an indicator, so you don't have to recalculate them every time.

The data you save this way can even survive if your process unexpectedly restarts when you’re live trading.

You can clear out the stored data by passing `null` as the value.

It automatically figures out whether it’s running in backtest or live mode, so you don't need to worry about that.

You provide the symbol as a string, and then the data or null value you want to store.


## Function setLogger

This function lets you plug in your own logging system to track what's happening within the backtest-kit framework. It takes a logger object that adheres to a specific interface, and then any log messages generated by the framework – things like what strategy is running, which exchange is being used, and the symbol being traded – will be sent to your logger. This allows you to customize where and how those logs are stored or displayed. It’s a way to get more visibility into the inner workings of the backtesting process.

## Function setConfig

This function lets you adjust how the backtest-kit framework operates, allowing you to modify settings like data fetching or logging behavior. You provide a new configuration, and it will selectively update the existing global settings. There's an option to bypass safety checks during this process, primarily intended for testing environments where strict validation might be inconvenient.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like the ones generated in markdown format. You can change or add to the default column definitions to display the specific data points that are most important to you. The framework checks your new column configurations to make sure they are set up correctly, but there’s an option to skip those checks if you’re doing something experimental, like within a test environment. Providing a partial configuration means you only need to specify the columns you want to modify, not the entire set.

## Function searchMemory

The `searchMemory` function helps you find relevant data stored in your memory system. Think of it as a powerful search tool that looks for entries based on a text query. It uses a sophisticated method called BM25 to rank the results, ensuring the most likely matches appear first.

The function automatically figures out whether it's running a backtest or a live trading session by looking at its environment. It also seamlessly pulls the necessary signal information from where it's currently running.

You provide a description of what you're searching for (the `query`) and where that data is stored (the `bucketName`). The function then returns a list of matching memory entries, including a unique ID for each entry, a score indicating how well it matches your search, and the actual content of the entry.


## Function runInMockContext

The `runInMockContext` function lets you execute code as if it were running within a trading strategy's environment, but without actually needing a full backtest setup. Think of it as creating a temporary, controlled setting for your tests or scripts. 

It’s helpful when you need to use functions that rely on things like the current timeframe or exchange information. 

You can customize this environment by providing details like the exchange name, strategy name, or the point in time you want to simulate. If you don’t provide these details, it uses some default values to create a basic, real-time-like environment. This is a handy way to test parts of your strategy in isolation.


## Function removeMemory

This function helps you clean up old data related to trading signals. 

Specifically, it deletes a particular "memory" entry associated with a signal, identified by its bucket name and a unique memory ID. 

It's designed to work seamlessly whether you’re running tests or live trading, and it handles the complexities of signal execution automatically. You just need to provide the bucket name and the memory ID of the entry you want to remove.


## Function readMemory

The `readMemory` function lets you fetch data that's been stored in a specific memory location. Think of it like retrieving a previously saved value for later use. It's designed to work with data structures (objects) and automatically figures out whether you're running a backtest or live trading session based on the environment it's running in.

You provide the name of the memory bucket and a unique identifier for the memory you want to read.

The function will return the data stored in that memory as an object, or it will throw an error if the data isn't found. 


## Function overrideWalkerSchema

This function lets you tweak a previously defined trading strategy comparison setup, often called a "walker." Think of it as modifying a blueprint for how your strategies are tested against each other.

You're essentially providing a set of changes – only the parts you specify – to update the existing walker configuration.  The rest of the original walker setup remains untouched.

It takes a partial walker configuration as input, and returns a promise that resolves to the modified, complete walker configuration. This is useful when you need to adjust aspects of the comparison process without rebuilding the entire setup from scratch.

## Function overrideStrategySchema

This function lets you tweak a strategy that's already been set up in the backtest-kit framework. Think of it as a way to make small adjustments without having to redefine the entire strategy from scratch. You provide a portion of the strategy’s configuration, and it will update only those specified parts, leaving the rest of the strategy untouched. It's helpful for fine-tuning or making incremental changes to a strategy's behavior.




The function takes a partial strategy configuration object as input and returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without completely replacing it. Think of it as making small adjustments to how much capital gets allocated to trades. You provide a new set of settings, and only those settings are applied to the existing sizing configuration – everything else stays as it was before. It’s a way to fine-tune your sizing without redoing the entire setup. 


## Function overrideRiskSchema

This function lets you tweak an already set-up risk management system within the backtest-kit framework. Think of it as making small adjustments to an existing plan, rather than starting from scratch. You provide a partial configuration – just the bits you want to change – and the function updates the original risk schema, leaving everything else untouched. This is useful for fine-tuning your risk controls without completely redefining them.

## Function overrideFrameSchema

This function lets you tweak the settings for a specific timeframe you're using in your backtest. Think of it as making targeted adjustments - you can change things like how data is sampled or calculated, but you don't have to redefine the entire timeframe from scratch. It’s useful for fine-tuning how your backtest analyzes data at different time intervals, letting you experiment with how often trades are evaluated. You supply a partial configuration, and it merges with the existing timeframe definition.

## Function overrideExchangeSchema

This function lets you modify existing connections to data sources, like exchanges. Think of it as a way to tweak a connection without completely rebuilding it.

You provide a partial set of changes – only the parts of the exchange configuration you want to update will be affected. The rest of the connection settings will stay as they were before.

This is useful for things like adjusting API keys or fine-tuning data formatting without needing to re-register the entire data source.


## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without having to completely recreate them. Think of it as a targeted update – you can change specific parts of an action’s configuration, like how it responds to events.

It's particularly handy if you need to adjust event handling logic, modify callback functions for different environments (like testing versus production), or even swap out handler implementations on the fly.  You can adjust how actions behave without needing to make broader changes to your overall strategy. 

To use it, you simply provide a partial configuration object containing the fields you want to change; all other configuration details will stay as they were originally set.

## Function listenWalkerProgress

This function lets you track the progress of a backtest as it runs. 

It provides updates after each strategy finishes executing. 

Think of it as a way to get notified about the completion of each step in the backtesting process, ensuring that any actions you take based on these updates happen one at a time to prevent unexpected issues. You give it a function that will be called with details about each completed strategy. The function you provide will receive an event object containing information about the progress. When you’re done listening, you can unsubscribe using the function that this returns.

## Function listenWalkerOnce

The `listenWalkerOnce` function lets you watch for changes happening during a backtest, but only once a specific condition is met. You provide a filter – a way to describe exactly what kind of event you’re interested in – and then a function to run when that event appears. Once the event occurs and the function runs, the watcher automatically stops, so you don’t need to manage the subscription yourself. This is handy when you need to react to a particular event during a backtest, like a specific price point or market condition.

It takes two inputs:

*   A filter function to identify the relevant events.
*   A callback function that will be executed only once when a matching event is detected.

The function returns a cleanup function that you can use to manually unsubscribe from the walker if needed, although it generally unsubscribes automatically.

## Function listenWalkerComplete

This function lets you get notified when a backtest run finishes. 

It listens for a special event that happens when the backtest kit completes testing all the strategies you've set up. 

The notification you receive includes details about the completed run, and importantly, it makes sure that whatever you do with that information (even if it’s a complex operation) doesn't interfere with other events – everything happens in a controlled, sequential order. You can unsubscribe from these notifications whenever you need to stop listening.


## Function listenWalker

This function lets you listen for updates as a backtest progresses. Think of it as a way to get notified after each strategy within a backtest has finished running.

The updates you receive are called "walker events," and they're delivered one after another, even if your code needs to do something complex (like an asynchronous operation) to process each event.

To ensure things run smoothly and prevent any conflicts, the updates are handled in a queue – meaning they are processed sequentially. You'll get a function back that you can call to unsubscribe from these updates when you're done.


## Function listenValidation

The `listenValidation` function lets you keep an eye on potential problems during risk validation. Think of it as setting up a listener that gets notified whenever a validation check fails and throws an error. 

This is really helpful for spotting and fixing issues in your risk management process. 

You provide a function that will be called whenever an error occurs. This function receives the error object itself, giving you details about what went wrong. Importantly, these errors are handled in the order they happen, and your provided function will be run one at a time, even if it’s an asynchronous operation.


## Function listenSyncOnce

This function lets you listen for specific events happening within the backtest, but only once. It's great when you need to quickly coordinate with something outside of the backtest itself, like an external data feed. 

You provide a rule (`filterFn`) to decide which events you're interested in. Then, you provide a function (`fn`) that will be executed *once* when a matching event occurs. If this function takes time to finish, like if it involves a promise, the backtest will pause until it's done. This ensures everything happens in the right order.


## Function listenSync

This function lets you listen for events related to signal synchronization, like when a signal is about to be opened or closed, but with a twist. It's designed to help you coordinate your trading activities with external systems or processes that might take a little time. 

If you provide a function that returns a promise, the backtest will pause signal processing until that promise resolves, ensuring everything happens in the right order. 

Think of it as a way to make sure external processes don't interfere with your trading signals. You receive updates whenever signals are being synchronized, and you can react to them in a controlled manner.

## Function listenStrategyCommitOnce

This function lets you temporarily listen for specific events related to strategy changes. You provide a filter to identify the events you're interested in, and a function that will be executed once when a matching event occurs. Once that single event is processed, the listener automatically stops, so you don't have to worry about managing subscriptions. It’s a clean way to react to a single, particular strategy action and then move on.

You define what events you care about with a filter, and then specify the action to take when one of those events happens. The function handles the subscription and unsubscription for you.

## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategies. It's like setting up a notification system that tells you when certain actions are taken, such as canceling a scheduled trade, closing a trade with profit or loss, or adjusting stop-loss and take-profit levels.

These events are handled one at a time, so you don’t have to worry about things getting mixed up if your notification code takes some time to run. It ensures a smooth and orderly flow of information about strategy adjustments. You give it a function to run when one of these events occurs. The function you provide will receive details about the specific event that triggered it. When you're finished needing to listen for these events, the function returns another function to unsubscribe.

## Function listenSignalOnce

This function lets you react to specific trading signals just once. You provide a filter to define which signals you're interested in, and a function to execute when that signal arrives. Once the signal matches your filter, the callback runs, and the subscription is automatically canceled. It's a handy way to wait for a particular condition to occur and then take action.

## Function listenSignalNotifyOnce

This function helps you react to specific signal events just once and then automatically stop listening. You provide a filter – a function that tells it which events you’re interested in – and a callback function that will be executed when a matching event occurs. Once that callback runs, the subscription is automatically cancelled, so you don't need to worry about cleaning up. It's perfect for situations where you only need to handle a particular event type once.


## Function listenSignalNotify

This function lets you keep an eye on what's happening with your trading signals. Whenever a strategy uses `commitSignalInfo` – essentially, sending a note about a trade – you'll get notified. 

The notifications are delivered one after another, even if your notification handling takes some time. This ensures things are processed in the right order and avoids any unexpected issues from running things at the same time. You provide a function that will be called with the signal information each time a notification is available. When you’re done listening, the function returns another function that you can call to unsubscribe.

## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming directly from a live trading execution. You provide a filter – a way to select which signals you're interested in – and a function to run when a matching signal arrives. The function automatically stops listening after it has executed once, so you don't need to worry about manually unsubscribing. It's perfect for quickly reacting to a specific event during a live trading simulation.

You give it two things: a filter to determine which signals to catch, and a function to handle those signals. Once that function runs, the listener stops, ensuring you only get that single notification.

## Function listenSignalLive

This function allows you to subscribe to live trading signals generated during a backtest run. Think of it as hooking into the real-time events happening as your strategy executes. The events, which contain detailed information about each tick, are delivered one at a time, ensuring they are processed in the order they occur. This is particularly useful if you need to react to signals as they appear, perhaps for logging or external integrations. This function is only compatible with signals from `Live.run()`. The function returns an unsubscribe function that you can use to stop receiving these live signals.

## Function listenSignalBacktestOnce

This function lets you listen for specific events happening during a backtest run, but only once. It’s useful when you need to react to something particular occurring during the simulation and then stop listening. You provide a filter to determine which events you're interested in, and a function to execute when a matching event happens. Once that one event triggers the callback, the listener automatically stops. It's a simple way to observe a single, targeted moment in your backtest.

## Function listenSignalBacktest

This function lets you tap into the stream of data generated during a backtest. It's designed for situations where you need to react to events as they happen during the backtest simulation, but you want to ensure those reactions are handled one at a time. You provide a function that gets called whenever a new signal event occurs, passing information about that event. This is particularly useful when the backtest is running and you're observing what’s happening. The function you provide returns another function that can be called to stop listening to these events.


## Function listenSignal

This function lets you tap into the flow of signals generated by your trading strategy. It’s like setting up a listener that gets notified whenever your strategy changes state – whether it's idle, opening a position, actively trading, or closing one.

The signals are handled one at a time, even if the function you provide takes some time to complete. This ensures a controlled and orderly process.

To use it, you simply provide a function that will be called with each signal event. The function you provide will also return a function that, when called, unsubscribes from the event listener.


## Function listenSchedulePingOnce

This function helps you react to specific ping events but only once. Think of it as setting up a temporary listener that responds to a particular condition and then disappears.

It takes a filter – a way to identify the exact ping events you're interested in – and a function to execute when that event is found.

Once the matching event occurs, your function runs, and the listener automatically stops. It's perfect for situations where you need to react to something just once and don't want to keep a listener active indefinitely.


## Function listenSchedulePing

`listenSchedulePing` lets you keep an eye on scheduled signals as they wait to become active. Think of it as a way to get regular "ping" notifications – every minute – while a signal is being monitored and hasn’t yet started.

This function sets up a listener that calls your provided function whenever one of these ping events occurs.

You can use this to build custom monitoring or keep track of the signal's status as it progresses through its lifecycle.

The function returns another function that you can call to unsubscribe from these ping notifications when you no longer need them.


## Function listenRiskOnce

The `listenRiskOnce` function lets you monitor for specific risk rejection events and react to them just once. It acts like a temporary listener; you provide a filter to identify the events you're interested in, and a function to execute when a matching event occurs. Once that event is detected, the listener automatically stops, preventing further executions. This is perfect for situations where you need to wait for a particular risk condition to be met and then take action.

You tell it what events to look for with a `filterFn` and what to do with the event when it’s found via `fn`. After that single execution, the listener disappears.

## Function listenRisk

This function lets you react specifically to situations where a trading signal is blocked because of risk checks. 

It’s designed to notify you only when a signal fails the risk validation, so you won't be overwhelmed by events for signals that are perfectly safe to execute.

The events will be delivered one after another, even if your response function involves asynchronous operations.

Essentially, it's a focused way to be alerted to potential risk-related issues in your trading strategy.

To use it, you provide a function that will be called whenever a risk rejection occurs, and it will return another function to unsubscribe from the events.

## Function listenPerformance

The `listenPerformance` function lets you keep an eye on how long different parts of your trading strategy take to run. It's like having a performance monitor that reports on the timing of various operations.

You provide a function that will be called whenever a performance event occurs. This is perfect for identifying slow spots in your code—those bottlenecks that are impacting your strategy's overall performance.

Importantly, the events are handled one after another, even if the function you provide needs to do some asynchronous work. This ensures that the performance data is processed in the correct order and prevents potential conflicts. It acts like a queue, ensuring orderly processing.


## Function listenPartialProfitAvailableOnce

This function lets you watch for specific profit milestones reached during a backtest, but only once. 

You provide a filter – a way to identify the exact profit level you're interested in – and a function to run when that condition is met. 

Once the event you're looking for happens, the provided function is executed, and the listener automatically stops listening. It’s perfect for reacting to a single, important profit target being hit.


## Function listenPartialProfitAvailable

This function lets you set up a listener that gets notified whenever your trading strategy reaches specific profit milestones – like 10%, 20%, or 30% profit. It’s designed to handle these events one at a time, even if the code you provide to handle them takes some time to run. 

Think of it as a way to be alerted to progress milestones in your backtest without overwhelming your system.

You provide a function that will be executed each time a milestone is reached, and this listener will handle the event processing in a safe, sequential manner.


## Function listenPartialLossAvailableOnce

This function lets you set up a listener that reacts to changes in partial loss levels, but only once. You provide a filter – a function that determines which loss events you're interested in – and a callback function that will be executed when a matching event occurs. Once the callback has run, the listener automatically stops listening, so you don't need to worry about managing the subscription yourself.

Think of it as a temporary alert for a specific type of loss event.

It's great for situations where you need to take action based on a particular loss condition and then move on.

Here’s how it works:

*   You give it a `filterFn` to tell it which events to watch for.
*   You provide a `fn` to handle the event when it appears.
*   The listener runs, finds the first matching event, calls your `fn`, and then silently stops.


## Function listenPartialLossAvailable

This function lets you get notified whenever a trading strategy experiences a specific loss level, like 10%, 20%, or 30% of its initial capital. It's designed to make sure these notifications happen one at a time, even if your code takes some time to process each event. You provide a function that will be called with details about the loss event, and this function will return another function that you can use to unsubscribe from these notifications later.


## Function listenMaxDrawdownOnce

This function lets you set up a listener that reacts to max drawdown events, but only once. You provide a filter—a way to specify which drawdown events you’re interested in—and then a function to run when a matching event occurs. Once that one event is handled, the listener automatically stops, so you don't have to worry about cleaning up manually. It's perfect for situations where you need to react to a particular drawdown condition just one time.

The first argument is the filter, which determines if an event should trigger your callback. The second argument is the function that gets executed when a filtered event is detected.

## Function listenMaxDrawdown

This function lets you monitor when your trading strategy experiences a new maximum drawdown. Think of it as a way to keep an eye on how much your profits have shrunk during a particular trading period.

It works by sending you notifications whenever a new drawdown level is reached.

Importantly, these notifications are handled one at a time, ensuring that your response logic is processed in the correct order.

You can use this to react to changes in risk or to set up alerts when your drawdown reaches a concerning level. To use it, you simply provide a function that will be called with details about the new drawdown event.


## Function listenIdlePingOnce

The `listenIdlePingOnce` function lets you react to infrequent system activity signals, but only once a specific condition is met. You provide a way to identify the signals you're interested in—a filter—and then tell it what you want to do when one of those signals appears.  Once that signal is processed, the subscription stops, preventing repeated actions. This is useful when you need to trigger something just once based on system inactivity.

It takes two parts: a filter that checks if a signal matches what you’re looking for, and a function that runs when a matching signal is found. The function returns a cleanup function that you can use to stop the subscription.


## Function listenIdlePing

The `listenIdlePing` function lets you monitor periods of inactivity within your backtesting environment. It essentially listens for moments when there are no trades actively being processed or scheduled. When such a lull occurs, your provided callback function will be triggered, allowing you to react to these idle periods. This is useful for tasks like housekeeping, logging, or performing maintenance without interrupting active trading. The function returns an unsubscribe function, which you can call to stop listening for these events.

## Function listenHighestProfitOnce

This function lets you react to specific instances of the highest profit a contract reaches, but only once. You provide a test – a filter – to determine when you want to be notified. Then, you give it a function that will run when that condition is met. After that single execution, the subscription automatically stops, so you don't keep getting notifications. It’s great for situations where you need to react to a particular profit milestone and then move on.

You define *what* events trigger the callback with the `filterFn`.
The `fn` argument specifies *what* happens when a matching event occurs.


## Function listenHighestProfit

This function lets you keep track of when a trading strategy reaches a new peak profit level. It automatically handles the events in the order they happen, even if your callback function takes some time to run. Think of it as a way to get notified when your strategy is performing exceptionally well, allowing you to adjust your approach or manage your portfolio based on these milestones. It's designed to ensure your logic runs smoothly without conflicts, even if the profit events come in rapid succession. You provide a function that will be called whenever a new highest profit is achieved.

## Function listenExit

The `listenExit` function lets you be notified when the backtest or other background processes encounter a critical, unrecoverable error that will halt execution. 

It's like setting up an emergency alert for situations where things go so wrong they need to stop immediately.

These errors aren't like the usual hiccups; they’re showstoppers that prevent further progress.

Any errors that trigger this will be handled one at a time, ensuring they're processed in the order they happened, even if your error handling function needs to do some asynchronous work.


## Function listenError

This function lets you set up a listener that will catch any errors that happen while your trading strategy is running, but that aren't critical enough to stop the whole process. Think of it as a safety net for hiccups in your API calls or other operations. These errors are handled without halting the backtest, ensuring the simulation continues smoothly. The errors are processed one at a time, in the order they occur, even if the error handling code itself takes some time to complete. It's designed to make sure your error handling doesn’t accidentally cause further issues.

The listener is a function you provide; it receives the error details, allowing you to log, retry, or otherwise deal with the problem. The function returns another function which unsubscribes the listener.

## Function listenDoneWalkerOnce

This function lets you react to when a background process within your backtest finishes, but only once. You provide a filter to specify which finished processes you're interested in, and a callback function that will run when a matching process completes. After the callback runs once, the subscription is automatically removed, so you don't have to worry about cleaning up. Essentially, it’s a way to get notified of a single, specific background task's completion.


## Function listenDoneWalker

This function lets you keep track of when background tasks within the backtest-kit framework finish running. It's especially useful when you need to ensure that processing happens in a specific order.

You provide a function (`fn`) that will be called whenever a background task is done.

The key thing to know is that the provided function will always be executed one at a time, even if the callback itself involves asynchronous operations. This ensures things happen sequentially and prevents unexpected issues from concurrent processing.

Essentially, it provides a way to listen for the completion of background operations and guarantees the order of execution for your callback.


## Function listenDoneLiveOnce

This function lets you react to when a background task finishes running within your backtest. It’s designed for situations where you need to perform an action just once when a specific background task completes. 

You provide a filter to select the exact events you’re interested in and then a callback function that will run when that event happens. Once the callback has been executed, the listener is automatically removed, ensuring it doesn't fire again. Think of it as a temporary alert that goes off only once for a particular condition.


## Function listenDoneLive

This function lets you listen for when background tasks run by `Live.background()` are finished. It's like setting up a notification system. 

When a background task completes, it sends out a signal, and your provided function will be executed. Importantly, these signals are handled in the order they arrive, and your function will run one at a time, even if it takes some time to complete. This helps prevent issues that can arise when multiple functions try to run simultaneously. You provide a function that will be called with information about the completed task. When you no longer need to listen for these signals, you can use the function returned by `listenDoneLive` to unsubscribe.

## Function listenDoneBacktestOnce

This function lets you react to when a background backtest finishes, but only once. You provide a filter to specify which backtest completions you're interested in, and then give it a function to run when a matching backtest is done. The function will automatically unsubscribe after it runs, so you don't need to worry about cleaning up the subscription manually. It's a convenient way to handle a specific backtest completion just one time.


## Function listenDoneBacktest

This function lets you register a callback that gets triggered when a background backtest finishes running. 

Think of it as setting up a listener to be notified when a particular backtest process is done. 

The important thing to know is that when the backtest finishes, your callback function will be executed, and it will happen in a controlled, sequential order – even if your callback itself involves asynchronous operations. This helps ensure that things are processed reliably and prevents unexpected conflicts. You provide the callback function, and it returns a function you can use to unsubscribe from the listener later on.

## Function listenBreakevenAvailableOnce

This function lets you react to a specific moment when a breakeven protection condition is met. You provide a filter to define exactly what kind of breakeven event you're interested in, and a function to run when that event occurs. Once the event is found and your function runs, the listener automatically stops listening – it's perfect for scenarios where you need to respond to something just once and then move on. Think of it as a one-time alert for breakeven changes.


## Function listenBreakevenAvailable

This function lets you get notified whenever a trade's stop-loss automatically adjusts to the original entry price – that’s your breakeven point. It's useful for monitoring when your trades have reached a level of profitability that covers initial costs. The notifications are delivered one at a time, even if the function you provide to handle them takes some time to complete, ensuring things don't get jumbled up. To stop receiving these notifications, the function returns another function that you can call.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest begins. You provide a filter to specify which events you're interested in, and then a function that will run *once* when a matching event occurs. After that one execution, the listener automatically stops, so you don't have to worry about cleaning up. 

Essentially, it's a way to perform a single, time-sensitive action at the start of a backtest based on certain conditions.

It takes two parts: first, how to identify the event you're looking for, and second, what you want to do when that event happens.


## Function listenBeforeStart

This function lets you hook into the moment right before a trading strategy begins running for a specific asset. You can provide a function that will be called whenever this happens. Importantly, the function calls happen one after another, even if your function takes some time to complete – this prevents things from getting jumbled up. This is useful for tasks like logging, preparing data, or making any last-minute adjustments before the strategy kicks off. The function you provide will be executed asynchronously, and the subscription can be easily removed when it's no longer needed.

## Function listenBacktestProgress

This function lets you keep an eye on how your backtest is running. It provides updates as the backtest progresses, allowing you to monitor its status. You give it a function that will be called whenever a progress update is available. Importantly, these updates are handled one at a time, even if the provided function takes some time to complete, ensuring a smooth and predictable flow of information. The function returns another function which you can call to unsubscribe from these progress updates.


## Function listenAfterEndOnce

This function lets you react to specific events that happen after a trading period ends, but only once. 

You provide a filter to specify which events you're interested in. 

When an event matches your filter, a callback function you define will run once, and then the subscription automatically stops, so you don't keep receiving events. It's a convenient way to handle a one-off action after a backtest concludes.


## Function listenAfterEnd

This function lets you tap into what happens after a trading strategy's run is finished for a specific asset. 

Think of it as a notification system – you provide a function, and it gets called when the engine has wrapped up its work on a symbol. 

Importantly, these notifications are handled in the order they arrive, and the processing of each notification happens one at a time to keep things orderly, even if your function does something complex. This helps avoid any unexpected conflicts or issues.


## Function listenActivePingOnce

This function lets you set up a temporary listener for active ping events. You tell it what kind of ping you’re looking for using a filter, and then provide a function that should run *just once* when a matching ping comes along. After that single execution, the listener automatically stops, preventing unnecessary processing. It's perfect for situations where you need to react to a specific ping condition and then move on.


## Function listenActivePing

This function allows you to keep an eye on the status of active signals in your backtest. It’s like setting up a little observer that gets notified every minute about any active signals.

You can use this to react to changes in signal activity – maybe adjust your trading strategy or manage resources based on what’s happening. 

The function gives you a callback, which is essentially the code that runs when a new active ping event is detected. To ensure things run smoothly and avoid conflicts, the callback will always execute one at a time, even if it’s a more complex function. Think of it as a neatly organized line – each task gets its turn.


## Function listWalkerSchema

This function helps you discover all the different trading strategies or "walkers" that are currently set up in your backtest-kit environment. It essentially gives you a list of all the available strategies you can use for testing. Think of it as a way to see what's available without having to manually search through your code. This can be really useful for understanding your system, creating helpful tools, or even building user interfaces that let you choose from different strategies.

## Function listStrategySchema

This function helps you see a list of all the trading strategies that are currently set up and ready to be used within the backtest-kit framework. Think of it as a way to inventory your strategies. You can use this list to check if everything is configured correctly, generate documentation, or even build tools that automatically display your available strategies. It pulls the information directly from the system's registered strategy list.


## Function listSizingSchema

This function lets you see all the sizing strategies currently active within your backtest setup. Think of it as a way to peek under the hood and see how your order sizes are being determined. It returns a list of configurations, which can be helpful when you’re trying to understand what’s going on or building tools to manage your strategies. Essentially, it's a quick way to get a handle on how order sizes are calculated.

## Function listRiskSchema

This function lets you see all the risk configurations that are currently active within your backtesting environment. Think of it as a way to peek under the hood and understand what risk parameters are being used. It returns a list of these configurations, which can be helpful for troubleshooting, creating documentation, or building interfaces that need to display this information. You can use this to see exactly how your backtest is assessing and managing risk.

## Function listMemory

This function lets you see all the saved memory entries associated with your signal. It’s useful for understanding what data is stored and how it's being used. 

The function automatically figures out whether it's running in a backtest or a live trading environment, and it also identifies the active signal it’s working with.

You provide a simple object with the name of the bucket where the memory is stored, and it returns a list of all memory entries, including their unique IDs and the content they hold. Think of it as a way to peek inside the memory storage for your signal.

## Function listFrameSchema

This function lets you see all the different data structures, or "frames," that your backtest kit is using. It's like getting a catalog of all the ways your data is organized.

You can use this to check if everything's set up correctly, generate documentation, or even build tools that react to the different data types your backtest uses. Think of it as a quick peek under the hood to understand the framework’s data landscape.


## Function listExchangeSchema

This function gives you a peek at all the exchanges your backtest-kit is set up to handle. It's like a directory listing of all the different trading venues you've connected. You can use this to check if everything is configured correctly, understand what data sources are available, or build tools that adapt to different exchanges. Essentially, it provides a list of exchange "blueprints" that backtest-kit uses.

## Function hasTradeContext

This function simply tells you whether a trading context is currently active. Think of it as a quick check to see if you're in a state where you can perform actions related to trading, like fetching historical data or calculating prices. It confirms both the execution and method contexts are running. If it returns true, you're good to use functions like `getCandles` or `formatPrice`.

## Function hasNoScheduledSignal

This function helps you quickly check if a scheduled trading signal currently exists for a specific trading pair, like BTC-USDT. It returns a simple "yes" or "no" answer, letting you know if a signal is waiting to be triggered. Think of it as the opposite of a function that *would* confirm a signal exists; it's useful for making sure you don't accidentally try to generate a signal when one is already pending. The function cleverly figures out whether the system is in backtesting or live trading mode without you having to specify it. You can pass it the trading pair symbol to see if a scheduled signal is active for that pair.

## Function hasNoPendingSignal

This function helps you check if there's currently a pending signal for a specific trading pair, like 'BTCUSDT'. It returns `true` if no pending signal exists – essentially, it's the opposite of `hasPendingSignal`. Think of it as a safety check: use it to make sure you’re not accidentally generating new signals when there’s already one waiting. The function automatically figures out whether you're running a backtest or a live trading session. You just provide the symbol you're interested in to see if there's anything pending.

## Function getWalkerSchema

The `getWalkerSchema` function helps you access the configuration details of a specific trading strategy or "walker" you've defined within your backtesting setup. It's like looking up the blueprint for a particular trading method.  You provide the name of the walker you want to examine, and the function returns a detailed description of how that walker operates, including its parameters and logic. This lets you understand and potentially modify how a walker is structured. 

It requires you to specify the unique identifier assigned to the walker when it was registered.


## Function getTotalPercentClosed

This function helps you understand how much of a trading position remains open. It calculates the percentage of the position that hasn't been closed, giving you a clear picture of your exposure. A result of 100% means the entire position is still active, while 0% indicates it's been fully closed.

It takes the trading symbol as input, such as "BTC/USDT". 

The function cleverly considers any dollar-cost averaging (DCA) entries when figuring out the percentage, ensuring an accurate representation even with multiple partial closures. 

It also figures out whether it's running in a backtest or a live environment automatically.


## Function getTotalCostClosed

This function helps you figure out how much you've spent on a position you're still holding. It calculates the total cost basis in dollars, taking into account any averaging you've done when closing the position bit by bit (like with dollar-cost averaging). It automatically knows whether it's running in a testing environment or live trading mode. 

You just need to provide the trading pair's symbol, like "BTCUSDT".


## Function getTimestamp

This function retrieves the current timestamp, which is essentially the current time. 

It behaves differently depending on whether you're running a backtest (analyzing historical data) or a live trading session. 

During a backtest, it provides the timestamp specific to the timeframe being evaluated. When running live, it gives you the actual, real-time timestamp.


## Function getSymbol

This function retrieves the symbol you're currently trading based on the setup of your backtest or trading environment. Think of it as a way to know exactly which asset your strategies are operating on. It returns a promise that resolves to the symbol as a string.

## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy. It takes the strategy's unique name as input, and returns a detailed description of that strategy, outlining its expected inputs and outputs. Think of it as looking up a strategy's technical specification. You’ll use this information to understand how the strategy is structured and what data it needs to run correctly within the backtest environment. It ensures your strategy is properly defined and compatible with the backtest-kit framework.


## Function getSizingSchema

This function helps you find the specific rules for how much of an asset to trade based on its name. Think of it as looking up a preset for order sizing. You give it a name—an identifier for the sizing method you want—and it returns the configuration details for that method. This configuration tells the backtest how much to trade each time.

## Function getSignalState

This function lets you retrieve a specific piece of data, like a running total or a counter, tied to a particular trading signal.

It automatically figures out whether you're in a backtesting or live trading environment.

If there's no active trading signal, it will give you a warning and provide a default starting value.

This is particularly helpful for advanced strategies, like those using AI, where you want to track metrics on a trade-by-trade basis, such as how long a trade is held or its maximum gain. The function is designed to handle situations where trades might have different risk profiles and exit conditions, like those aiming for small profits or avoiding losses.

It requires a symbol (like "BTC-USDT") and a configuration object that defines where the data is stored and what its initial value should be.


## Function getSessionData

This function lets you retrieve data that's specific to a trading symbol and relevant across multiple candles within a backtest or live trading session. Think of it as a place to store information that needs to be remembered between candles, like results from complex calculations or intermediate steps. 

This stored data sticks around even if the backtest or live environment restarts, making it ideal for things like caching results from AI models or keeping track of ongoing calculations.

You simply provide the trading symbol (e.g., "BTC-USD") to fetch the associated data. If no data is found for that symbol, it will return null.

## Function getScheduledSignal

This function lets you retrieve the scheduled signal that's currently in effect for a specific trading pair. Think of it as checking what automated instructions are currently guiding your strategy. 

It will fetch the signal data, and if no signal is active for that symbol, it will return nothing. It automatically figures out whether you’re running a backtest or a live trading session, so you don’t need to worry about that distinction.

You just need to provide the symbol, like "BTCUSDT", to get the relevant signal.

## Function getRuntimeInfo

This function gives you a snapshot of what's happening in your backtest or trading environment right now. It tells you things like which asset you're analyzing, the exchange you're connected to, the timeframe you’re using, and the strategy that's running. It’s useful for checking context during your tests or debugging. You’ll get this information as a promise that resolves to a structured object.

## Function getRiskSchema

This function lets you fetch a predefined structure for managing a specific type of risk within the backtest kit. Think of it as looking up a template describing how to measure and handle a particular risk factor. You provide the name of the risk you're interested in, and it returns a schema outlining its details. This helps ensure consistency and clarity when analyzing potential trading strategies. The risk name must be a unique identifier previously registered within the system.

## Function getRawCandles

This function allows you to retrieve historical price data, specifically candle data, for a given trading pair and timeframe. You can easily fetch a specific number of candles or a range of dates. 

The function is designed to be reliable, ensuring that your backtesting or analysis doesn't inadvertently use future data.

Here’s how you can use it:

You can provide a start date, end date, and the number of candles you need. Or, you can specify just a date range, and the function will automatically determine the number of candles. You can also just provide a number of candles to get them from the beginning of the available data, going backward from the present. 

The function takes care of making sure that the end date you provide is valid and doesn't lead to issues with your data.

Here's what you need to provide: the symbol (like "BTCUSDT"), the timeframe (like "1m" for one-minute candles), and optionally, a limit for the number of candles, a start date, and an end date.

## Function getPositionWaitingMinutes

getPositionWaitingMinutes lets you check how long a trading signal has been waiting to be put into action. It tells you the number of minutes it's been delayed. 

If there isn't a signal currently waiting, it will return null.

To use it, you simply provide the trading pair symbol, like 'BTCUSDT', and it will give you the waiting time or null.


## Function getPositionPnlPercent

This function helps you understand how your open trades are performing right now. It calculates the unrealized profit or loss as a percentage of your investment for a specific trading pair.

It takes into account factors like partial trade closures, dollar-cost averaging, potential slippage, and trading fees to give you a more realistic view of your position’s health.

If you don't have any open trades, it will return null. 

The function also smartly figures out whether you're in a backtesting or live trading environment and automatically gets the current market price to make its calculations. You just provide the symbol (like BTCUSDT) and it does the rest.


## Function getPositionPnlCost

This function helps you figure out the unrealized profit or loss in dollars for a trade you're currently holding. It calculates this based on the percentage change in price since you started the trade, taking into account how much you invested and any fees or slippage you experienced.

If you don’t have any active trades, it will return null.

The function knows whether you're running a backtest or a live trade and will automatically fetch the current market price for the specified trading pair. You just need to give it the symbol of the pair you’re interested in, such as "BTCUSDT".

## Function getPositionPartials

This function lets you see details about any partial profit or loss orders that have been executed for a specific trading pair. It gives you a history of how your position has been incrementally closed out.

If no signal is currently active, it will return null. If partial closes haven't happened yet, it returns an empty list.

For each partial close, you'll see the type (profit or loss), the percentage of the position closed, the price used for the close, the cost basis at that time, and the number of entries in the trade’s cost basis calculation. You simply need to provide the symbol of the trading pair you're interested in to retrieve this information.

## Function getPositionPartialOverlap

This function helps you avoid accidentally closing partial positions twice at roughly the same price. It checks if the current price being considered for a trade falls within a small range around any previously executed partial close orders. 

Think of it as a safety net to ensure you're not triggering a second partial close when the price is already very near the first one. 

The function takes the trading symbol and the current price as input, and optionally a configuration for the allowed tolerance around the partial close price. It returns `true` if the current price falls within that tolerance zone of a previously executed partial close, and `false` if there are no partial closes or no pending signals. This helps ensure accurate and efficient trading.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trading position experienced its biggest loss. 

It looks at a particular trading pair, like "BTC-USDT", and tells you the exact timestamp – a date and time – when the position hit its lowest point.

If there isn't any trading activity recorded for that pair, it will return nothing. 

You provide the trading pair's symbol as input, and it gives you that important timestamp.


## Function getPositionMaxDrawdownPrice

This function helps you understand the potential downside of a trade. It calculates the lowest price a specific trading pair (like BTC/USD) reached while you held a position. Think of it as finding the “bottom” of a price dip during the time you were in the trade. If there's no active signal for that trading pair, the function will return nothing. You provide the symbol of the trading pair to get this drawdown information.

## Function getPositionMaxDrawdownPnlPercentage

This function helps you understand the performance of a specific trading position. It tells you the percentage gain or loss you experienced at the point when the position hit its lowest value. Think of it as identifying the worst financial moment for that trade.

If there's no active trading signal for the given symbol, the function will let you know by returning null. You provide the trading pair's symbol as input, such as "BTCUSDT".

## Function getPositionMaxDrawdownPnlCost

This function helps you understand the financial impact of a trading position. It calculates the total cost in terms of profit and loss (expressed in the quote currency) that occurred when the position hit its lowest point. Essentially, it tells you how much you lost at the worst time for that specific trading pair. If there's no active signal for the position, it won’t be able to provide a value and will return null. You need to specify which trading pair, like 'BTC-USD', to get the information for.

## Function getPositionMaxDrawdownMinutes

This function helps you understand the timing of your trading positions' most significant losses. It tells you how many minutes have passed since the point where a position experienced its maximum drawdown – essentially, its biggest loss. A value of zero means that the lowest price point was just reached. 

If there are no open positions for the specified trading pair, the function will return null, indicating that drawdown information isn’t currently available. You provide the trading pair's symbol (like "BTCUSDT") to check.

## Function getPositionLevels

getPositionLevels helps you check the prices at which you've entered a trade using dollar-cost averaging (DCA). It gives you a list of prices, starting with the original price when you first started the trade, and then any prices added later through the commitAverageBuy function. If you haven't started a trade yet, it will return null. If you started a trade but didn’t add any more prices via DCA, it returns just the original entry price in an array. You provide the trading pair's symbol to find the relevant entry prices.

## Function getPositionInvestedCount

This function tells you how many times a DCA (Dollar Cost Averaging) strategy has been used for a specific trading pair. 

Essentially, it counts the number of buy orders placed as part of a DCA plan after the initial trade. 

A value of '1' means only the original trade was made, and each subsequent use of `commitAverageBuy()` increases this count. 

If there’s no ongoing trading plan, the function will return null. You don’t need to specify whether you're running a backtest or a live simulation, as the function adapts to the environment it’s used in.


## Function getPositionInvestedCost

This function helps you figure out how much you've spent overall on a trade for a specific symbol. It calculates the total cost of getting into the position, taking into account all the individual entry costs. 

Think of it as adding up all the money spent when you first started buying the asset.

If there's no ongoing trade or signal, it will return null. It smartly adjusts to whether you're in a backtesting or live trading environment. You just need to tell it the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you find out when a specific trading position reached its highest profit point. It tells you the exact timestamp – a date and time – when the position was most profitable.

If there are no signals related to that position, it will return null, indicating there's nothing to report.

You'll need to provide the trading symbol, like 'BTCUSDT', to identify the position you're interested in.

## Function getPositionHighestProfitPrice

This function helps you find the highest price your position has reached while being profitable. It essentially remembers the best price achieved in a favorable direction since the position started.

For long positions, it tracks the highest price above the initial entry price. For short positions, it tracks the lowest price below the initial entry price.

It's updated as new price data arrives and will always have a value—at least the entry price—as long as the position is active. To get this value, you simply need to provide the trading pair symbol.

## Function getPositionHighestProfitMinutes

This function helps you understand how long a trade has been in the red since it made its best profit. It tells you the number of minutes that have passed since the position reached its highest profit point. Think of it as a measure of how far the trade has fallen from its peak – a zero value means it just hit that high profit mark. If no trading signal exists, the function will return null. You provide the trading pair symbol, like "BTCUSDT," to specify which position you're checking.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position has moved from its best profit point. It calculates the difference between the highest profit percentage achieved so far and the current profit percentage. 

Essentially, it tells you how much room there is for improvement or how much potential loss you might face if things turn around. 

If there’s no trading signal currently active, the function won't be able to provide a value and will return null. The function takes the trading symbol (like "BTC-USDT") as input to specify which position you’re analyzing.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your position is from its best possible profit. It calculates the difference between the current profit and the highest profit achieved so far, but only considers the difference if the peak profit was actually higher. This gives you an idea of how much room there is for improvement in your trading strategy for a given trading pair. If no trading signals are currently pending, the function won't be able to calculate anything and will return null. The symbol you are analyzing is required for the function to work.

## Function getPositionHighestProfitBreakeven

This function helps you understand if a trade could have realistically reached its peak profit, even if it started at a breakeven point. It checks if the highest possible profit for a position on a specific trading pair was achievable from a breakeven starting point. If there's no active trading signal for the given symbol, the function will tell you that it can't perform the calculation. You simply need to provide the trading pair symbol, like "BTCUSDT", and it will give you a yes or no answer regarding the breakeven possibility.


## Function getPositionHighestPnlPercentage

This function helps you understand how well a specific trade performed. 

It tells you the highest percentage profit achieved by a position for a given trading pair, looking back at its entire history. 

Essentially, it pinpoints the moment when the trade was at its most profitable.

If there’s no trading activity for that symbol yet, the function will return null.

You just need to provide the symbol of the trading pair you are interested in, like "BTC-USDT."


## Function getPositionHighestPnlCost

This function helps you understand the maximum cost incurred while a trading position was active. It looks at a specific trading pair, like 'BTC-USD', and tells you the highest cost (expressed in the quote currency, like USD) that was reached when the position was at its most profitable point. If there's no data available for that position, it will return null. Essentially, it provides a single number representing the peak cost associated with a profitable trading position.


## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how risky a trading position has been. It calculates the largest drop in percentage profit a position experienced from its peak to its lowest point. 

Essentially, it tells you how far your profits have fallen from their highest level.

The result is a percentage value that shows the magnitude of this drawdown.

If there's no active trading signal for the specified trading pair, the function won't be able to calculate this and will return null.

You simply need to provide the trading pair's symbol, such as "BTC-USDT", to get the drawdown information.


## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand how far your trading position is from its lowest point during a drawdown. It calculates the difference between the current profit and loss (PnL) and the lowest PnL reached during a period of losses. Think of it as measuring the 'distance' you've recovered from the most significant dip in your position's profitability. If there's no open trading signal, the function won't be able to calculate this and will return null. You provide the symbol of the trading pair (like BTCUSDT) to get the information specific to that trade.

## Function getPositionEstimateMinutes

getPositionEstimateMinutes helps you understand how long a trade is expected to last. 

It calculates the estimated duration in minutes based on the information within a pending trading signal. 

Essentially, it tells you how much time remains before the trade might expire. 

If there's no active trading signal, it won't be able to provide an estimate and will return null.

You provide the trading symbol (like BTC-USDT) to get the duration estimate.

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing multiple DCA entries at very similar price levels. It checks if the current price you're seeing falls within a small range around your existing DCA entry prices. 

Think of it as a safety net to ensure you’re not repeatedly buying at roughly the same spot.

The function looks at each of your existing DCA levels and calculates a tolerance range around it – essentially, a small zone above and below the level. If the current price falls within any of those zones, the function returns true, signaling a potential overlap. If there are no existing DCA levels, it returns false.

You can customize the size of this zone using the `ladder` parameter, which lets you define percentages for the upper and lower tolerance.

## Function getPositionEntries

getPositionEntries lets you peek at the details of how a trading position is being built, specifically the prices and costs involved in each step. It gives you a list of entries, which could be the initial purchase or subsequent additions made using commitAverageBuy for dollar-cost averaging. If there’s no active trading signal, it won't return anything. If the position was started but no further DCA steps happened, you’ll get an array with just one entry. Each entry shows the price at which it was bought and how much money was used. You provide the symbol, like 'BTCUSDT', to specify which position's history you want to see.

## Function getPositionEffectivePrice

This function helps you understand the average price at which you've acquired a position based on your current trading plan. It calculates a weighted average, considering any previous price adjustments or DCA (Dollar-Cost Averaging) entries.

Essentially, it shows you the effective price you’ve paid, factoring in partial closes and subsequent price adjustments. If you haven’t initiated a trade yet, it will return the original opening price.

If there isn't a pending signal to analyze, it will indicate this by returning null. The function intelligently adapts to whether it's running in a backtest or a live trading environment. You provide the symbol of the trading pair as input.

## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your current trading position reached its highest profit point. Think of it as a measure of how far your profits have retraced. 

It starts at zero when your position first achieves its peak, and then increases steadily as the price moves down from that high. 

If there's no active trade, it won't be able to provide a value.

You give it the trading symbol (like 'BTCUSDT') to know which position to analyze.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes tells you how much time is left before a trading position expires. It figures this out by looking at when the position was flagged for pending execution and comparing that to an estimated expiration time.

The result will always be a non-negative number of minutes. 

If there's no pending signal for the specified trading pair, the function will return null. You need to provide the symbol of the trading pair, like "BTCUSDT", to get the countdown.

## Function getPositionActiveMinutes

The `getPositionActiveMinutes` function helps you figure out how long a specific trading position has been open. It calculates the total number of minutes the position has been active, starting from when it was initially created. If there aren't any signals pending for that symbol, it will return null, indicating that it can't determine the active time. To use it, you simply provide the trading pair symbol you're interested in.

## Function getPendingSignal

This function lets you check if your trading strategy currently has a pending order waiting to be triggered. It gives you the details of that pending signal if it exists, or returns nothing (null) if there isn't one. The function knows whether it's running a backtest or live trading session without you needing to specify. You only need to tell it the trading pair's symbol, like "BTC-USDT," to get the information.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT, from the connected exchange. 
You can specify how many levels of the order book you want to see; if you don't provide a depth, it will use a default setting. 
The function takes into account the current time when fetching the data, ensuring accurate results whether you’re running a backtest or live trading.


## Function getNextCandles

This function helps you grab a chunk of future candles for a specific trading pair and timeframe. It's useful when you need to look ahead and plan your trading strategies.

You tell it which trading pair you're interested in (like "BTCUSDT"), how frequently the candles are (options are 1 minute, 3 minutes, up to 8 hours), and how many candles you want. It then fetches those candles, taking into account the current time the system is using. Essentially, it asks the exchange to give you the candles that come *after* the current time.


## Function getMode

This function tells you whether the trading system is currently running a backtest (analyzing historical data) or operating in a live trading environment. It’s a simple way to check the context of the code being executed. The function returns a promise that resolves to either "backtest" or "live".

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how much time has passed since the last trading signal was generated for a specific trading pair. It’s a simple way to track cooldown periods, for example, after a stop-loss trigger. 

It doesn't matter if the signal is still active or if it's already closed – the function just looks at the timestamp of the most recent signal. If no signals exist for that symbol, it returns null. 

It smartly determines whether you’re in backtesting mode or live trading mode and searches for the signal data accordingly. You just need to provide the trading pair symbol (like "BTCUSDT") to get the time elapsed in minutes.


## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown. It essentially measures the biggest drop from the highest profit point to the lowest point during the backtest. 

The result is expressed as a percentage, indicating how much potential loss you might have experienced. 

If no trading signals were generated for a specific trading pair (symbol), the function won't be able to calculate a drawdown, and it will return null. You need to provide the trading pair symbol to get the drawdown percentage.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy. It calculates the largest difference between the highest profit and the lowest loss experienced during a backtest.

Essentially, it reveals how far a position could have fallen from its peak before recovering. 

The result is a number representing that distance, expressed as profit and loss.

You provide the trading pair symbol (like 'BTCUSDT') to specify which strategy you're analyzing. If no trading signals were generated for that symbol, the function will return null.

## Function getLatestSignal

This function helps you retrieve the most recent trading signal for a specific asset, whether it's still active or has already concluded. 

It's really handy for things like preventing you from opening a new trade too soon after a previous trade closed, like after a stop-loss trigger. You can use the signal’s timestamp to control how long you wait before initiating a new trade.

The function first looks for this signal in your backtest history and then checks your live trading data if it's not found in the backtest. If absolutely no signal exists for that asset, it will return nothing. It smartly adjusts its behavior depending on whether you’re running a backtest or live trading.

You just need to provide the trading pair symbol (like BTCUSDT) to specify which asset you're interested in.


## Function getFrameSchema

The `getFrameSchema` function helps you find details about a specific frame used in your backtesting setup. Think of it as looking up the blueprint for a particular component. You provide the name of the frame you're interested in, and it returns a description of what that frame does and what data it expects. This is useful for understanding the structure of your backtest and making sure everything is configured correctly. Essentially, it lets you peek under the hood of your backtest's framework.

## Function getExchangeSchema

The `getExchangeSchema` function helps you find information about a specific exchange that your backtest uses. Think of it as looking up the details of a trading platform – things like what symbols it offers and how orders are handled. You give it the name of the exchange, and it returns a set of rules and information describing that exchange. This lets the backtest kit know exactly how to interact with the data from that particular exchange.

## Function getDefaultConfig

This function provides you with a set of default settings for the backtest-kit framework. Think of it as a starting point if you're not sure how to configure things. It returns a read-only object containing various numbers and boolean values that control different aspects of the backtesting process, like how frequently data is fetched, limits on signal generation, and options for enabling specific features like DCA or long/short signals. It’s a great way to explore all the configuration possibilities before customizing them to your specific needs.

## Function getDefaultColumns

This function gives you the pre-defined setup for the columns that appear in your backtest reports. It's like a template showing you all the possible columns – things like performance metrics, risk indicators, and strategy events. You can look at the returned structure to understand what columns are available and how they're initially configured before you customize them for your specific reports. Think of it as a peek into the standard report format.

## Function getDate

This function, `getDate()`, simply retrieves the current date. 

Think of it as a way to know what date your backtest or live trading is operating on. 

When running a backtest, it returns the date associated with the specific timeframe you're analyzing. 

If you're running in a live environment, it will provide the current real-time date.

## Function getContext

This function provides access to the current method's context. Think of it as a way to peek inside what’s happening during a particular trading strategy execution. It returns an object containing details about the environment in which the method is running. This could be useful for debugging or tailoring behavior based on the situation.

## Function getConfig

This function lets you peek at the framework's global settings. It returns a snapshot of all the configuration options, like how often it checks prices, limits on slippage, and maximum numbers of signals or log lines. Think of it as a read-only window into how the backtest kit is currently set up. Importantly, it provides a copy of the settings, so you can look without changing anything.

## Function getColumns

This function provides access to the configuration of columns used for generating markdown reports within the backtest-kit framework. It essentially gives you a snapshot of how the data will be displayed in reports, detailing which columns are used for backtest results, heatmaps, live data, and various event types. You can use this to understand the structure of your report without risking any unexpected changes to the underlying configuration. This is useful for debugging or customizing report appearance.

## Function getClosePrice

This function lets you quickly retrieve the closing price of the most recent candle for a specific trading pair and time interval. 

Think of it as grabbing the final price recorded for a particular period of trading activity. You provide the symbol, like BTCUSDT for Bitcoin against USDT, and the timeframe you're interested in, like a 15-minute candle. The function then returns that closing price as a number.

## Function getCandles

This function helps you retrieve historical price data, also known as candles, for a specific trading pair like BTCUSDT. You tell it which pair you're interested in, how frequent the data should be (every minute, every hour, etc.), and how many data points you want to get. The function then reaches out to the connected exchange to pull that data, which is then returned as a list of candle records. Think of it as requesting a historical snapshot of the price movement.


## Function getBreakeven

This function helps you determine if a trade has reached a point where it's made enough profit to cover transaction costs. It's useful for understanding if a trade is effectively "in the green" considering fees and slippage. The function takes the symbol of the trading pair and the current price as input. It then calculates a threshold based on pre-defined percentages for slippage and fees, and tells you if the current price has exceeded that threshold, indicating breakeven has been achieved. The function intelligently adapts to whether it's running in a backtesting environment or a live trading scenario.


## Function getBacktestTimeframe

This function helps you find out the historical dates available for backtesting a specific cryptocurrency trading pair, like BTCUSDT. It fetches a list of dates that represent the time period covered in the backtest data for that symbol. You provide the trading pair’s symbol as input, and it returns a promise containing an array of dates. This allows you to understand the scope of the historical data being used for your backtesting analysis.

## Function getAveragePrice

This function helps you figure out the average price a security has traded at, using a specific method called VWAP. It looks at the last five minutes of trading activity, considering both the price and the amount of each trade.

Specifically, it calculates what's called a "typical price" for each minute (based on the high, low, and closing prices) and then weights that price by the trading volume for that period.

If there's no trading volume at all for a particular period, it falls back to a simpler calculation using just the closing price. To use it, you just need to tell it which security's price you’re interested in, like "BTCUSDT" for Bitcoin against US Dollar Tether.

## Function getAggregatedTrades

This function allows you to retrieve historical trade data for a specific trading pair, like BTCUSDT. It pulls this information directly from the exchange your backtest is connected to.

You can request a limited number of trades if you only need a small sample. If you don't specify a limit, it will fetch trades within a defined time window. The function is designed to efficiently get enough trades, even if that means going back a while or retrieving more than the requested limit initially.

## Function getActionSchema

This function helps you find the blueprint for a specific action within your backtest. Think of it as looking up the definition of a trading action, like "buy" or "sell." It takes the name of the action you're interested in and returns a detailed description of what that action entails, including the data it requires and how it should be executed. You'll use this to understand exactly what's needed for each step in your trading logic.


## Function formatQuantity

This function helps you display the right amount of a cryptocurrency or asset when you're showing it to a user or sending it to an exchange. It takes the trading pair, like BTCUSDT, and the raw quantity you want to show. It then figures out how many decimal places are needed based on the rules of that particular exchange, ensuring the number looks correct. It returns the formatted quantity as a string.

## Function formatPrice

The `formatPrice` function helps you display prices accurately, following the specific rules of the exchange you're working with. It takes a trading pair symbol, like "BTCUSDT", and the raw price value as input.  It then uses the exchange’s internal formatting logic to ensure the correct number of decimal places are shown, making your price displays consistent with the exchange.  This function returns a promise that resolves to the formatted price as a string.

## Function dumpText

The `dumpText` function is your tool for saving raw text data, like log messages or reports, related to a specific trading signal. Think of it as a way to record observations during a backtest or live trade. It automatically figures out whether you're in a backtesting environment or running live, and handles the signal details for you, so you don't have to worry about those specifics.

You'll need to provide the bucket name, a unique dump ID, the actual text content you want to save, and a descriptive label for what the text represents. This function then takes care of storing that information in a way that's easily accessible for analysis and review.

## Function dumpTable

This function helps you display data in a clean, organized table format. It's perfect for showcasing results from your trading simulations.

It takes an array of data objects and presents them as a table, automatically adapting to whether you're running a backtest or a live trading session.

The table's column headers are determined by examining all the data fields present in your objects, ensuring all relevant information is displayed.

You provide details like the bucket name, a unique ID for the data, the data itself, and a description to accompany the table.


## Function dumpRecord

The `dumpRecord` function lets you save a snapshot of data—think of it as a flat, key-value record—associated with a specific signal. It's designed to help you keep track of what's happening during a backtest or live trading session. The function cleverly figures out which signal it's connected to and whether you're running a backtest or a live simulation. You simply provide the data to be saved, a description, and a unique identifier for the dump.


## Function dumpJson

The `dumpJson` function is a handy way to output a complex object as a formatted JSON block, useful for detailed logging or debugging during your backtesting or live trading. It essentially takes your data, like a trading strategy's state, and presents it in a clean, readable JSON format within the context of a specific signal. 

It smartly figures out whether you're running a backtest or a live trade and handles resolving signals automatically, so you don’t have to worry about those details. To use it, you provide the bucket name, a unique identifier for the dump, the JSON object itself, and a brief description to help you understand what the data represents.


## Function dumpError

The `dumpError` function helps you record and share detailed information about errors that occur during backtesting or live trading. Think of it as a way to create a snapshot of what went wrong, including a description of the error and a unique identifier. This function smartly handles the context of your trading system, automatically linking the error to the specific signal involved, whether it's a pending order or a scheduled event. It also knows if you're running a backtest or a live trade, so the error information is appropriately categorized.


## Function dumpAgentAnswer

This function helps you save detailed records of conversations with the AI agent. It takes all the messages exchanged during a session, along with a description and unique identifiers, and stores them in a designated location.  It’s designed to simplify the process by automatically figuring out whether you're running a backtest or a live trading scenario. Essentially, it’s a convenient way to preserve a complete log of the agent's actions and responses for review or debugging. 

The `dto` object contains the information to be dumped.


## Function createSignalState

This function helps you manage the state of your trading signals in a structured way. It generates a pair of functions, `getState` and `setState`, which you can use to access and update the signal's information. The cool thing is you don't need to manually specify the signal ID – it automatically figures that out based on the current environment (backtest or live).

It's particularly useful for advanced strategies, like those driven by large language models, that need to track metrics over time, such as how long a trade is open or its percentage gain. Think of it as a tool to keep track of performance details for each individual trade as it unfolds.

The function takes a set of parameters (not detailed here) to configure the initial state and scoping of the signal.

## Function commitTrailingTakeCost

This function lets you set a specific take-profit price for a trade. It's handy when you want to move your take-profit to a particular price level instead of just adjusting the percentage. 

It handles the complexities behind the scenes, figuring out whether you're in a backtesting environment or live trading and getting the current market price. It essentially calculates how much the new price differs from the initial take-profit distance and applies that difference to the original take-profit price. You just tell it the symbol and the price you want your take-profit to be.


## Function commitTrailingTake

This function lets you fine-tune the trailing take-profit for a pending trade. It's designed to adjust the take-profit distance as the price moves, but it's important to understand how it works to avoid problems.

It always bases calculations on the original take-profit level you set initially. This helps prevent small errors from building up over time if you repeatedly adjust the take-profit.

The `percentShift` value controls how much to move the take-profit. A negative shift moves it closer to the entry price, making it more conservative. A positive shift moves it further away, making it more aggressive.

The function only updates the take-profit if the new position would be *more conservative* than the current one. For long positions, this means only lower take-profit levels are accepted. For short positions, only higher take-profit levels are accepted. 

It automatically figures out whether it’s running in a backtest or live trading environment.

You'll need to provide the trading symbol, the percentage adjustment, and the current price for the calculation.

## Function commitTrailingStopCost

This function lets you update the trailing stop-loss order to a specific price. Think of it as setting a hard limit on how much the price can drop before your order triggers.

It simplifies the process by calculating the correct percentage shift needed based on the original stop-loss distance.

The framework handles some of the behind-the-scenes work for you, like figuring out whether you're in a backtest or live trading environment and getting the current market price.

You simply provide the trading symbol and the new stop-loss price you want to set.


## Function commitTrailingStop

This function lets you refine the trailing stop-loss distance on an existing, pending trading signal. 

It’s important to understand it always calculates adjustments based on the original stop-loss level, not the currently active trailing stop, to avoid compounding errors.

You can tighten or loosen the stop-loss – negative values move it closer to your entry price, positive values move it further away.

The framework is smart about updates: it only adjusts the trailing stop if the new position provides better protection, and it respects the direction of the trade – for long positions, it only moves the stop higher; for short positions, it only moves it lower.

Finally, the function automatically figures out whether it's running in backtesting or live trading mode, so you don't need to specify that. It takes the symbol, the percentage adjustment for the stop-loss, and the current price as input.

## Function commitSignalNotify

This function lets you send out informational notifications about your trading strategy. Think of it as a way to leave notes for yourself or trigger external alerts without actually changing your positions. It's perfect for highlighting key moments in your strategy’s decision-making process, like when a specific indicator triggers or when you notice unusual trading volume. The function takes care of several details automatically, like figuring out whether you're in backtest or live mode, and it also pulls in information like the strategy name, exchange, and the current price, making it easy to add useful context to your notifications. You specify the trading symbol and can add optional details to the notification as well.

## Function commitPartialProfitCost

The `commitPartialProfitCost` function lets you close a portion of your trading position when you've made a profit, based on a specific dollar amount. It simplifies the process by automatically calculating the percentage of your investment needed to achieve that dollar value. 

This function is designed to move your position closer to your take profit target.

It handles the complexities of determining whether you're in a backtest or live environment and also retrieves the current price for calculations. 

You provide the trading symbol and the dollar amount you want to close, and the function takes care of the rest. For example, telling it to close $150 worth of a position will calculate the corresponding percentage.

## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of an open trade when the price moves in a profitable direction, helping you secure gains. It allows you to specify the percentage of the trade you want to close, for example, closing 25% or 50% of the position. This function handles whether it's running in a backtesting simulation or a live trading environment for you, simplifying the process. You tell it the symbol of the trading pair and the percentage to close, and it does the rest, ensuring the price is moving towards your take profit level.

## Function commitPartialLossCost

This function lets you partially close a position when the price is moving towards your stop-loss level, using a specific dollar amount. It simplifies the process by handling the calculations needed to determine the percentage of the position to close. 

The function automatically adapts to whether you're in a backtest or a live trading environment and figures out the current price for you.

You provide the trading symbol and the dollar amount you want to use to close part of the position. For example, if you provide $100, it will close a portion of the position equivalent to $100 in value.

## Function commitPartialLoss

This function lets you automatically close a portion of your open trade when the price is heading towards your stop-loss level. It’s designed to help manage losses by closing a specified percentage of your position – for example, you might choose to close 25% of your trade if the price moves unfavorably. The system figures out whether it’s running a backtest or a live trading scenario and adjusts accordingly. You simply tell it which symbol you're dealing with and what percentage of the position you want to close.

## Function commitClosePending

This function lets you cancel an order that's already in the process of being executed, essentially undoing a "pending" signal. Think of it as a way to step back from a trade without completely halting your trading strategy. It doesn't impact any signals that are already scheduled or prevent the strategy from generating new trading opportunities. The system intelligently figures out if it's running in a backtest or live environment. You can optionally provide details like an ID and note to track why you canceled the order.

## Function commitCancelScheduled

This function lets you cancel a signal that’s been scheduled for execution, but it won’t interrupt what your trading strategy is currently doing. Think of it as saying, "Forget about that planned signal, but keep everything else running as usual." It won't interfere with any existing signals or stop your strategy from creating new ones. The function will automatically determine if it's being used in a backtest or live trading environment. 

You can provide extra information when canceling a signal, such as an ID or a note, but this part is optional.


## Function commitBreakeven

This function lets you automatically adjust your stop-loss order to break even once the price moves in your favor. Essentially, it protects your initial investment by resetting the stop-loss to your entry price.

It's designed to account for transaction costs, ensuring the price needs to move enough to make the trade worthwhile before the break-even is triggered.

The function handles whether you’re in a backtesting or live trading environment and takes care of retrieving the current price for calculations. You only need to specify the trading pair symbol for which you want this automatic break-even adjustment to happen.

## Function commitAverageBuy

The `commitAverageBuy` function helps you gradually build up a position by adding small, regular purchases. It automatically adds a new buy order to your trading strategy's record, using the current market price to determine the cost. This function is smart enough to know whether it's running a test or in a live trading environment and it handles getting the latest price for you. The function also keeps track of the average price you've paid for the asset and will let other parts of your system know a new average buy has happened. You can optionally specify a cost as a parameter.

## Function commitActivateScheduled

This function lets you trigger a previously scheduled trading signal before the expected price. It's useful when you want to act on a signal ahead of time, perhaps because you anticipate market movement. The function sets a flag, and the strategy will then execute the signal during the next price update. It figures out if it's running a backtest or a live trade automatically. You provide the trading symbol, and optionally add a note or ID to the action for tracking purposes.

## Function checkCandles

The `checkCandles` function is a handy tool for verifying if your historical price data (candles) are already stored and ready to use. It efficiently checks if the data exists without needing to download the entire dataset.

Think of it as a quick check to see if you've already downloaded the candles you need for your backtest.

It works by querying the storage system – what's called the 'persist adapter' – to see if the expected candles are present, making the process very fast and efficient. If even one candle is missing or out of place, it will register as a miss, meaning it avoids unnecessary loading of data.

You provide it with some parameters to define what it should check.

## Function cacheCandles

This function makes sure your historical price data (candles) for a specific trading symbol and timeframe is available where it needs to be. It works by first checking if the data exists, and if not, it downloads and verifies it again to guarantee you have what you need. Think of it as a safety net to prevent your backtesting from failing due to missing data. It helps organize and store this data for reliable analysis. You can also provide callbacks to track the progress of the data check and download processes.


## Function addWalkerSchema

This function lets you add a new "walker" to the backtest-kit system. Think of a walker as a specialized tool that runs multiple trading strategies simultaneously using the same historical data. 

It helps you compare how different strategies perform against each other, based on a metric you define.

To use it, you'll provide a configuration object, which tells the walker how to execute the backtests and what to compare.

## Function addStrategySchema

This function lets you tell the backtest-kit framework about a new trading strategy you've built. Think of it as registering your strategy so the system knows how to use it.

When you register a strategy, the system will check to make sure your strategy's signals are valid – things like the prices being correct and your take profit/stop loss logic working as expected. It also prevents your strategy from sending too many signals too quickly, which could cause problems.  Finally, it ensures your strategy's data is safely saved even if there are unexpected issues during live trading. 

You provide a configuration object containing details about your strategy, like how it generates signals.


## Function addSizingSchema

This function lets you tell the backtest-kit how to determine the size of your trades. Think of it as defining your risk management rules.

You provide a sizing schema – a set of instructions – that specifies things like whether you want to use a fixed percentage of your capital per trade, a more complex Kelly Criterion approach, or something based on Average True Range (ATR). 

It also allows you to set limits on how much risk you’re willing to take on each trade and to control the absolute maximum size of your positions. Finally, you can even provide a custom function that will be triggered during the sizing calculation process for more advanced control.

## Function addRiskSchema

This function lets you set up how your trading system manages risk. 

You can define limits like the maximum number of trades running at once. 

It also allows for custom checks to ensure your portfolio is healthy, considering factors like correlations between assets. 

Finally, you can create rules that determine whether or not a trading signal is allowed to execute, potentially rejecting it based on risk conditions. 

Importantly, risk management is shared between all your trading strategies, so they operate within the same boundaries and you can see how they affect each other.

## Function addFrameSchema

This function lets you tell the backtest-kit about a new timeframe generator you want to use. Think of it as registering a way to break down your historical data into specific periods, like daily, weekly, or monthly intervals. You provide a configuration that details the start and end dates for your backtest, the interval length (e.g., 1 day, 1 week), and any special actions you want to trigger as timeframes are generated. This allows the backtest-kit to use your custom timeframe logic during the backtesting process.


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for backtesting. Think of it as registering a data source.

You’ll provide a configuration object, which describes how to access historical price data, how to format prices and quantities, and how to calculate VWAP (Volume Weighted Average Price) based on recent trades. 

Essentially, it helps the system understand where and how to get the data it needs to simulate your trading strategies.

## Function addActionSchema

This function lets you tell backtest-kit about a special action handler, which is like plugging in a service that reacts to events during your backtest. Think of these actions as a way to connect your backtest to external systems like messaging apps, data logging tools, or even custom business logic. 

For example, you could use an action to send a Telegram message whenever your strategy hits a profit target, or log detailed metrics to a database. 

Each time your strategy runs, a new instance of this action handler is created and receives all the important events, like signals, profit updates, and more, allowing it to respond appropriately. You provide a configuration object to define how this action handler should work.
