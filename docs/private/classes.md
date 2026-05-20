---
title: private/classes
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


# backtest-kit classes

## Class WalkerValidationService

The WalkerValidationService helps you keep track of your parameter sweep setups, often used for optimization and hyperparameter tuning. It’s like a central organizer for those configurations, ensuring they're set up correctly before you start running tests.

You can register new parameter sweep setups using `addWalker`, so the service knows about them.  Before you proceed with any operation, use `validate` to confirm a specific setup actually exists—it helps prevent errors. The service also keeps a record of all registered setups, making it easy to view them all with `list`.  To improve performance, validation results are cached, so checking a setup multiple times isn't as taxing.

## Class WalkerUtils

WalkerUtils provides a convenient way to manage and execute walker comparisons, which are essentially automated tests of trading strategies. Think of it as a tool to run and oversee your trading algorithms.

It handles the underlying complexity of running these walkers, automatically identifying the necessary settings from the walker's schema. It's designed to be easy to use, offering functions to start walkers, stop them, and retrieve their results.

You can run walkers in the foreground to get live updates, or in the background for tasks like logging or triggering other actions. It’s also possible to stop walkers, which gracefully halts new signals while allowing existing ones to finish.

Beyond running the walkers, it offers methods to generate reports (in Markdown format) and save those reports to a file. You can also get a listing of all currently running walkers and their status. It's implemented as a single, easily accessible instance to make it simple to incorporate into your workflow.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different trading strategies, or "walkers," in a structured and organized way. It uses a special system to store these strategy definitions in a way that prevents errors caused by incorrect data types.

You can add new walkers using the `addWalker` method, and then find them again later by their assigned name using the `get` method. 

Before a new walker is added, the system checks to make sure it has all the necessary pieces of information with the `validateShallow` method. If a walker already exists, you can update some of its details using the `override` method. Essentially, this service acts as a central place to manage and access all your defined trading strategies.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are evolving during optimization. It's like a digital notebook that records each test run and its results, allowing you to see how different parameter settings affect performance.

The service listens for updates from the walker (your optimization engine) and neatly stores those results in a database. This way, you can analyze which settings are working best and monitor the overall progress of your strategy improvements.

To get started, you’ll subscribe to receive these optimization updates, and when you're done, you can unsubscribe to stop receiving them. It’s designed to prevent accidental duplicate subscriptions, making sure the process stays clean and reliable.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they run. It keeps track of how each strategy performs, gathering results as the strategies execute. These results are then neatly organized into markdown tables that allow for easy comparison.

The service connects to the walker system, listening for updates and storing the results for each strategy in a dedicated space. You can subscribe to these updates and unsubscribe when you no longer need them. 

Need a specific report? You can request data for a particular strategy and timeframe.  The `dump` function then takes this data and saves the formatted report as a markdown file, helping you to keep a clear record of your backtesting process. Finally, you have the option to clear out all the stored data if you need to start fresh.

## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated processes for analyzing trading strategies. It builds upon a private service to handle the core walker logic.

It automatically passes along important information like the strategy name, exchange, frame, and walker name whenever a walker is run.

You can think of it as a convenient way to orchestrate and execute your trading backtests, making sure all the relevant details are passed along automatically.

The `run` method is the main way to execute a walker for a specific symbol, and it returns a generator that provides the results. This method ensures consistent context when running multiple walkers.

## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies, acting as a central coordinator. It manages the process of running each strategy and keeps you informed about its progress.

Think of it as orchestrating a series of backtests. As each strategy finishes, you’ll receive updates. It also monitors performance in real-time, tracking the best results as they emerge. Finally, it provides a complete report, ranking all the strategies you tested.

This service uses BacktestLogicPublicService behind the scenes to actually execute the backtests.

You can customize the process by specifying the trading symbol, the strategies you want to compare, and the metric you’ll use for evaluation, all within a given context which includes details like the exchange, frame, and walker name. 

The `run` method is the main entry point, initiating the comparison process and returning updates as each strategy concludes.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for accessing the walker functionality within the backtest-kit framework. Think of it as a convenient gateway, designed to make it easier to integrate walker capabilities into your applications. It bundles together several key services, like those for handling logic, schemas, validation, and more, simplifying dependency management.

The primary function it provides is the `run` method.  This lets you initiate a walker comparison process, specifying the symbol to analyze and providing context, such as the names of the walker, exchange, and frame involved.  It returns a generator, allowing you to process the results of the comparison step-by-step.


## Class TimeMetaService

The TimeMetaService helps you keep track of the latest candle timestamps for your trading strategies across different symbols, strategy names, exchanges, and frames. It's particularly useful when you need to know the current candle time *outside* of the normal trading tick cycle, like when you're executing commands between ticks.

Essentially, it stores these timestamps in a special way, so they're readily available and update automatically as your strategy progresses. If a timestamp isn’t immediately available, it will wait briefly – up to a set time limit – to get it.

You can clear the stored timestamps entirely or just for a specific combination of symbol and settings to make sure you're always working with fresh data. It's designed to be automatically updated by the system and automatically cleaned up when strategies start. This service is a central point for accessing the timestamp and it is configured as a single instance so everyone can rely on it.

## Class SystemUtils

The SystemUtils class helps keep backtest sessions isolated from each other. Think of it as a way to prevent one backtest from accidentally messing with another's data.

It provides a way to temporarily disconnect everything that's listening to global events. This is super useful when you want to run multiple backtests without them interfering with each other. Once the backtest is done, you can easily reconnect everything as it was before.

The `createSnapshot` method is your tool for this isolation. It essentially takes a picture of the current event listeners, clears them out, allowing for a clean backtest environment, and you can later restore them.

## Class SyncUtils

The SyncUtils class helps you understand and analyze signal sync events within your trading system. It provides a way to gather data related to when signals are opened and closed, letting you track performance and identify trends.

You can use it to get summarized statistics about your signals, like the total number of opens and closes. 

It also generates detailed reports in markdown format. These reports include tables with information on each signal, such as the symbol traded, action taken (open or close), price points, profit/loss details, and timestamps. 

Finally, you can automatically save these reports as files for easy record-keeping and review. The filenames clearly indicate the symbol, strategy, and whether the data is from backtesting or live trading.

## Class SyncReportService

The SyncReportService helps you keep track of what’s happening with your trading signals. It listens for events related to signals – when a new signal is created and when an existing one is closed.

It's designed to record details like the signal's information when it starts and its performance (profit and loss) and reason for closure when it ends. These records are saved to files so you can review them later for auditing or analysis.

You can easily start and stop the service from listening for these events, ensuring you don't accidentally overload the system. The service uses a logger to help diagnose any problems.

## Class SyncMarkdownService

This service helps you create and save reports about your trading signals, specifically focusing on when signals are opened and closed. It keeps track of these events for each symbol, strategy, exchange, and time frame you're backtesting or trading live.

It listens for signal events and organizes them. Then, it automatically generates nicely formatted markdown reports that include detailed information about each signal's lifecycle, along with helpful statistics. These reports are saved to your computer.

You can subscribe to receive these signal events, and when you're done, you can unsubscribe to stop the process and clear all the accumulated data. The service lets you retrieve specific reports or statistics for a particular trading setup, or clear all the data to start fresh. You can also tell it to write the reports directly to files.

## Class StrategyValidationService

This service helps you manage and double-check your trading strategies. It keeps track of all the strategies you've set up.

Before you use a strategy, this service makes sure it exists and that anything connected to it – like risk profiles and actions – is also correctly configured.

To improve speed, it remembers the results of its checks, so it doesn’t have to re-validate things unnecessarily.

You can add new strategies using `addStrategy`, get a list of all registered strategies with `list`, and ensure a specific strategy's setup is correct using `validate`. It relies on other services to validate risk and actions.


## Class StrategyUtils

StrategyUtils helps you analyze and report on how your trading strategies are performing. It acts as a central place to gather information about events like closing positions, taking profits, or adjusting stop-loss orders. Think of it as a tool to automatically create detailed summaries of your strategy’s activity.

You can use it to:

*   Get aggregated statistics about the events your strategy has triggered – like how often it’s taken profits versus losses.
*   Generate comprehensive markdown reports that show a history of your strategy's actions, including the price, percentages, and timestamps associated with each event. This is really useful for understanding exactly what happened and why.
*   Save these reports directly to files for easy sharing or archiving. The reports will include a summary of the data as well.
*   Customize the columns included in the reports to focus on the most important information.




The data comes from events recorded by other components, and StrategyUtils organizes and presents them in a user-friendly way.

## Class StrategySchemaService

This service helps keep track of different strategy schemas, acting like a central place to store and access them. It uses a special system to ensure the schemas are typed correctly and consistently.

You can add new strategy schemas using the `addStrategy()`-like function, and retrieve them later by their names.

Before a strategy schema is fully registered, it's quickly checked to make sure it has all the necessary properties in the correct format.

If a strategy schema already exists, you can update parts of it using the `override()` function. 

Finally, you can easily get a strategy schema by providing its name.


## Class StrategyReportService

This service is designed to keep a detailed audit trail of your trading strategy's actions. It records events like canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting trailing stops and take profits, and moving the breakeven point.

To start using it, you need to "subscribe" to begin the logging process. Once subscribed, it writes each event directly to a JSON file as it happens, ensuring you always have a record of what's happening. When you're done, you can "unsubscribe" to stop the logging.

It's different from other reporting services that might hold events in memory – this one's all about permanent records.

Here's a quick rundown of the different event types it tracks:

*   **cancelScheduled:** Records when a scheduled order is canceled.
*   **closePending:** Records when a pending order is closed.
*   **partialProfit:** Records taking a portion of your profits.
*   **partialLoss:** Records taking a portion of your losses.
*   **trailingStop:** Records adjustments to your trailing stop-loss.
*   **trailingTake:** Records adjustments to your trailing take-profit.
*   **breakeven:** Records moving the stop-loss to the entry price.
*   **activateScheduled:** Records when a scheduled order is activated before its intended time.
*   **averageBuy:** Records when an averaging entry is added.



The service uses a `loggerService` to handle the actual writing of these events.

## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's activity during backtesting or live trading. It's designed to efficiently gather information about strategy actions like canceling orders, closing positions, and adjusting stops.

Instead of writing each event to a file immediately, it temporarily stores them in memory for each symbol and strategy combination. This batch processing makes report generation faster and more efficient.

To start using it, you need to 'subscribe' to begin collecting events. Events are automatically recorded when certain actions happen in your strategy. You can then use functions like `getData` to get the raw data, `getReport` to create formatted markdown reports, or `dump` to save reports to files. Once you're done, remember to 'unsubscribe' to stop collecting data and clear the stored information.

The service remembers previous data for each symbol/strategy pairing using a system of cached storage. This avoids recreating storage objects every time.

It offers flexibility: you can clear accumulated data selectively or completely, depending on your needs.



The `loggerService` property provides access to logging capabilities and context information.

The `cancelScheduled`, `closePending`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, `breakeven`, `activateScheduled`, and `averageBuy` methods are crucial as they are the actual event recording points in your trading logic.

## Class StrategyCoreService

This class, `StrategyCoreService`, acts as a central hub for handling trading strategy operations within the backtest framework. It essentially manages and coordinates various services involved in strategy execution, like logging, connection management, and validation. Think of it as a conductor orchestrating different parts of the trading process.

It provides methods to retrieve key information about a pending trading signal, such as its cost, position size, potential profit/loss, and associated details like DCA entries and partial closes. Many of these methods are designed to be efficient and avoid repeated calculations by caching results.

You'll find functions for validating strategies, simulating trades (backtesting), adjusting stop-loss or take-profit levels, and even stopping or canceling existing signals. It allows for things like testing partial profit or loss, and checking if a position is profitable or nearing breakeven. In essence, it gives you the tools to understand and control the behavior of your trading strategy during testing and even live execution. It offers methods to retrieve historical data points, such as the highest profit or loss ever achieved during a trade, and the elapsed time since those events occurred.

## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central hub for executing strategy logic within the backtest kit. It intelligently routes requests to the correct strategy implementation based on the symbol and strategy name, optimizing performance through caching.

Here's a breakdown of what it does:

*   **Smart Strategy Routing:** It ensures the right strategy handles requests, connecting symbols and strategies seamlessly.
*   **Performance Boost:** It caches frequently used strategy instances to avoid unnecessary re-creation, making the backtesting process faster.
*   **Lifecycle Management:**  It manages strategy initialization and handles both live trading (`tick()`) and historical backtesting (`backtest()`).
*   **Signal Monitoring:** It provides methods to retrieve information about pending and scheduled signals, including P&L calculations.
*   **Position Management:** It offers utilities for tracking position details, such as entry prices, costs, partial closes, and profit/loss.
*   **Control & Safety:** It includes methods to stop strategies, cancel scheduled actions, and validate actions before execution.
*   **Comprehensive Data:** It gives you access to various data points related to a position's lifecycle, allowing for in-depth analysis of strategy performance.


## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored, allowing you to easily switch between different storage methods. It acts as a bridge, letting you choose how your signal data is handled – whether it's persistent storage on disk, in-memory, or even a dummy adapter for testing.

You can change the storage backend being used to adapt to different environments or testing scenarios.  The adapter remembers the storage it's using, creating it only once and reusing it unless you specifically clear it. 

The adapter offers methods for handling events like signal openings, closings, scheduling, and cancellations, passing these actions on to the storage implementation you've chosen.  It also provides ways to find signals by ID and list all stored signals.

It's particularly important to call `clear()` when your working directory changes, as this ensures a fresh storage instance is created with the updated path. The `useStorageAdapter` method lets you completely customize the storage implementation, while `useDummy`, `usePersist`, and `useMemory` offer convenient shortcuts for common storage options.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how your backtest data is stored, letting you choose between different storage methods like persistent disk storage, in-memory storage, or even a dummy storage for testing. It uses a pattern that allows you to easily swap out the storage backend without changing the core backtest logic.

You can choose to use the default persistent storage, switch to in-memory storage for faster testing, or use the dummy storage to avoid writing to any storage at all. The system remembers the storage configuration you select, but you can always clear this selection to force it to recreate the storage utils when, for instance, your working directory changes.

There are methods for handling various signal events like opening, closing, scheduling, and cancellation, all of which are passed to the currently selected storage adapter. You can also search for specific signals by their ID or retrieve a list of all stored signals.  The system keeps track of when signals are actively pinged, updating their timestamps accordingly. Finally, it provides a mechanism to reset the cached storage instance, ensuring a fresh start with any new configuration.

## Class StorageAdapter

The StorageAdapter is like a central hub for keeping track of all your trading signals, both those from past tests (backtest) and those from live trading. It automatically updates itself as new signals are generated, ensuring your data is always current.

You can easily turn the storage on or off, and it's designed to prevent accidental duplicate subscriptions.

If you need to find a specific signal, you can search by its unique ID.  You can also retrieve lists of signals specifically from your backtesting data or from your live trading data. It handles the details of managing both signal types, so you don’t have to.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and store information about trading signals, allowing for flexibility in how that data is handled. It lets you easily switch between different storage methods – like keeping data only in memory, saving it to a file, or even using a dummy adapter that simply ignores any changes. This is particularly useful for complex strategies that need to track things like how long a trade has been open and its peak performance, as demonstrated by the example use case of an LLM-driven capitulation rule.

When a signal is no longer needed, you can clean up the associated data using `disposeSignal`.  The `getState` and `setState` functions provide the core functionality for retrieving and updating this signal data.

To quickly change how the adapter works, you have shortcuts like `useLocal`, `usePersist`, and `useDummy` for common storage choices. You can even plug in your own custom storage implementation using `useStateAdapter`.  If you need to completely refresh the stored data, `clear` can be used, which is useful when the working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage the state during backtesting. It lets you easily swap out different storage methods for your backtest data, offering choices like keeping everything in memory, saving it to files, or using a dummy adapter that just ignores changes. This adaptability is useful for experimenting with different data handling approaches.

To help with setup, there are convenient functions to quickly switch between these storage options: `useLocal` (in-memory), `usePersist` (disk-based), and `useDummy` (discarding all changes). You can also plug in your own custom state adapter using `useStateAdapter`.

The adapter manages state information tied to specific signals and buckets; these cached instances are automatically cleaned up when a signal is canceled. `disposeSignal` is available to manually clear these memoized instances if needed.

The adapter is designed to track important metrics, like the peak percentage change and how long a position has been open, which can be used to trigger actions based on automated rules, such as exiting a trade if it hasn't performed as expected. Think of it as a way to build automated responses to market behavior based on tracked performance data. The `clear` function is specifically intended to be called when the base directory changes, ensuring fresh instances are used for each new iteration.

## Class StateAdapter

The StateAdapter is the central hub for managing your trading state, whether you're running a backtest or live trading.

It automatically handles cleaning up old data when signals are finished, so you don't have to worry about stale information lingering around.

It uses a clever "single-shot" system to make sure you only subscribe to signals once, avoiding unnecessary subscriptions.

You can enable or disable the adapter – it's safe to disable it multiple times if needed.

To get or update the state of a signal, you use the `getState` and `setState` functions, which automatically direct the request to the correct storage location (backtest or live). This simplifies your code and keeps everything organized.

## Class SizingValidationService

This service helps you keep track of and make sure your position sizing strategies are set up correctly. Think of it as a central place to register all your sizing methods, like fixed percentage or Kelly Criterion.

It keeps a record of all your registered sizing strategies.

Before you try to use a sizing strategy, the `validate` function checks if it's been registered, helping prevent errors. To improve performance, the service remembers the results of these checks. 

You can add new sizing strategies using `addSizing`, and retrieve a full list of registered strategies with `list`. The `loggerService` property manages the service logs.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of sizing schemas, which define how much of an asset to trade. It uses a special system to ensure that these schemas are stored and managed correctly.

You add new sizing schemas using the `addSizing` function (although technically it's `register`), and you can retrieve them later by their assigned name using the `get` method. If a sizing schema already exists, you can update parts of it using the `override` function.

Before a new sizing schema is added, it’s quickly checked to make sure it has all the necessary information – this is handled by the `validateShallow` function. The service also has internal components for logging and storing the schemas.

## Class SizingGlobalService

This service, `SizingGlobalService`, handles the crucial task of determining how much of an asset to trade, a process called sizing. It acts as a central point for these calculations, relying on other services to do the heavy lifting.

Think of it as a manager coordinating the sizing process. 

It uses `SizingConnectionService` to perform the actual position size calculations.  There's also a `sizingValidationService` involved, and a `loggerService` for keeping track of what's happening.

The `calculate` method is the core of the service; it takes input parameters defining the sizing requirements and some context, then returns the calculated position size. This method is used internally and also makes up a part of the public API for sizing.

## Class SizingConnectionService

This service handles the logic for determining how much of an asset to trade, based on your chosen sizing method. 

It acts as a central point to connect your trading strategy with the specific sizing calculations you've defined.

Think of it like a dispatcher: you tell it which sizing method you want to use (like "kelly-criterion" or "fixed-percentage"), and it finds the right component to do the actual calculation.

To improve performance, it remembers which sizing methods have already been loaded, so it doesn't have to recreate them every time.

The `getSizing` property lets you get a reference to the sizing component for a particular method.

The `calculate` method is the main way to get a position size – you give it your risk parameters and the sizing method name, and it figures out the size.


## Class SessionLiveAdapter

This component helps manage and store data during live trading sessions, offering flexibility in how that data is handled. It allows you to easily swap out different storage methods—like keeping data only in memory, saving it to files, or discarding it entirely—without changing your core trading logic.

You can choose between a few pre-built storage options, or even create your own custom storage solution. The system automatically keeps track of the appropriate storage method based on the trading symbol, strategy name, exchange, and frame. 

To manage your data, there are functions to retrieve existing data during a live run and update values as needed. It also offers convenience methods to switch between different storage backends and provides a way to clear the stored adapters when the working directory changes, ensuring fresh data isn't used unintentionally.


## Class SessionBacktestAdapter

This component, the SessionBacktestAdapter, provides a flexible way to manage data during your backtesting process. It acts as a central point for accessing and storing session information, allowing you to easily switch between different data storage methods.

By default, data is stored in memory, which is quick but temporary.  You can readily change this to save your data to disk for later use or switch to a dummy adapter for testing purposes.

It intelligently caches these data storage instances, ensuring efficient access. If you need to refresh the cache, for example after changing your working directory, a simple "clear" function can handle that. You can also use custom adapters for highly specialized needs.

The `getData` method retrieves a specific piece of data for a particular symbol and timeframe. `setData` lets you update that data during the backtest.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data during both simulated (backtest) and live trading sessions. It simplifies data access and modification by automatically directing requests to the appropriate storage mechanism – either the backtest storage or the live session storage – based on whether you're in a backtest scenario.

You can use `getData` to retrieve existing data for a particular signal, specifying the symbol, strategy, exchange, frame, whether it's a backtest, and the timestamp. Conversely, `setData` allows you to update the session data for a signal, again specifying all the relevant context and indicating if it’s related to a backtest. This adapter hides the complexity of choosing between backtest and live storage, letting you focus on the trading logic.


## Class ScheduleUtils

This class, `ScheduleUtils`, helps you keep an eye on how your scheduled trading signals are performing. It’s designed to make it easy to track signals that are waiting to be executed, those that were cancelled, and gain insights into cancellation rates and waiting times.

It centralizes access to reporting tools, essentially streamlining the process of understanding the performance of your scheduled signals.

You can use it to:

*   Retrieve statistics for a specific trading symbol and strategy.
*   Generate detailed markdown reports that summarize signal events.
*   Save these reports directly to a file on your computer.

Think of it as a helpful assistant for monitoring and analyzing your scheduled trading activity.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing. It listens for events related to scheduled signals – when they're initially scheduled, when they start, and when they’re canceled. 

It automatically measures the time it takes from when a signal is scheduled to when it's either executed or canceled. 

This service stores all that information in a SQLite database so you can review how effectively your signals are being handled and identify any potential delays.

To start using it, you’ll subscribe to signal events, and when you're done, you can unsubscribe to stop the logging.  The service ensures you don’t accidentally subscribe multiple times.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals and generate reports. It listens for signals being scheduled and cancelled, neatly organizing them by strategy.

This service automatically creates markdown reports that summarize these events, including details about each signal and useful statistics like cancellation rates and wait times. These reports are saved as files so you can easily review them.

You can subscribe to receive these signal events, and when you're finished, you can unsubscribe. 

The service lets you retrieve accumulated data and reports, or clear the data for a specific combination of symbol, strategy, exchange, frame, and backtest settings, or clear everything. It handles the details of managing this information so you can focus on analyzing your trading performance.


## Class RiskValidationService

This service helps you keep track of and verify your risk management settings. It acts like a central directory for all your defined risk profiles.

Before you try to use a risk profile, this service can double-check that it actually exists, preventing errors later on.

It’s designed to be efficient too, remembering the results of previous checks so it doesn't have to re-validate everything every time.

You can add new risk profiles to the service using `addRisk`, confirm their existence with `validate`, and get a complete list of all registered profiles with `list`. The `loggerService` property lets you interact with logging functionality, while `_riskMap` is an internal data structure used for managing risk profiles.

## Class RiskUtils

The RiskUtils class helps you analyze and understand risk rejection events within your trading system. It's like a central hub for gathering and presenting information about why trades were rejected. You can use it to pull out key statistics, like the total number of rejections and how they’re distributed across different symbols and strategies. 

It can also create detailed markdown reports, essentially generating a table that outlines each rejection with specific details: the symbol involved, the strategy used, the position taken (long or short), the exchange, the price at the time of rejection, how many positions were active, and the reason for the rejection.

Finally, this class allows you to easily save those reports to files, neatly organized by symbol and strategy, for later review and analysis. The reports are generated as markdown files, making them easy to read and share.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a structured and reliable way. It utilizes a specialized registry to store these schemas, ensuring type safety throughout the process.

You can add new risk profiles to the registry using `addRisk()`, and later retrieve them by their assigned names. 

Before a new schema is added, `validateShallow()` checks that it has all the essential properties and that they are the correct type. This helps catch potential errors early on. 

If a risk schema already exists, you can update portions of it using `override()`. Finally, `get()` allows you to easily find a schema when you need it.

## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system blocks trades. It acts as a listener, catching those rejection events – the signals that didn't make it through – and storing them.

Essentially, it's your audit trail for risk rejections. You’ll find details like the reason for the rejection and information about the signal itself saved for later review and analysis.

To use it, you’ll subscribe to receive these rejection events.  A special feature makes sure you only subscribe once, preventing duplicate recordings.

When you're finished, you can unsubscribe, which stops the service from receiving and logging any further rejections. If you haven't subscribed, unsubscribing won’t do anything. The service relies on a logger for any helpful debug messages.


## Class RiskMarkdownService

This service helps you create reports about rejected trades due to risk checks. It listens for these rejection events and keeps track of them, organized by the trading symbol and strategy being used. 

It then compiles this information into easy-to-read markdown tables, along with statistics like the total number of rejections and how they're distributed across different symbols and strategies. The reports are automatically saved to your computer's disk.

You can subscribe to receive these rejection events, and easily unsubscribe when you no longer need them. The service lets you retrieve statistics and reports for specific trading combinations, and even clear out the collected data when it's no longer needed, either for a specific setup or everything at once. It also provides a way to save the generated markdown reports to disk.

## Class RiskGlobalService

This service handles all the risk-related checks and management within the trading framework. It acts as a central point for validating risk configurations, ensuring trades adhere to predefined limits. 

It's built around a connection service for risk validation and provides several key functions.

Here’s a breakdown of what it does:

*   **Validation:** It validates risk configurations and remembers previous validations to avoid unnecessary repeats, while also logging those validations.
*   **Signal Checks:** `checkSignal` verifies whether a trading signal is permissible based on risk rules.  `checkSignalAndReserve` is a more robust version, ensuring concurrency safety by atomically validating and reserving a position.
*   **Signal Management:** `addSignal` records when a signal is initiated (a trade is placed), and `removeSignal` cleans up the record when the trade is closed.
*   **Data Clearing:** `clear` allows you to wipe the slate clean, either for a specific set of risk parameters or a complete reset of all risk data.

Essentially, this service safeguards the trading system by enforcing risk limits and providing tools for managing open positions and their associated data.

## Class RiskConnectionService

This service acts as a central hub for handling risk-related operations within your trading framework. It ensures that risk checks and signal validation are directed to the correct risk management implementation.

Think of it as a smart router: when your strategy needs to check if a trade is allowed (based on risk limits), this service figures out *which* specific risk checker to use. It does this by looking at a "riskName" parameter.

To improve performance, it keeps a cache of these risk management implementations. It only creates a new one when needed, and reuses it for subsequent checks with the same risk configuration.

The `checkSignal` method is the workhorse for validating trades, considering things like portfolio drawdown and position limits. There’s a concurrency-safe version, `checkSignalAndReserve`, which is crucial when multiple signals need to be handled at once.  It makes sure that signals don’t all pass validation against the same outdated data.

Finally, methods like `addSignal` and `removeSignal` manage signals within the risk system when a trade is opened or closed. You can clear the cache if necessary with the `clear` method.

## Class ReportWriterAdapter

This component handles storing and managing your trading reports, like backtest results or live trade data. Think of it as a flexible system that allows you to easily change where your reports are saved without modifying your core trading logic.

It keeps track of different types of reports (backtest, live, walker) and ensures that each type only has one storage instance running at a time, which helps with efficiency.

By default, it saves reports as JSONL files, but you can swap out this default to use a different storage method. 

The `writeData` function takes your report data and sends it to the appropriate storage, automatically creating the storage if it doesn't already exist.

You have control over the report adapter with `useReportAdapter`, allowing you to choose how the reports are stored.  You can also temporarily disable writes with `useDummy` or revert to the standard JSONL format with `useJsonl`.  If your working directory changes, `clear` will reset the storage to ensure new instances are created.


## Class ReportUtils

ReportUtils helps you control which parts of the system are generating detailed log files.

It lets you turn on or off logging for things like backtesting, live trading, walker processes, and performance monitoring.

Think of it as a way to selectively gather information without overwhelming your system.

The `enable` function sets up logging for the services you choose, and it's really important to use the cleanup function it gives you to stop the logging later – otherwise, you might run into memory issues.

The `disable` function stops logging for specific services without affecting the others. It's a simple way to turn off logging for a particular area without needing to manage a cleanup function.

## Class ReportBase

This adapter provides a simple way to log events to JSONL files, designed for tracking and analyzing trading activity. It organizes data into separate files based on the type of report (like trade events or order fills).

The adapter writes data as individual JSON lines, making it easy to process the logs later. It automatically creates the necessary directories to store these files.

To prevent issues with slow writes, it includes built-in safeguards like a 15-second timeout. The adapter also handles errors gracefully, notifying a central error handling system. 

You can search through the logs using flags like symbol, strategy name, exchange, frame, signal ID, and walker name. The initialization process only happens once to set up the file and stream, so it's safe to call repeatedly. Finally, data is written in a structured format including the report type, the event data itself, and important metadata for easy filtering and analysis.

## Class ReportAdapter

The ReportAdapter helps manage how your backtesting results are stored, offering flexibility and efficiency. Think of it as a central point for controlling where and how your trading data gets saved.

It uses a pattern that allows you to easily switch between different storage methods without changing your core backtesting logic.  For example, you might want to save data to a JSONL file or another custom format.

The adapter also remembers which storage method you're using, preventing unnecessary creation of storage instances and speeding up the process.

You can tell the adapter which specific storage method to use, essentially choosing how your reports are handled. If you're running multiple tests in a row where the working directory changes, you’ll want to clear the cache to ensure fresh storage.

Finally, there's a "dummy" adapter that lets you temporarily disable writing to storage altogether, which is useful for testing or debugging.

## Class ReflectUtils

This utility class provides a way to easily track key performance metrics for your trading strategies, such as profit and loss, peak profit, and drawdown. It acts as a central hub, simplifying access to position data and ensuring consistent validation across different trading contexts (live or backtesting).

Think of it as a tool for inspecting your strategy’s health in real-time.

It provides methods to retrieve values like:

*   **Profit & Loss (PnL):**  You can get PnL as a percentage or in cost terms (dollars) for the current trade.
*   **Peak Performance:** It allows you to identify the highest profit achieved and the worst drawdown experienced, along with timestamps and percentages.
*   **Position Duration:**  You can see how long a position has been active, or how long a signal has been waiting.
*   **Distance from Peaks/Troughs:**  It lets you measure how far the current price is from the highest profit or worst drawdown points.

The class is designed to be easy to use, using a singleton instance and handling the complexities of data access and validation behind the scenes. The `backtest` parameter offers flexibility for evaluating performance in both live and historical trading scenarios.  Essentially, it simplifies the process of monitoring and analyzing your strategy’s performance.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, providing flexibility in where those signals are stored. Think of it as a central hub for retrieving and handling the most recent signals for a specific trading strategy.

It’s designed so you can easily switch between different storage methods – either keeping signals saved to disk for persistence, or storing them only in memory for faster access. The adapter uses a factory pattern, allowing you to plug in different storage implementations without modifying the core adapter logic.

You can switch between persistent and memory storage using `usePersist()` and `useMemory()`. If you need to refresh the storage instance, like when the working directory changes, use `clear()`. Methods like `getLatestSignal()` and `getMinutesSinceLatestSignalCreated()` simply pass through to the currently configured storage. The `handleActivePing()` method allows you to process active ping events, and the adapter handles those signals based on your chosen storage.

## Class RecentBacktestAdapter

The `RecentBacktestAdapter` helps manage and access recent trading signals, offering flexibility by allowing you to choose where those signals are stored. It acts as a bridge between your backtesting code and either in-memory storage or persistent storage on disk.

You can easily switch between these storage options – the default is in-memory, but you can switch to persistent storage for keeping signals between sessions. The adapter remembers the storage implementation you choose, so you don't have to reconfigure it constantly.

The `clear` method is important to use when your application's working directory changes, ensuring a fresh start for signal storage.  It handles fetching signals, calculating time differences, and responding to "ping" events by forwarding requests to the currently active storage.

## Class RecentAdapter

The RecentAdapter is the core component for handling recent trading signals, whether you're backtesting or running live. It automatically keeps track of the most recent signals, ensuring you always have access to the latest information.

It's designed to be easy to use – enabling it automatically starts the tracking process, and disabling it cleanly stops it.

You can quickly grab the very latest signal for a specific trading pair and situation using `getLatestSignal`.  It checks both historical data and live data to find the most up-to-date signal, and it prevents look-ahead bias by only returning signals that occurred before a specified time.  

`getMinutesSinceLatestSignalCreated` tells you how much time has passed since the most recent signal was generated, also considering the look-ahead cutoff and providing a meaningful measure of signal freshness. This helps ensure your strategies aren’t reacting to information that wouldn't have been available in real-time.


## Class PriceMetaService

PriceMetaService is a tool for keeping track of the most recent market prices for your trading strategies. It acts as a central place to get these prices, especially when you need them outside of the usual trading tick process.

Think of it as a memory bank for prices; it stores the latest price for each symbol, strategy, exchange, frame, and backtest combination. If a price hasn't been seen yet, it will wait briefly for it to appear.

Importantly, if you're getting a price while the strategy is actively running, it will retrieve the live exchange price instead. To keep things fresh, other parts of the system like the backtest or live environment automatically clear out these stored prices when a new strategy begins.

You can also manually clear these cached prices – either for a specific combination of parameters or for all of them – to make sure you're working with the most up-to-date information. The service is managed automatically and updated by other components of the trading framework.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, based on different strategies. Think of it as a calculator for position sizing, ensuring the method you choose is appropriate. 

It includes several pre-built position sizing methods, such as:

*   **Fixed Percentage:**  A straightforward approach where you risk a fixed percentage of your account on each trade.
*   **Kelly Criterion:**  A more complex method aiming to maximize long-term growth by balancing potential gains and losses.
*   **ATR-Based:** This method uses the Average True Range (ATR) to size your positions based on price volatility. 

Each method has built-in checks to confirm everything aligns correctly, so you don't have to worry about making mistakes in your calculations. These methods accept information like your account balance, the asset's price, and other relevant data to determine an appropriate position size.

## Class Position

The Position class helps you figure out where to set your take profit and stop loss prices when you’re trading. It automatically adjusts these levels depending on whether you're going long (buying) or short (selling).

Here are two pre-built calculation methods:

*   **moonbag:** This calculates simple take profit and stop loss levels, setting the take profit at a fixed percentage above the current price.
*   **bracket:** This one allows you to define your own percentages for both take profit and stop loss, giving you more control over your risk and reward. 

Both methods take into account your position type (long or short) to calculate the correct price levels.

## Class PersistStorageUtils

This class provides tools for safely saving and loading signal data, ensuring your backtest and live trading environments can retain their progress. It manages storage instances for signals, using a clever system where each signal is stored as a separate file, identified by its ID.

The system intelligently creates storage "factories" for each mode (backtest or live), making sure you don't have to manage them directly. It also has built-in safeguards to handle unexpected crashes and ensure your data remains consistent.

You can customize how data is stored by providing your own storage adapter. This lets you use different methods or file formats. The class handles reading and writing data in a way that prevents corruption and guarantees accuracy. If your working directory changes, a simple call to `clear()` will reset the storage. There are also convenient options for using a standard file-based storage or a dummy storage for testing purposes.


## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals using files on your computer. It's designed to be the standard way of saving data when you're running backtests or using the backtest-kit framework.

Each signal you save will be stored in its own JSON file, making it easy to manage and understand your data.

The system is built to handle unexpected interruptions - if something goes wrong during saving, it will try to ensure your data isn't corrupted.

You can control whether the storage is used for a backtest or not when you create an instance of the class.

Here's a breakdown of what you can do with it:

*   **Initialization:** `waitForInit` sets up the file storage.
*   **Reading data:** `readStorageData` retrieves all the saved signals.
*   **Writing data:** `writeStorageData` saves new or updated signals, ensuring each signal has a unique identifier.

Essentially, it’s a reliable and straightforward file-based system for keeping track of your trading signals.

## Class PersistStateUtils

This class provides tools for safely saving and loading application state, particularly useful when dealing with potential crashes or interruptions. It cleverly manages storage instances, ensuring each piece of data is stored and retrieved correctly based on a unique identifier and storage location.

Think of it as a way to ensure your application remembers where it left off, even if things go wrong.

It offers a few handy features:

*   It keeps track of storage locations to avoid duplicates.
*   You can customize how state is stored using adapters.
*   It ensures data is read and written in a reliable way.

The class has a built-in cache that gets cleared when the working directory changes. There are also options to use a dummy storage for testing or switch back to the default file-based storage. It also provides a way to clean up old storage when you’re finished with a specific data identifier.  You can register a custom storage solution if the default behavior isn't quite what you need.

## Class PersistStateInstance

This class, `PersistStateInstance`, is a way to store and retrieve data persistently, like saving settings or progress. 

It's a straightforward implementation built around file-based storage. Think of it as a safe keeper for your data.

It's designed to work with a specific signal and a bucket name—these act as identifiers for the data it manages.

The `waitForInit` method ensures the storage is ready before you try to use it. 

`readStateData` fetches the saved data associated with the bucket name, and `writeStateData` saves new or updated data.

Finally, `dispose` doesn't do anything directly; instead, it relies on a separate utility function to clean up any resources that might be involved.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, especially when strategies are running. It makes sure each strategy has its own dedicated storage for its signals.

It's designed to be flexible, letting you plug in different ways to store these signals, such as using files or a custom system. 

The system automatically creates the storage needed when you first try to read or write a signal, ensuring everything is initialized correctly. It handles saving and retrieving signal data in a reliable way.

You can switch between different storage methods easily, including using a simple file-based system, a dummy (no-op) system for testing, or a custom adapter. The class also keeps a cache of storage instances to avoid unnecessary creation and cleanup. Clearing the cache is important when the working directory changes during strategy runs.

## Class PersistSignalInstance

This class provides a way to reliably store and retrieve signal data, acting as a persistent layer for your trading strategies. It essentially manages a file on your computer to hold the signal information.

The class uses the trading symbol, the name of your strategy, and the exchange you're trading on to identify the specific signal being stored. This setup ensures that signals for different strategies and exchanges are kept separate and organized.

The `waitForInit` method sets up the initial file storage, making sure everything is ready before you start using it. The `readSignalData` method pulls the saved signal from the file, and `writeSignalData` lets you save a new signal or clear out the existing one, all while ensuring the process is safe even if something goes wrong during the save. This helps ensure that your signals aren't lost unexpectedly.

## Class PersistSessionUtils

This class helps manage how your trading strategy’s session data, like settings or state, is saved and loaded. It’s designed to be reliable, even if your application crashes unexpectedly.

It remembers which storage method to use for each combination of strategy name, exchange, and frame, so you don’t have to recreate them every time.

You can easily swap out the default storage method (which saves to a file) for your own custom storage solution.

The `waitForInit` method makes sure the storage is ready before you try to use it, and you can control whether it sets up the storage for the very first time.

When you're done, you can manually clear out old storage or remove specific sessions to keep things tidy.

## Class PersistSessionInstance

This class provides a way to save and load session data related to your trading strategies and exchanges, using files to store the information. It essentially acts as a middleman to handle the actual saving and loading of data to disk in a safe and organized way. The data is identified by the strategy and exchange it belongs to, along with a unique name for each session, ensuring clarity and preventing conflicts. 

Think of it as a convenient box where you can store and retrieve information specific to a particular strategy and exchange combination. It doesn't do any cleanup itself, relying on a separate utility to manage related resources.

Here's a breakdown of how it works:

*   It initializes a storage area based on your strategy and exchange names.
*   It allows you to read session data from the storage, retrieving previously saved information.
*   It allows you to save new session data to the storage.
*   When you're finished, calling `dispose` won't actually clean anything up, leaving that to a separate process.

## Class PersistScheduleUtils

This class helps manage how your trading strategy's scheduled signals are saved and loaded, ensuring they're not lost if something goes wrong. It's specifically used by the `ClientStrategy` when it’s running in live mode to keep track of those signals.

Think of it as a helper for keeping track of important timing information for your strategy.

It intelligently creates storage instances based on your strategy's symbol, the strategy's name, and the exchange being used. You can even swap out the default storage method for something custom.

If you need to change how the signals are saved—maybe using a different file format or a dummy method for testing—this class allows you to do that easily. It remembers which storage method is being used, so you don't have to keep telling it.

When you need to read or write a signal, the system handles creating the necessary storage component if it doesn't already exist. The `clear` method is useful if your program's working directory changes; it forces the system to refresh its memory of where signals are stored.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, provides a way to reliably store and retrieve data related to scheduled trading signals. It's designed to work with a specific trading symbol, strategy, and exchange.

Think of it as a file-based system for keeping track of scheduled signals, ensuring that the data isn’t lost even if something unexpected happens.

It uses the trading symbol as a unique identifier for the data it manages.

The `waitForInit` method prepares the underlying storage system before anything else happens.

You can use `readScheduleData` to get existing scheduled signal information and `writeScheduleData` to save updated information, or clear the signal completely.

## Class PersistRiskUtils

This class helps manage and store information about your active trading positions, ensuring it's reliable even if there are interruptions. It's designed to work with ClientRisk to keep track of what's happening in live trading environments.

The system remembers which “risk profiles” are being used and creates specific storage areas for each. You can even customize how these positions are stored by providing your own creation methods.

It makes sure reading and writing position data happens safely and reliably, preventing data loss.

If you need to change how positions are persisted—for example, switching to a file-based system or using a dummy for testing—this class provides ways to do so. 

Furthermore, it automatically cleans up its memory when things change, like when the working directory is updated, preventing errors.

## Class PersistRiskInstance

This class, `PersistRiskInstance`, helps manage and save your trading data to a file, ensuring it's protected and consistent. It's designed to work with the broader backtest-kit framework.

Think of it as a reliable way to store information about your risk management, specifically the positions you're holding. It handles the complex details of writing data to a file safely, so you don't have to worry about data corruption or loss.

Here's a breakdown of how it works:

*   **Initialization:** You start by creating a `PersistRiskInstance` and it initializes the underlying storage.
*   **Data Storage:** It uses a specific, predefined name ("positions") to identify where your position data is stored within the file.
*   **Reading and Writing:** It provides simple methods (`readPositionData` and `writePositionData`) for retrieving and updating your positions. These methods ensure that any changes are written to the file in a reliable and complete way.
*   **Crash Safety:** If something unexpected happens during the process, the data is still protected, preventing data loss. 

Essentially, this class simplifies the process of persisting and accessing your risk management data, letting you focus on your trading strategy.

## Class PersistRecentUtils

This class, PersistRecentUtils, helps manage how recent trading signals are saved and retrieved. It's designed to be efficient and reliable, ensuring that even if something goes wrong, your signal data is protected.

It keeps track of recent signals based on specific criteria like the trading symbol, strategy, exchange, and timeframe, storing them in a way that avoids unnecessary re-creation.

You can customize how these signals are stored by providing your own storage methods. The class also handles updating and reading these signals, making sure the process is consistent.

Here's a breakdown of what you can do:

*   **Control Storage:**  You can easily change how the data is persisted, choosing between file-based storage, a dummy storage for testing, or providing your own custom solution.
*   **Clear Data:** You can clear all the stored signal data when needed, for instance, if the working directory changes during strategy runs.
*   **Read the Latest Signal:** Quickly fetch the most recent signal for a specific trading context.
*   **Save a Signal:**  Store a new or updated signal for a particular context, ensuring it’s saved correctly.



It’s a core component used by other utilities for backtesting and live trading, simplifying the process of managing recent signal persistence.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent signal data for a particular trading strategy and timeframe. Think of it as a way to remember the last important data point for a specific setup.

It's designed to work with files, so the information is stored persistently even if your program restarts. It organizes this data by the trading symbol, the name of your strategy, the exchange it's running on, the timeframe (like a 5-minute chart), and whether it's a backtest or live trading session.

The class constructor takes these details to create a uniquely identified storage location. It uses internal properties to hold these identifiers and a storage object for handling the file operations.

The `waitForInit` method makes sure the storage is ready before you try to read or write data. `readRecentData` fetches the most recent signal data saved for that specific combination of symbol, strategy, exchange, timeframe and backtest/live status. Conversely, `writeRecentData` saves a new signal data point, effectively replacing the old "most recent" data.

## Class PersistPartialUtils

This class helps manage how partial profit and loss data is saved and retrieved, particularly for trading strategies. It intelligently creates storage areas for each symbol and strategy combination, ensuring data isn't lost.

You can customize how this data is stored, such as using files or a dummy adapter for testing. 

It handles reading and writing this data safely and efficiently, making sure the information is accurate even if something unexpected happens. Think of it as a reliable way to keep track of your progress during a trade.

The system also provides a way to clear its memory, which is useful if your environment changes. There's also a simple dummy mode for testing purposes where nothing actually gets saved.


## Class PersistPartialInstance

This class helps manage and save incomplete or temporary data related to your trading strategies, ensuring that even if things go wrong, you don't lose progress. It's designed to work with files, making the storage persistent.

The class is built around a specific trading symbol, strategy name, and exchange, essentially creating a dedicated storage area for that combination. 

It utilizes a unique identifier (signalId) to organize data and employs atomic writes for increased reliability, especially important in situations where unexpected interruptions might occur.

Here's what you can do with it:

*   **Initialization:** `waitForInit` makes sure the storage is ready to go before you start saving data.
*   **Reading Data:** `readPartialData` allows you to retrieve the partial data associated with a specific signal.
*   **Saving Data:** `writePartialData` lets you save the incomplete data for a signal, knowing it's being handled safely and reliably. 

Internally, it uses a separate storage mechanism for each trading context (symbol, strategy, exchange) and handles writing data in a way that prevents data loss.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved, ensuring it's handled reliably. It automatically creates a storage instance for either backtest or live modes and remembers it for efficiency. You can customize how notifications are persisted by providing your own storage creation function. 

The class reads and writes notification data, setting up the storage if it hasn't been initialized before. 

It's designed to handle situations where things might unexpectedly stop working, such as a crash, and it stores each notification as a separate file identified by its unique ID. To switch notification persistence methods, you can use functions to select a file-based approach, a dummy implementation, or register a custom storage creator. Clearing the cache forces the creation of new storage instances, which is useful when the working directory changes.

## Class PersistNotificationInstance

This class helps you save and retrieve notifications to disk, ensuring they are reliably stored even if something unexpected happens. Think of it as a safe way to keep track of important information. It stores each notification as a distinct JSON file, making it easy to manage. 

When you need to load all the notifications, it goes through each file. The system is designed to be robust – it writes files in a way that prevents data loss, even during unexpected interruptions. 

You can control whether this is used in a testing environment. Internally, it uses a basic file storage system, and a initialization process makes sure everything's ready before you start saving or loading data.

## Class PersistMemoryUtils

This class helps manage how data is saved and retrieved persistently, particularly for crash-safe memory persistence within the trading framework. It acts as a central point for creating and handling these persistent memory instances.

The framework keeps track of these memory instances and only creates one for each specific combination of a signal ID and a bucket name, making the process more efficient.

You can customize how memory instances are created by providing your own constructors, allowing for different storage mechanisms.

The class includes methods to read, write, check for existence, and remove memory data. It also provides a way to clear the internal cache of these memory instances, which is important when the working directory of the process changes.

Finally, it offers options to switch between different persistence strategies: a default file-based system, a dummy system for testing, or a custom implementation. There's also functionality to list all existing memory entries for a given signal and bucket, which is useful for tasks like rebuilding indexes.


## Class PersistMemoryInstance

This component provides a way to persistently store and retrieve memory data, essentially acting as a file-based database for your trading strategies. It's built on top of a more basic storage mechanism, ensuring that changes are saved reliably. 

The data is organized into "buckets," identified by a name, and each piece of data has a unique ID.  You can read, write, and delete (soft-delete, meaning the data isn't completely erased, but marked as removed) individual memory entries.

The `listMemoryData` method helps you retrieve all valid (non-deleted) entries within a bucket. Importantly, this component doesn't handle the complete cleanup of related caches; that's managed by a separate utility function. Initializing storage is also handled by waitForInit.

## Class PersistMeasureUtils

This utility class helps manage how your trading strategy's external data, like API responses, is stored persistently. It’s designed to be reliable, even if your program crashes unexpectedly.

It keeps track of data based on unique identifiers combining timestamps and symbols, so you can efficiently retrieve previously fetched information. 

You can customize how this data is stored by providing your own storage mechanisms.

It automatically creates storage instances when needed and cleans up old ones when appropriate.

You can easily switch between different storage methods, like using a standard file system, a dummy (no-op) implementation for testing, or custom adapters tailored to your specific needs. 

The `clear` method is particularly useful for resetting everything if your working directory changes during strategy runs.


## Class PersistMeasureInstance

This class provides a way to persistently store and retrieve measure data, like results or configurations, on disk. It's designed to work with the backtest-kit framework, acting as a reliable place to save your data.

Think of it as a container (the 'bucket') where you store your measure data as individual files. When you need to load or update a piece of data, this class handles that for you.

It includes features like automatically saving changes to the files, the ability to mark data as deleted without actually removing the file, and a way to list all the currently active data entries. The `waitForInit` method ensures that the underlying storage is properly initialized before you start working with it. If you need to get or set a specific measure data entry, the `readMeasureData` and `writeMeasureData` methods handle that.  You can also remove entries by marking them as deleted. Finally, `listMeasureData` lets you loop through all the existing, non-deleted entries to manage or display them.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how your trading logs are saved and loaded. It acts as a central point for handling log persistence, ensuring a reliable way to store your trading history. 

It uses a cached version of your logging instance for efficiency, making accessing it faster. You can easily swap out the default logging method with your own custom adapter, giving you flexibility in how data is stored.

The system handles reading and writing log entries, and it’s designed to be crash-safe, protecting your data. Each log entry is saved as a separate file, identified by a unique ID. 

You can clear the cached instance, which is useful if your working directory changes.  There are also shortcuts available to quickly switch between different logging implementations – the standard file-based approach, or a dummy mode for testing.

## Class PersistLogInstance

This component handles saving and retrieving your backtest logs to files. It’s designed to keep your logs safe, even if your program crashes unexpectedly.

Each log entry is stored as a separate JSON file, making it easy to manage and locate individual entries. The system works by adding new log entries to the storage; it won't overwrite existing ones, guaranteeing that your historical data remains intact.

Before you start using it, you'll need to initialize the storage. The `readLogData` method pulls all those saved log entries back into your program, and `writeLogData` adds new ones, ensuring a clean, append-only log.


## Class PersistIntervalUtils

This component helps keep track of when certain actions have happened within specific time intervals. It essentially remembers whether a particular task has already been executed for a given period.

Data is stored as simple markers in a directory structure located under `./dump/data/interval/`. A file's existence indicates the interval has already fired; its absence means it hasn't yet.

You can customize how this persistence layer works, either by using a standard file-based system, a JSON-based approach, or even a dummy implementation for testing where nothing is actually saved.

The system automatically manages the storage for each interval, creating instances as needed. The `listIntervalData` function allows you to see all the intervals that have occurred, and there's a way to clear the storage if the working directory changes. It also provides functions to read, write, and remove these interval markers.

## Class PersistIntervalInstance

This class provides a way to store and retrieve interval data to disk, ensuring data integrity and allowing for a soft-delete mechanism. It’s designed to manage data related to specific time intervals.

The `bucket` property defines the storage location for the interval data. 

The `waitForInit` method makes sure the storage is ready before any operations are attempted.

You can read interval data using `readIntervalData`, which will return `null` if the data is missing or has been soft-deleted. `writeIntervalData` lets you save new data.  If you need to temporarily disable an interval without deleting the data entirely, `removeIntervalData` will "soft-delete" it by adding a `removed: true` flag.  Finally, `listIntervalData` provides a way to loop through the keys of all the interval data that are currently active and not soft-deleted.

## Class PersistCandleUtils

This class helps manage how your trading strategy's historical candle data (like open, high, low, close prices) is stored and retrieved from files. It's designed to keep things organized and efficient, with each candle's data saved as a separate file.

Think of it as a smart caching system. It checks if the data it has already is enough before fetching more. It also handles situations where the data might be incomplete and automatically updates when needed.

The `PersistCandleInstanceCtor` allows you to swap out the default way these files are handled, offering flexibility in how your data is persisted.

The `getCandlesStorage` function is clever – it makes sure you're only creating the necessary data handling objects for your specific symbol, time interval, and exchange.

`readCandlesData` gets the data from the cache, and `writeCandlesData` saves it.  They work together to keep your data up-to-date.

If your working directory changes, it’s good to clear the cache with `clear()` to ensure things are fresh.  You can use `useJson` to go back to the standard file-based storage, or `useDummy` for testing purposes where you don't actually want to save any data.

## Class PersistCandleInstance

This component manages storing and retrieving candle data, acting as a persistent layer for your backtesting framework. Think of it as a way to save your historical price data to files, so you don’t have to constantly re-download it.

Each candle’s information is stored as a separate file, making it easy to manage individual data points. When you need to read data, it will return nothing if a candle is missing, which signals the framework to refresh the data from the original source.

Writing data is designed to prevent corruption and ensure data integrity; it skips candles that are still in progress (where the closing time is in the future) and avoids overwriting existing files. 

The `waitForInit` method ensures the underlying storage is ready before you start reading or writing data.  You'll use `readCandlesData` to fetch a range of candles, and `writeCandlesData` to save new candles. If a candle is found to be invalid it will trigger a warning and be treated as if the candle wasn't present.


## Class PersistBreakevenUtils

This class manages how breakeven data is saved and loaded, making sure your trading strategies remember their progress. It handles saving data to files on your computer, organized neatly by symbol, strategy, and exchange.

The class automatically creates and manages a dedicated storage area for each combination of symbol, strategy, and exchange, ensuring data isolation and organization. You don't have to worry about creating or deleting these files directly.

You can even customize how this data is stored using adapters, or switch to a dummy mode for testing purposes where no actual data is saved. The class uses a clever system to make sure you're only creating one storage area per symbol-strategy combination, even if you're frequently loading and saving. If you change your working directory, clearing the cache ensures it reinitializes correctly.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data, which is crucial for backtesting and analysis. It acts as a bridge between your trading logic and persistent storage, making sure your data survives crashes or unexpected events. 

It's designed to work with a specific trading symbol, strategy name, and exchange, keeping related data organized.

The class handles the details of writing data to a file in a safe, atomic way, ensuring that your data isn't corrupted. To start using this, you'll need to initialize the storage.

You can then use it to read and write breakeven data, identifying each piece of data with a unique signal ID. This helps the system keep track of data for different signals.

## Class PersistBase

`PersistBase` provides a foundation for storing and retrieving data to files, ensuring that writes are handled safely and reliably. It automatically manages the directory where your data is kept, cleans up any potentially damaged files, and provides a way to iterate through all the entities it manages. This class helps guarantee that data isn’t lost even if something unexpected happens during the writing process.

You can specify a name for your data and a base directory where it will be stored when you create an instance. 

The `waitForInit` method is crucial for setting up the initial state and validating data when the system starts.  It ensures that the directory exists and all existing files are in good shape.

`readValue` lets you retrieve a specific entity by its ID, while `hasValue` simply checks if an entity with that ID exists.  `writeValue` is how you store or update entities, using a process that prevents data corruption. Finally, `keys` generates a list of all entity IDs, which is helpful for tasks like validation or processing all your stored entities.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to run, so you can identify and fix any slowdowns.

It works by listening for performance events—timing information emitted during strategy execution.  The service then records these events, including how long each step took and what data was associated with it.

You can think of it as a tool to pinpoint bottlenecks and improve your strategy's efficiency.

To start using it, you need to subscribe to the performance emitter.  This ensures that the service receives the timing events.  Once you're done, remember to unsubscribe to stop the service from processing further events.  The `subscribe` method returns a function that you call to unsubscribe.  The `loggerService` provides output for debugging, while `track` is the core function used to log timing information.


## Class PerformanceMarkdownService

This service helps you monitor and understand how your trading strategies are performing. It keeps track of performance metrics, like how often trades happen and how long things take.

You can tell it to listen for performance updates and it will collect data separately for each strategy you're running, organized by the trading symbol, strategy name, exchange, timeframe and whether it's a backtest.

It calculates things like average performance, the best and worst cases, and percentiles to give you a complete picture. 

You can ask it for summaries of how specific strategies are doing or have it generate detailed reports in markdown format that highlight potential bottlenecks. These reports are saved as files so you can review them later. 

It also allows you to clear the stored data when you no longer need it, and it provides ways to get the stored data.


## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to gather and analyze metrics for specific strategies and symbols.

You can retrieve detailed performance statistics, broken down by different operations, giving you insights into average durations, volatility, and potential outliers.

The class also generates clear, readable markdown reports that summarize the performance analysis, highlighting areas of potential bottlenecks.

Finally, you can easily save these reports to disk, making it simple to track progress and share findings. The reports will be saved in a directory named 'dump/performance' by default.

## Class PartialUtils

This utility class helps you analyze and understand partial profit and loss data, which is information about small gains and losses that occur during a trading process. It provides tools to extract key statistics, create detailed reports, and save those reports to files.

It gathers data from events related to partial profits and losses, keeping track of things like when they happened, what symbols were involved, and how much was gained or lost.

You can use it to:

*   Get summarized data like the total number of profit and loss events.
*   Generate easy-to-read markdown reports that show each individual event with details such as the action (profit or loss), symbol, price, and timestamp. You can customize what columns are displayed in the report.
*   Save these reports as markdown files, named after the symbol and strategy, so you can review them later or share them. It will create the necessary folders to store the files.






## Class PartialReportService

The PartialReportService helps you keep track of when your trades partially close, whether that's a profit or a loss. It essentially logs these "partial exit" events – the level and price at which they happened – so you can analyze them later. 

It listens for signals about profits and losses and records them in a database.

You can easily subscribe to receive these events, and it makes sure you don't accidentally subscribe multiple times. 

To stop receiving these events, there's an unsubscribe function that you can use. If you haven't subscribed, calling unsubscribe won't do anything.



The service also uses a logger for debugging purposes, and handles the details of writing the data to the database through a separate component.

## Class PartialMarkdownService

This service is designed to automatically create and save reports detailing your trading performance, specifically focusing on profits and losses. It listens for these events as they happen and keeps track of them for each symbol and trading strategy you use.

The service then compiles this information into easy-to-read markdown tables, providing a clear overview of your trading activity. You can also get overall statistics like the total number of profit and loss events.

Reports are saved to your disk, organized by symbol and strategy, making it simple to review your performance over time. You have the option to customize the columns displayed in the reports, and to clear the stored data when needed. The system ensures that each combination of symbol, strategy, exchange, frame, and backtest has its own isolated storage for accurate reporting.

## Class PartialGlobalService

This service acts as a central hub for managing partial profit and loss tracking within your trading strategies. It’s designed to be injected into your strategy, providing a single point of access for these operations. Think of it as a middleman that sits between your strategy and the underlying connection layer.

It keeps a record of all partial operations, logging them for easy monitoring and debugging.  The service relies on other services—like those for validating strategies, schemas, risks, exchanges, and frames—to ensure everything is set up correctly.

It provides functions to record when a profit or loss level is reached, and to clear the partial state when a trade is closed. Importantly, each of these operations is logged at a global level before being passed on to the connection service to handle the actual details.  This ensures consistent tracking and simplifies troubleshooting.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss data is tracked for different trading signals. Think of it as a central hub that keeps track of each signal’s performance.

It’s designed to create and store a record, called a ClientPartial, for each signal ID. These ClientPartial records hold information about the signal's progress and are reused whenever possible to avoid unnecessary work.

When a profit or loss is detected, this service handles the calculations and notifications, ensuring the data is correctly recorded and that events are triggered. Similarly, when a signal is closed, it cleans up the associated data.

The service uses caching to efficiently manage these records, creating them only when needed and removing them when they're no longer required. It’s a crucial component for maintaining accurate and reliable trading data.

## Class NotificationLiveAdapter

This component acts as a central hub for sending notifications about your trading strategies, offering flexibility in how and where those notifications are delivered. It's designed to be easily customized with different notification methods, like storing them in memory, persisting them to a database, or simply ignoring them altogether for testing purposes.

You can switch between these different notification methods – memory, persistent storage, or a dummy adapter that does nothing – with simple convenience functions. The `getInstance` property is a smart cache, meaning it creates the notification handling object only once and reuses it, ensuring efficiency.

The various `handle...` functions (like `handleSignal`, `handlePartialProfit`, etc.) are the core of how notifications are sent, and they automatically forward those notifications to the currently selected notification method.  You have methods to get all stored notifications and clear them entirely.  If your strategy uses different working directories, remember to call `clear` to ensure fresh notification instances.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, particularly within the backtesting process. It's designed to streamline how the system communicates information related to signals.

The service keeps track of validations for strategies, exchanges, and frames, making sure they're correct.  Importantly, it remembers those validations so it doesn't have to repeat them unnecessarily.

You’ll primarily use this through the `commitSignalNotify` function. This function does several things: it verifies the necessary components, figures out the signal details, and then broadcasts the signal information to anyone who's listening. Think of it as the central hub for sending out signal notifications during backtests.

Several other services are used internally by this helper service for validation and signal handling.

## Class NotificationBacktestAdapter

This component acts as a central hub for sending notifications during backtesting. It's designed to be flexible, allowing you to easily swap out different ways of handling those notifications – whether that's storing them in memory, writing them to a file, or simply discarding them.

Think of it as a messenger service for your backtesting process.

It uses a factory pattern, letting you plug in different “notification adapters.” The default adapter stores notifications in memory, but you can easily switch to adapters that persist notifications to disk or ignore them completely for testing purposes.

Here's a quick rundown of what it does:

*   **Handles Various Events:** It's designed to handle different types of events that might occur during a backtest, such as signals, partial profits, losses, strategy commits, risk rejections, and errors.
*   **Notification Storage Options:** You can choose how notifications are handled:
    *   **Memory:**  The default; notifications are stored in memory and will be lost when the backtest ends.
    *   **Persistent:** Notifications are saved to disk, allowing you to review them later.
    *   **Dummy:** Notifications are effectively ignored – useful for performance testing or when you don't need to capture them.
*   **Memoization:** The system cleverly caches the notification handling instance to avoid unnecessary overhead.  You can manually clear this cache when needed (e.g., when changing working directories), forcing a new instance to be created.
*   **Error Handling:** Includes methods for handling different levels of errors during the backtest, ensuring that any issues are appropriately communicated.
*   **Data Retrieval:** Provides a way to retrieve all stored notifications, useful for analysis and debugging.
*   **Cleanup:** Offers a way to clear all stored notifications, which is important for keeping things tidy after a backtest.

## Class NotificationAdapter

The NotificationAdapter is the central place for handling all your trading notifications, whether you're running a backtest or live trading. It automatically keeps track of notifications based on signals coming from your trading system.

You can think of it as a single point of access to both backtest and live notifications. To avoid getting duplicate notifications, it uses a clever "singleshot" mechanism.

Setting up notifications is done via the `enable` property, which handles the subscription process. Conversely, `disable` allows you to cleanly stop the notifications.

Need to see all the notifications? The `getData` function lets you retrieve all notifications, specifying whether you want the backtest or live data. Finally, `dispose` completely clears out the stored notifications when you're finished.

## Class MemoryLiveAdapter

This `MemoryLiveAdapter` acts as a central storage for trading-related data during live trading sessions. Think of it as a flexible memory bank that can be configured in different ways.

It offers several storage options: a default file-based persistence, an in-memory option for quick tests, and a dummy option that simply throws away any data written. You can easily switch between these storage methods.

The adapter uses a clever system to memoize instances, ensuring efficient access to data. When signals are cancelled, you can manually clear these memoized instances.

It provides methods for writing data, searching, listing, removing, and reading entries from memory, as well as utility functions to change the adapter type and clear the cache.  When the base path for your strategy changes, be sure to clear the cache to ensure new instances are created.


## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for backtesting, letting you choose different storage methods depending on your needs. It’s designed to be easily swapped out, allowing you to switch between a simple in-memory solution, a persistent file-based storage, or even a dummy adapter for testing purposes.

By default, it uses an in-memory storage system (BM25) that doesn’t save data between backtest runs. If you need to persist your data, you can switch to the file-based adapter, which saves data to files. The dummy adapter is useful for quickly verifying your code without actually saving anything.

You can also create your own custom storage solutions using the `useMemoryAdapter` method.  The adapter efficiently caches memory instances, and the `disposeSignal` function lets you clear specific data when a signal is cancelled.  Functions like `writeMemory`, `searchMemory`, and `listMemory` allow you to interact with the stored data, while `readMemory` and `removeMemory` provide access to individual entries. Finally, `clear` is helpful when the working directory changes during your backtest runs.

## Class MemoryAdapter

The MemoryAdapter acts as a central manager for both backtesting and live trading memory storage. It intelligently handles writing, searching, listing, removing, and reading memory entries based on whether you’re in a backtest or live trading environment.  It automatically cleans up old memory instances to prevent clutter, subscribing to signal lifecycle events and employing a "singleshot" pattern to avoid duplicate subscriptions. You can control its activity using `enable` to start memory storage and `disable` to stop it. The `writeMemory` method lets you store data, while `searchMemory` helps you find specific entries using full-text search, `listMemory` retrieves all entries, `removeMemory` deletes them, and `readMemory` fetches individual items.

## Class MaxDrawdownUtils

This class helps you analyze and understand the maximum drawdown experienced during trading simulations or live trading. It provides tools to access and summarize drawdown data, allowing you to assess risk and optimize your strategies.

You can request statistical summaries of drawdown events for specific symbols and strategies. 

It also creates detailed markdown reports outlining all drawdown events, making it easy to visualize and understand the performance history.  

Finally, you can have these reports automatically saved to a file for later review or sharing.

## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is designed to keep track of and record maximum drawdown events, essentially the biggest drops in value during a trading simulation.

It monitors a specific data stream called `maxDrawdownSubject` and whenever a new drawdown event occurs, it writes detailed information about it to a database in a format suitable for analysis.

This information includes things like the time of the event, the asset involved, the trading strategy used, and the specific parameters of the trade at that point.

To start recording these drawdown events, you need to subscribe to the `maxDrawdownSubject`. This ensures only one subscription exists, preventing redundant data.

To stop the recording, use the `unsubscribe` function, which effectively detaches the service from the data stream and halts the writing of new drawdown records.

## Class MaxDrawdownMarkdownService

This service is designed to create and save reports detailing maximum drawdown, a key risk metric for trading strategies. It actively listens for drawdown events and organizes them based on the trading symbol, strategy, exchange, and timeframe.

You can subscribe to receive these drawdown events, and conversely, unsubscribe to stop receiving them and clear any stored data.  The service provides methods to retrieve the raw data, generate a formatted markdown report, or directly write the report to a file.

If you need to discard accumulated data, a `clear` function is available. This function can either clear data for a specific trading combination (symbol, strategy, exchange, frame, and whether it's a backtest) or completely clear all accumulated data.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your trading reports are saved. It provides a flexible way to choose where and how your reports are stored, offering options like individual files, a single appended log, or even disabling output altogether. The adapter automatically handles creating the necessary storage when you first write a report. 

You can easily switch between different storage methods using functions like `useMd` for per-file reports, `useJsonl` for a combined log, or `useDummy` to silence all report generation. If you need to change the default way reports are stored, you can customize the `MarkdownFactory`.  The system keeps track of these storage instances, making sure you only have one active storage for each report type. The `clear` function is helpful for resetting this when your working directory changes.

## Class MarkdownUtils

MarkdownUtils helps you control which parts of the backtest-kit framework generate markdown reports. You can choose to have reports for backtests, live trading, or other areas, or turn them off individually.

The `enable` method lets you turn on markdown reporting for specific services. When you enable a service, it starts collecting data and will create markdown files when you ask it to. Importantly, you'll get a function back from `enable` that you *must* call later to stop the data collection and clean up resources – don't forget this step!

If you only want to stop report generation for certain parts of the system, use `disable`. This turns off reports for the services you specify without affecting others.

Finally, `clear` lets you wipe out the data that’s been collected for reports without stopping the report generation itself, allowing you to essentially reset the reporting data.

## Class MarkdownFolderBase

This adapter creates individual markdown files for each report, making it easy to browse and review your results. It organizes reports into separate files within a directory structure you define, which is great for human-readable and well-organized output. 

The adapter doesn't require any setup or initialization; it simply writes the markdown content directly to the specified file.

You control the file's location and naming through options you provide during the writing process, allowing for a customizable and logical report directory. 

Each report gets its own .md file, built from the path and file name you specify.


## Class MarkdownFileBase

This framework component handles writing markdown reports in a specific, organized way. It creates and manages files that store your trading reports as JSONL (JSON Lines) entries, making them easy to process with other tools.

Each report type gets its own file, and the data is written in a structured format including details like the trading symbol, strategy name, and timestamp.

The system automatically manages the file directory structure, handles potential errors, and prevents data loss with timeout protections.

You can easily filter reports later using metadata like symbol or strategy name.

To start, you'll create an instance specifying the type of report you're generating, and then use the `dump` method to write the markdown content along with associated metadata. The `waitForInit` method sets up the necessary file and stream, and it's safe to call it multiple times.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility and efficiency. It lets you choose different ways to save your markdown, like storing each piece in a separate file or combining them into a single JSONL file. 

Think of it as a central point for controlling how your markdown is handled, ensuring consistency and potentially improving performance. 

You can easily switch between storage methods, and the system remembers your choice so you don't have to configure it every time. It also avoids creating unnecessary files, only initializing storage when you actually need to write something. The `useMd()`, `useJsonl()`, and `useDummy()` functions provide simple shortcuts for common storage configurations.

## Class LoggerService

The LoggerService helps ensure your trading framework logs consistently and provides valuable context. It's designed to automatically add details about where the log originated, such as the specific strategy, exchange, and step being executed, along with information about the symbol and time. 

You can customize the logger it uses, plugging in your own implementation if needed. If you don't set a custom logger, it will use a basic "no-op" logger that doesn't actually log anything.

The LoggerService has several methods for different log levels: `log` for general messages, `debug` for detailed information, `info` for important events, and `warn` for potential issues. These methods all automatically add the relevant context information. You can provide your own logger using the `setLogger` method.


## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting framework. It allows you to easily switch between different logging methods, such as storing logs in memory, persisting them to disk, or even silencing logs entirely using a dummy adapter. The default behavior keeps logs in memory, but you can swap this out to use persistent storage or disable logging completely.

You can also customize the logger by providing your own logger constructor using `useLogger`. The `getInstance` property makes sure there's only one active logging instance, recreating it if necessary – for example, when the current working directory changes during a backtest. Functions like `log`, `debug`, `info`, and `warn` simply pass messages on to the currently active logging method. The `clear` function ensures the log instance is refreshed when the environment changes, preventing potential issues during iterative backtesting. Finally, `useJsonl` enables logging directly to a JSONL file.

## Class LiveUtils

The `LiveUtils` class provides tools for live trading operations within the backtest-kit framework. It's designed to simplify running and managing live trading strategies.

It offers a single entry point (`run`) for starting live trading, handling crash recovery by saving and restoring state. You can also run trading in the background (`background`) without directly receiving results, useful for tasks like data persistence.

Retrieval of information about open positions is also available. Functions like `getPendingSignal`, `getTotalPercentClosed`, `getBreakeven`, and `getPositionInvestedCost` give insight into a position's state.

Several methods allow you to interact with open positions: you can cancel scheduled signals (`commitCancelScheduled`) or close existing positions (`commitClosePending`). Partial profit or loss closes, along with trailing stop-loss and take-profit adjustments, are also supported.  Finally, it provides reporting and data retrieval capabilities for analysis.


## Class LiveReportService

LiveReportService is designed to keep a detailed record of your trading strategy’s activity as it's running live. It essentially acts as a logging system, capturing key moments in the signal's lifecycle, such as when it's idle, when a trade is opened, while it's active, and when it's closed. 

This service receives live trading signals, noting every relevant detail along the way. 

It then diligently stores these events in a SQLite database, allowing you to monitor your strategy's performance in real-time and analyze its behavior after the fact.

To ensure everything runs smoothly, the service uses a logger for debugging and prevents accidental duplicate subscriptions to the signal stream.

You subscribe to receive these events, and can later unsubscribe when you no longer need the live data logging.

## Class LiveMarkdownService

The LiveMarkdownService helps you automatically create and save reports detailing your live trading activity. It actively monitors your trading strategies and records every significant event – from periods of inactivity to trade openings, ongoing positions, and closures.

This service automatically generates well-formatted markdown tables summarizing these events, including key statistics like win rate and average profit/loss (PNL). The reports are conveniently saved as `.md` files in the `logs/live/{strategyName}` directory, making it easy to review and analyze your trading performance.

You subscribe to receive tick events, and the service handles the rest, accumulating data and generating reports. It's designed to be a simple and effective way to keep track of your live trading.

You can also retrieve specific data, generate reports on demand, or clear accumulated data if needed. The storage system isolates data for each unique combination of symbol, strategy, exchange, frame, and backtest, ensuring organization and preventing data conflicts.

## Class LiveLogicPublicService

LiveLogicPublicService helps manage and run live trading operations smoothly. It acts as a convenient layer on top of the private service, automatically handling the context needed for things like strategy name and exchange details.

Think of it as a way to let your trading strategies execute without constantly passing around extra information.

It generates a continuous stream of trading signals (opened, closed, or cancelled), and it's designed to keep running indefinitely. Importantly, if the system encounters a problem and crashes, it's able to recover and pick up where it left off using saved data. This service also keeps track of time using the system clock to ensure accurate progression.

Here's a bit more detail:

*   It uses an infinite stream of data, meaning it doesn't stop on its own.
*   It's built to recover from unexpected crashes, preserving its state.
*   It operates in real-time, using the current date and time.

The `run` method is the key – it's what kicks off the live trading process for a specific symbol, and it provides the continuous stream of signals. You provide the symbol you want to trade and a context containing strategy and exchange names.

## Class LiveLogicPrivateService

This service handles the ongoing process of live trading, using a technique that allows it to stream results efficiently. It continuously monitors the market, checks for new trading signals, and delivers updates – only when trades are opened or closed.

Think of it as a tireless worker, constantly running and providing updates on what's happening in your live trading system.

It's designed to be resilient; if something goes wrong, it will attempt to recover and continue trading from where it left off.

The service uses an infinite generator to stream trading results, which is a memory-efficient way to handle a continuous flow of data.

Here's what it relies on:

*   A `loggerService` for logging events.
*   A `strategyCoreService` to handle the core trading logic.
*   A `methodContextService` to manage context for the method calls.

The `run` method starts this whole process for a specific trading symbol, providing a stream of results that you can use to track the live trading activity.

## Class LiveCommandService

The LiveCommandService provides a way to interact with live trading features within the backtest-kit framework. It acts as a central point of access for live trading functionality, streamlining how different components communicate.

Think of it as a helper that makes it easier to manage dependencies when working with live trading. 

It handles things like validating strategies and exchanges, and performing risk and action checks.

The core function, `run`, is what actually executes the live trading process. It continually generates results, monitoring and automatically recovering from potential crashes to keep the trading running. You provide the symbol you want to trade and information about the strategy and exchange being used. This function is designed to run indefinitely, providing a stream of trading data.

## Class IntervalUtils

IntervalUtils helps manage functions that need to run only once within a specific time interval, like calculating indicators or placing orders. It offers two ways to do this: keeping the information in memory or saving it to a file so it persists even if the application restarts.

Think of it as a way to make sure a function doesn't run too often and remembers if it's already completed for the current time period.

The `fn` method is for functions you want to control in memory, while the `file` method is for asynchronous functions that need to store their status in a file. Each function gets its own isolated tracking, meaning changes to one function's interval don't affect others.

You can clean up old interval data using `dispose` to free up memory or `clear` to reset everything when the working directory changes. There's also `resetCounter` to handle situations where file indices might conflict across different strategy runs. These methods provide tools to maintain clean and reliable interval-based operations.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profit events your trading strategies have generated. Think of it as a tool for understanding which strategies performed best under specific conditions.

It works by collecting data from previously recorded highest profit events.

You can use it to get detailed statistics about a strategy’s performance for a particular trading symbol.

Need to see a full report? It can generate a markdown report showing all the highest profit events.

And, if you want to save that report, you can have it write the markdown directly to a file.

## Class HighestProfitReportService

This service is designed to keep track of your most profitable trading moments. It essentially listens for events indicating a new highest profit has been achieved.

Whenever a new highest profit is detected, the service records details like the timestamp, symbol, strategy name, exchange, timeframe, and backtest information, along with specifics about the signal, position, and price levels involved (open, take profit, and stop loss).

To start tracking these highest profit records, you need to subscribe to the service. Once subscribed, it automatically begins saving these records to a JSONL report database.

If you want to stop the service from recording further profit events, you can unsubscribe. This will disconnect it from the source of profit data. It’s important to use the unsubscribe function that’s returned when you subscribe, as this ensures everything is cleaned up properly. Trying to subscribe multiple times won’t re-subscribe; it will just give you the same unsubscribe function.

## Class HighestProfitMarkdownService

This service is responsible for creating and saving reports detailing the highest profit achieved. It listens for incoming data related to highest profit contracts, organizing them based on symbol, trading strategy, exchange, and time frame.

You can subscribe to receive these events, though this is designed to prevent multiple subscriptions. Unsubscribing completely stops the process and clears all stored data.

The `tick` function processes each incoming data point, routing it to the appropriate storage location.

You can retrieve accumulated statistics for a specific symbol, strategy, exchange, and time frame using the `getData` function. If no data exists for that combination, it returns a model with empty information.

The `getReport` function generates a markdown report containing a table of the newest events and the total event count.  `dump` writes this report to a file, using a naming convention that includes the symbol, strategy, exchange, time frame, and a timestamp.

Finally, `clear` allows you to erase either a specific set of data or all accumulated data. This is useful for resetting the analysis or freeing up resources.

## Class HeatUtils

HeatUtils helps you visualize and analyze your trading portfolio's performance using heatmaps. It’s designed to simplify getting and presenting statistics across different trading strategies and symbols.

Think of it as a tool that automatically gathers data from your closed trades, figures out key metrics like profit, Sharpe Ratio, and maximum drawdown for each symbol and the overall portfolio.

You can easily request this data to be presented as a formatted table, ready to be incorporated into reports.

If you need to save these analyses, it can also write the heatmap report directly to a file on your computer. The report includes important details like total profit, Sharpe Ratio, maximum drawdown, and the number of trades executed for each symbol, all sorted by profit.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording closed trades – those signals that have actually resulted in a profit or loss. It listens for these "closed signal" events across all your trading symbols and saves the relevant data to a database.

Think of it as a system that collects data points about your trades, allowing you to see patterns and identify areas for improvement in your overall portfolio.

It's designed to be reliable, ensuring it doesn’t accidentally subscribe multiple times and overload the system.

You can start receiving these closed signal reports by using the `subscribe` function, which also provides an `unsubscribe` function to stop the process when needed. If you’re already subscribed, the `unsubscribe` function will safely end the connection.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance through interactive heatmaps. It listens for trading signals and gathers data about your strategies, exchanges, and timeframes.

You can subscribe to receive real-time updates of trading activity, and the service ensures you don't receive duplicate updates.  Unsubscribing stops these updates.

The `tick` function processes closed signals, updating internal storage with key metrics for each symbol and strategy.

You can retrieve aggregated statistics for a specific exchange, timeframe, and backtest mode using `getData`, which will return data about each symbol or an empty dataset if nothing's been recorded yet.

The `getReport` and `dump` functions generate markdown tables that provide a clear overview of your portfolio’s performance, including per-symbol and overall metrics. The dump function writes this report directly to a file.

The `clear` function resets the data storage, allowing you to start fresh with a particular strategy or clear everything entirely. This is useful for testing or starting a new analysis period.

## Class FrameValidationService

The FrameValidationService helps you keep track of your trading timeframe configurations and makes sure they're set up correctly. It's like a central manager for all your timeframes. 

You can use it to register new timeframes using `addFrame`, telling the service about their structure. 

Before you actually *use* a timeframe in your backtesting process, `validate` lets you double-check that it exists, preventing errors. 

To see a complete list of all the timeframes you've registered, `list` provides that information. The service also intelligently remembers its validation results to avoid unnecessary checks, making it efficient.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your trading strategies' structures. It’s like a central record book for how your strategies are built.

It uses a special system to ensure everything stays consistent and avoids errors related to data types.

You can add new strategy templates using `register`, update existing ones with `override`, or simply look up an existing template with `get`.  Before a strategy template is added, the service checks that it has the essential parts defined correctly through shallow validation. This service uses `loggerService` to help you understand what’s happening and track down any issues.

## Class FrameCoreService

FrameCoreService is a central component that helps manage and generate timeframes for your backtesting processes. It works closely with other services to ensure your data is ready for analysis.

Think of it as the engine that provides the sequences of dates and times you'll use to evaluate your trading strategies. It relies on a connection to fetch historical data and a validation process to confirm its accuracy. This service is primarily used behind the scenes, streamlining the overall backtesting workflow. 

You can use `getTimeframe` to request a specific set of dates and times for a given trading symbol and timeframe name. This method is the key to getting the sequence of moments in time your backtest will evaluate.

## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames within your backtesting environment. It automatically directs requests to the correct frame implementation based on the currently active context.

To improve efficiency, it remembers (caches) previously created frame instances, so it doesn't need to recreate them every time you use them. 

This service provides a way to retrieve the timeframe (start and end dates) for a specific symbol and frame, allowing you to restrict the backtest to a defined period. When running in live mode, no frame constraints are applied, and the frameName will be an empty string.

It's designed to be straightforward to use, providing a clean way to work with frames within your backtesting framework. The service relies on other services for logging, schema management and context.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your configured exchanges and makes sure they're actually set up correctly before you try to use them. It acts like a central directory for your exchange information.

You can register new exchanges using the `addExchange` function, effectively adding them to this central list. 

Before performing actions on an exchange, use the `validate` function to confirm it exists – this prevents errors later on.

For performance, it remembers the results of its validation checks, so it doesn't have to repeat the same checks unnecessarily.  The `list` function allows you to see all the exchanges currently registered. 

It uses a `loggerService` to report on what's happening and keeps track of exchanges in its internal `_exchangeMap`.

## Class ExchangeUtils

The ExchangeUtils class simplifies working with different cryptocurrency exchanges within the backtest-kit framework. It acts as a central helper, ensuring consistent and validated interactions with exchange data.

Think of it as a single point of access for common exchange-related tasks. 

It provides functions to retrieve historical candle data, calculate average prices, and get the latest closing price for a trading pair.  You can also use it to format trade quantities and prices to match the specific rules of each exchange. 

Need the order book or aggregated trades?  ExchangeUtils handles those too, delegating the work to a specialized instance for each exchange. Finally, it allows fetching raw candle data with options for specifying time ranges. The class is designed to be easy to use, automatically handling time calculations and ensuring consistency across different exchanges.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, ensuring everything is consistent and well-organized. It uses a special system to store this information in a way that avoids errors.

You can add new exchange details using `addExchange()` and find existing ones by their name using `get()`.

Before adding a new exchange, `validateShallow` checks that it has all the necessary information and that it's in the correct format.

If you need to update details of an existing exchange, `override` lets you make changes while keeping the rest of the information intact. 

The service relies on logging to record events and errors, using `loggerService` to handle this. Behind the scenes, it uses `_registry` to actually store the exchange information.

## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges, providing a consistent way to retrieve data like candles, order books, and trades. It's designed to work seamlessly within the backtesting framework, automatically injecting important details like the trading symbol, timestamp, and backtest mode into every request.

Think of it as a middleman that prepares requests for the exchange, ensuring all the necessary information is included.

It offers several functions for retrieving data:

*   **Candles:** It can fetch historical candles and, in backtest mode, even future candles.
*   **Price Data:** You can get the average price (VWAP) or the closing price of a specific period.
*   **Order Book:** It retrieves the current order book, showing bids and asks.
*   **Trades:** It fetches aggregated trade data.
*   **Formatting:** It can format prices and quantities for display.
*   **Raw Candles:** Get candles with flexible date and limit options.

The service also validates exchange configurations and remembers results to speed up future requests. It is designed to be used internally by other key components but provides a foundation for reliable exchange interactions.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs your requests—like fetching candles, order books, or average prices—to the correct exchange based on your current settings.

It intelligently caches these exchange connections to speed things up, so you're not repeatedly creating them. 

Think of it as a universal translator for your trading framework, handling the specifics of each exchange behind the scenes.

Here's a breakdown of what it does:

*   **Retrieves Exchange Connections:** It fetches the appropriate exchange connection based on the exchange name specified in your context.
*   **Candle Data:**  It can grab historical or subsequent candle data (price charts) from any connected exchange.
*   **Price Information:**  It gets the average price or closing price, adapting to whether you're in backtesting or live trading mode.
*   **Order Book:**  Fetches the depth of orders on a given trading pair.
*   **Trade Data:** Retrieves aggregated trade data.
*   **Formatting:**  It ensures that prices and quantities are formatted correctly to meet the rules of the specific exchange you're using.
*   **Flexible Candle Retrieval:**  Allows fetching raw candle data with custom date ranges and limits.

The service relies on other components like logger, execution context, exchange schema, and method context services to function.

## Class DumpAdapter

The `DumpAdapter` helps you save data during your backtesting process, offering flexibility in how that data is stored. It acts as a central point for writing different kinds of information like messages, records, tables, errors, and JSON objects.

It uses a backend to handle the actual writing – by default, it saves data as Markdown files. You can easily switch this backend to store data in memory, discard data entirely (useful for debugging), or even create your own custom backend.

Before you start dumping data, you need to activate the adapter with `enable()`, which sets up listeners for signal lifecycle events. When you're done, `disable()` cleans up those listeners. The `clear()` function is helpful when your working directory changes, ensuring you get fresh instances of the adapter.

Essentially, the `DumpAdapter` provides a convenient and configurable way to record what’s happening during your backtests.

## Class ConstantUtils

The `ConstantUtils` class provides a set of predefined values used for calculating take-profit and stop-loss levels, designed around a Kelly Criterion approach with a decay mechanism. These values represent percentages along the path to your final take-profit or stop-loss target, allowing you to incrementally secure profits and manage risk.

For example, `TP_LEVEL1` at 30% triggers when the price reaches 30% of the way to your total take-profit, letting you lock in some profit early on.  `TP_LEVEL2` and `TP_LEVEL3` continue this process at 60% and 90% respectively.

Similarly, `SL_LEVEL1` acts as an early warning at 40% of the way to your stop-loss target, and `SL_LEVEL2` provides a final exit point at 80%, helping to minimize potential losses.  Essentially, these constants give you a structured way to progressively manage your position’s risk and reward.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading setup is mathematically sound and capable of making a profit. It's like a safety net that checks your configuration settings.

It carefully examines settings like slippage, fees, and profit margins, ensuring they're all set to reasonable, non-negative values. The service also verifies that your take-profit distance is sufficient to cover all the costs associated with a trade, guaranteeing that you can actually profit when your target is reached. 

Beyond that, it ensures that ranges of values make sense, that time limits and candle parameters are valid, and that everything fits together correctly. This helps prevent common configuration errors that could lead to unprofitable trading. 

Essentially, it's a crucial component for building reliable and profitable backtesting systems.


## Class ColumnValidationService

This service, ColumnValidationService, is designed to help you ensure your column configurations are set up correctly. It acts as a safety net, verifying that your column definitions adhere to the expected structure and prevent potential errors.

Essentially, it checks that each column has the necessary components: a unique identifier (key), a descriptive name (label), a formatting rule (format), and a visibility setting (isVisible).  It also confirms that your keys and labels are strings that aren't empty.

Furthermore, it makes sure that your formatting and visibility rules are actually functions, not something else. Finally, it guarantees that each column’s key is unique, preventing confusion and misinterpretation in your data. This helps maintain consistency and avoids unexpected behavior within your application.

## Class ClientSizing

The ClientSizing component helps determine how much of your capital to allocate to each trade. It offers flexibility with several sizing methods, such as fixed percentages, Kelly Criterion, and using Average True Range (ATR). 

You can also set limits on the minimum and maximum position sizes, and a maximum percentage of your capital that can be used for any single trade. 

The `calculate` method is the core of this component – it takes input parameters and returns the calculated position size, making it easy to integrate into your trading strategy. This allows your strategies to be properly sized and managed.

## Class ClientRisk

ClientRisk helps manage risk across multiple trading strategies, ensuring no single strategy pushes the portfolio beyond defined limits. It acts as a central point for checking signals before they're executed, considering things like the maximum number of concurrent positions and any custom risk validations you might have set up.

This component is shared among different strategies, enabling analysis of risk across the entire portfolio.  It keeps track of all currently open positions, providing a unified view.

The constructor requires configuration parameters for the risk rules. Internally, it manages a record of active positions, automatically loading this data from storage (unless you're in backtest mode). It also handles saving these positions to storage regularly, again skipping this step during backtesting.

The `checkSignal` method is the core of the risk management process, determining if a signal is valid based on the established rules.  You can provide custom validation logic here, gaining access to details about the signal and all current positions.  A related `checkSignalAndReserve` method provides an extra layer of safety by atomically checking the signal *and* reserving a spot in the position tracking, preventing race conditions when multiple strategies are operating concurrently.

Finally, the `addSignal` and `removeSignal` methods are used to update the record of open and closed positions, respectively, and are triggered by the StrategyConnectionService.  Careful use of `checkSignalAndReserve`, `addSignal`, and `removeSignal` is important to prevent stale reservation data in the risk map.

## Class ClientFrame

The `ClientFrame` is a core component responsible for creating the timeline of data that a backtest uses. Think of it as the engine that builds the sequence of dates and times your trading strategy will be tested against.

It avoids unnecessary work by caching these timelines, ensuring that the same data isn't regenerated repeatedly.

You can customize the spacing between these timestamps, ranging from one minute to one day, to match your testing needs. It also includes ways to check and record information as these timelines are created.

The `getTimeframe` function is its primary function, generating a timeline for a given trading symbol and using a smart caching mechanism to optimize performance.


## Class ClientExchange

This `ClientExchange` component is responsible for getting data from an exchange, like historical prices or order books, in a way that's safe and efficient for backtesting. It’s designed to be memory-friendly, using techniques that avoid unnecessary duplication.

To get historical price data, you can request candles going back in time, or look forward to get candles needed for things like signal duration during a backtest. It can also calculate the Volume Weighted Average Price (VWAP) by averaging prices over a specific number of recent 1-minute candles, or just a simple average if no volume data is available.

You can easily get the most recent closing price for a specific interval, or format quantities and prices according to the exchange's rules (important for ensuring compatibility).  Need a large chunk of raw historical data? You can specify start and end dates, or just a limit, and the component will handle the data retrieval and validation.

Finally, it can fetch the order book and aggregated trades, making sure the data is retrieved in a way that respects the current time and avoids "looking into the future" which would skew backtest results. It uses pre-defined time offsets and limits to control the amount of data retrieved and ensures data integrity.

## Class ClientAction

The `ClientAction` class is designed to manage and execute custom logic within your trading strategies, particularly concerning how your system reacts to events and signals. It acts as a central hub for handling these events and connecting them to specific functions within your custom handlers.

Think of it as a messenger that routes different types of trading signals – like a potential buy, a profit target reached, or a risk event – to the appropriate parts of your code. It’s responsible for setting up and tearing down your custom handlers, ensuring they're initialized just once and cleaned up properly when they're no longer needed.

These handlers can be used for a wide range of purposes, from updating your application's state to sending notifications or collecting data. The `signal` methods (`signalLive`, `signalBacktest`, etc.) are the primary ways to trigger these handlers based on the specific mode (live, backtest, or a combination) of your trading activity.

There are also specific handlers for breakeven and profit/loss events, as well as various ping events related to signal monitoring. Finally, the `signalSync` method offers a direct connection for order placement using a specific function, requiring careful error handling.

## Class CacheUtils

CacheUtils helps you automatically store and reuse the results of your functions, which is really helpful when you're doing things like backtesting trading strategies. It's like having a helper that remembers what your functions calculated and serves up those results quickly if you ask for the same calculation again.

There’s a main function, `fn`, that's designed for regular functions, allowing you to control how often the cache refreshes based on specific time intervals (like candle intervals in trading).  `file` is similar but stores the results in files on your computer, making the caching persistent across program runs, and good for larger, expensive calculations.

If you need to clean things up, `dispose` lets you get rid of a specific function's cached data, forcing it to recalculate.  `clear` is for a full reset, clearing all cached data when you need to start fresh. `resetCounter` ensures that the file-based caches start from zero when the working directory changes. The system uses special memoization to make sure each function has its own separate cache, so one function's caching doesn't affect another.

## Class BrokerBase

This class, `BrokerBase`, serves as a foundation for building connections to different exchanges and automating trading. Think of it as a blueprint for connecting your trading strategy to a real brokerage account. It provides all the necessary functions – like placing orders, managing stop-losses, and recording trades – but leaves the actual implementation details (connecting to a specific exchange like Binance or Coinbase) up to you.

The framework handles basic setup, logging, and ensures that your custom broker works correctly within the system.

Here's a breakdown of how it works:

1.  **Initialization:**  `waitForInit()` is a crucial first step. Use this method to log in to your exchange, set up API keys, or perform any other necessary initial tasks. It runs only once before trading begins.
2.  **Event Handling:** The core of your broker adapter lies in the `onSignal...Commit` methods. These functions are triggered automatically when events happen in your trading strategy—opening a new position (`onSignalOpenCommit`), closing a position (`onSignalCloseCommit`), taking profits (`onPartialProfitCommit`), setting stop-loss orders (`onTrailingStopCommit`), and more. You'll override these methods to actually interact with the exchange.
3.  **Built-in Logging:**  Every action and event is logged automatically, making debugging and monitoring much easier.
4.  **Extensibility:**  By extending the `BrokerBase` class, you’re ensuring your custom broker integrates seamlessly into the backtest-kit framework.



This structure lets you focus on the specifics of communicating with your chosen exchange while relying on the framework to handle the underlying mechanics of order management and event tracking.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, making sure things happen correctly and safely. It's designed to control how trading actions, like opening, closing, and adjusting positions, are handled.

During testing, these actions are ignored, so you can simulate trading without real transactions. When live trading, the `BrokerAdapter` passes these actions on to the configured broker.

Think of it as a safety net: if anything goes wrong during a trading action, the `BrokerAdapter` prevents it from affecting your account state.

Here's a breakdown of what it does:

*   **Connects to Your Broker:** You tell the `BrokerAdapter` which broker to use.
*   **Handles Trading Actions:** It manages various actions like opening positions (`commitSignalOpen`), closing with profits or losses (`commitPartialProfit`, `commitPartialLoss`), and adjusting stop-loss and take-profit levels (`commitTrailingStop`, `commitTrailingTake`, `commitBreakeven`).
*   **Automatic Signal Handling:** It automatically handles signal events (like receiving a buy or sell signal) and routes them to the broker.
*   **Transaction Control:** It ensures that if any of these actions fails, the overall trading process is rolled back, preventing unintended changes.
*   **Testing Mode:** It allows for simulated trading without actual transactions.
*   **Dynamic Updates:** It allows for resetting the broker connection when the operating environment changes (like when you change directories).
*   **Enable/Disable:** It allows enabling or disabling of the adapter, affecting whether trading actions are sent to the broker.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events, which are crucial for understanding your trading strategy's performance. It provides simple ways to get overall statistics and detailed reports of breakeven occurrences.

You can retrieve summarized data like the total number of breakeven events using the `getData` method.

The `getReport` method creates a nicely formatted markdown report, showing a table of all your breakeven events, including details like entry price, position, and timestamp, along with summary data at the end.

Finally, `dump` lets you save this markdown report directly to a file, making it easy to share or archive your breakeven analysis. The file will be named based on the symbol and strategy, such as "BTCUSDT_my-strategy.md".

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach their breakeven points. It acts like a dedicated recorder, listening for these "breakeven" moments and saving the details—like exactly what the signal was doing—to a database.

Think of it as a way to analyze how your trading strategies perform and identify patterns.

To get it working, you need to tell it to start listening for these events using `subscribe()`.  Once you're done, `unsubscribe()` will stop it from recording any further breakevens. It's designed to prevent accidental duplicate subscriptions, ensuring a clean and accurate record of events. The service uses a logger to help with debugging if needed.

## Class BreakevenMarkdownService

This service helps you automatically create and save reports detailing breakeven events for your trading strategies. It keeps track of these events, which are moments when a trade reaches a point where it could potentially be profitable or a loss, for each symbol and strategy you're using.

The service listens for breakeven events and organizes them, then generates clear, readable markdown tables summarizing these events. You can request overall statistics, like the total number of breakeven events, and easily save these reports to your computer.

It allows you to subscribe to receive updates about breakeven events, and you can easily stop listening when you no longer need the updates.  You can also clear the accumulated data if needed, either for a specific strategy or across all of them. The reports are saved in a structured directory system, making it easy to find and manage your breakeven analysis. The data is stored in a way that isolates each symbol, strategy, exchange, frame, and backtest combination.

## Class BreakevenGlobalService

This service, BreakevenGlobalService, acts as a central hub for managing breakeven tracking within the trading system. It's designed to simplify how strategies interact with the underlying breakeven mechanisms and to provide a convenient place for observing and logging these operations.

Think of it as a middleman: strategies receive instructions about breakeven actions, but this service handles the actual work by passing those requests on to another component, BreakevenConnectionService. It also keeps a record of all breakeven actions for monitoring and debugging.

Several other services, like those for validating strategies, risks, exchanges, and frames, are integrated to ensure everything is set up correctly before any breakeven calculations occur. The `validate` function helps to verify those configurations, and it's designed to be efficient by remembering previous validations. The `check` and `clear` functions are key – `check` determines if breakeven should be triggered, and `clear` resets the state when a signal closes.

## Class BreakevenConnectionService

This service helps track and manage breakeven points for trading signals. It ensures we don't create unnecessary breakeven calculations by remembering previously created instances for each signal. 

Think of it as a smart factory – when it needs to calculate a breakeven, it either creates a new one or reuses an existing one.

The service is designed to work with different trading modes, like backtesting and live trading, and keeps things organized by associating each breakeven calculation with a specific signal.

It handles the actual breakeven calculations by delegating tasks to specialized components and also makes sure to clean up those calculations when they’re no longer needed.


## Class BacktestUtils

This class provides tools and shortcuts for running backtests, simplifying the process of testing trading strategies. It acts as a central hub for interacting with the backtesting system.

The `run` method allows you to execute a backtest for a specific symbol and strategy, providing a continuous stream of data about the progress. You can also run backtests in the background with `background`, which is useful for tasks like generating logs or performing calculations without interrupting the main process.

Need to check on the state of a pending signal? Methods like `getPendingSignal`, `getTotalPercentClosed`, and `hasNoPendingSignal` give you detailed insights. You can also retrieve information about the position, such as its effective entry price (`getPositionEffectivePrice`), total cost (`getPositionInvestedCost`), or even the levels at which it was entered (`getPositionLevels`).

The framework also enables control over the backtest, providing functions to manually cancel (`commitCancelScheduled`) or close (`commitClosePending`) signals.  You can manage positions by taking partial profits or losses (`commitPartialProfit`, `commitPartialLoss`) or adjusting the trailing stop or take-profit levels.

Finally, the utility includes helpful functions for data collection (`getData`, `getReport`) and listing active backtests (`list`).

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what’s happening during your backtests. It's designed to capture every important change in your trading signals – when they’re idle, when they open, when they’re active, and when they close. 

Think of it as a logging system that stores these events, along with all the details about each signal, so you can examine them later to understand why your strategy performed the way it did.

To use it, you’ll subscribe to the backtest signal emitter; this prevents you from accidentally signing up multiple times.  When you’re finished, you can unsubscribe to stop receiving signal events. The service also has a logger to help you debug and monitor its activity. It writes all tick events to a database using the ReportWriter.

## Class BacktestMarkdownService

This service helps you create and save detailed reports about your backtesting results. It listens for events triggered during backtests, specifically when a signal closes.

It keeps track of these closed signals for each strategy and symbol you're testing, using a clever system to ensure each test has its own dedicated storage space. 

You can then request summaries, like total statistics or a full report presented in a nicely formatted markdown table, which includes information about each signal. These reports are saved as files on your disk within the 'logs/backtest' directory.

You can clear out old data if you need to, and easily subscribe to or unsubscribe from the backtest events to control when it's actively processing information. This is particularly useful if you're setting up and configuring your backtests.

## Class BacktestLogicPublicService

This service helps you run backtests in a streamlined way. It takes care of automatically managing the context needed for your strategy, like the strategy name, exchange, and frame. 

Essentially, it simplifies how you access data and generate signals during the backtest process – you don't need to manually pass those context details to every function. 

The `run` method is the core of this service.  It executes the backtest for a specific symbol and provides results as a stream of signals, like when trades are opened, closed, or canceled. This method conveniently handles the context setup for you behind the scenes.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is designed to run trading strategy backtests efficiently, especially when dealing with lots of data. It works by first getting a list of timeframes, then going through each one, checking for trading signals.

When a signal tells the strategy to start a trade, it fetches the necessary historical data (candles) and executes the backtest logic.  The service then skips ahead in the timeframes until the signal that triggered the trade is closed.

It delivers the results as a stream, rather than building a giant list in memory, which is much better for handling large backtests. You can also stop the backtest early if needed.

The `run` method is how you actually start the backtest. You give it a symbol (like a stock ticker), and it returns an async generator that continuously produces results – either indicating a signal started, was closed, or was cancelled – allowing you to process the backtest data step-by-step. The service relies on other core services like `StrategyCoreService`, `ExchangeCoreService`, `FrameCoreService`, `ActionCoreService`, and a logger for internal operations.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the system. Think of it as the main doorway to the backtesting capabilities.

It's designed to be easily incorporated into different parts of the application, acting as a convenient link to the core backtesting logic.

Several key components, like those handling validation and logging, are connected and available within this service.

You can use the `run` method to kick off a backtest.  You'll need to specify the symbol you’re testing and provide context details like the strategy and exchange names involved, as well as the frame name. This method returns a series of results detailing how the strategy performed for each tick.

## Class ActionValidationService

The ActionValidationService helps you keep track of and confirm that your action handlers are set up correctly. Think of it as a central place to register all your action handlers and a way to double-check they're available before they're used. 

It keeps a list of registered action handlers, and when you need to use one, you can ask this service to verify it exists. To speed things up, it remembers past validation checks, so it doesn't have to repeat them unnecessarily.

Here's what you can do with it:

*   You can register new action handlers using `addAction`.
*   You can confirm an action handler exists using `validate`.
*   You can see a complete list of registered handlers with `list`. 

The service also has a `loggerService` property for logging and an internal `_actionMap` for managing the action handlers.

## Class ActionSchemaService

The ActionSchemaService is responsible for managing and keeping track of the different actions your trading system can perform. It's like a central directory for all the instructions and logic that execute actions.

It ensures these actions are structured correctly and that the code handling them only uses approved methods, contributing to a more reliable system.

You can register new actions with the service, ensuring they are properly validated. It’s also possible to update existing action configurations without needing to re-register them from scratch, which is helpful for making changes. The service retrieves action configurations for use within the trading system’s connections and client actions.

Here’s what you can do with it:

*   **Register Actions:** Add new actions to the system.
*   **Validate Actions:** Make sure action schemas are correctly formatted.
*   **Override Actions:** Update parts of existing actions without recreating them.
*   **Retrieve Actions:** Get complete action configurations when needed.

The service utilizes a registry to store the action schemas and validates method names to maintain a safe and controlled environment.

## Class ActionProxy

ActionProxy acts as a safety net when you’re using custom code within your trading strategy. Think of it as a wrapper around your user-defined action handlers, ensuring that any errors in your code don’t crash the entire system. It catches and logs errors, sends them off to be dealt with, and keeps things running smoothly.

It’s designed to be flexible, working even if you haven't implemented all the possible action methods – it simply returns null in those cases.  It uses a factory pattern for creation, meaning you don't directly create an ActionProxy; you use the `fromInstance` method.

Here's a breakdown of what it handles:

*   **Initialization:** `init()`—Sets up the action handler, catching any errors.
*   **Signal Events:** `signal()`, `signalLive()`, `signalBacktest()`—Handles signals from different modes (every tick, live trading only, and backtesting), catching and logging any issues.
*   **Breakeven & Profit/Loss Levels:** `breakevenAvailable()`, `partialProfitAvailable()`, `partialLossAvailable()`—Manages events related to profit and loss levels, wrapped in error handling.
*   **Scheduled Pings:** `pingScheduled()`, `pingActive()`, `pingIdle()`—Deals with scheduled and active ping events.
*   **Risk Management:** `riskRejection()`—Handles situations where a signal is rejected by risk management.
*   **Synchronization:** `signalSync()` – A special case that doesn't use the standard error capture as exceptions are designed to propagate.
*   **Cleanup:** `dispose()`—Cleans up resources at the end of the strategy.

Essentially, ActionProxy is a vital component for ensuring robust and stable trading strategy execution, protecting against unexpected issues in your custom code. `fromInstance` is the only way to create an ActionProxy, and it’s important for wrapping your action handlers for safe operation.

## Class ActionCoreService

The ActionCoreService is the central hub for managing actions within your trading strategies. It's responsible for coordinating how actions are executed, ensuring they're validated, and handling different types of events.

Think of it as a traffic controller for your strategy's actions. It pulls the list of required actions directly from the strategy's configuration.

Here's a breakdown of its key functions:

*   **Initialization:** When a strategy starts, it prepares each action for use, loading any necessary data.
*   **Event Handling:** It routes different events – like market ticks, breakeven conditions, or scheduled pings – to the appropriate actions. Each event triggers a specific handler within those actions.
*   **Validation:** Before anything happens, it rigorously checks the strategy's setup, including the strategy name, exchange, and actions themselves, to prevent errors. It caches these validations to avoid repeated checks.
*   **Disposal:** When a strategy finishes running, it cleans up any resources used by the actions.
*   **Synchronization:** It provides a mechanism for actions to coordinate, ensuring consistency across the board.

The service utilizes various internal helpers to manage tasks like action connection, validation of strategies, exchanges, frames and risks.  Each of the signal-related methods (`signal`, `signalLive`, `signalBacktest`, etc.) follows the same pattern: retrieving actions from the schema and sequentially invoking the appropriate handler on each. The `clear` method offers options for targeted or complete action data cleanup.

## Class ActionConnectionService

The ActionConnectionService acts as a central hub for directing different actions within your trading system. It intelligently routes events—like signals, profit updates, or scheduled pings—to the correct action handler based on its name and the specific strategy and frame being used.

Think of it as a smart dispatcher. Instead of having many separate places to handle these events, they all come through this service, which then ensures they reach the right component.

To improve performance, it remembers recently used action handlers, so it doesn't have to recreate them every time. This caching is keyed by the action’s name, the strategy using it, the exchange involved, and the frame it applies to.

The service relies on other components like a logger and action schema service to function correctly. You can also clear the cached action handlers if needed, which is useful for resetting or debugging. Finally, it allows for disposing of action handlers when they're no longer needed.

## Class ActionBase

This class, `ActionBase`, serves as a starting point for creating custom actions within the backtest-kit trading framework. Think of it as a foundation that simplifies adding your own logic to handle events and interactions related to your trading strategies. It automatically handles logging for you, so you don’t have to write that boilerplate code.

When you create a custom action, you’ll inherit from `ActionBase` and override specific methods to customize how your strategy behaves. These methods are triggered by different events during the trading lifecycle like signal generation, reaching profit or loss milestones, or when a signal gets rejected by the risk management system.  

The framework provides default implementations for each method, so you only need to implement what's relevant to your custom actions.  You'll receive details about the strategy name, frame name, and action name, helping you keep track of what's happening.  The `init` method lets you do one-time setup like connecting to databases or APIs.  The `dispose` method guarantees a clean exit, allowing you to free up any resources your action is using. Essentially, it's designed to be a flexible and convenient way to extend the functionality of your trading strategies.
