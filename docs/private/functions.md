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

The `writeMemory` function lets you store data persistently within your trading strategy, like remembering past decisions or calculations. Think of it as creating a named storage location – a "bucket" – with a unique identifier ("memoryId") where you can save and retrieve information. This function handles the details of where this memory is stored, whether you're in a test environment (backtest) or actively trading. 

It takes an object with a few crucial pieces of information: the bucket name, a unique memory identifier, the data you want to save (which can be any kind of object), and a descriptive note about what the data represents.  It's a promise-based function, so it will complete the process and return when the data is safely written. Importantly, it figures out the signal context for you, meaning you don't need to worry about that underlying technical detail.


## Function warmCandles

This function helps speed up your backtesting by pre-loading historical candle data. Think of it as preparing the ingredients before you start cooking. It downloads all the candles for a specific timeframe, from a start date to an end date, and stores them so they're readily available during your backtest runs. This avoids repeated downloads and significantly reduces the time it takes to execute a backtest. You provide the starting and ending dates, and the function takes care of fetching and caching those candles.

## Function waitForReady

This function ensures everything needed for trading is fully loaded before you begin. It waits patiently, checking if the essential registries – those defining how trades work, how data is interpreted, and the strategies you'll use – are ready.

If you're doing a backtest (simulating past performance), it makes sure the data about historical market conditions (frames) is also loaded. 

When running a live trade, frames aren’t needed, so only the exchange and strategy registries are checked. 

It waits for a maximum time, and if things don’t load quickly enough, it silently moves on; you’ll then get an error if you try to start trading without everything being ready. You can control whether or not the frames are required by specifying the `isBacktest` parameter.

## Function validate

This function helps make sure everything is set up correctly before you start your backtests or optimizations. It checks if all the names you're using for things like exchanges, trading strategies, and risk parameters actually exist in the system.

You can tell it to validate specific items if you want, or if you leave it blank, it’ll check *everything* that's registered. This is a quick way to catch any configuration errors before they cause problems later on. 

The checks it runs are remembered, so subsequent validations are faster.

## Function stopStrategy

This function lets you pause a trading strategy's signal generation. 

It essentially tells the strategy to stop creating new orders. Any existing orders will still finish up. 

The framework smartly figures out if it's running a backtest or live trading session to stop the strategy at the right moment, ensuring a clean halt. 

You just need to specify the trading pair symbol – the framework looks for the strategy within its current context.

## Function shutdown

This function lets you safely end a backtest run. It sends out a signal that tells all parts of the backtest system to clean up and prepare to exit. This is useful when you need to stop the backtest because of an external signal, like pressing Ctrl+C. By using this, you make sure everything is properly closed before the program stops.

## Function setStrategyPaused

This function lets you temporarily stop a trading strategy from opening new positions. Think of it like putting a strategy on hold. 

When a strategy is paused, it won't react to new market signals, and any pending signals waiting to be acted upon will remain in a queue until you resume the strategy. Existing orders and ongoing trades will continue as normal.

This pause state is saved, so it persists even if the backtest or live environment restarts or the signal changes. To bring the strategy back into action, you need to explicitly unpause it using `setStrategyPaused(symbol, false)`. Whenever the paused state changes, a notification is sent out to let you know. The function automatically adapts to whether it's running in a backtest or a live trading environment.

You provide the symbol of the trading pair you want to affect and a boolean value indicating whether the strategy should be paused or resumed.

## Function setSignalState

This function lets you update a value associated with a specific trading signal, keeping track of information like how long a trade is open and its percentage gain. It's designed for strategies that need to gather details about each trade, especially in situations where trading decisions are driven by AI.

The function handles the complexities of knowing whether you're in a backtesting or live trading environment, so you don't have to. 

It automatically resolves any pending or scheduled signals. If there isn't a signal waiting, the function will raise an error.

The intent is to allow for advanced strategies that manage risk and target profit based on specific criteria like how long a trade has been open and its overall gain. For example, it can automatically exit a trade if it's been open for a certain amount of time and hasn't reached a particular profit level.

You provide the trading symbol, a way to send updates (the `dispatch` argument), and a data transfer object containing the initial value and a name for the data bucket. The function then returns the updated data.

## Function setSessionData

This function lets you store data that lasts throughout a backtest or live trading session. Think of it as a way to temporarily hold information like cached calculations or the state of a complex indicator.

It's linked to a specific trading pair (symbol), strategy, exchange, and timeframe, so the data is only relevant within that context.

If you need to clear the data later, you can simply pass `null` as the value.

The framework automatically figures out whether you're in backtest or live mode, so you don’t have to worry about that.

You can store complex objects as session data, making it a handy tool for managing cross-candle information.


## Function setLogger

This function lets you plug in your own logging system for backtest-kit. It’s great if you want to direct debugging information to a specific place, like a file, a database, or a more sophisticated monitoring tool. When you provide a logger, backtest-kit will automatically add helpful details to each log message, such as the trading strategy being used, the exchange, and the symbol being traded. This makes it easier to understand what's happening during your backtests and identify any potential issues. You need to provide an object that implements the `ILogger` interface.

## Function setConfig

The `setConfig` function lets you adjust how the backtest-kit framework operates. Think of it as tweaking the settings to fine-tune your backtesting environment. You can provide a new configuration object, and it will update the framework's global settings. 

Sometimes, especially in testing scenarios, you might need to bypass certain validation checks—that’s where the `_unsafe` flag comes in. It’s a way to override settings even if they don’t strictly conform to expected rules, but use it with caution.

## Function setColumns

This function lets you customize the columns that appear in your backtest reports, like those generated for markdown. You can change how different data points are displayed and organized.

It’s useful if you want to tweak the default report appearance or need specific columns for analysis. 

The function takes a configuration object which lets you adjust individual columns. 

Validation checks are in place to make sure your configurations are structurally sound, but if you're working in a testing environment and need to bypass these checks, you can use the optional `_unsafe` parameter.

## Function searchMemory

The `searchMemory` function helps you find relevant information stored in your memory system. Think of it as a powerful search tool.

It lets you query a specific memory bucket using a text-based search.  The results are ranked by relevance, using a technique called BM25, so you'll see the most useful entries first.

The function automatically adapts to whether you're running a backtest or a live trading environment and understands the current signal being processed, eliminating the need for manual configuration.

It returns an array of results, each containing the memory's ID, a relevance score, and the content itself, which is structured according to the type `T`.  This makes it easy to retrieve and use the information you’ve found.


## Function runInMockContext

This function lets you execute code as if it were running within a backtest or live trading environment, but without actually needing a full backtest setup. It’s perfect for testing code that relies on things like the current timeframe or exchange information.

Think of it as creating a temporary, controlled environment for your code to run in.

You can customize the details of this environment - things like the exchange name, strategy name, and even the date and time – but if you don’t, it defaults to a basic "mock" setup. This makes it easy to test components in isolation without needing a complete backtest running. The `when` parameter defaults to the current minute, making it straightforward to work with time-sensitive operations.


## Function removeMemory

This function helps clean up data related to past trading signals. Specifically, it removes a "memory" entry—think of it as a record of a past calculation—associated with a particular signal. It figures out whether you're running a test or a live trade and handles the necessary steps to make sure the cleanup works correctly within the trading environment. You provide the name of the data bucket and the unique ID of the memory entry you want to remove.


## Function readMemory

The `readMemory` function lets you fetch data that's been stored in memory, specifically data associated with the current trading signal. It's designed to retrieve information that's relevant to the ongoing trade.

This function simplifies things by figuring out which signal you're working with and whether you're in a backtesting or live trading environment, without you needing to specify that directly.

It takes a simple object as input: you provide the name of the memory bucket and the unique ID of the specific memory item you want to retrieve.  The function then returns a promise that resolves to the value stored in memory, automatically casting it to the expected type.


## Function overrideWalkerSchema

This function lets you tweak a pre-existing "walker" configuration, which is used when comparing different strategies. Think of it as a way to modify a strategy's settings without completely rebuilding it. You provide a partial update – only the settings you want to change will be altered; everything else stays the same. It's useful for analyzing how small adjustments to a strategy impact its performance.

## Function overrideSweepSchema

This function lets you modify a sweep configuration that's already been set up. Think of it as fine-tuning an existing plan. It only changes the parts you specify; everything else stays the same. Keep in mind that the framework remembers sweep configurations, so any changes won't apply to already running sweeps unless you refresh the memory. 

You provide a partial configuration object to update the sweep.

## Function overrideStrategySchema

This function lets you modify a trading strategy that's already been set up within the backtest-kit framework. It’s like making a small adjustment to an existing strategy – you can change specific settings without completely rebuilding it. Think of it as fine-tuning a strategy’s configuration. 

You provide a portion of the strategy's data, and the framework applies those changes to the existing strategy while keeping everything else the same. It's helpful when you need to make incremental updates to a strategy's settings.

The function returns a promise that resolves to the updated strategy schema.

## Function overrideSizingSchema

This function lets you tweak an existing position sizing strategy without rebuilding it from scratch. Think of it as fine-tuning – you can change specific parts of the sizing schema, like the risk percentage or the minimum size, while keeping the rest of the original settings intact. It's helpful when you want to adjust a sizing strategy based on new data or changing market conditions but don’t want to rewrite the entire thing. You provide a partial sizing configuration object, and this function returns a modified sizing schema.

## Function overrideRiskSchema

This function lets you tweak existing risk management settings within the backtest-kit system. It’s like making small adjustments to a plan you’ve already put in place. Instead of replacing the whole risk configuration, you can simply update specific parts of it – just the settings you want to change will be affected, leaving everything else untouched. You provide a partial configuration object containing the updated values.

## Function overrideMCPSchema

This function lets you tweak existing MCP (Model Context Protocol) configurations. Think of it as a way to fine-tune how your backtest environment handles data. 

You provide a partial configuration – just the bits you want to change – and the function updates the existing MCP, leaving the rest untouched. It’s useful when you need to adjust things without starting from scratch. The function returns a promise that resolves to the updated MCP configuration.

## Function overrideFrameSchema

This function lets you tweak the settings for a specific timeframe you're using in your backtest. 

Think of it as modifying an existing blueprint rather than creating a new one from scratch.

You provide a set of changes—like adjusting the frequency or data fields—and only those specific changes will be applied to the timeframe's configuration. The rest of the original settings remain untouched. This is useful when you need to fine-tune how data is processed for a particular timeframe during your backtesting.


## Function overrideExchangeSchema

This function lets you modify an already set up data source for an exchange within the backtest-kit framework. Think of it as a way to tweak existing exchange settings rather than completely replacing them. You provide a partial configuration – just the parts you want to change – and the function updates the original exchange data accordingly, leaving everything else untouched. It's useful when you need to adjust a specific parameter without redoing the entire exchange setup.

## Function overrideActionSchema

This function lets you tweak existing action handlers within the backtest-kit framework without needing to completely replace them. Think of it as making small adjustments to how your trading actions behave. 

You can use this to update things like the logic within an event handler, change how callbacks work in different environments (like development versus production), or even swap out the specific implementation of a handler. It’s a handy way to fine-tune your actions without requiring significant changes to your overall strategy. The function takes a partial configuration object – just the parts you want to change will be updated, leaving everything else untouched.

## Function listenWalkerProgress

This function lets you track the progress of your backtest as it runs. It provides updates after each strategy finishes, so you can monitor how things are going. 

It’s designed to handle updates one at a time, even if the update function you provide takes some time to process, ensuring a smooth and predictable flow of information. Basically, you give it a function to call when a strategy is done, and it makes sure that function is executed safely and in order.

## Function listenWalkerOnce

This function lets you monitor the progress of a trading walker, but only once a specific condition is met. You give it a filter—a way to define what kind of event you're looking for—and a callback function that should run when that event happens. After the callback executes, the monitoring automatically stops, preventing unnecessary processing. It’s great for situations where you need to react to a particular walker event and then forget about it. 

The `filterFn` determines which events trigger the callback, and the `fn` is the function that gets executed when a matching event is detected.


## Function listenWalkerComplete

This function lets you be notified when a backtest run finishes, ensuring all strategies have been tested. 

It's like setting up a listener that gets triggered when the backtesting process is fully complete.

Importantly, it handles events one at a time, even if your notification code takes some time to run, preventing issues from multiple processes happening at once.

You provide a function that will be called when the backtest is done, and it returns a function to unsubscribe from these notifications when you no longer need them.

## Function listenWalker

The `listenWalker` function lets you keep an eye on what's happening as your backtests run. It's like subscribing to updates about each strategy's completion within a `Walker`.

Whenever a strategy finishes, it sends an event, and this function makes sure you receive those events. The events are delivered one at a time, even if your event handling function takes some time to process (like if it's doing something asynchronous). To ensure smooth operation, it uses a queuing system to prevent multiple events from being handled at the same time.

You provide a function (`fn`) that will be called for each event, allowing you to react to the progress of the backtest. This function will receive a `WalkerContract` object containing details about the completed strategy. Finally, `listenWalker` returns a function that you can call to unsubscribe from these events.

## Function listenValidation

This function lets you keep an eye on potential problems during risk validation. 

Essentially, it provides a way to be notified when something goes wrong while the system is checking trading signals. 

If a validation process encounters an error, this function will alert you, allowing you to debug and monitor for failures. The alerts are handled one at a time, even if your response involves asynchronous operations, ensuring a reliable flow of information. You provide a function that will be called whenever a validation error occurs, and this function returns another function to unsubscribe from these notifications.

## Function listenSync

This function lets you listen for events related to order synchronization, like when a signal is being opened or closed. It's a way to react to these moments as they happen, ensuring things are processed in a coordinated way.

Importantly, if your listener encounters a problem—like an error during opening or closing—it can signal how to handle that issue. A simple error will trigger retry attempts; a rejection means the operation is immediately stopped; and a deleted error is treated as a temporary setback.

You provide a callback function that's called whenever a synchronization event occurs, and this callback can handle the event data.

## Function listenStrategyCommitPerSignal

This function lets you keep an eye on what’s happening with your trading strategies. It's like setting up a notification system that tells you when a new signal is generated and a commitment is made. 

It's designed to avoid overwhelming you with repeated notifications – it only reports the first relevant event for each signal.

You provide a filter to specify which events you’re interested in, and a function that will be executed when a matching event occurs. The function will receive details about the strategy commitment. 

The function returns a cleanup function that you can call to stop listening to these events.

## Function listenStrategyCommitOnce

This function lets you react to specific changes happening within your trading strategy, but only once. It's like setting up a temporary listener – it waits for a particular event related to your strategy to occur, then immediately runs the code you provide, and then it stops listening. This is handy when you need to respond to a single, specific strategy action and then move on. 

You tell it which events you're interested in using a filter function, and then provide a callback function that gets executed when the right event happens. The function automatically cleans up after itself by unsubscribing, so you don't have to worry about managing subscriptions.


## Function listenStrategyCommit

This function lets you keep an eye on what's happening with your trading strategy – things like when signals are canceled, orders are closed, or stop-loss and take-profit levels are adjusted. It's like setting up a notification system for important changes within your strategy.

The system ensures these notifications are handled one at a time, even if the notification processing takes some time. This helps prevent any conflicts or unexpected behavior due to multiple actions happening at once. You provide a function that gets called whenever one of these events occurs, so you can react to them in your own way. Essentially, you're subscribing to these events to build custom logic around strategy changes.

## Function listenSignalWaitingPerSignal

This function lets you react to specific events that occur while a trade is waiting to be executed, but only once per signal. It's useful when you want to know when a waiting order finally becomes valid – for example, when a limit order reaches the required price level. You provide a filter to identify the events you're interested in and a function to handle those specific events. Think of it as setting up a listener that only triggers the first time a waiting order meets your criteria and then stops listening for that particular signal.

## Function listenSignalWaiting

This function lets you keep an eye on what's happening while your strategies are waiting for a signal to trigger. It's like having a notification for each tick that occurs before a signal becomes active.

Be aware that this can generate a lot of events – one for every tick while waiting on each signal.

You can use this if you need to react to every single tick during those waiting periods, but if you're looking for less frequent updates, consider using `listenSignalWaitingPerSignal` instead, which provides updates only for each specific signal.

The function takes a callback – a piece of code that will run whenever a waiting tick event is detected. This callback receives information about the tick event, allowing you to react accordingly. It returns a function that can be called to unsubscribe from these notifications.

## Function listenSignalScheduledPerSignal

This function lets you react to scheduled trading signals as they become available, but only once for each unique signal. It’s useful when you need to perform an action based on a new signal's data, like updating a display or triggering a secondary process. You provide a filter to determine which signals should trigger the callback, and then a function to execute when a matching signal is received. The subscription is automatically cleaned up when the function returns a cleanup function.

## Function listenSignalScheduled

This function lets you listen for signals that are scheduled to trigger when a specific price is reached. Think of it as setting up an alert for when the market hits a certain level.

It's designed to work with both live trading and backtesting.

Whenever a new signal is created that has a specific price target, this function will notify you. You'll get updates as the signal "waits" for that price to be met.

You provide a function (`fn`) that will be called each time a scheduled signal event occurs, providing you with the relevant details.  The function you provide will also be returned, which you can then call to unsubscribe from these signal updates.

## Function listenSignalPerSignal

This function lets you react to specific trading signals as they come in. It's designed to only notify you when a new signal appears, avoiding redundant updates.

You provide a filter to determine which signals you're interested in, and then a function to execute when a matching, unique signal arrives. 

The system handles some of the details for you, ensuring you only receive signals with valid information and that repeated signals are ignored. You can be sure the callback will always receive signal data when it's triggered.


## Function listenSignalOpenedPerSignal

This function lets you track when a new trading signal is activated, specifically when an order is opened. It provides a way to react to each individual signal being opened, whether it’s from a live trading environment or a backtesting simulation. 

You provide a filter function to determine which signal openings you're interested in, and then a callback function that will be executed each time a new signal is opened that matches your filter. The callback receives information about the opened signal, allowing you to take action based on that specific event. The function returns a subscription function which you can call to stop listening.

## Function listenSignalOpened

This function lets you hook into when new trading positions are opened, whether those positions are created in real-time or as part of a backtest. You provide a function that will be called each time a position is opened, and it will receive information about that specific event. Think of it as setting up a listener to be notified whenever a trade begins. This is useful for monitoring trades as they happen or analyzing how often certain conditions lead to new positions being opened during a backtest. It returns a function that, when called, will unsubscribe from the event listener.


## Function listenSignalOnce

This function lets you set up a listener that reacts to specific trading signals, but only once. You provide a rule – a filter – to define which signals you're interested in. Then, you give it a function to run when that signal happens. Once the signal matches your rule and the function runs, the listener automatically stops, so you don’t have to worry about cleaning it up. It's a handy way to wait for a particular condition to be met and then take action.


## Function listenSignalNotifyPerSignal

This function lets you tune into updates about signals, specifically focusing on each unique signal identifier. It's a way to be notified whenever a new signal appears. To prevent being overwhelmed by repeated notifications from the same signal, it automatically handles duplicates – if a signal is sent multiple times, you'll only receive one notification. You provide a filter to specify which signals you're interested in and a function to execute whenever a new, unique signal is detected.


## Function listenSignalNotifyOnce

This function helps you react to specific signal events just once and then stop listening. You provide a filter to define which events you're interested in, and a callback function that will run when a matching event occurs. After that one execution, the subscription is automatically cancelled, so you don’t need to worry about manually unsubscribing. Essentially, it's a convenient way to get notified about a single occurrence of a particular event.


## Function listenSignalNotify

This function lets you tap into notifications about signal information changes within the backtest environment. Specifically, it listens for events triggered when a trading strategy uses `commitSignalInfo()` to share notes related to an active position.

Think of it as a way to be informed about custom messages or updates associated with your trades as they unfold during a backtest.

The function provides a way to handle these events in a reliable, sequential manner – even if your handling function is asynchronous. It ensures events are processed one at a time, preventing any potential conflicts or issues from concurrent operations.

You provide a callback function that will receive these signal information events. This callback will be executed when new signal information becomes available. This function returns an unsubscribe function that can be called to stop listening.

## Function listenSignalLiveWaitingPerSignal

This function lets you listen for specific events during live trading, but with a clever twist to avoid getting overwhelmed by repetitive updates. It focuses on "waiting" periods – those times when a trade is poised to enter but hasn't yet.

Imagine a trade order resting on the exchange; this listener will only notify you once when the conditions to activate that order are met, even if it continues to wait. It won't bother you with constant updates.

This is designed to work exclusively with live trading data and won't trigger during backtesting.

To prevent any accidental interference between different trading strategies, the system keeps track of events separately for each trade - considering the strategy, exchange, time frame, trading mode, and the asset being traded.  

The `filterFn` lets you define exactly which waiting events you're interested in. Events that don't match this filter are ignored completely, so you won't miss anything important that comes later.


## Function listenSignalLiveWaiting

This function lets you listen for signals that are currently waiting to be activated during a live trading execution. Think of it as getting updates on signals that are "on hold" – they haven't triggered yet but are poised to.

You'll get a notification for each tick while a signal is waiting, providing information like the potential entry point and theoretical profit and loss (pnl) – remember, no actual position is open yet, so there's no risk involved.

Importantly, this callback *only* works with live executions; it won’t trigger during backtest replays. This makes it perfectly safe for actions like sending notifications or mirroring orders, since it won't interfere with historical data. 

The information is delivered directly without needing extra checks, making it efficient. You just provide a function that will handle the incoming events.


## Function listenSignalLiveScheduledPerSignal

This function allows you to react to specific scheduled events coming from live trading executions. It's designed to ensure you only receive each signal once, acting as a safeguard against duplicate emissions.

Think of it as a way to listen for events triggered by your strategies during live trading, but only if they meet a certain condition you define.

Crucially, this function *only* works with live executions; it won't fire during backtest replays.

The mechanism to avoid duplicates is smart: it considers the strategy, exchange, the trading frame, mode and symbol to ensure even if you have multiple strategies running concurrently, they won’t interfere with each other's signal handling. Once a signal has been processed, any repeats are ignored until a new signal occurs.

You provide a filter function which determines if an event should be considered. This filter runs first, meaning events that don't pass the filter will never be processed, and won't prevent later events from being handled.

The function returns a way to unsubscribe from these events when you no longer need them.

## Function listenSignalLiveScheduled

This function lets you tap into live trading executions to get notified when a strategy is actively waiting for a specific price to be reached. Think of it as a heads-up when a strategy has placed an order but is still waiting for the market to move to the desired price.

It's specifically designed for live trading – backtesting won't trigger this notification. This makes it safe for actions that might interact with the real world, such as sending alerts or mirroring trades.

You’ll get a single notification when the initial order is placed and the system starts waiting for the price. Subsequent updates related to that same order will arrive through different channels. 

The information you receive is already filtered based on the specific action taken, so you don't need extra checks to determine the event type.


## Function listenSignalLivePerSignal

This function lets you tap into the live stream of signals generated during a backtest. It’s like setting up an alert that only triggers when a new trading signal appears. You define a filter to specify exactly which signals you're interested in, and then a function to execute whenever a matching signal arrives.  Importantly, it only works with signals created by `Live.run()`, ignoring periods of inactivity. You'll find more details about how signals are handled uniquely within the framework's documentation.

The filter function determines if a signal is of interest, while the callback function handles the actual processing of that signal.


## Function listenSignalLiveOpenedPerSignal

This function lets you listen for when a trading strategy opens a new position during live trading.

It ensures you only receive notifications once for each new trade signal, even if there are occasional hiccups in the system.

The function works exclusively with live trading data, meaning it won’t trigger during backtesting or replay sessions.

Because of how it handles duplicates, multiple strategies running concurrently won't interfere with each other's notifications. 

You provide a filter to select which events you’re interested in, and a function to execute when a matching event occurs. The filter is applied first, so it can prevent events from being tracked in the first place.

## Function listenSignalLiveOpened

This function lets you listen for when a trading strategy actually starts a new position in a live trading environment. 

It's triggered when a strategy generates a signal to enter a trade, whether it’s an immediate action or part of a scheduled plan. 

You’ll receive details about the signal, including the entry price and stop-loss/take-profit levels. This is the moment the position begins incurring costs.

Crucially, this callback only works with live executions – it won't be called during backtesting, so it's safe to use for things like placing orders elsewhere, sending alerts, or triggering notifications. 

You get the specific type of event directly, without needing extra checks to identify the action.


## Function listenSignalLiveOnce

This function lets you temporarily listen for specific trading signals coming from a live backtest run. Think of it as setting up a quick alert for a particular event. You provide a filter—a rule to determine which signals you're interested in—and a function to run when that signal appears. Once the matching signal is received, the function automatically stops listening, ensuring you only get that one notification. It’s perfect for debugging or quickly checking a specific condition during a live backtest.

## Function listenSignalLiveIdle

This function lets you listen for moments when your trading strategy isn't actively doing anything—no positions held, no orders pending. 

Think of it as a heartbeat signal; it tells you the strategy is still running but currently inactive. 

The data you receive will include the current price, the traded symbol, and information about the strategy and the exchange it's connected to, but crucially, there won't be any signal data because no signal was present during the idle time.

It’s designed to be used with live trading executions and won't trigger during backtesting. This makes it a safe place to handle tasks that interact with the real world, such as sending notifications or updating external systems.

## Function listenSignalLiveClosedPerSignal

This function lets you listen for when a live trading strategy has closed a position. 

It’s designed to make sure you only get notified once for each closed position, even if there's a technical hiccup.

Importantly, it only works with live trading executions – not when you're replaying past data.

To help prevent interference when using multiple strategies, it tracks closed positions separately for each strategy, exchange, and trading pair. 

You provide a filter to decide which closed position events you’re interested in, and a function to execute when one of those events occurs. The filter is checked *before* any deduplication takes place.

## Function listenSignalLiveClosed

This function lets you listen for when a live trading strategy closes a position. 

It's specifically designed for actions happening in real-time, not during backtesting simulations.

When a position closes – whether due to a stop-loss, take-profit, or manual closure – this function will notify you. You'll receive details like the reason for closure, the timestamp, and the realized profit and loss (including fees and slippage). 

Importantly, once you receive a signal through this listener, that's the end of the line - you won't get any more events related to it. This makes it ideal for actions that need to happen instantly, like sending notifications or mirroring trades. Because of the way the events are structured, you don't need to check the `action` field before accessing the closing details.

## Function listenSignalLiveCancelledPerSignal

This function lets you listen for when a trading signal is cancelled during a live execution. 

It only works with signals generated during a live trading session – not during backtests.

The function delivers updates once for each cancelled signal, avoiding repeated notifications even if something goes wrong.

To ensure you only receive the relevant cancelled signals, you provide a filter function to screen them. This filter runs first, so it can't inadvertently hide important events. 

You also define a callback function that gets executed for each filtered, unique cancelled signal.


## Function listenSignalLiveCancelled

This function lets you listen for situations where a trading signal was dropped before it actually became a trade. It's specifically for live trading, not backtesting.

Think of it as a notification when a signal is cancelled – maybe the wait time expired, the price moved against you, or you manually cancelled it.

You'll get information about why it was cancelled, including a unique ID for user cancellations.  It’s a way to react to cancelled signals in a live environment like sending alerts or updating a user interface. Because it's only triggered during live executions, you can confidently use it for actions that need to happen in the real world.

## Function listenSignalLiveActivePerSignal

This function lets you set up a listener that reacts to specific events happening during live trading. It's designed to trigger only once for each trading signal that meets your criteria.

Think of it as a way to get notified when a trade hits a certain profit level or other milestone – but only the first time it happens.

The listener only works with data coming directly from live executions, meaning backtesting won't trigger it. 

To avoid getting overwhelmed with repeated notifications from the same trade, it makes sure you only get the first signal.  It also lets you specify a condition (a predicate) that determines which signals should be considered. Events that don't meet this condition are ignored, so they won't interfere with future signals.

## Function listenSignalLiveActive

This function lets you hook into real-time updates while your strategies are actively trading. It's like having a live feed of what's happening with your positions, including profit and loss, and how close you are to hitting your take-profit or stop-loss levels.

You'll get notified for every tick while a position is open.

Importantly, this only works during live trading sessions initiated by `Live.run()`. You won't receive these notifications during backtesting. This makes it a safe place to perform actions that affect the outside world, such as sending notifications or placing mirrored orders.

The events are already organized by action, so you can directly access the data you need without needing extra checks.


## Function listenSignalLive

This function lets you tap into the live trading signals generated when you're running a backtest. It's like setting up a listener that gets notified every time a signal is produced.

You provide a function that will be called with each signal – this function receives the signal data.

Importantly, the signals are delivered in the order they happen, and the processing of each signal is handled one at a time, ensuring no signals are missed.

This listener only works when using `Live.run()`, so it’s specifically for observing live executions.

The function returns another function that you can call to unsubscribe from these live signal updates.


## Function listenSignalIdle

This function lets you listen for moments when your trading strategy isn't actively holding a position – essentially, times when it’s “idle.” It's a way to react to periods of no signal. 

You provide a function that will be called whenever this idle state occurs. The information passed to your function includes the current price and details about the strategy, exchange, and timeframe being used. It's particularly useful if you want to track or react to these quiet periods in your trading activity. Remember that during these idle events, `signal` will always be null.


## Function listenSignalEventPerSignal

This function lets you keep a close eye on signal events, specifically designed to handle them one signal at a time. It’s like setting up a notification system that only alerts you when a new signal appears. 

You tell it what kind of events you’re interested in with a filter – for instance, you might only want to hear about signals that are opened. Then, it calls your provided function each time a new signal ID arrives. 

The system makes sure you don't get duplicates, even if a signal has both an opening and closing event; you can refine this further by filtering based on the action type. Essentially, it gives you focused and reliable updates on individual signal lifecycles.


## Function listenSignalEventOnce

This function lets you temporarily listen for specific lifecycle events and react to them just once. Think of it as setting up a temporary listener that only fires when a particular condition is met. Once that condition is met and the callback runs, the listener automatically disappears. This is really handy if you only need to wait for something to happen, like a trade to open or close, without being subscribed indefinitely. You tell it what events to look for using a filter, and then provide a function to execute when that specific event occurs.

## Function listenSignalEvent

This function lets you keep an eye on what's happening with your trading signals. You can use it to react to signals being created or closed, whether they're part of a live trade or a backtest.

It's like setting up an alert system; whenever a signal starts up or finishes (because of a profit target, a stop-loss, or time running out), this function will notify you. 

The events happen in order, so you can be sure you're processing them correctly, even if your reaction to the event takes a little time. To use it, you simply provide a function that will be called whenever a signal event occurs, providing details about the event.


## Function listenSignalClosedPerSignal

This function lets you react to trading signals that have been closed, but it only triggers once for each unique signal ID. You provide a filter function to specify exactly which closed signals you're interested in. Then, a callback function is executed whenever a closed signal with the filter criteria is received. Think of it as a way to get notified about the final outcome of individual trading signals as they complete.

## Function listenSignalClosed

This function lets you tap into events when a trading position closes, whether it's a live trade or a backtest simulation. Whenever a position is closed, it will call the function you provide.

You’ll receive details like the profit/loss (pnl), the reason for the close (closeReason), and the exact timestamp of the closing event. This is especially useful for analyzing your trading strategy's performance after each trade.

To use it, simply give it a function that will handle the closing event data. The function you provide will return another function that you can call to unsubscribe from these events.


## Function listenSignalCancelledPerSignal

This function lets you listen for situations where a trading signal is cancelled. Specifically, it provides updates on cancelled signals, but only when a new signal ID is encountered.

You provide a filter function to determine which cancelled events you're interested in, and a callback function that will be executed for each new signal ID that experiences a cancellation. Think of it as a way to react to cancelled orders on a per-signal basis. The function returns an unsubscribe function, which you’ll need to call when you no longer need to listen for these events.

## Function listenSignalCancelled

This function lets you be notified when a signal is cancelled before a trade ever happens. It’s useful for understanding why signals aren’t being executed, perhaps due to scheduling issues or other problems. 

You provide a function (`fn`) that will be called whenever a signal is cancelled, and that function will receive details about the cancellation, including the reason it occurred. This is a way to monitor and debug your trading strategies and ensure signals are processed as expected. It works for both live trading and backtesting scenarios.

## Function listenSignalBacktestWaitingPerSignal

This function lets you react to specific signals during backtesting, but in a smart way to avoid getting overwhelmed by repetitive updates. It focuses on those "waiting" signals – the ones where an order is resting and hasn't been filled yet.

The callback you provide will only run the first time a signal meets your criteria; subsequent updates for that same signal will be skipped.

It's designed to work *only* during backtesting, so you don’t have to worry about it affecting live trades.

Think of it as a targeted alert system for backtesting, letting you focus on the significant changes without the noise. You use a filter to decide which signals you even want to consider, and the function takes care of making sure you only get notified once per signal. Importantly, this deduplication happens within each backtest execution, preventing signals from different strategies from interfering with each other.

## Function listenSignalBacktestWaiting

This function lets you listen for updates during a backtest when a signal hasn't yet triggered. 

Essentially, it provides information about potential trades before they actually happen. 

You’ll receive events for each tick while a signal is waiting to activate, giving you details about the signal and theoretical profit/loss (pnl) – keep in mind the position isn’t open yet, so there’s no actual risk involved.

It’s designed specifically for backtesting and won't be active in live trading environments, making it perfect for analyzing backtest results and creating reports without interference. You can directly access relevant data without needing extra checks.


## Function listenSignalBacktestScheduledPerSignal

This function lets you listen for specific events generated during backtesting, focusing on results tied to individual signals. It ensures that you only receive each signal's information once, acting as a safeguard against duplicates.

The callback will be triggered for each signal that matches the filter you provide, specifically during backtest runs—not in live trading situations.

It's designed to work with parallel strategies without interfering with each other's events; the filtering happens *before* any duplicate checks. 

You provide a function (`filterFn`) that decides which signal events you want to be notified about, and a callback (`fn`) that gets executed for those events. The filter function is evaluated first, guaranteeing that rejected events don’t influence the deduplication process.


## Function listenSignalBacktestScheduled

This function lets you tap into events that happen during a backtest when a strategy is waiting for a specific price to be reached. Think of it as getting a notification when your strategy has placed an order but the market hasn't hit that price point yet.

It’s designed specifically for backtesting – you won't see these events during live trading. This makes it perfect for analyzing backtest results or building reports that you don't want to be affected by real-time market data.

The event you receive signals the *start* of this waiting period; subsequent updates about the same waiting order will be delivered through different events. You don’t need to check the event type, as it’s already filtered for these scheduled signals.

You provide a function (`fn`) that will be called whenever one of these scheduled tick results is generated during a backtest. The function receives an object (`IStrategyTickResultScheduled`) containing details about the event.


## Function listenSignalBacktestPerSignal

This function lets you tap into the stream of signals generated during a backtest. Think of it as setting up a listener that gets notified whenever a new trading signal is produced.

You provide a filter to specify which signals you're interested in, and a function that will be executed for each of those signals.

It's important to know that this listener only works during a backtest execution – it won't pick up signals when the backtest isn’t actively running. Also, signals that represent no action (like `signal: null`) are ignored, so you only get events for actual trading decisions. It handles signal duplicates to ensure you don't get overwhelmed.


## Function listenSignalBacktestOpenedPerSignal

This function lets you listen for when a backtest starts a new trade, but only for specific situations. 

It provides a way to react when a trade is opened during a backtest, ensuring you only get notified once for each unique trading scenario.

The system remembers the last signal it processed for each combination of strategy, exchange, timeframe, mode, and symbol, preventing duplicate notifications.

You can use a filter function to specify exactly which opened trades you're interested in, and this filter is applied *before* the deduplication happens, so it can’t miss anything.

It's important to remember this only works during backtest simulations, and won't fire during live trading.


## Function listenSignalBacktestOpened

This function lets you tap into what's happening when a trading position actually begins during a backtest. It’s like getting a notification the moment a trade is triggered, whether it's an immediate order or a planned entry.

You’ll receive details like the signal information, including the entry price and stop-loss/take-profit levels. 

Importantly, this notification only comes from backtest simulations – it won't be used in live trading. This makes it a clean, dedicated channel for analyzing and reporting on backtest results without interference from real-world trading activity. You can directly access the relevant information without extra checks.


## Function listenSignalBacktestOnce

This function lets you react to specific signals during a backtest, but only once. 

You provide a filter – a rule that determines which signals you're interested in – and a function to run when a matching signal arrives.

The function automatically subscribes to signals from the backtest, executes your callback function the first time a signal matches your filter, and then immediately unsubscribes, ensuring it doesn't run again. It’s great for performing a single action based on a particular event during the backtest.


## Function listenSignalBacktestIdle

This function lets you listen for moments during a backtest when your trading strategy isn't actively doing anything – it doesn't hold any positions and has no scheduled actions. Think of it as getting notified when your strategy is "idle" or quiet. 

The events you receive will contain information like the current price, the symbol being traded, and details about the strategy, exchange, and data frame being used. Importantly, the `signal` data will always be null in these events.

This is especially useful for monitoring backtest progress, logging heartbeat signals, or getting a sense of how often your strategy remains inactive.  It only works with backtest simulations; you won't receive these notifications in live trading. You provide a function (`fn`) that gets called whenever an idle event occurs. The function you provide returns another function which can be used to unsubscribe from the event.

## Function listenSignalBacktestClosedPerSignal

This function lets you listen for when a backtest finishes for a specific trading signal. It ensures you only receive each signal's closing information once, even if the backtest runs multiple times. 

Think of it as a way to react to the final result of a backtest, but only once per signal.

It's specifically designed for backtesting scenarios, so it won't trigger during live trading.

You provide a filter to choose which signals you're interested in, and a callback function to execute when a matching signal closes. The filter is checked before any repetition is checked, so it will always check everything the first time.


## Function listenSignalBacktestClosed

This function lets you keep an eye on when positions close during backtesting. 

You provide a function that will be called each time a position closes, whether it's due to a take-profit order, a stop-loss trigger, time expiration, or manual closure.

The information you receive includes the reason for the closure, the exact timestamp, and the profit/loss realized, accounting for fees and slippage.

Importantly, this only works for backtesting scenarios, so it's perfect for analyzing backtest results and generating reports without interference from live trading data. You don’t need to check the event type – the information you need is readily available.


## Function listenSignalBacktestCancelledPerSignal

This function lets you listen for situations where a trading signal was cancelled during a backtest. 

It’s designed to make sure you only receive each cancelled signal once, even if the backtest is complex or runs multiple strategies. 

The function filters events based on a predicate you provide, ensuring that you only process the cancelled signals you're interested in. 

It only operates during backtest executions; you won't see these events in live trading scenarios. 

The callback is invoked at most once per signal, and the system keeps track of which signals it's already processed to prevent duplicates. 

The filter function is applied first, so it cannot mask later matching events.


## Function listenSignalBacktestCancelled

This function lets you be notified when a trading signal is cancelled during a backtest. 

It's specifically for analyzing backtest results – you won't get notifications from live trading.

A cancelled signal means the trading opportunity was dropped before any money was actually put at risk.

The notification will tell you *why* the signal was cancelled, like a timeout or price movement, and give you an ID if the cancellation was user-initiated.

Think of it as a way to monitor and debug how your backtest strategies handle signals that don’t ultimately lead to trades.

You provide a function to be called when a cancellation happens, and that function will receive information about the cancelled signal.


## Function listenSignalBacktestActivePerSignal

This function lets you monitor specific events happening during a backtest, focusing on when a trading position meets a particular condition. 

It's designed to notify you only once for each signal, even if that condition continues to be met throughout the trade's lifetime. Think of it as a way to get alerted when a trade hits a certain profit level, for instance.

It only works with backtests – no live trading data will trigger it. The system is clever: it ensures that multiple strategies running simultaneously don't interfere with each other's notifications, and it won't re-trigger notifications for the same signal. 

You provide a filter to specify which events you're interested in and a callback function to execute when a matching event occurs. The filter is checked *before* any deduplication happens, guaranteeing that even rejected events won’t prevent later valid ones from being delivered.

## Function listenSignalBacktestActive

This function lets you tap into real-time data during backtesting simulations. It provides a stream of updates for each tick while a trading position is active.

You'll get information about the current profit and loss, as well as how close the price is to your take-profit and stop-loss levels.

It's specifically designed for backtest analysis and reporting, ensuring that the data isn't mixed with live trading signals. This is a high-frequency feed – expect a lot of updates! The callback function you provide will be executed for every relevant event during a backtest run.

## Function listenSignalBacktest

`listenSignalBacktest` lets you hook into the backtest process to receive updates as it runs. It’s a way to get notified about what’s happening during the simulation, like when a signal is generated. 

You provide a function that will be called each time a backtest signal event occurs, and it handles the events one after another in the order they arrived. Keep in mind, it only works with events triggered by `Backtest.run()`.

The function you provide will return a function that can be called to unsubscribe from receiving these updates.


## Function listenSignalActivePerSignal

This function lets you listen for updates related to active trading signals. It’s particularly useful when you need to react to specific events triggered by a signal. 

Think of it as setting up a notification system – you define a filter to identify the signals you’re interested in, and a function to be executed whenever a matching signal becomes active. 

Because a trading position’s active state can change repeatedly, you'll only receive a notification once for each unique signal ID. This avoids being bombarded with unnecessary updates. 

The function returns an unsubscribe function, allowing you to stop listening when it's no longer needed.

## Function listenSignalActive

This function lets you listen for updates whenever a trading strategy is actively managing a position. 

Essentially, you'll get notified on each tick while a trade is open.

Each notification includes real-time information like profit and loss, progress towards take profit, and progress towards stop loss. Be aware that this can generate a lot of notifications, especially if you have multiple open positions! 

If you're managing several positions and don't need every single tick event, consider using `listenSignalActivePerSignal` instead, which reduces the number of callbacks. You provide a function (`fn`) that will be called with the active tick result. This function receives an object containing the relevant information about the active tick.

## Function listenSignal

The `listenSignal` function lets you tap into the core events of your backtest – when a strategy is idle, when a position is opened, when it's actively trading, and when it's closed. It’s designed to handle these events in a reliable order, even if your callback function takes some time to run. Think of it as setting up a listener that ensures your response to each event happens one at a time, preventing any unexpected conflicts or issues that might arise from multiple things happening concurrently. You simply provide a function that will be called for each event, and the function returns another function to unsubscribe from the signal.


## Function listenSchedulePingPerSignal

This function allows you to monitor signals that are waiting to be activated. It's useful when you need to react to signals that are currently paused or on a schedule.

Essentially, it listens for "ping" events that happen repeatedly while a signal is waiting. Instead of getting flooded with pings, you'll receive a notification once for each unique signal.

You can specify a filter to only receive notifications for signals that meet certain criteria. The callback function you provide will then be executed with details about that specific signal. This lets you react to the signal’s status changes in a controlled and efficient way.


## Function listenSchedulePingOnce

This function helps you react to specific ping events, but only once. It lets you set up a rule – a filter – to determine which events you're interested in. Once an event matches that rule, it triggers your provided function, and then automatically stops listening. Think of it as setting up a temporary alert that goes off just for one particular situation. You specify the rule (the filter) and what you want to do when the rule is met (the function).

## Function listenSchedulePing

This function lets you keep an eye on scheduled trading signals. 

It sets up a listener that gets notified every minute while a signal is waiting to become active. Think of it as a gentle ping to remind you the signal is still in the queue.

You provide a function that will be called with each ping event, allowing you to track the signal’s progress and potentially implement custom checks or logging. 

When you're done listening, the function returns another function you can call to unsubscribe and stop receiving these ping events.

## Function listenRiskOnce

This function lets you react to specific risk rejection events just once and then automatically stop listening. You provide a filter that defines what kind of event you're interested in, and a function that will run when that specific event occurs. Once the event is handled, the subscription is automatically cancelled, so you don't have to worry about cleaning up. It's a handy way to wait for a particular risk rejection condition to happen and respond to it immediately.

## Function listenRisk

This function lets you monitor when trading signals are blocked because they violate risk rules. It's specifically for situations where a signal is rejected – you won't receive notifications for signals that are approved. The events are handled one at a time to ensure reliable processing, even if your callback function takes some time to complete. To use it, you provide a function that will be called whenever a risk rejection event occurs, and it returns a function that can be used to unsubscribe from the events later.

## Function listenPerformance

This function lets you monitor how quickly your trading strategy is running. It's like a performance tracker that sends you updates during the backtest. 

These updates, called "performance events," help pinpoint slow parts of your strategy, which is great for making it more efficient. The updates are sent in the order they happen, and even if your callback function takes some time to process, things will still run smoothly. It ensures that your monitoring code doesn’t slow down your backtest.

To use it, you provide a function that will be called whenever a performance event occurs, giving you the chance to analyze the data. The function you provide will return another function that you need to call to stop listening to these events.

## Function listenPauseOnce

This function lets you react to a specific pause event happening in your trading environment, but only once. You tell it what kind of pause event you're interested in using a filter—think of it as a rule—and provide a function that will execute when that specific event occurs. Once the event is handled, the listener automatically stops itself, ensuring you don't get repeated notifications.

It’s particularly useful for one-off actions you need to perform when a certain pause condition is met, like adjusting a strategy or logging a specific occurrence. 

The function returns an unsubscribe function that you can call to stop listening.

## Function listenPause

This function lets you keep track of when your trading strategies are paused or resumed. 

It's a way to get notified whenever a strategy's pause state changes, like when you temporarily stop it or start it back up. 

You can use these notifications to show users what's happening or to trigger other actions based on the strategy's status.

The notifications happen in order and ensure any actions you take are handled one at a time, even if your notification process takes some time.


## Function listenPartialProfitAvailablePerSignal

This function lets you keep an eye on when partial profits become available for your trading signals. It’s like setting up an alert system—you tell it what conditions you're interested in (using `filterFn`), and it'll notify you whenever those conditions are met for a new signal. 

Importantly, it avoids sending you duplicate alerts for the same signal. If a signal has multiple profit levels, you’ll only get one notification for the first level that matches your criteria. 

If you need to track every level change for a specific signal, you can use the more general `listenPartialProfitAvailable` function and handle the bookkeeping yourself, or create a very specific `filterFn` to target only one particular profit level.

The function returns a function that you can call to unsubscribe from these alerts.

## Function listenPartialProfitAvailableOnce

This function lets you set up a one-time alert for when a specific profit condition is met during a backtest. You provide a filter to identify the exact condition you’re looking for, and a function that will run just once when that condition appears. Think of it like setting a watch – once the event you’re waiting for happens, your function executes, and the watch is automatically dismissed. It's ideal when you need to react to a particular situation just one time during the backtest process.


## Function listenPartialProfitAvailable

This function allows you to be notified whenever your backtest reaches a specific profit milestone, like 10%, 20%, or 30%. It ensures that these notifications are handled one at a time, even if the process of handling them takes some time. 

Think of it as setting up a listener that calls your provided function whenever a particular profit level is hit. The function you provide will receive details about the event that triggered the notification.


## Function listenPartialLossAvailablePerSignal

This function lets you keep an eye on changes to the partial loss levels for different trading signals. It’s like setting up a notification system—whenever a signal’s partial loss level changes in a way that matches your criteria, a callback function will be triggered.

Importantly, if a signal has multiple partial loss levels, you’ll only receive the first one that matches your filter. If you need to track every single partial loss level change, you’ll want to be specific with your filter.

You provide two things: a filter function to decide which changes you’re interested in, and a callback function that gets executed when a matching change happens. The function also returns a cleanup function to unsubscribe from these events.

## Function listenPartialLossAvailableOnce

This function lets you set up a temporary listener that reacts to specific partial loss events. You provide a filter – a rule that defines which events you're interested in – and a callback function that will be executed only once when an event matches that filter. Once the callback runs, the listener automatically stops, so you don't need to worry about cleaning it up manually. It’s handy when you need to react to a particular loss situation just once.

The `filterFn` determines what events trigger the function you provide.
The callback function (`fn`) will only run once when a matching event is found.

## Function listenPartialLossAvailable

This function lets you keep track of how much a trading strategy has lost, marking milestones like 10%, 20%, or 30% loss. It sends you notifications whenever these loss levels are hit. Importantly, these notifications are handled one at a time, in the order they occur, even if your notification code takes some time to run. This ensures things don't get messed up by multiple events happening at once. You provide a function that will be called with details about the partial loss event. The function returns another function which can be called to unsubscribe from the notifications.

## Function listenOrderStop

This function lets you react to situations where an order check has stopped, essentially a notification system for order management events. Think of it as a way to be informed when an order check is finished – either because it was deleted, exhausted its retry attempts, or is being closed or canceled.

It works in tandem with another system that keeps track of order status. When an order check reaches a final state (terminated), this function will alert you.

Importantly, this isn’t a gatekeeper – it's just a messenger. If something goes wrong within your response to these events, it won't interrupt the overall process; instead, errors are logged and handled internally.

You provide a function to handle these events; the function is called with information about the stopped order check, including the reason for the stop and the number of consecutive failures. If your function returns a promise, the processing is handled in a queued, sequential manner. This feature is only available when backtesting and won't be active during live trading.

## Function listenOrderSchedulePerSignal

This function helps you keep track of when trading signals are scheduled or canceled. It lets you set up a listener that gets notified whenever a new signal appears or an existing one is removed from the schedule. You can choose which signal events you want to hear about by providing a filter; for example, you could specifically listen for signals being scheduled or only those being canceled. The listener function you provide will be called each time a matching signal event occurs, giving you the details of that event. This is useful for reacting to changes in your trading plan.


## Function listenOrderSchedule

This function lets you keep an eye on scheduled order events, like when an order is planned or cancelled. You'll receive notifications when a strategy requests an order at a specific price and when that order is ultimately dropped before it’s placed. Keep in mind, activation of an order isn't reported here; that’s handled by the regular signal emitters. 

It's a core system channel that the framework itself uses, so you'll get every event, even cancellations that occur after the order is no longer active. If you're building an exchange integration, it's generally better to use the Broker adapter with specific hooks. However, this listener is useful for tasks like logging, notifications, or auditing. 

The callback function you provide will be called whenever a scheduled order event happens, and these events are processed in the order they are received.


## Function listenOrderReject

This function lets you listen for order rejections that happen because the exchange definitively refused the order – meaning it won’t be retried. Think of it as a notification about orders that were outright denied. 

It only triggers for rejections that are final; temporary problems won’t show up here because those are automatically retried.

You provide a function that gets called whenever an order is rejected. It's designed to be safe for things like sending notifications (like through Telegram or webhooks) or auditing, because any errors in your listener function won't disrupt the core process. If your function needs to do something asynchronous, it will be processed one at a time to avoid overwhelming the system. During backtesting, these rejections are simulated and don’t interact with a real exchange.


## Function listenOrderFill

The `listenOrderFill` function lets you get notified when your orders have been confirmed by the broker – meaning the broker acknowledges the order has actually been placed or executed on the exchange. 

It’s a bit like a mirror of the order synchronization process, but it only triggers once the synchronization has reached a "confirmed" state. This ensures you're only reacting to orders that the broker has definitively handled.

You'll receive notifications for three main order events: when a new position order is filled, when a resting order is placed, and when an exit order is executed. Keep in mind that this function only operates with live data; during backtesting, the gates automatically resolve to 'confirmed' without simulating an exchange.

This function is designed to be a notification channel, meaning errors thrown within your callback won't interrupt the main backtest process – they'll be logged instead. This makes it safe to use for things like sending updates to external services like Telegram or webhooks.

You provide a function as input that gets called whenever a confirmed fill event occurs. If your function returns a Promise, the processing will be handled sequentially.

## Function listenOrderContinue

The `listenOrderContinue` function lets you keep an eye on orders that are still in progress after an initial check. It's like a follow-up notification – you'll be notified when the system confirms an order is still valid (meaning it's staying open) or when a temporary problem was handled and monitoring continues.

Think of it as working alongside another system that sends initial "check" signals.  This function specifically receives updates *after* that initial check and resolves any doubts.

This feature only works during live trading; backtesting doesn't perform these checks. Importantly, if something goes wrong in your callback function, it won't disrupt the ongoing order monitoring – any errors will be handled internally.

You provide a function that will be called with order continue event information. If your function returns a Promise, the processing of that event will happen one at a time.

## Function listenMaxDrawdownPerSignal

This function lets you track and react to maximum drawdown events related to specific trading signals. It's like setting up an alert system that triggers when a signal hits a certain drawdown level.

The system remembers which signals you've already seen drawdown events for, ensuring you only get notified about the initial, most significant drawdown for each signal.

You define a filter to specify which drawdown events you're interested in and then provide a callback function that will be executed when a matching event occurs. This allows you to build custom responses to those events, such as adjusting risk parameters or sending notifications. 

The function returns a cleanup function which you can call to unsubscribe from the events.


## Function listenMaxDrawdownOnce

This function lets you set up a listener that reacts to specific maximum drawdown events, but only once. You provide a filter to define which drawdown events should trigger the reaction, and then a function that will be executed when a matching event occurs. Once that event is processed, the listener automatically stops itself, which is great for scenarios where you need to respond to a particular condition and then move on. Think of it as a one-time alert for significant drawdown changes.


## Function listenMaxDrawdown

This function allows you to be notified whenever the maximum drawdown changes during a backtest or live trading simulation. It’s like setting up an alert for significant drops in performance. 

When a new maximum drawdown is detected, a notification is sent to the function you provide. Importantly, these notifications are handled one at a time, even if your notification function takes some time to complete.

You can use this to keep a close eye on potential losses and automatically adjust your trading strategy. To stop listening for these drawdown events, the function returns a cleanup function that you can call.

## Function listenIdlePingOnce

This function lets you react to signals indicating periods of inactivity within your application. It's designed to listen for specific types of idle pings – like when the user hasn't interacted with the interface for a while – and then trigger a function just *once* when that condition is met. You provide a filter to determine which idle ping events you're interested in, and then a callback function to be executed when a matching event occurs. The function returns a cleanup function that you can call to unsubscribe from these idle ping events when you no longer need it.

## Function listenIdlePing

The `listenIdlePing` function lets you monitor periods of inactivity in your trading system. It's designed to trigger an action whenever there are no active trades or pending signals being watched. You provide a function that will be called each time this idle condition occurs, and that function receives an event object containing details about the ping. When you're done, the function returns another function that you can call to unsubscribe from these idle ping notifications.

## Function listenHighestProfitPerSignal

This function lets you keep an eye on when a trading signal reaches its highest profit. 

It sends you a notification whenever a new signal hits a peak profit, but it only reports the *first* time that happens for each signal. 

You can specify a filter to only receive notifications for signals that meet certain criteria. 

Essentially, it’s a way to track the most profitable moments for each trading signal you’re interested in. 

The function returns a way to unsubscribe from these notifications.


## Function listenHighestProfitOnce

This function lets you set up a one-time alert for when a specific profit condition is met during a backtest. 
You provide a filter to define the exact criteria you're looking for, like a particular contract or price level. 
Once that condition is met, a callback function you specify will run just once, and then the alert automatically stops listening. 
It's a handy way to react to a single, important event without needing to manage ongoing subscriptions.


## Function listenHighestProfit

This function lets you keep an eye on when your trading strategies reach new profit peaks. It's like setting up a notification system that tells you whenever a strategy does better than it ever has before. 

Importantly, it handles these notifications in order, even if the processing of each notification takes some time. This ensures everything is tracked properly and prevents any conflicts.

You provide a function that gets called each time a new highest profit is achieved, allowing you to track these milestones and potentially adjust your strategies on the fly. It’s a handy way to monitor performance and react to success.

## Function listenExit

The `listenExit` function lets you monitor for severe errors that will halt the entire backtest or live trading process. These aren’t the minor hiccups you can recover from—they're problems that cause the system to stop running. Think of it as setting up an emergency alarm for the most critical issues.

When an error of this type occurs, the provided callback function will be executed, giving you a chance to respond, log the error, or take other corrective actions. Importantly, the callback is handled in a controlled way to ensure errors are processed one at a time, even if your response is complex or involves asynchronous operations. This prevents potential conflicts or unexpected behavior during error handling.


## Function listenError

This function helps you keep your trading strategies running smoothly even when things go wrong. It allows you to register a function that will be called whenever a recoverable error occurs during the strategy's execution – like a temporary API problem. The key is that instead of stopping everything, the strategy continues running, and your function gets notified about the issue. Importantly, the errors are handled in the order they happen, and the callback function is processed one at a time to avoid any conflicts.


## Function listenDoneWalkerOnce

This function lets you react to when a background task finishes, but only once. It’s useful when you need to know when something specific has completed and you don’t want to keep listening for more events afterward. You provide a filter to decide which completion events you're interested in, and a function to run when the right event happens. Once that function runs, the subscription is automatically removed, so you won't be notified again. 

It's like setting up a temporary listener that goes away on its own.


## Function listenDoneWalker

This function lets you monitor when background tasks managed by the Walker system finish running. 

Think of it as setting up a listener to be notified when a long-running process completes. 

When a background task is done, the provided callback function will be executed. Importantly, the callbacks are handled one at a time, ensuring that operations are processed in the order they arrive and preventing any conflicts from running them simultaneously. This queuing mechanism helps keep things organized and reliable.


## Function listenDoneLiveOnce

This function helps you react to when a background task finishes running. 

Think of it as setting up a listener that waits for a specific background job to complete. 

You provide a filter—a way to identify which completed jobs you're interested in—and then a function that will run once when a matching job finishes. 

Once that function executes, the listener automatically stops listening, so you don't have to worry about cleaning up. It's a convenient way to handle single completion events. 

It is mainly for use with `Live.background()`.


## Function listenDoneLive

This function allows you to be notified when background tasks initiated by `Live.background()` are finished. It's a way to keep track of what's happening behind the scenes. 

Essentially, when a background process completes, a signal is sent to your provided function. 

Crucially, these signals are handled one at a time to avoid issues if your function needs to do something complex. To use it, you provide a function that will be called when a background task finishes. This function receives information about the completed task. You’ll also receive a function from this call that can be used to unsubscribe from this event.

## Function listenDoneBacktestOnce

This function lets you react to a specific backtest finishing its background execution, but only once. Think of it as setting up a temporary listener.

You provide a filter – a way to identify the exact backtest completion you’re interested in – and a function that will run when that specific backtest is done. The function automatically removes itself after it runs, so you don't need to worry about cleaning up. It's a simple way to grab a quick piece of information when a certain backtest concludes.


## Function listenDoneBacktest

This function lets you react to when a background backtest finishes running. 

Essentially, it sets up a listener that gets triggered once the backtest completes. 

The events are handled one at a time, in the order they arrive, even if your reaction to them involves asynchronous operations. This ensures things happen in a controlled, sequential manner. You provide a function that will be called when the backtest is done, and this function will receive information about the completed backtest event. When you no longer need to listen, you can unsubscribe from the listener.

## Function listenCheck

This function lets you listen for signals that tell you if an order is still valid on the exchange. It's like a health check for your open positions or pending orders.

The system sends these checks frequently while a position is active. There are two main types of signals: "active" for orders with an open position and "schedule" for resting orders that are waiting to be filled. Note that backtests won’t generate "schedule" events.

If the check fails, it can handle temporary errors ("transient" errors) and keep trying a few times before giving up. However, if the order is truly deleted, the system will stop monitoring it immediately. Certain user errors and protocol violations are treated as temporary.

You provide a function that will be called whenever a check event occurs, and this function can even handle asynchronous operations.

## Function listenBreakevenAvailablePerSignal

This function lets you keep a close eye on when a breakeven point becomes available for each of your trading signals. 

You provide a filter to specify which signals you're interested in, and a function that will be called whenever a new breakeven point is calculated for a matching signal. 

Essentially, it’s a way to react to changes in the potential profit or loss for individual trades as they evolve. 

The function returns another function that you can call to unsubscribe from these updates, ensuring you only receive notifications you need.


## Function listenBreakevenAvailableOnce

This function lets you react to specific breakeven protection events, but only once. 

You provide a filter to identify the exact events you're interested in, and a function that will run just one time when that event occurs. 

Once the event matches your filter and your function has been called, the subscription automatically stops, so you don't have to worry about managing it yourself. It's perfect for scenarios where you need to respond to a single occurrence of a particular breakeven state.

The function returns an unsubscribe function that can be used to manually stop the subscription if needed. 


## Function listenBreakevenAvailable

The `listenBreakevenAvailable` function lets you keep an eye on when your trades reach a breakeven point – that’s when your stop-loss automatically adjusts to your original entry price. This happens as the price moves in your favor enough to cover the costs of the trade.

Essentially, it's a way to get notified when your protection kicks in.

The function provides a way to subscribe to these events and ensures that the notifications are handled one at a time, even if your callback function takes some time to complete. This makes sure that events aren't missed or processed out of order. You provide a function that will be called whenever a breakeven event occurs, and this function returns another function you can call to stop listening.

## Function listenBeforeStartOnce

This function lets you react to specific events that happen right before a backtest starts, but only once. You provide a filter – essentially, criteria that define which events you’re interested in – and a function to execute when a matching event occurs. Once that event is processed, the listener automatically stops listening, preventing it from firing again. It's a handy way to perform a setup action once at the beginning of a backtest.

## Function listenBeforeStart

This function lets you hook into what happens right before a new trading strategy begins for a specific asset. It's designed to allow you to perform actions like setting up data or making adjustments before the strategy actually starts running.  The events are handled in order, and any asynchronous operations within your callback function won't disrupt the sequence. It uses a queuing system to ensure that these pre-start actions are handled one at a time, preventing potential conflicts or issues caused by multiple callbacks running simultaneously. You provide a function that gets called just before the strategy execution, and this function returns a way to unsubscribe from that event.

## Function listenBacktestProgress

This function lets you keep an eye on how a backtest is running. It sends updates as the backtest progresses, allowing you to track its status.

The updates are delivered one at a time, even if the function you provide needs to do some work itself. This ensures things don't get out of order or overwhelmed.

You give it a function that will receive these progress updates, and it returns another function you can use to stop listening.


## Function listenAfterEndOnce

This function lets you react to specific events that happen *after* a trading simulation or backtest has finished. 

It allows you to set up a filter – a condition – that determines which of those "after end" events you're interested in. Once an event matches your filter, a provided callback function runs *just once*, and then the subscription automatically stops. This is handy for things like performing final calculations or logging specific results from a completed backtest without needing to manage the subscription manually. You provide a function to determine if the event is of interest, and then a function to be executed when it is.


## Function listenAfterEnd

This function lets you react to what happens *after* a trading strategy finishes running for a particular asset. It's like setting up a notification system that gets triggered when a trading cycle is complete.

The important thing to know is that the code you provide to handle these events will be executed one after another, in the order they arrive.  This helps avoid conflicts if your code needs to perform actions that depend on the previous completion.

Essentially, you give it a function ( `fn` ) that gets called after each strategy execution.  The function is wrapped to ensure that it runs safely and doesn’t interfere with other processes.  It returns a function that can be called to unsubscribe from these notifications.

## Function listenActivePingPerSignal

This function lets you react to specific active ping events as they happen. It's designed to be very efficient – you'll only get a notification when a new signal ID appears, and then it will stop sending updates for that signal.

Think of it as a way to listen for the very first time a position meets certain criteria, and then ignore further updates for that specific condition.

You provide a filter function to select the events you're interested in, and a callback function that will be executed when a matching event occurs. The function returns a cleanup function that you can call to unsubscribe from the active ping events.

## Function listenActivePingOnce

This function helps you react to specific active ping events but only once. 

It allows you to set up a listener that checks if an active ping event meets certain criteria you define. Once an event matches those criteria, it runs your provided function, and then automatically stops listening. This is ideal for situations where you need to respond to a single occurrence of a particular type of active ping. You tell it what kind of event you're looking for and what you want to do when you find it.


## Function listenActivePing

This function lets you keep an eye on active signals within the backtest-kit framework. It listens for events that are triggered roughly every minute, giving you information about the signals that are currently being monitored. 

Think of it as a way to track the lifecycle of these signals and respond to changes dynamically. 

The events are handled one after another, even if your callback function takes some time to complete – ensuring a smooth and predictable flow of processing. It also makes sure your callback runs one at a time to avoid any conflicts. You simply provide a function that will be called whenever a new active ping event occurs, and the function returns a function to unsubscribe when needed.

## Function listWalkerSchema

This function lets you see all the different trading strategies or "walkers" that are set up within the backtest-kit framework. Think of it as a way to list all the available options for analyzing past trading data. It gives you a collection of schema objects, each describing a specific walker. This is great for understanding what's happening behind the scenes, creating helpful documentation, or building tools that automatically adjust based on the available trading strategies.

## Function listSweepSchema

This function lets you see all the different ways your backtest kit is set up to handle sweep tests. It essentially gives you a list of all the sweep schemas you've defined. Think of it like checking the configuration of your automated testing process – it's helpful for making sure everything is set up correctly, understanding how your tests will run, or even for creating interfaces that show users the available testing options. You get back a collection of sweep schema objects.


## Function listStrategySchema

This function lets you see a complete list of all the trading strategies you've set up within the backtest-kit framework. Think of it as a way to get an overview of all your trading plans.  It pulls together all the strategies you've added using `addStrategy()`. This is helpful for checking things, creating documentation, or building tools that need to know about all your strategies.


## Function listSizingSchema

This function lets you see all the sizing strategies currently in use within your backtest. Think of it as a way to inspect how your backtest determines the size of trades. It gathers a list of these strategies, allowing you to verify their setup, generate documentation, or build tools that adapt to different sizing approaches. It's a handy tool for understanding and managing your trading sizing configurations.


## Function listRiskSchema

This function lets you see all the risk schemas that have been set up in your backtest. Think of it as a way to check what rules are in place for managing risk during simulations. It returns a list of these configurations, which can be helpful for making sure everything is set up correctly or for creating tools that need to know about all the registered risk schemas. Essentially, it’s a debugging and documentation tool.

## Function listMemory

This function lets you see a list of all the saved memory entries associated with your signal. 

It's really useful for checking what data is stored and available. 

The function handles some of the tricky stuff for you, like figuring out which signal is active and whether you're running a backtest or a live trading session. 

You just need to provide a bucket name to specify where the memory entries are stored. 

The function will return an array, where each item represents a memory entry with its ID and the content it holds.

## Function listMCPSchema

This function allows you to see all the different data models (called MCP schemas) that are currently being used within your backtesting environment. It essentially gives you a comprehensive inventory of how your trading strategies and data sources are structured. You can use this to inspect the system, create documentation, or even build interactive interfaces that adapt to the available data formats. Think of it as a way to understand the overall architecture of your trading setup.

## Function listFrameSchema

This function lets you see all the different "frames" your backtest setup uses. Think of frames as templates that define the data available for your trading strategies. It returns a list of these schemas, each describing the data a frame provides. This is helpful when you're trying to understand your system, generating documentation, or building tools that need to know what data is available.

## Function listExchangeSchema

This function gives you a list of all the exchanges your backtest-kit is currently set up to use. Think of it as a way to see what data sources are available for your trading simulations. It's helpful if you're trying to understand how your system is configured, build tools that show available exchanges, or troubleshoot any issues with your exchanges. The function returns a promise that resolves to an array of exchange schema objects.

## Function hasTradeContext

This function tells you whether you're currently in a state where you can safely execute trading-related actions. Specifically, it verifies that both the execution context and the method context are active. If both are present, it means you're authorized to use functions designed for interacting with the exchange, like retrieving candle data, getting average prices, or formatting values—essentially, anything related to the trading process. Think of it as a gatekeeper ensuring you have the necessary permissions before performing actions that could affect your trades.

## Function hasNoScheduledSignal

This function helps you quickly check if a scheduled signal exists for a specific trading symbol. It returns `true` if no signal is currently scheduled, and `false` otherwise. Think of it as the opposite of `hasScheduledSignal`; it’s a handy way to ensure your signal generation processes only run when needed. The function smartly figures out whether you're in backtesting or live trading mode, so you don't need to worry about that. 

You provide the symbol, like "BTCUSDT", and it tells you whether a signal is waiting for that symbol.

## Function hasNoPendingSignal

This function helps you check if there’s currently a signal waiting to be triggered for a specific trading pair, like 'BTCUSDT'. It returns `true` when there isn't a pending signal, essentially confirming that no action is queued. Think of it as the opposite of `hasPendingSignal` – use it to make sure you’re not generating signals when one is already in progress.  The function smartly figures out whether you’re running a backtest or live trading based on the environment it's used in. You provide the trading pair’s symbol as input to the function.

## Function getWalkerSchema

The `getWalkerSchema` function helps you find the blueprint for a specific trading strategy, or "walker," within the backtest-kit framework. Think of it like looking up the instructions for how that strategy operates. You provide the name of the walker you’re interested in, and the function returns a detailed description of its inner workings, including what data it needs and how it makes decisions. This allows you to understand and potentially modify or extend existing trading strategies.


## Function getTotalPercentHeld

This function tells you what percentage of your position in a particular trading pair you are still holding. It's a helpful way to understand how much of your initial investment remains open. 

A value of 100 means you haven't closed any of your position, while 0 indicates the entire position has been closed. The calculation takes into account any Dollar-Cost Averaging (DCA) entries you've made, even if you've closed parts of your position along the way. 

To use it, simply provide the symbol of the trading pair you’re interested in. The framework automatically knows whether it's running in a backtesting or live trading environment.


## Function getTimestamp

This function, `getTimestamp`, gives you the current time, but it behaves differently depending on whether you're running a simulation (backtest) or live trading. 

When you're backtesting, it returns the timestamp associated with the particular time period being analyzed.  If you're in a live trading environment, it gives you the actual, current time. Essentially, it provides a reliable time reference for your trading logic.

## Function getSymbol

This function lets you find out which symbol your backtest or trading strategy is currently focused on. It's a simple way to retrieve the ticker symbol being used for analysis or trades.  You'll get this information back as a promise that resolves to a string representing the symbol.

## Function getSweepSchema

This function lets you access predefined templates for running different types of backtesting simulations, also known as "sweeps." Each sweep represents a specific scenario or set of parameters you want to test. 

You provide the name of the sweep you're interested in, and the function returns a detailed configuration object describing how that sweep should be executed. 

Think of it like looking up a recipe—you give it the recipe's name, and it provides you with all the necessary ingredients and instructions. The `sweepName` is a unique identifier for each of these pre-built simulation setups.

## Function getStrategyStatus

This function lets you peek at what's happening behind the scenes with a particular trading strategy. It gives you a snapshot of things like pending orders, actions that are waiting to be processed, and the latest signal ID. It cleverly figures out whether you're in a backtesting or live trading environment without you needing to specify. You just need to provide the symbol of the trading pair you're interested in to get this status update.

## Function getStrategySchema

This function helps you find the blueprint for a specific trading strategy. Think of it as looking up the details of a strategy – what inputs it expects, what outputs it produces – based on its name. You provide the name of the strategy, and it returns a structured description of that strategy's design. This is useful for understanding how a strategy is built and what it requires.


## Function getStrategyPaused

This function lets you check if a particular trading strategy is currently paused. When a strategy is paused, it won't initiate any new trades – the `getSignal` function won’t be called, and any pending new orders are held back. However, any existing open orders or scheduled actions for that strategy will still be handled and closed as usual. The system figures out if it’s running a backtest or live trading environment automatically. You just need to provide the symbol of the trading pair you're interested in to get the paused state.

## Function getSizingSchema

This function helps you find the specific rules and logic used to determine how much of an asset to trade. Think of it as looking up a pre-defined plan for position sizing. You provide a name – a unique identifier – for the sizing method you're interested in, and it returns the details of that sizing strategy. This allows you to understand and potentially modify how much capital is allocated to each trade based on the sizing method chosen.

## Function getSignalState

This function helps you retrieve a specific piece of data associated with a trade signal. It's designed to work within the backtest-kit framework, automatically recognizing whether you're in a testing or live trading environment.

It finds the currently active trade signal for you, so you don’t have to worry about that part. If there's no active signal, it will let you know.

This tool is particularly useful for advanced strategies, especially those using AI to make decisions. It allows those strategies to track details like how much a trade has gained or lost, and how long it’s been open, across multiple trades. These tracked metrics help refine and improve trading performance.

You provide the trading symbol (like "BTC-USD") and a basic data structure to hold the initial state value. The function then returns the current state associated with that signal.

## Function getSessionData

This function lets you retrieve data that's specifically linked to a trading symbol within your backtest or live trading session. Think of it as a place to store information that needs to be remembered between candles or even across restarts of your program.

It's really handy for things like caching the results of complex calculations, keeping track of intermediate states in your trading strategies, or saving any kind of data that needs to exist throughout the current trading run.

The function automatically figures out if it’s running in backtest mode or live mode, so you don't have to worry about that.

You just need to provide the trading symbol (like 'BTC-USDT') to get the associated data. If no data exists for that symbol, it will return null.

## Function getScheduledSignal

This function lets you retrieve the signal that's been pre-programmed to run at a specific time for a given trading pair. Think of it as checking what your automated trading plan has scheduled. 

It will give you the details of that scheduled signal, or return nothing if there isn't a signal currently scheduled.

Importantly, it handles whether you’re running a test (backtest) or live trading automatically, so you don't need to worry about specifying that. 

You just need to tell it which trading pair (symbol) you're interested in.

## Function getRuntimeInfo

This function gives you important details about how your trading strategy is running. It tells you things like which asset you're trading, the exchange being used, the timeframe of your data, and the specific strategy in place. You’ll also find out if it's a backtest, simulating past performance, or a live run, actively trading. Essentially, it provides a snapshot of the current operating conditions for your trading system.

## Function getRiskSchema

This function helps you access pre-defined structures for managing risk in your trading strategies. Think of it as looking up a specific template to ensure you’re calculating and handling risk consistently. It takes a unique identifier – the risk name – and returns a detailed schema outlining how that risk should be assessed. This schema includes things like what data to use and how to calculate the risk measure.

## Function getRemainingCostBasis

To figure out how much money you still need to account for in your cost basis, use this function. It's really helpful if you've been closing out portions of your positions – it takes into consideration any dollar-cost averaging (DCA) purchases you’ve made along the way. The function smartly knows whether it’s running in a backtest or live trading environment without you needing to specify. You just provide the trading symbol, like "BTC-USDT," and it will return the remaining cost basis amount.

## Function getRawCandles

This function retrieves historical candlestick data for a specific trading pair and time interval. You can easily fetch a limited number of candles, or specify a start and end date for the data you need. 

The function intelligently handles different combinations of start date, end date, and limit parameters, automatically calculating missing values when provided. It ensures the data you retrieve doesn't include information from the future, preventing issues with backtesting accuracy.

Here’s what the parameters mean:

*   `symbol`: The trading pair you're interested in, like "BTCUSDT".
*   `interval`: How frequent the candlesticks are, ranging from one-minute intervals to eight-hour intervals.
*   `limit`:  The number of candlestick periods you want to retrieve.
*   `sDate`: The starting date for the data you need, expressed as milliseconds since the epoch.
*   `eDate`: The ending date for the data, also in milliseconds.

## Function getPositionWaitingMinutes

This function helps you check how long a trading signal has been patiently waiting to be put into action. It tells you the number of minutes a signal has been pending. 

If there isn't a signal waiting, it will return null.

To use it, you just need to provide the symbol of the trading pair you’re interested in, like 'BTCUSDT'.


## Function getPositionPnlPercent

getPositionPnlPercent helps you understand how your current open positions are performing financially. It calculates the unrealized profit or loss as a percentage, taking into account factors like any partial trades you've made, your average cost basis (DCA), potential slippage, and fees. 

If you don't have any active trades, this function will let you know. 

It conveniently handles the details of knowing whether you're in a backtesting or live trading environment, and it also automatically gets the current market price to do the calculation.  You just need to provide the trading pair symbol you're interested in.


## Function getPositionPnlCost

This function helps you understand the potential profit or loss on your open positions. It calculates the unrealized profit and loss in dollars for a specific trading pair, based on the current market price. 

Essentially, it looks at how much you've invested and how the current price compares to your entry price, factoring in things like partial trades and any fees you’ve paid. 

If there's no active trade currently open, it will let you know by throwing an error.  The function will figure out whether it's running a backtest or a live trade, and it will automatically grab the current average price for the trading pair. You simply need to provide the symbol, like "BTCUSDT".


## Function getPositionPartials

getPositionPartials lets you peek at the history of partial profit or loss closures that have happened for a specific trading pair. It gives you a list of events showing how much of your position was closed, at what price, and what the cost basis and entry count were at the time. If no signal is active, it will let you know. If you haven't done any partial closures yet, it will return an empty list. You provide the symbol of the trading pair you’re interested in to get these details.

## Function getPositionPartialOverlap

This function helps you make sure you're not accidentally trying to partially close a position at a price you've already dealt with. It looks at existing partial close orders and checks if the current price you're considering falls within a small range around those prices.

Think of it as a safety net to avoid repeating actions.

The function takes the trading pair symbol and the current price as input. You can also provide a custom tolerance range if you need more precise control. It returns true if the price is within the allowed range of an existing partial close, and false otherwise, meaning you’re safe to proceed.

## Function getPositionMaxDrawdownTimestamp

This function helps you find out when a specific trade experienced its biggest loss during its lifetime. It takes the symbol of the trading pair (like BTC/USD) as input and returns a timestamp – a precise date and time – marking when that maximum drawdown occurred. Think of it as identifying the point in time when the trade was furthest from its peak value. If there's no active trade for that symbol, the function will let you know it can't proceed.

## Function getPositionMaxDrawdownPrice

getPositionMaxDrawdownPrice helps you understand how far a trading position has fallen from its peak value. It calculates the lowest price hit during the position's active period.

This function provides a glimpse into the potential losses experienced by the position.

To use it, you simply need to specify the symbol of the trading pair you're interested in.

If no trading signals are currently active, the function will indicate an error.


## Function getPositionMaxDrawdownPnlPercentage

This function lets you find the point during a trade where the position experienced the biggest loss, expressed as a percentage of the profit/loss. It tells you the PnL percentage at that lowest point.

You need to specify the trading pair (like "BTC-USDT") to get this information.

If there's no active trading signal, the function will let you know it can't proceed.


## Function getPositionMaxDrawdownPnlCost

This function helps you figure out the biggest financial loss a particular trade experienced at its lowest point. It tells you the total cost in the currency used for that trade.

It requires a trading symbol to know which trade you're asking about.

If there aren't any active trading signals for a trade, the function will alert you.

## Function getPositionMaxDrawdownMinutes

This function helps you understand the timing of a trade's biggest loss. It tells you how many minutes have passed since the point where the trade reached its lowest value. Essentially, it's a measure of how recently the trade experienced its maximum drawdown. A value of zero means the trade just hit its lowest point. If there's no active signal for the trade, the function will indicate an error. To use it, you’ll need to provide the symbol of the trading pair you're interested in.

## Function getPositionLevels

This function, `getPositionLevels`, helps you find out the prices at which you've entered a trade using Dollar-Cost Averaging (DCA). 

It takes the trading symbol (like 'BTCUSDT') as input and returns an array of prices.

The first price in the array will always be the original entry price.  If you’ve added more prices by using `commitAverageBuy`, they'll appear after that.

If no trade has been initiated yet, it will return an array containing only the initial open price. 

If you try to use it when there's no active trade, it will signal an error.


## Function getPositionInvestedCount

getPositionInvestedCount tells you how many times you've added to a position using a DCA strategy for a specific trading pair.

It returns a number representing the DCA count; a value of 1 means it's just the initial purchase.

Each time you successfully confirm an average buy through commitAverageBuy(), this number goes up.

If there's no active DCA plan for that trading pair, it will let you know.

It figures out whether you're in a backtest or live trading mode all on its own.

You need to provide the trading symbol, like "BTCUSDT," to use this function.

## Function getPositionInvestedCost

This function helps you figure out how much money you've invested in a particular trading pair, like BTC/USD. 

It calculates the total cost based on all the times you've bought into a position, using the cost that was set when each purchase was made. 

If you try to use it without a pending signal (a trade you're planning), it will let you know.

It smartly adapts to whether you're running a backtest or a live trading session.

You just need to provide the symbol of the trading pair you're interested in.

## Function getPositionHighestProfitTimestamp

This function helps you pinpoint exactly when a specific trade reached its most profitable point. It tells you the timestamp representing the highest profit achieved for a given trading pair, like BTC-USDT. If there's no trading signal related to the position, the function will let you know by throwing an error. You simply provide the trading pair's symbol, and it returns that important timestamp.

## Function getPositionHighestProfitPrice

This function helps you find the highest price a position has reached while being profitable. 

It starts by remembering the entry price when the position begins. 

As the market moves, it continuously updates this value – for long positions, it tracks the highest price above the entry; for short positions, it follows the lowest price below the entry. You'll always get a price, even if it's just the original entry price, as long as the position is still active. It tells you the best price where your position was in the money.


## Function getPositionHighestProfitMinutes

This function helps you understand how long a trading position has been operating below its peak profit. It calculates the minutes passed since the price reached its highest point for that specific trading pair. Think of it as a way to see how far the price has fallen from its best moment. The value will be zero the instant the peak profit is achieved. If no trading signal exists, the function will indicate an error. You provide the trading pair symbol, such as "BTCUSDT", to check its performance.

## Function getPositionHighestProfitDistancePnlPercentage

This function helps you understand how far your trading position is from its best-ever profit. It calculates the difference between the highest profit percentage achieved and the current profit percentage. The result shows you how much room there is for improvement, always expressed as a positive value or zero.  To use it, you need to provide the trading pair symbol (like 'BTC-USDT'). It won't work if there isn't a pending signal for that symbol.

## Function getPositionHighestProfitDistancePnlCost

This function helps you understand how far your current trading position is from its best possible profit. It calculates the difference between the highest profit you've seen so far and what you've earned up to now, but only considers the positive difference. To use it, you simply provide the trading symbol (like "BTC-USDT"). If there are no outstanding trade instructions, the function will let you know.

## Function getPositionHighestProfitBreakeven

This function helps determine if a trading position could have reached a breakeven point at its peak profit level. It checks if, mathematically, it was possible to break even at the highest price achieved during the trade.

The function requires a trading symbol, like "BTCUSDT," to perform this calculation. 

If there isn't a pending signal for the specified symbol, the function will signal an error.

## Function getPositionHighestPnlPercentage

This function helps you understand the peak profitability of a specific trade. 

It calculates the highest percentage profit achieved by a position for a given trading pair. Think of it as finding the point where the trade looked the most successful during its entire lifespan.

To use it, you simply provide the symbol of the trading pair you're interested in, like 'BTC-USDT'. 

If there's no trading signal associated with that position, the function will let you know.


## Function getPositionHighestPnlCost

This function helps you understand the financial impact of a trading position. It calculates the profit and loss (PnL) cost at the point when the position reached its highest profitable price. 

Essentially, it shows how much you would have lost if you had closed the position at that peak profit moment.

You need to provide the trading pair symbol (like 'BTCUSDT') to use this function.

If there are no signals pending, this function won't be able to provide the information and will throw an error.

## Function getPositionHighestMaxDrawdownPnlPercentage

This function helps you understand how much your trading position has recovered from its biggest loss. It calculates the difference between your current profit percentage and the lowest profit percentage it hit during a downturn. The result is expressed as a percentage, showing you the distance from the bottom of that drawdown. You need to provide the trading symbol (like "BTCUSDT") to use this function. If there’s no active trading signal, the function won't work and will throw an error.

## Function getPositionHighestMaxDrawdownPnlCost

This function helps you understand the potential downside risk of a trading position. It calculates how far the current profit and loss (PnL) is from the lowest point it reached during a drawdown. Essentially, it tells you how much PnL you've recovered from a previous loss. The function requires the symbol of the trading pair, like 'BTC-USDT', to perform this calculation. If there isn't a pending signal for that symbol, the function will let you know it can't proceed.


## Function getPositionEstimateMinutes

This function helps you understand how long a trading position is expected to last. It gives you an estimate in minutes of the original duration set when a trading signal was created. Think of it as a reminder of the intended lifespan of a trade, based on the initial plan. If there isn't a currently active signal, the function will let you know. To use it, you simply need to provide the symbol of the trading pair, such as "BTCUSDT".

## Function getPositionEntryOverlap

getPositionEntryOverlap helps you avoid accidentally placing multiple DCA entries at very similar price points. It examines the current market price and compares it to your existing DCA entry levels.

Essentially, it confirms whether the current price sits within a defined tolerance zone around any of your previously set entry levels, preventing unnecessary trades. 

The function returns true if the current price is considered within a tolerated range of an existing entry level and false if no pending signals are present. You can customize the acceptable tolerance range using the `ladder` parameter to fine-tune how closely the current price needs to be to trigger a match.

## Function getPositionEntries

This function lets you see the details of how a position was built up, whether it was an initial buy or a series of DCA (Dollar-Cost Averaging) buys. It gives you a list of each individual purchase, showing the price it was bought at and the total cost of that specific buy. If no buy orders are pending, it will throw an error, and if only a single buy order was placed, it will return an array with just one entry. You'll need to provide the trading pair's symbol (like BTCUSDT) to see the associated entries.

## Function getPositionEffectivePrice

getPositionEffectivePrice lets you find the average price at which you've acquired a position. It calculates this price by considering any past trades and DCA (dollar-cost averaging) entries.

Essentially, it gives you a weighted average of the prices you’ve bought at, taking into account partial trades.

If you haven't made any DCA entries, it will simply return the initial price you opened the position at.

The function will tell you if there's no active trade to calculate the price for. It works seamlessly whether you're running a backtest or a live trading session.

To use it, you just need to provide the symbol of the trading pair you're interested in, like "BTCUSDT."


## Function getPositionDrawdownMinutes

getPositionDrawdownMinutes tells you how much time has passed since your trading position reached its highest profit. Think of it as a measure of how far the price has moved down from that peak. The value starts at zero when your position is first created or hits its highest profit and increases as the price moves against you. It’s a quick way to see how long a position has been operating below its best point. The function requires a valid trading symbol to work.

## Function getPositionCountdownMinutes

getPositionCountdownMinutes helps you figure out how much time is left before a trading position expires. It calculates this by looking at when the position became pending and compares that to an estimated expiration time. 

The result is always a positive number – if the estimated time has already passed, it will return zero, meaning the position is considered expired.

You'll need a pending signal to use this function; otherwise, it will let you know there's a problem. The function requires the symbol of the trading pair you're interested in.

## Function getPositionActiveMinutes

getPositionActiveMinutes lets you check how long a specific trading position, identified by its symbol, has been open. It calculates the duration in minutes from when the position was initially created. If there isn't a signal associated with the position, it will let you know with an error. You provide the symbol of the trading pair you’re interested in to get this information.

## Function getPendingSignal

This function lets you check if your trading strategy has a pending order waiting to be filled. 

It tells you about the most recent signal that's still active for a specific trading pair, like BTC/USDT.

If there isn’t a pending order, it will simply tell you that nothing is waiting. 

The function smartly figures out whether it’s running a backtest (testing historical data) or live trading, so you don't need to worry about that.

You just need to provide the symbol of the trading pair you’re interested in.

## Function getOrderBook

This function lets you retrieve the order book for a specific trading pair, like BTCUSDT, from the connected exchange. 
It automatically uses the current timing based on the testing environment. 
You can also specify how many levels of the order book you want to see – if you don’t specify, it will default to a maximum depth. 
Essentially, it gets you a snapshot of the buy and sell orders currently available for a particular trading pair.

## Function getNextCandles

This function helps you grab a batch of future candles for a specific trading pair and timeframe. It's designed to get data that comes *after* the current time being used by the backtest.

You provide the symbol (like "BTCUSDT"), the candle interval (like "1h" for one-hour candles), and how many candles you want.

The function then uses the underlying exchange's tools to fetch those future candles and returns them to you.


## Function getMode

This function tells you whether the backtest-kit framework is currently running in backtest mode or live trading mode. It’s a simple way to check what environment your code is operating in, allowing you to adjust behavior accordingly. The function returns a promise that resolves to either "backtest" or "live".

## Function getMinutesSinceLatestSignalCreated

This function helps you figure out how long ago the most recent trading signal was generated for a specific trading pair. It’s great for things like implementing cooldown periods after a stop-loss order – you can use it to make sure you don’t jump back into trading too quickly.

It doesn't care whether the signal is still "open" or already finished. It just looks at the timestamp of the *last* signal created.

It first checks your historical backtest data, and if it can't find anything there, it looks at live, current data. If it can't find any signals at all, it will let you know there’s a problem.

The function smartly knows whether it’s running in backtest or live mode based on the environment it’s used in.

You just need to tell it which trading pair (like BTC/USD) you're interested in.

## Function getMaxDrawdownDistancePnlPercentage

This function helps you understand how risky a trading strategy was during its backtest. It calculates the largest percentage difference between the highest profit and the lowest point (drawdown) the strategy experienced. 

Essentially, it tells you how far the strategy fell from its peak before recovering. 

The result is always zero or positive, because it focuses on the magnitude of the loss, never the gain.

To use it, you just need to provide the trading symbol, like 'BTC-USDT', and it will return a number representing that drawdown percentage. 

If no trading signals were generated for a symbol, you'll get an error.

## Function getMaxDrawdownDistancePnlCost

This function helps you understand the risk profile of a trading strategy by calculating the maximum drawdown distance, specifically focusing on profit and loss. It determines the difference between the highest profit achieved and the lowest point of loss experienced during a backtest.

Essentially, it tells you how much potential loss you could have faced from the peak of your profits.

To use it, you simply provide the symbol of the trading pair you're analyzing. The function requires existing signals for the symbol to operate; otherwise, it will report an error.

## Function getMCPSchema

This function lets you grab the blueprint, or schema, for a specific Model Context Protocol (MCP) within the backtest-kit system. Think of an MCP as a way different parts of the system communicate – this function gives you the rules and structure they follow. You provide the name of the MCP you're interested in, and it returns the schema describing that MCP. This is helpful if you need to validate data or understand the expected format of a particular MCP.


## Function getLatestSignal

This function lets you retrieve the most recent trading signal, whether it's still active or has already been closed. It's a handy tool for things like cooldown periods – for instance, you might want to prevent new trades for a while after a stop-loss has been triggered, and this function helps you determine that timeframe based on the signal's timestamp. It checks both your historical backtest data and any current live data to find that signal. If no signal exists, it will let you know. It figures out whether you're in a backtest or live trading environment automatically.

You give it the trading pair's symbol, like "BTCUSDT", and it returns the latest signal information.


## Function getFrameSchema

The `getFrameSchema` function helps you find the blueprint for a specific type of data "frame" that your backtest uses. Think of frames as structured containers holding information like prices, indicators, or orders. You give it the name of the frame you're interested in, and it returns the details of what that frame should look like – what data it contains and how it's organized. This is useful for validating data or understanding the expected structure of different data elements within your backtesting system.


## Function getExchangeSchema

This function lets you fetch the details of a specific cryptocurrency exchange that backtest-kit knows about. Think of it as looking up the blueprint for how that exchange works within the backtest environment. You provide the name of the exchange, and it returns a structured description containing information like what data it provides and how it's formatted. This schema helps backtest-kit understand and process data from different exchanges consistently.


## Function getDefaultConfig

This function provides you with a set of pre-configured settings used by the backtest-kit. Think of it as a starting point for customizing how your trading simulations run. It gives you a look at all the possible settings you can tweak, along with what their standard values are. You can then use these defaults as a base and adjust specific parameters to tailor the backtest to your strategy.

## Function getDefaultColumns

This function provides the standard set of column configurations used when creating reports. It essentially gives you a blueprint for structuring your data display. Think of it as a starting point – you can look at the definitions to understand how different types of events and results are organized into columns. This setup includes columns for things like closed trades, heatmap data, live events, performance metrics, and more.

## Function getDate

This function, simply called `getDate`, retrieves the current date. It's useful for knowing what date your trading logic is operating on. If you're running a backtest, it will return the date associated with the historical data being processed. Conversely, if you're running live, it provides the actual, real-time date.

## Function getContext

This function provides access to the current environment where a method is running. Think of it as a snapshot of the surroundings, including information relevant to the method’s execution. It returns a promise that resolves to a method context object. This object holds details that can be useful for understanding and controlling the process happening within the backtest-kit framework.


## Function getConfig

This function allows you to access the framework's configuration settings. Think of it as a way to peek under the hood and see how the system is set up.

It provides a snapshot of various parameters that control different aspects of the backtesting and trading process, from candle fetching and order management to notification limits and signal generation.

The configuration includes settings related to timing, data handling, risk management, and more, all presented as numerical values and boolean flags. This allows for fine-grained control over the system's behavior.


## Function getColumns

This function lets you see what columns are currently set up for your backtest reports. 

It provides a snapshot of the column configurations used for various data types like closed trades, heatmaps, live ticks, and more. 

Think of it as a way to peek at how your report will be structured – you can examine the settings but won’t directly change them. This is useful for understanding your data presentation without risking any unexpected modifications to the core settings.

## Function getClosePrice

This function helps you retrieve the closing price from the most recent candle for a specific trading pair. To use it, you'll need to specify the symbol, like "BTCUSDT" for Bitcoin against USDT, and the candle interval, which determines the length of the time period for the candle (options include 1 minute, 3 minutes, and longer intervals up to 8 hours). It will then return the closing price of that last completed candle as a number.

## Function getCandles

This function helps you retrieve past price data, also known as candles, for a specific trading pair like BTCUSDT. You tell it which trading pair you're interested in, how frequently the data should be (like every minute, hour, etc.), and how many data points you want to see. It then pulls that historical data from the exchange you’ve set up, going back from the present time. Think of it as looking at a history book of prices to understand how a trading pair has moved.


## Function getBreakeven

This function helps you determine if a trade has reached a point where it’s profitable enough to cover the associated costs. It checks if the current price has moved beyond a calculated threshold that accounts for slippage and trading fees. Essentially, it tells you if your trade is “in the green” enough to consider it breakeven, taking into account the costs involved. The function works whether you're running a backtest or a live trade.

You provide the trading pair symbol and the current price, and it returns true if the breakeven threshold has been met, and false otherwise. The threshold is calculated based on predefined constants that represent slippage and fees, multiplied by two to provide a buffer.


## Function getBacktestTimeframe

This function helps you find out the dates and times available for backtesting a specific trading pair, like BTCUSDT. It gives you an array of dates, showing you the range of historical data that's ready to be used for testing your trading strategies. You simply provide the symbol of the trading pair you're interested in, and it returns a list of dates representing the backtest timeframe for that symbol.

## Function getAveragePrice

This function, `getAveragePrice`, helps you determine the VWAP (Volume Weighted Average Price) for a specific trading symbol like BTCUSDT. 

It does this by analyzing the most recent five one-minute candles.

Essentially, it calculates a weighted average price, giving more importance to prices where higher volumes were traded. 

If there’s no trading volume recorded, the function will instead provide a simple average of the closing prices. 

You simply need to provide the symbol you're interested in, and it will return a number representing the calculated average price.

## Function getAggregatedTrades

This function allows you to retrieve a history of aggregated trades for a specific trading pair, like BTCUSDT. It pulls this data directly from the exchange you're connected to.

You can request a limited number of trades using the `limit` parameter, or if you don't specify a limit, it will retrieve trades within a defined time window. The trades are returned in reverse chronological order. The system aims to gather at least the requested number of trades, paging backwards as needed.

## Function getActionSchema

This function lets you look up details about a specific action that's been registered within the backtest-kit system. Think of it as finding the blueprint for how a particular action should work. You provide the unique name or identifier of the action you're interested in, and it returns a structured description – a schema – that defines things like the expected inputs and outputs for that action. This is useful for understanding and validating how actions are executed within your trading strategies.

## Function formatQuantity

This function helps you display the correct quantity of an asset when trading. It takes the trading pair symbol, like "BTCUSDT", and the raw quantity number as input. Then, it automatically adjusts the number of decimal places to match the rules of the specific exchange you're using, ensuring your displayed values are accurate. It's a convenient way to avoid manual calculations and potential errors when showing how much of an asset you're dealing with.


## Function formatPrice

The `formatPrice` function is your go-to tool for displaying prices correctly when trading. It takes a trading pair symbol like "BTCUSDT" and a raw price number and transforms it into a string formatted according to the specific rules of that exchange. This ensures that the price is displayed with the right number of decimal places as required by the exchange, which is crucial for accurate and understandable information. Essentially, it handles the details of how prices are presented so you don't have to.


## Function dumpText

This function allows you to send raw text data, like logs or debugging information, to a designated storage location. Think of it as a way to record what's happening during your trading tests or live trading sessions. 

It connects the data you send with the specific signal (a trading instruction or event) that was active at the time, so you can easily trace back where the information came from. The system also figures out whether it’s running a backtest (historical data) or live trading, so you don't need to specify that. 

You provide the function with the bucket name, a unique dump ID, the actual text content, and a descriptive label for the data. The function then handles the complexities of saving this information for you.


## Function dumpTable

This function helps you display data as a nicely formatted table, perfect for examining results during a backtest or live trading session. It takes an array of objects (records) and presents them in a table format.

The function automatically understands the context of the backtest (whether it's a simulation or a real-time run) and handles signal management for you.  It figures out the column headers based on the data itself, pulling them from all the keys used in your records. This makes it easy to visualize and debug your trading strategies.


## Function dumpRecord

The `dumpRecord` function lets you easily save data snapshots – think of them as records – to a designated storage bucket. It's particularly useful for debugging and analyzing your trading strategies.

This function handles the complexities of figuring out which signal to associate the record with, and whether you’re running a backtest or a live trading scenario, so you don’t have to. 

You provide a data record, a bucket name, a unique identifier for the dump, a description, and the function takes care of the rest. Essentially, it's a straightforward way to get detailed information about your trades saved for later review.


## Function dumpMCPStatus

This function lets you create a snapshot of the Model Context Protocol (MCP) status, which is helpful for understanding what’s happening during a trade. It automatically figures out which signal it should be associated with, and whether you’re running a backtest or live trading. 

By default, it creates two files: a markdown document containing all the messages, including any images decoded from base64 and embedded as images, and individual image files for each image message. You can also use different "backends" to control exactly how this snapshot is created – for example, silencing it entirely or creating a simple text-only version. The function takes a data transfer object containing the bucket name, a unique dump ID, the list of messages, and a description for the snapshot.


## Function dumpJson

The `dumpJson` function lets you record complex data structures, like nested objects, as formatted JSON within your backtest or live trading sessions. It essentially creates a snapshot of your data, neatly formatted and stored.  This function is designed to be convenient; it handles the process of resolving the correct signal (whether it’s an ongoing test or a live trade) and automatically adapts to the environment it’s being used in. You provide the data as a JavaScript object, along with a descriptive label for easy identification later. The result is a persistent record of your data’s state.


## Function dumpError

The `dumpError` function helps you log detailed error descriptions, associating them with specific signals in your backtest or live trading environment. Think of it as a way to create structured error reports.

It takes an object containing the bucket name, dump ID, error content, and a description of the error.

This function automatically figures out whether you're running a backtest or a live trading session, so you don't have to specify that. It also automatically handles related signals for easy error tracking. It's designed to simplify the process of reporting and understanding errors during trading.

## Function dumpAgentAnswer

This function helps you save a complete record of an agent’s conversation—all the messages exchanged—linked to a specific signal. Think of it as creating a snapshot of the interaction for review or debugging.  It automatically figures out which signal you're working with and whether you’re in a testing or live environment, so you don’t have to specify those details. You provide the data you want to save, including the signal it relates to, a unique identifier, the messages themselves, and a brief description.  The function then handles the rest, ensuring the history is safely stored.


## Function createSignalState

This function helps you manage the state of trading signals in a streamlined way. It generates a pair of functions, `getState` and `setState`, that are linked to a specific trading environment – whether it’s a backtest or a live trade. You don’t need to manually specify signal IDs; the function automatically figures out the correct context.

It’s particularly useful for sophisticated strategies, like those driven by large language models, where you want to track metrics across multiple trades. This allows for detailed analysis of performance over time, like maximum drawdown and percentage gain.

Think of it as a tool for building robust, data-driven trading systems. It handles the signal management details so you can focus on the core logic of your strategy.


## Function commitTrailingTakeCost

This function lets you set a specific price level for your take-profit order, regardless of how far it initially was from the entry price. It's a simplified way to manage your take-profit, especially useful when you want to lock in profits at a particular target. The framework handles the details of calculating the right percentage shift for the take-profit and makes sure it works correctly whether you're in a backtesting or live trading environment. It also automatically gets the current market price to ensure the take-profit is calculated accurately.

You provide the symbol of the trading pair and the absolute price you want your take-profit to be. The function then takes care of adjusting the take-profit order accordingly.

## Function commitTrailingTake

This function helps refine your trailing take-profit orders, ensuring they dynamically adjust to market movements. It calculates the new take-profit level based on a percentage shift applied to the *original* take-profit distance, which is essential for accuracy and prevents errors that can happen with repeated adjustments. 

Think of it like this: the function won’t let you move your take-profit *further* away from your entry price; it only allows for more conservative adjustments that bring it closer. 

For long positions, it only allows for take-profit levels that are closer to your entry price. Conversely, for short positions, it only allows for levels that are further away.

The function automatically determines whether it’s running in a backtesting environment or a live trading scenario. You provide the trading pair symbol, the percentage shift you want to apply, and the current market price.


## Function commitTrailingStopCost

This function lets you set a specific price for your trailing stop-loss order. It's a shortcut that simplifies the process of adjusting the stop-loss, automatically calculating the necessary percentage shift based on your initial stop-loss distance. 

It figures out whether you're in a backtest or live trading environment and gets the current market price to make the calculations.

To use it, you'll need to provide the symbol of the trading pair and the exact price you want the stop-loss to be set at. The function will then handle the rest, updating your order accordingly.

## Function commitTrailingStop

This function lets you adjust the trailing stop-loss level for an open trading signal. It's designed to help you refine your risk management strategy.

A key thing to remember is that it always bases the adjustment on the original stop-loss level you set initially, not any previous trailing adjustments. This prevents errors from stacking up over time.

When you use a percentage shift, the function will only move the stop-loss in a direction that provides better protection – if you try to tighten it too much, it might only adjust it slightly to be more beneficial.

Negative shifts tighten the stop-loss, bringing it closer to your entry price, while positive shifts loosen it, creating more buffer. 

For long positions, the stop-loss can only move upwards, always choosing the tighter level. Conversely, for short positions, the stop-loss can only move downwards, again favoring the tighter distance.

The function knows whether it's running in a backtesting environment or live trading mode and adjusts its behavior accordingly.

You'll need to provide the trading symbol, the percentage shift you want to apply, and the current market price.

## Function commitSignalNotify

The `commitSignalNotify` function lets you send out custom information messages related to your trading strategy. Think of it as a way to add notes or alerts to your backtesting or live trading process. These notifications don’t change your positions; they simply provide extra context. 

It's handy for tracking things like when a specific indicator reaches a certain level, or any other event you want to keep an eye on.

The function automatically gathers information like the trading symbol, strategy name, and exchange name, so you don't have to specify them manually. It also gets the current price for you. You can also include additional details in the `payload` to add even more information to your notification.


## Function commitPartialProfitCost

This function lets you partially close a trading position when you've reached a specific profit target, measured in dollar amounts. It simplifies the process by automatically calculating the percentage of your position to close based on the dollar amount you specify. Think of it as a way to lock in profits incrementally as your trade moves toward its take profit level.

The function handles whether you're in a backtesting environment or a live trading situation, and it also retrieves the current price to ensure accuracy. To use it, you simply provide the trading pair symbol and the dollar amount you want to close.


## Function commitPartialProfit

The `commitPartialProfit` function lets you automatically close a portion of an open trade when the price is moving in a profitable direction, essentially guiding your trades toward a take-profit target. It’s a convenient way to secure some gains along the way.

You specify which trading pair you're working with and the percentage of the position you want to close – for example, closing 25% of the trade.

The function intelligently handles whether it’s running in a backtesting environment or a live trading situation, so you don’t need to worry about configuring it differently for each.


## Function commitPartialLossCost

This function lets you partially close a position when it's losing money, based on a specific dollar amount. Think of it as a way to gradually reduce your exposure when the market moves against you, moving toward your stop loss. It simplifies the process by automatically calculating the percentage of your position needed to close based on the dollar amount you provide.

The function handles the technical details for you, like determining whether you’re in a backtest or live environment and retrieving the current price.  You just need to specify the trading pair and the dollar amount you want to close.


## Function commitPartialLoss

This function lets you automatically close a portion of your open trade when the price moves in a way that heads towards your stop-loss order. 

It's designed to help manage risk by closing off some of your position if things aren't going as planned. You specify the symbol of the trading pair and the percentage of the trade you want to close – for example, closing 25% of your position. 

The function automatically adapts to whether you're running a backtest or a live trade, so you don't need to worry about that.


## Function commitCreateTakeProfit

This function lets you tell the backtest-kit that a take-profit order for a position has actually been filled on the exchange. Sometimes, orders get filled at unexpected prices, bypassing the framework’s usual VWAP-based take-profit calculation.

It's used to reconcile what the framework thinks is happening with what's actually occurring on the exchange, ensuring accurate backtest results.

This function reports the filled order and will signal a close with the reason "take_profit" on the next tick. It won’t do anything if there isn't a pending take-profit signal for the specified symbol.

The function automatically adjusts based on whether you're in backtest or live trading mode. 

You can optionally provide additional details like an order ID or a note along with this report.

## Function commitCreateStopLoss

This function lets you inform the backtest framework that a stop-loss order has been filled on the exchange, even if it happened outside of the framework's usual checks. It's used when the exchange executes a stop-loss order at a price point different from what the framework initially calculated, like when it hits a high or low.

The framework typically checks stop-loss orders based on closed candles, but sometimes the exchange fills the order immediately. This function ensures the backtest accurately reflects those real-world executions.

It's a way to synchronize the framework's records with what actually happened on the exchange.

If no pending position exists, this function does nothing. It handles the difference between backtest and live trading environments automatically.

You can include extra details like an ID or note within an optional payload when you call the function.

## Function commitCreateSignal

This function lets you manually inject trading signals into the backtest or live environment, bypassing the usual signal retrieval process. Think of it as a way to feed in your own custom signals directly.

The signal’s timing depends on whether you provide a `priceOpen` value. If you don't provide one, the signal executes immediately at the current price.  If you do provide a `priceOpen`, the signal will execute immediately if the current price has already reached that level; otherwise, it's scheduled to execute when the price does reach that level.

The function checks that your signal is valid and prevents multiple signals from being processed at once. It automatically figures out if it's running a backtest or a live trading session, adjusting its behavior accordingly.

You'll need to pass in both the trading symbol (like BTC-USD) and the signal data itself, structured as an `ISignalDto`.

## Function commitClosePending

This function lets you manually close an existing "pending" trade signal without interrupting your trading strategy. Think of it as a way to clear a signal you've set up but don't want to execute just yet.

It won't impact any signals that are already scheduled or prevent your strategy from creating new signals – your strategy will keep running as normal. Importantly, it also won’t trigger any stop-loss mechanisms.

The function recognizes whether it’s running in a backtesting environment or a live trading scenario automatically.

You can optionally provide extra information with the function call like a transaction ID or a note explaining why you're closing the pending signal.

## Function commitCancelScheduled

This function lets you cancel a previously scheduled signal within your trading strategy, without interrupting the strategy's overall operation. Think of it as removing a planned action from the queue—it won't impact any currently running orders or the strategy's ability to create new signals. It's designed to be used regardless of whether you're in a backtesting or live trading environment, and allows you to optionally add a note to the cancellation for record-keeping. You specify the symbol of the trading pair you're working with to identify the scheduled signal to cancel.


## Function commitBreakeven

This function helps manage your trades by automatically adjusting the stop-loss order once a certain profit level is achieved. 

Specifically, it moves the stop-loss to the entry price, essentially making the trade risk-free, when the price has moved favorably enough to cover both slippage and transaction fees.

The profit threshold required to trigger this adjustment is calculated based on predefined parameters related to slippage and fees. 

It works seamlessly in both backtesting and live trading environments and automatically retrieves the current price to determine if the threshold has been met. You just need to provide the trading symbol to execute this action.

## Function commitAverageBuy

The `commitAverageBuy` function lets you add a new purchase to a trading strategy that uses averaging. It essentially records a buy order at the current market price, contributing to a larger, averaged-out position.

This function intelligently handles whether you're in a testing environment (backtest) or a live trading scenario, and it automatically retrieves the current market price to ensure accuracy. The function keeps track of the average price of your purchases, signals important changes, and generally helps manage your averaging-based trading plan. It takes the trading pair's symbol as an argument, and an optional cost parameter.


## Function commitActivateScheduled

This function lets you manually trigger a pre-planned trading signal before the price reaches the anticipated level. 

Think of it as a way to nudge your strategy to act a little sooner.

It's especially useful when you want to adjust your timing based on external factors.

You simply specify the symbol you're trading and optionally include a note or ID for tracking. 

The framework automatically recognizes whether you're in backtesting or live trading mode, so you don't need to worry about that.


## Function checkCandles

The `checkCandles` function helps verify if your historical candlestick data is already available and stored. It efficiently checks for the presence of candles in your persistence adapter – the system that stores your data. Instead of loading the entire dataset, it uses a fast check to see if the candles for the expected timestamps exist. This is a quick way to confirm that you don’t need to download the data again.

The function takes a set of parameters to define which candles it should check.


## Function cacheCandles

The `cacheCandles` function helps you make sure your trading system has the historical price data it needs. It fetches candlestick data for a specific trading symbol, timeframe, and date range from your persistent storage. It's designed to be robust: first, it checks if the data is already available, and if not, it downloads the missing data and verifies it again to guarantee accuracy. You provide details like the symbol (e.g., "BTCUSDT"), the interval (e.g., "1h"), the start and end dates, and the exchange being used.  You can also optionally supply callbacks to track the start of the validation and warm-up processes.


## Function addWalkerSchema

This function lets you register a new "walker" which helps compare different trading strategies against each other. Think of a walker as a way to run multiple backtests simultaneously, using the same data, so you can see how various strategies stack up.

You provide a configuration object – the `IWalkerSchema` – that details how this walker should run the backtests and what metrics to use for comparison. Essentially, it’s how you set up a system to evaluate and contrast different trading approaches within the backtest-kit framework.

## Function addSweepSchema

This function lets you define and register a sweep, which is a process for systematically testing different trading strategies or parameter combinations. Think of it as setting up an experiment where you want to explore various ways to trade an idea. 

The sweep will run through a single candle on the exchange you’ve configured, essentially simulating the strategy and collecting data. It then uses this data to automatically adjust and evaluate different entry and exit points.

You can customize the parameters being tested within the sweep, but if you don't specify certain parameters, the system will use default values. Ultimately, this function helps you identify the most promising strategies and parameter settings based on a structured, automated evaluation.

## Function addStrategySchema

This function lets you register a trading strategy with the backtest-kit framework. Think of it as telling the system about a new way to generate trading signals.

When you register a strategy, the framework automatically checks to make sure the signals are valid, preventing issues with prices or timing. It also helps to control how often signals are sent to avoid overwhelming the system.

Finally, if you're running in live mode, it ensures that your strategy's configuration is safely stored even if the system crashes.

You provide a configuration object – the `strategySchema` – which defines how the strategy works.

## Function addSizingSchema

This function lets you tell the backtest kit how to determine the size of your trades. You're essentially registering a plan, or schema, that outlines how much capital to allocate to each position. This schema includes details like the method used for sizing (whether it's based on a fixed percentage, the Kelly Criterion, or Average True Range), the specific risk parameters involved, and any limits on position sizes.  It also allows you to specify a callback function that will be triggered during the sizing calculation process.

## Function addRiskSchema

This function lets you define and register how your trading system manages risk. Think of it as setting up the boundaries and rules to prevent overexposure and ensure stability. You can specify limits on the total number of trades running at once, and even add complex custom checks to evaluate things like how your different strategies might impact each other. The framework keeps track of all open trades across your strategies, allowing risk validations to consider the big picture, not just one trading strategy in isolation.

## Function addMCPSchema

This function lets you connect your trading strategy to an MCP agent, essentially creating a live link for them to observe and interact with your strategy's performance. Think of it as registering your strategy with the system so it can share data and receive commands. The MCP allows the agent to see the strategy's status and send instructions about positions. If you don’t provide a custom renderer, the system will automatically create simple text messages for each traded asset, making it easy for the agent to understand the portfolio. You provide a configuration object that defines how the MCP should operate.

## Function addFrameSchema

This function lets you tell the backtest-kit system about a new way to generate timeframes – essentially, how you want to slice up the historical data for your backtest. You provide a configuration object that specifies the start and end dates of your backtest, the interval (like 1-minute, 1-hour, or daily), and a function that will be called to create the specific timeframes. It's how you customize the lookback periods used during your backtest. Think of it as telling the system, "I want to backtest using these specific timeframes."


## Function addExchangeSchema

This function lets you tell the backtest-kit framework about a new exchange you want to use for your tests. Think of it as registering a data source.

You provide a configuration object that describes the exchange – this object tells the framework how to fetch historical price data, format prices and quantities appropriately, and even calculate VWAP (a common trading indicator) based on recent candle data.

Essentially, it’s the first step to incorporating real-world market data into your backtesting process.


## Function addActionSchema

This function lets you add custom actions to your backtesting framework. Think of actions as triggers—they’re fired based on events happening during your strategy's run, like a trade being placed or a profit target being hit. These actions can then do things like update your state management system, send notifications to a messaging service, log data, or run custom code. You define what an action does and when it's triggered by providing an action schema. Each action is specific to a strategy and the time frame it's running on, ensuring it receives the relevant context.
