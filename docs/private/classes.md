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

The WalkerValidationService helps you manage and check the configurations for your parameter sweeps, often used for optimization and hyperparameter tuning. It keeps track of all your defined parameter sweep setups (called walkers) and makes sure they exist before you try to use them.

To make things run faster, the service remembers the results of previous checks, so it doesn't have to re-validate the same configurations repeatedly.

You can add new walkers using `addWalker`, and verify the existence and completeness of a walker's setup with `validate`. This validation goes beyond just checking the walker itself, ensuring any related strategies, risks, and actions are also properly defined.  If you need a quick overview of all your configured walkers, the `list` function provides a simple way to see them all.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, providing a central place to manage and interact with them. Think of it as a helpful assistant for running and controlling your trading walkers.

It allows you to easily execute walker comparisons for specific symbols, automatically handling details like the walker’s name and where it gets its data.  You can run these comparisons in the foreground to get real-time updates or in the background when you just need to perform actions like logging or triggering callbacks.

If you need to pause a walker’s activity, WalkerUtils provides a `stop` function that gracefully halts signal generation, ensuring existing signals finish normally.

You can also retrieve the complete results of a walker's analysis or generate and save a report summarizing its performance, including custom columns for strategy and performance metrics. Finally, it lists all currently running walkers and their statuses so you can keep track of what's happening.  This utility is designed to be easily accessed as a single, shared instance.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your walker schemas in a reliable and type-safe way. It’s essentially a central place to store and manage these schema definitions.

You can add new walkers using the `addWalker` method, and then find them later by their name to retrieve the schema. 

Before adding a walker, it’s a good idea to use the `validateShallow` function to quickly check if the schema has the basic structure it needs.

If you need to update a walker schema, the `override` method lets you make changes while keeping the existing structure. 

And, of course, you can use the `get` method to pull a specific walker schema from the registry by its name. 

The service uses a special registry to make sure the schemas are stored and accessed correctly.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are improving during optimization. It acts like a dedicated record-keeper, storing the results of each test run in a SQLite database.

Think of it as a tool to monitor your strategy's progress and see which parameter combinations are performing best.

It connects to your optimization process, capturing key metrics and statistics.  The service prevents duplicate connections, ensuring clean and reliable data collection.

You can subscribe to receive these updates and unsubscribe when you're done, allowing for flexible integration into your workflow. The service provides a way to debug and understand what’s happening behind the scenes during optimization.

## Class WalkerMarkdownService

The WalkerMarkdownService is designed to automatically create and save detailed reports about your trading strategies as they run. It listens for updates from your walkers – the components that execute your strategies – and carefully tracks their performance.

Think of it as a reporting engine that keeps a record of how each strategy is doing. It organizes this information and presents it in easy-to-read markdown tables, making it simple to compare different strategies. 

You can subscribe to receive these updates and then, at specified intervals, the service will generate a report and save it to a file on your disk, named after the walker. This makes it straightforward to monitor your strategies and analyze their effectiveness over time. You can also clear this stored data when needed.

## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, often called "walkers," by handling the background processes and making sure everything is coordinated. It builds on a private service to automatically pass along important information like the strategy name, exchange, frame, and walker name to each strategy being run.

The `run` function is key; it’s how you kick off a test for a specific stock symbol (like "AAPL").  When you call `run`, it will actually execute your backtesting logic for all applicable strategies, ensuring that each one has the necessary context to operate correctly. Essentially, it streamlines the process of executing and organizing your trading strategy tests.


## Class WalkerLogicPrivateService

The WalkerLogicPrivateService manages and orchestrates the process of comparing different trading strategies. Think of it as a conductor leading an orchestra of backtests.

It works by running each strategy one after another and providing updates on their progress as they finish. During the process, it keeps track of the best-performing strategy based on a chosen metric.

Finally, it delivers a complete report that ranks all strategies based on their performance. It relies on other services like BacktestLogicPublicService to perform the actual backtesting calculations and BacktestMarkdownService to help format the output. 

The `run` method is the main entry point to start a comparison, requiring details like the asset to trade (symbol), the list of strategies to compare, the metric used for evaluation, and information about the trading environment. The process generates intermediate results which you can act upon as they become available.

## Class WalkerCommandService

The WalkerCommandService acts as a central hub for interacting with walker functionality, providing a straightforward way to access and manage various components. It essentially simplifies things for developers by wrapping the more complex WalkerLogicPublicService.

This service utilizes several key components for its operations, including services for logging, managing walker logic, handling schemas, validating strategies, exchanges, frames, walkers, strategies, risks, actions, and a general validation function.

The `validate` function performs a thorough check of walker and strategy configurations, including an intentional extra layer of validation to ensure the critical functionality works reliably.

The `run` function allows you to execute the walker comparison process for a specific symbol, and it also passes along important contextual information, such as the walker, exchange, and frame names, so the process knows precisely what it’s dealing with.

## Class TimeMetaService

The TimeMetaService is designed to provide a reliable way to access the current candle timestamp, even when you're not directly within the normal execution flow of a trading strategy. Think of it as a central place to get the time, ensuring you always have the correct timestamp for actions that happen between ticks.

It keeps track of these timestamps using a special type of data structure called a BehaviorSubject, one for each unique combination of symbol, strategy, exchange, and timeframe. This service automatically updates these timestamp records after each tick, and it’s registered as a singleton so it's readily available.

If you need the timestamp while already inside a trading tick, it pulls it directly from another service. Otherwise, it waits a short time (up to LISTEN_TIMEOUT milliseconds) for the first timestamp to become available. You can clear out all these cached timestamps or just specific ones to ensure you’re working with fresh data, especially at the start of a new strategy run. Essentially, it helps prevent issues caused by outdated time information.

## Class SystemUtils

The `SystemUtils` class helps keep your backtest sessions clean and separate. It prevents one test from accidentally affecting another by temporarily disconnecting from the global event bus.

Think of it as creating a little bubble around each backtest.

The `createSnapshot` property provides a way to create a record of the current event listeners. This allows you to effectively "pause" the existing system state, run your backtest, and then easily "resume" the original state afterward, ensuring a fresh start for each session.

## Class SyncUtils

The SyncUtils class helps you understand what's happening during the lifecycle of signals, providing insights into how signals are opened and closed. It collects data from events like when a signal is triggered (signal-open) and when a position is closed (signal-close).

You can use it to get statistical information, like the total number of signals, opens, and closes.  It also allows you to generate a detailed markdown report that summarizes these events, presenting them in an organized table with important details like signal ID, action taken, pricing information, and profit/loss.

Finally, you can easily save these reports to a file for later review and analysis, with the filename automatically incorporating the symbol, strategy, and other relevant information.  This makes it easier to track and analyze the performance of your trading strategies.

## Class SyncReportService

The SyncReportService helps keep track of what’s happening with your trading signals, especially for audit purposes. It listens for events related to signals being opened and closed, like when an order is filled or a position is exited.

It records detailed information about these events, including the signal specifics and profit/loss data when a position closes. Think of it as creating a history log for your trading activity.

You can easily start and stop this service – subscribing to the signal events and unsubscribing when needed, making sure you don't accidentally log things twice. The service also uses a logger to provide helpful debug information.

## Class SyncMarkdownService

This service is designed to automatically create and save reports detailing the lifecycle of trading signals. It listens for signal events – when signals are opened and closed – and organizes this data for easy review.

Essentially, it gathers information about each signal's journey, including when it was opened, closed, and why. It then formats this data into nicely readable markdown tables, providing a clear overview of what happened.

You can subscribe to receive these signal events and start collecting data. The service makes sure you don't accidentally subscribe multiple times.  You can also unsubscribe to stop collecting data and clear everything out.

The `tick` method is where the real work happens – it takes each incoming signal event and organizes it into the correct reporting bucket.

You can request data statistics for specific signals (like for a particular symbol, strategy, or exchange), or generate a full report in markdown format for easy viewing.

Finally, you can dump the report directly to a file on your disk, or completely clear all the accumulated signal data to start fresh.

## Class SweepValidationService

This service keeps track of all the sweeps (sets of trading rules or strategies) registered within the backtest-kit framework. It's like a safety net, ensuring that whenever a sweep is used, it actually exists and that its required exchange is valid. 

Think of it as preventing errors by making sure everything is in place before trading begins.

You can register new sweeps with this service, but it won't let you register the same sweep name twice. 

It also provides a way to check if a particular sweep is valid and a method for listing all the sweeps currently being tracked. The validation process is efficient; it only runs once per sweep name.

## Class SweepUtils

SweepUtils helps you explore and evaluate many different trading ideas simultaneously. Think of it as a way to quickly test a wide range of strategies and see which ones perform best.

It runs a "sweep" of trading ideas, profiling each one with just a single candle to quickly assess its potential. The system then evaluates these ideas based on several factors, like profit, risk, and recovery time, ultimately identifying the top four performing strategies. Each strategy’s performance is tracked individually, with its own specific rules.

You can fine-tune how these strategies are tested using various parameters, such as stop-loss percentages, trailing take percentages, and time limits. The system emphasizes individual author performance, rather than trying to combine strategies based on consensus—that's something you'd handle separately.

The system provides detailed reports, showing exactly how each trade performed. It’s important to remember that the results are based on a simulation and the ultimate test is a real-world backtest using the `Backtest.run` method.

The `run` method is the core of the system. It takes a list of trading ideas and processes them through a series of steps: profiling, filtering, and evaluation.  The system automatically filters out irrelevant ideas like those from other symbols, or ideas that are repeated too closely together.

The `run` method merges your defined parameters with default settings to create a comprehensive evaluation, and ranking winners are determined while respecting minimum trade thresholds to prevent inaccurate results.

## Class SweepSchemaService

The SweepSchemaService acts as a central place to store and manage sweep schemas, which define how data is processed and analyzed. 

Think of it as a library where each schema is associated with a unique name.

It ensures basic validity when a schema is added, making sure essential information is present.

When a new ClientSweep instance needs to be created, it consults this service to find the appropriate schema.

The service includes a logger for tracking activity and a registry to hold the schemas.

You can register new schemas, update existing ones (partially overriding their settings), and retrieve schemas by name.

## Class SweepGlobalService

SweepGlobalService acts as the main entry point for working with sweep simulations. It’s the first place you'll interact with when you want to run a sweep, handling the initial checks to make sure everything is set up correctly.

Essentially, it verifies that the sweep you're requesting exists and is compatible with the exchanges involved. Then, it passes the request along to other services that manage the simulation process.

The `run` method is your primary tool for initiating a sweep simulation. You provide the symbol you’re interested in, the sweep name, and a list of ideas to test. This triggers a sequence of steps, including analyzing profiles, filtering based on criteria, evaluating grid performance, and generating rankings, ultimately producing a complete sweep result.


## Class SweepCoreService

The SweepCoreService is the central engine for running sweep simulations. It verifies that the sweep configuration is valid, ensuring the necessary exchanges and data exist. 

Think of it as a gatekeeper and coordinator; it checks things out and then passes the work on to other components. It manages connections and makes sure data isn't unnecessarily reprocessed.

The service itself doesn’t hold onto sweep data directly, it relies on the SweepConnectionService for that. 

Its main responsibility is the `run` method. This method executes the entire sweep process for a given symbol, involving several steps like profile selection, filtering of ideas, evaluating trading strategies, and ultimately ranking the results.


## Class SweepConnectionService

The SweepConnectionService manages and provides access to ClientSweep instances, which handle the core logic for a specific sweep. It's responsible for retrieving the appropriate schema based on the sweep's name, setting up default grid axes if needed, and ensuring that a single, optimized client is used for each sweep. 

It acts as a connection layer, taking flat data input (DTOs) and passing them to the configured client. 

You can think of it as a central point to get a prepared sweep client ready to run.

The `getSweep` method is the primary way to obtain a ClientSweep, and it intelligently caches these clients to improve performance.  If a client doesn’t exist for a sweep name, it creates one.

The `run` method orchestrates the complete simulation process, guiding data through profiling, filtering, grid evaluation, and ranking – using the memoized client.

If you need to clear the cached clients – perhaps to reload schemas or reset state – the `clear` method is available. It can clear a specific client or all cached clients.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and verify your trading strategies. It acts as a central place to register your strategies, ensuring they're properly set up before you use them. 

It checks not only if a strategy exists but also if any related risk profiles and actions are valid too. To make things faster, it remembers the results of previous validations, avoiding unnecessary re-checks.

You can use it to add new strategies, check if a strategy is valid, or simply list all the strategies you've registered. It relies on other services for risk and action validation, making it a flexible component in your trading system.

## Class StrategyUtils

The StrategyUtils class helps you understand how your trading strategies are performing. It acts as a central hub to access and present information about strategy events like closing positions, taking profits, or setting stop-loss orders.

Think of it as a reporting tool that gathers data from strategy executions and presents it in an organized way.

You can retrieve statistical summaries of your strategies, showing how often different actions are triggered. It can also create detailed markdown reports, essentially tables, listing each strategy event with relevant information like the price, order IDs, and timestamps. Finally, you can save these reports directly to files on your system for later review or sharing. Essentially, it allows you to easily analyze and document the behavior of your trading strategies.

## Class StrategySchemaService

This service helps keep track of different strategy schemas, acting as a central place to store and manage them. It uses a special system to ensure the schemas are structured correctly and consistently.

You can add new strategy schemas using the `addStrategy` function, and retrieve them later by their name using `get`.

The service also provides a way to update existing schemas with just the changes you need, and it does a quick check to make sure the schema has all the essential parts before it’s stored. This helps prevent errors down the line.


## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategy is doing. It’s specifically designed to write each event – like canceling a trade, closing a pending order, taking partial profits, or adjusting stop-loss levels – to a separate JSON file as it happens. Think of it as a live audit trail for your strategy's activity.

To start using it, you need to "subscribe" to the service. This turns on the event logging. Once enabled, each significant action your strategy takes will be recorded. When you’re done, "unsubscribe" to stop the logging.

The service provides several functions, each responsible for logging a specific type of event. These include logging when a scheduled order is cancelled, a pending order is closed, partial profits or losses are realized, trailing stop or take levels are adjusted, or the stop-loss is moved to breakeven.  There's also logging for when a scheduled signal gets activated earlier than expected, and when a position is averaged (DCA). Each of these functions receives information about the trade, like the symbol, price, profit and loss data, and relevant context details.



It's important to note that unlike some reporting methods that accumulate data in memory, this service writes each event immediately to disk, making it ideal for maintaining a reliable history of your strategy's behavior.

## Class StrategyMarkdownService

This service helps you keep track of what's happening in your trading strategies during backtesting or live trading. Think of it as a detailed logbook, but instead of writing by hand, it automatically records important events like cancels, closes, partial profits, losses, and trailing adjustments.

It doesn't immediately save every event to disk like some systems do. Instead, it temporarily holds these events in memory, grouped by symbol, strategy, and other factors, so you can generate reports or export everything at once. This is useful for performance, especially when dealing with many events.

To start using it, you need to "subscribe" to begin collecting events. Events are then automatically recorded by the system.  You can retrieve the data and create reports using functions like `getData`, `getReport`, or `dump` to save the report to a file.  When you're finished, you need to "unsubscribe" to stop collecting events and clear the stored data.

It offers the ability to generate reports that are formatted using Markdown, letting you easily visualize and share your trading activity. It’s flexible, allowing you to choose which details to include in the reports.  You can also selectively clear specific data or everything to reset the tracking.


## Class StrategyCoreService

This class, `StrategyCoreService`, is a central hub for handling strategy operations within the backtest framework. It acts as a mediator, combining functionality from other services to manage the lifecycle of strategies and positions.

It handles validations, retrieves various data points about a strategy's position (like pending signals, cost basis, P&L, entry prices), and provides methods to interact with a position (partial profits/losses, stop adjustments).  These methods often involve validating strategy and connection services.

It’s designed to be injected with contextual information – symbol, timestamp, and backtest mode – to ensure consistency and inject appropriate data.

The service also offers methods for stopping, canceling scheduled signals, and dealing with potential issues like scheduled signal activation or taking profits/stop losses. 

Several methods are available to retrieve detailed information about a position's performance including profit/loss figures, entry prices, and drawdown details.  These provide insights into the strategy's behavior during a trade. Finally, there are utilities to clear cache and ensure proper disposal of strategy resources.

## Class StrategyConnectionService

This service acts as a central hub for managing strategies within the backtesting framework. It intelligently routes calls to the correct strategy implementation based on the symbol and strategy name.  It optimizes performance by caching these strategy instances, avoiding unnecessary re-creation.

Before any operations, it ensures the strategy is initialized. The service supports both live trading (`tick()`) and backtesting (`backtest()`) scenarios.

It provides methods to retrieve various details about active positions, such as pending signals, total holdings, cost basis, entry prices, partial closes, and scheduled signals. This information is crucial for monitoring and understanding strategy behavior.  You can also check the strategy's paused and stopped status and control these states.

The service offers methods for adjusting positions, including partial profit/loss closures and trailing stops/takes, as well as functions to activate or cancel scheduled signals.  It also allows manipulating signals and validates operations before execution. Finally, it provides a way to clear cached strategies. This centralizes strategy logic and improves efficiency.

## Class StorageLiveAdapter

The `StorageLiveAdapter` provides a flexible way to manage how your trading signals are stored, allowing you to easily switch between different storage methods. It acts as a middleman, letting you plug in various storage solutions like persistent disk storage, in-memory storage, or even a dummy adapter for testing.

You can choose which storage method to use by calling functions like `usePersist`, `useMemory`, or `useDummy`, and the adapter will handle the actual saving and retrieval of signal data. The adapter keeps a cached version of the storage utils to improve performance, and it's important to clear this cache using `clear()` when the underlying environment changes.

The adapter also provides methods for handling different signal events (opened, closed, scheduled, cancelled) and for finding signals by ID or listing all signals. Finally, it includes mechanisms for handling ping events which updates the timestamp of currently open and scheduled signals.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` acts as a central hub for managing how trading signals are stored during a backtest. It allows you to easily switch between different storage methods—like keeping data in memory, saving it to a file, or using a "dummy" adapter that doesn’t actually store anything.

Think of it as a flexible system: you can change how signals are saved without altering the core backtest logic. It defaults to storing signals persistently, but you can quickly swap to in-memory storage for testing or a dummy adapter for simulating a scenario without any data persistence.

The adapter handles various events like signals being opened, closed, scheduled, or cancelled, forwarding these actions to the currently active storage backend. It provides methods to retrieve signals by ID or list them all, and it also manages update timestamps based on "ping" events.

You can dynamically change the storage adapter used by the framework with methods like `usePersist()`, `useMemory()`, and `useDummy()`. Importantly, the `clear()` method is useful when running multiple backtest iterations where the working directory might change, ensuring a fresh storage setup.

## Class StorageAdapter

The StorageAdapter is the central component for handling both historical (backtest) and current (live) trading signals. It automatically keeps track of new signals as they arrive, ensuring that they're stored correctly.

You can turn the storage system on and off; once enabled, it subscribes to the signal sources just once and then maintains that connection.  Disabling it will safely remove the subscriptions, even if you call it multiple times.

Need to retrieve a specific signal? The `findSignalById` method lets you search for a signal based on its unique identifier. If you want to view all the signals recorded from your backtesting runs, `listSignalBacktest` is the way to go.  Similarly, `listSignalLive` shows you all the signals currently being tracked.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage the state of your trading strategies, allowing you to easily swap out different storage methods. It's designed to keep track of important information like the peak performance and duration of open trades, crucial for rules like those driven by LLMs.

You can choose how this state is stored – in memory for quick access, on disk for persistence across restarts, or even use a dummy adapter for testing. The adapter uses a factory to create state instances and provides methods to read and update them.

The `disposeSignal` function cleans up memory associated with a signal when it’s finished.  `useLocal`, `usePersist`, and `useDummy` provide shortcuts for selecting different storage backends. Finally, `clear` helps ensure the adapter uses fresh data when your program's working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage and store state information during backtesting. It’s designed to be adaptable, allowing you to easily switch between different storage methods like in-memory storage, persistent file storage, or even a dummy adapter that simply ignores data.

Think of it as a central hub for tracking things like peak performance and how long a trade has been open. This is particularly useful for sophisticated trading rules, like those driven by LLMs, where you want to automatically exit positions if they aren't performing as expected.

You can quickly change how the state is stored by using convenient functions like `useLocal`, `usePersist`, `useDummy`, or `useStateAdapter`. To ensure data consistency, it provides methods for disposing of old state data (`disposeSignal`) and clearing the entire cache (`clear`). The `getState` and `setState` functions handle reading and updating the state itself. When you need to swap to a different storage backend, these functions provide the easy switching mechanisms.

## Class State

The `State` class helps you manage and track data related to individual trading signals. Think of it as a place to store and update information specific to a trade, like the highest percentage reached during a trade’s lifetime.

You create a `State` instance, giving it a name and some initial data. This initial data acts as a starting point—it's what you get if no data exists yet. Whenever you want to update this data, you use the `setState` method inside your trading strategy.

To avoid looking into the future or using old information, the `State` class ensures that you can only access or modify data at or after the timestamp when it was originally created. The `enable` method is critical; it ensures that the state is correctly connected to the signal’s lifecycle and prevents lingering memory issues. Disabling state storage is also possible using `disable`. 

Importantly, you don’t need to pass any context information when reading or writing state – the system handles finding the right information automatically. The state management is specifically designed for use within your trading strategy's logic, and can't be directly used elsewhere.


## Class SizingValidationService

The SizingValidationService helps you keep track of and verify your position sizing setups. It acts as a central place to register your different sizing strategies, ensuring they're available when you need them. 

You can use `addSizing` to register new sizing approaches.  

Before you try to use a sizing strategy, `validate` checks to confirm it exists.  The service also remembers the results of these validations to speed things up.

Finally, `list` gives you a complete overview of all the sizing strategies you've registered.


## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas in a safe and organized way. It uses a special storage system that ensures the schemas are of the correct type.

You add new sizing schemas using `register` and find them later by name with `get`. If a sizing schema already exists, you can update it using `override` to make changes without replacing the entire schema.

Before a sizing schema is added, `validateShallow` checks to make sure it has all the necessary pieces and that they are the right type. This helps prevent errors later on. The service also uses a logger to track what's happening and make debugging easier.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade. It acts as a central point for sizing calculations, pulling in information from other services to make those decisions. 

Think of it as a behind-the-scenes worker, handling the math involved in deciding your position size. It uses a connection service to get the necessary data and a validation service to ensure everything is correct.

The `calculate` method is the main function – it takes parameters about the trade (like risk tolerance) and returns the calculated position size. This service is used both internally by the trading framework and to power some of the public-facing tools.

## Class SizingConnectionService

The SizingConnectionService acts as a central point for handling sizing calculations within the backtest-kit framework. It intelligently directs sizing requests to the correct sizing implementation based on a provided name.

This service utilizes a clever caching mechanism, ensuring that sizing implementations are only created once, boosting efficiency.

You can think of it as a dispatcher, routing your sizing requests (like fixed-percentage, Kelly Criterion, or ATR-based sizing) to the specific calculation method you need.

The `getSizing` property provides access to this routing and caching. 

The `calculate` function performs the actual size calculation, taking into account risk parameters and the selected sizing method. If you don't have any specific sizing configurations, the sizing name will be an empty string.

## Class SessionLiveAdapter

This component allows you to manage and store data during live trading sessions in a flexible way. It acts as a central point for accessing and updating session information, offering different storage options to suit your needs.

You can choose between several ways to store your data: keeping it only in memory for speed, persisting it to a file on your disk, or using a dummy adapter that effectively ignores any data changes. The system automatically remembers which adapter you're using based on the symbol, strategy, exchange, and timeframe.

Switching between these storage methods is easy with convenience functions like `useLocal()`, `usePersist()`, and `useDummy()`, providing a simple way to control where your session data is kept. If you need even more customization, you can even plug in your own adapter implementation. 

The `clear()` function helps ensure that your session data stays up-to-date, particularly if your working directory changes during the trading process. It essentially refreshes the memory of which adapters are being used.

## Class SessionBacktestAdapter

The SessionBacktestAdapter helps manage and store data during backtesting, offering flexibility in how that data is handled. It acts as a middleman, allowing you to easily swap out different ways of storing session information without changing the core backtesting logic.

By default, it uses an in-memory storage, keeping everything in the process’s memory. However, you can switch to persistent storage, saving data to disk, or a dummy adapter that simply ignores all data changes. 

The adapter intelligently caches these storage methods, making lookups and updates efficient.  You can change the storage method using convenient functions like `useLocal`, `usePersist`, `useDummy`, or even plug in your own custom storage solution.  It’s also important to clear the cache (`clear`) if your working directory changes to ensure fresh storage instances are created. The `getData` and `setData` methods provide a straightforward way to retrieve and update the session values associated with a specific symbol, strategy, exchange, and timeframe.

## Class SessionAdapter

The SessionAdapter acts as a central point for managing how your trading data is stored, whether you're running a historical backtest or a live trading session. It intelligently directs data read and write operations to either the backtest storage or the live trading storage based on whether you're in a backtest mode. 

Think of it as a traffic controller for your session data.

You can use `getData` to retrieve stored values for a particular signal, specifying the symbol, context (strategy, exchange, frame), whether it's a backtest, and a timestamp.  Similarly, `setData` lets you update those values, again directing the operation to the correct storage based on the backtest flag. This simplifies your code and ensures data is handled appropriately in either scenario.


## Class ScheduleUtils

This class helps you monitor and report on how your trading strategies are performing with scheduled signals. Think of it as a tool for keeping tabs on the signals your strategies are generating, particularly when dealing with delays or cancellations.

It provides methods to retrieve data about scheduled signals for a specific symbol and strategy, giving you insights into cancellation rates and how long signals are waiting.

You can also easily create markdown reports summarizing these scheduled signal events, or save those reports directly to a file. 

This functionality is designed to be straightforward to use, providing a single, accessible instance for tracking and reporting.


## Class ScheduleReportService

This service keeps track of when signals are scheduled, and when they’re opened or cancelled, storing that information in a database. It’s designed to help you understand how long signals take to execute or get cancelled.

It listens for signal events and calculates how much time passes between when a signal is scheduled and when it’s either executed or cancelled. The service then writes this data to a database, allowing you to monitor and analyze signal performance. 

You can tell it to start listening for signals, and it will send you updates as those signals change status. Importantly, it only allows one subscription at a time to prevent duplicate data. When you’re finished, you can tell it to stop listening.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your trading signals and generate reports about them. It automatically monitors scheduled and cancelled signals, organizing them by strategy. 

It builds markdown tables that summarize detailed event information, and also calculates useful statistics like the cancellation rate and average wait times. These reports are saved as `.md` files in a dedicated log directory for easy review.

You can subscribe to receive these updates, and unsubscribe when you no longer need them. The service offers methods to retrieve accumulated data, generate reports, and clear the stored information. It's designed to keep your signal scheduling organized and provide insights into your trading strategies. It also handles storage smartly, ensuring data related to different symbols and strategies are kept separate.

## Class RiskValidationService

This service helps you keep track of and verify your risk management settings. Think of it as a central place to register your risk profiles and make sure they're available before you try to use them. 

It’s designed to be efficient, remembering the results of previous checks to avoid unnecessary work.

Here's what you can do with it:

*   Register new risk profiles using `addRisk`.
*   Double-check if a risk profile exists before using it with `validate`.
*   See a complete list of all registered profiles using `list`.

The service also keeps a record of all your risk profiles and uses a logging service to help with debugging. It also uses a private map to store the risk profiles internally.

## Class RiskUtils

This class helps you analyze and report on risk rejection events within your trading system. Think of it as a tool for digging into why trades were rejected and understanding patterns. It gathers data collected by another component, the RiskMarkdownService, which tracks these rejection events.

You can use it to get statistical summaries of rejections – like how many occurred, broken down by symbol and trading strategy.  It also creates nicely formatted markdown reports detailing each rejection event, including key information such as the symbol, strategy, position, price, and the reason for rejection.

Finally, you can automatically save these reports to files on your disk, making it easier to review and share your risk rejection data.  The reports are named in a clear way (e.g., "BTCUSDT_my-strategy.md") so you can easily identify them.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a safe and organized way. It uses a special storage system to make sure your schemas are always the correct type. 

You can add new risk schemas using the `addRisk()` method (though it's technically called `register()`), and then find them later by their name using `get()`. If you need to make small changes to an existing schema, the `override()` method lets you update just the parts you need.

Before adding a new schema, `validateShallow()` checks to make sure it has all the necessary parts and that they’re the right types. The `loggerService` helps you keep an eye on what's happening with the service. The `_registry` is the internal storage that holds all the schemas.

## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system rejects trading signals. It's designed to catch those rejection events and store them in a database, usually an SQLite database, for later review and analysis.

Think of it as an auditor for your trading system – it notes down every time a signal is blocked and why.

You can use it to track rejected signals, including the reason for the rejection and the specifics of the signal that was pending.

To get started, you'll subscribe to the risk rejection events – this tells the service to start listening.  Make sure you remember to unsubscribe when you no longer need it to prevent unnecessary database logging.  The subscribe method gives you a function to do just that, ensuring you don't accidentally subscribe multiple times.

The service also has a logger to help with debugging and understanding how it's working.


## Class RiskMarkdownService

This service helps you create reports detailing rejected trades due to risk management rules. It listens for these rejection events and organizes them, creating clear summaries. 

The service keeps track of rejections for each symbol and trading strategy. It then generates easy-to-read markdown tables filled with detailed information about each rejected trade.

You can request overall statistics like the total number of rejections and breakdowns by symbol or strategy. These reports are saved as markdown files, making them simple to view and share.

The service has a clever storage system, ensuring that data for each symbol, strategy, exchange, timeframe, and backtest is kept separate.

You can subscribe to receive rejection events, unsubscribe when you no longer need them, and clear out accumulated data when it’s no longer needed. The `getData`, `getReport`, and `dump` methods offer ways to retrieve, generate, and save these rejection reports.

## Class RiskGlobalService

RiskGlobalService handles risk-related operations and validations within the backtest-kit framework. It acts as a central point for managing risk limits, working closely with services like RiskConnectionService to ensure these limits are properly checked.

The service offers several key functions: validating risk configurations to prevent errors, and checking whether a trading signal should be executed based on defined risk parameters. There's also a concurrency-safe version of the signal check that reserves resources to prevent conflicting signals.

For when a signal is approved, RiskGlobalService provides methods to register the signal as open and subsequently remove it when closed. Finally, it includes a function to clear all or specific risk data, providing a way to reset the risk management system. It logs activity related to these processes, which can be useful for debugging or auditing purposes.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently connects your risk assessment requests to the correct risk management implementation, ensuring that the right rules are applied based on the specific risk profile you're using.

Think of it as a dispatcher – when you need to check if a trade is allowed based on risk limits, this service directs the request to the appropriate risk checker. To improve performance, it remembers ("memoizes") previously used risk checkers, so it doesn't have to recreate them every time.

The service is designed to work with strategies that have different risk configurations. It allows you to specify which risk rules to apply for each trade using a "riskName" parameter.

Several methods are available for interacting with the risk management system. `checkSignal` validates if a trade is permissible, `checkSignalAndReserve` provides a concurrency-safe alternative, `addSignal` registers opened trades, and `removeSignal` clears closed trades. Finally, `clear` allows you to manually flush the cached risk checkers when needed, essentially forcing it to recreate them.


## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage and store data related to your trading backtests and live trading sessions. Think of it as a flexible system for capturing events and analytics.

It uses a design that lets you easily swap out how the data is stored – for example, switching between storing data in JSONL files or using a different storage method entirely. It's designed to be efficient, keeping track of a single storage instance for each type of report (like backtest results, live trading data, or walker data).

The `ReportFactory` defines how those storage instances are created, and you can change it using `useReportAdapter()`.

`getReportStorage` is how it remembers and reuses these storage instances.

The `writeData` method is how you actually send data to the storage; it also sets up the storage if it’s the first time you’re writing data for a specific report type.

You can control the adapter’s behavior using methods like `useReportAdapter()` to change the storage method, `clear()` to reset the storage, `useDummy()` to temporarily disable storage, and `useJsonl()` to switch back to the default JSONL storage.

## Class ReportUtils

ReportUtils helps you control which parts of your trading system generate detailed reports, specifically in JSONL format. You can think of it as a way to turn on or off logging for different areas like backtesting, live trading, or performance analysis.

The `enable` function lets you choose which reporting services to activate, setting them up to constantly log data to files. It's important to remember that `enable` gives you a function to call later that will *stop* those reports – always use that to clean up and avoid memory issues.

The `disable` function allows you to stop reporting for specific areas without affecting others. This is useful for targeted debugging or reducing the amount of data being collected. Unlike `enable`, `disable` doesn’t require a separate function to stop it – it's done immediately.






## Class ReportBase

The `ReportBase` class provides a way to write event data to files in a JSONL format, designed specifically for backtesting and analysis. It handles the creation of directories and files, and ensures that writing operations are reliable even under pressure. You can think of it as a system for automatically recording key events during a backtest, allowing you to examine them later.

Each report type gets its own file, and data is written as individual lines within that file. The system includes built-in protection against write timeouts and handles errors gracefully. 

You can easily filter these recorded events based on properties like the trading symbol, strategy name, exchange, timeframe, signal ID, or walker name. The class handles initialization once and ensures that writes are performed safely and efficiently. Essentially, it takes care of the tedious parts of data logging so you can focus on analyzing your trading strategies.

## Class ReportAdapter

The ReportAdapter helps you manage where your trading data and analytics are stored, and makes it easy to switch between different storage methods. It’s designed to be flexible, allowing you to plug in different storage solutions without changing your core code.

Think of it as a central point for handling report data. It keeps track of these storage locations and ensures only one is active at a time.

You can swap out the default JSONL storage for something else, or even use a "dummy" adapter that simply throws away data – useful for testing or situations where you don't want to persistently save anything.

The adapter also remembers which storage method you're using, preventing it from constantly recreating those storage locations. If your working directory changes, you'll need to clear the cache to ensure things are initialized correctly with the new path. It automatically logs data in a structured way, allowing for easier analysis and debugging.

## Class ReflectUtils

This class provides a way to check the performance of your trading strategies in both live and backtesting environments. It offers a set of methods to retrieve key metrics like profit and loss (PnL), peak profit, and drawdown information for active positions.

Think of it as a reporting tool that gives you insights into how a trade is performing – how much profit it has made, how much it lost, and how long it's been running.

Here's a breakdown of what you can do with it:

*   **Get PnL Information:**  You can query the unrealized PnL as a percentage or in dollar terms.
*   **Track Performance:** Get the highest profit price, when that price was reached, and the associated PnL.
*   **Understand Drawdown:**  Find out the worst loss price, when it occurred, and related PnL values.
*   **Measure Time:** Determine how long a position has been active, how long it's been waiting for activation, or how long it's been in a drawdown.
*   **Calculate Distances:**  See the difference between the current price and the highest profit or worst drawdown.
*   **Single Instance:** This class is designed to be used consistently throughout your system, as it's a singleton.

It's important to note that most of these methods require a pending signal to exist and will throw an error if one isn’t found. They all accept parameters to specify the strategy, exchange, and frame involved, and a `backtest` flag to indicate if the query should use backtest data.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recently generated trading signals, offering flexibility in how that data is stored. It's designed to be adaptable, letting you choose between storing signals persistently on disk or keeping them temporarily in memory.

This adapter uses a factory pattern, making it easy to swap out different storage implementations. By default, it uses persistent storage, but you can switch to memory-only storage if needed.

It provides convenient methods to switch between persistent and memory-based storage, and a way to clear the cached storage instance when the working directory changes. You can retrieve the most recent signal, calculate how long ago it was created, or handle active ping events, all while the underlying storage manages the details. The adapter takes care of constructing and caching the storage utility instance for efficiency.

## Class RecentBacktestAdapter

This component acts as a central point for managing how recent trading signals are stored and retrieved. It's designed to be flexible, allowing you to easily switch between storing signals in memory or persistently on disk.

The `RecentBacktestAdapter` manages the actual storage, using either an in-memory solution or a disk-based one. It simplifies working with these storage options by providing a consistent interface. 

You can easily swap out the storage method by using `usePersist()` to use persistent storage or `useMemory()` to revert to in-memory storage.  The `clear()` method is especially important when your project’s working directory changes, ensuring you get a fresh storage setup each time. It handles requests to get the latest signal and calculate the time since creation, delegating these tasks to the currently configured storage backend.

## Class RecentAdapter

The RecentAdapter is the central component for managing and accessing recent trading signals, used both during backtesting and in live trading environments. It automatically keeps track of the latest signals by subscribing to updates.

You can easily retrieve the most recent signal for a specific trading context, and it prioritizes signals from backtest data before live data. To prevent look-ahead bias, signals that occurred too far in the future won't be considered.

It’s designed to be reliable and prevent duplicate subscriptions. If you need to stop the signal tracking, a simple disable function handles that safely, even if called multiple times.

You can check if any signals exist for a given context before attempting to retrieve details like the time since the last signal, avoiding potential errors when dealing with new or empty trading histories. This adapter helps ensure a smooth and accurate workflow for signal-driven trading.

## Class PriceMetaService

PriceMetaService acts like a central price tracker for your trading strategies, keeping tabs on the latest market prices. It remembers these prices for each symbol, strategy, exchange, frame, and backtest combination, updating them automatically with each tick. 

This service is particularly useful when you need to know the current price outside of the regular trading cycle, for example, when executing commands between ticks.

If a price isn't immediately available, it'll wait a short time to see if it arrives, and if you're already in the middle of a trade execution, it'll use the live exchange price instead of relying on the cached value. 

You can clear the stored prices to make sure you're working with fresh data, either for all strategies or just a specific one. Essentially, it helps ensure you have accurate price information whenever and wherever you need it within your trading framework.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, based on different sizing strategies. Think of it as a toolkit to help you figure out your position size.

It includes several methods, each representing a distinct approach to sizing, like fixed percentage, Kelly Criterion, and ATR-based calculations. 

Each sizing method comes with built-in checks to ensure the inputs are suitable for the chosen strategy, reducing the chance of errors. The calculations consider factors like your account balance, the asset's price, and other relevant data points.


## Class Position

The Position class provides helpful tools for figuring out where to set your take profit and stop loss levels when you're trading. It handles the direction of your trade – whether you're buying (long) or selling (short) – automatically.

It offers two main ways to calculate these levels:

*   **moonbag:**  This method uses a simple strategy where your take profit is set at a fixed percentage above your purchase price.
*   **bracket:** This gives you more control, allowing you to define both your take profit and stop loss as percentages based on the current price. 

Essentially, the Position class simplifies the process of planning and setting these important trade parameters.

## Class PersistStrategyUtils

This utility class helps manage how strategy information is saved and retrieved, especially when dealing with situations where data needs to be temporarily stored before being finalized. It ensures that each strategy gets its own dedicated storage space, and allows for different storage methods to be used, like files or even a dummy option for testing. The system keeps track of these storage locations, so creating them is fast and efficient.

It's particularly important for strategies that need to handle actions like committing orders or managing signals, as it ensures these actions are saved reliably.

Here’s a breakdown of its key features:

*   **Custom Storage Options:** You can choose how strategy data is persisted – by default, it uses file-based storage, but you can switch to a custom method or even a dummy one for testing.
*   **Efficient Storage:**  It avoids creating unnecessary storage instances by remembering which ones have already been created.
*   **Safe Data Handling:** It’s designed to handle situations where things go wrong, ensuring data isn’t lost.
*   **Clearing Cache:** You can clear the stored information when the working directory changes.



The `readStrategyData` method gets the saved data, and `writeStrategyData` saves new data or clears existing data. The `usePersistStrategyAdapter` function lets you change the storage method, while `useJson` and `useDummy` provide default and testing options respectively.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategy to a file. It's designed to be reliable, even if your program crashes unexpectedly. 

The class takes the trading symbol, strategy name, and exchange name during its setup. 

It automatically handles the details of writing data to a file safely, preventing data loss.

Here's what you can do with it:

*   **Initialization:** The `waitForInit` method ensures the storage is ready.
*   **Loading Strategy Data:** The `readStrategyData` method retrieves the previously saved state of your strategy. If no state exists, it returns nothing.
*   **Saving Strategy Data:** The `writeStrategyData` method stores the current state of your strategy. You can also clear the stored data by passing null.

Essentially, this class provides a simple way to make your strategy's progress persistent across program restarts.


## Class PersistStorageUtils

This class helps manage how signals are stored persistently, ensuring their state is saved and can be recovered. It's particularly useful in backtesting scenarios where you need to load and save signal data.

It handles creating storage instances and provides ways to customize how these instances are created, allowing you to plug in your own storage solutions.

The class remembers which storage instance is being used for different modes like 'backtest' or 'live', so you don't have to recreate them.

You can read all the saved signals for a specific mode, or write a collection of signals to persistent storage. 

If the underlying storage location changes, you can clear the class's memory to force it to re-establish the storage connection. There's also a way to use a default file-based storage or switch to a dummy storage for testing purposes where no actual saving happens.

## Class PersistStorageInstance

This class provides a way to save and load trading signals using files. It's designed to be reliable even if there are unexpected interruptions during the saving process. 

Each trading signal is stored in its own JSON file, making it easy to manage and identify specific signals. 

The `backtest` property indicates whether this instance is running in a backtesting environment. 

The `waitForInit` method ensures the storage is ready before you start reading or writing data.

`readStorageData` retrieves all the stored signals by checking through all the files. 

`writeStorageData` handles saving signals, creating a new file for each one and using its ID as the file's name.

## Class PersistStateUtils

This class helps manage and save your strategy's state, ensuring it can recover even if there's a crash. It keeps track of state data for each signal and bucket combination, storing it in JSON files.

It uses a clever system to only create a storage instance once for each signal and bucket, improving performance. You can even plug in your own custom storage methods if you need something beyond the standard JSON file storage.

To help with situations where you might be testing or debugging, there are options to switch to a dummy mode where no state is actually saved and a way to clear out the storage to ensure fresh starts. You can also set up specific adapters for creating these state instances. Finally, the framework handles cleanup by disposing of storage entries when signals are no longer needed.

## Class PersistStateInstance

This class provides a way to save and load state information for your trading strategies, using files to store the data. It essentially acts as a manager, handling the details of writing and reading data from a file based on a unique identifier.

Think of it as a safe place to store your strategy's memory, letting it remember important details between runs.

The class uses a `signalId` and a `bucketName` to organize the stored data, associating them with specific signals.

Initializing the storage is done via `waitForInit`.

Retrieving stored state uses `readStateData` and saving state uses `writeStateData`.

Finally, `dispose` doesn't actually do anything itself - it relies on a separate utility function to clean up any related cached data.

## Class PersistSignalUtils

This class helps manage how signal data is saved and retrieved, especially for trading strategies. It makes sure each strategy's signals are stored reliably and individually, so you don't have to worry about conflicts.

It utilizes a clever system to create these storage instances automatically for each trading strategy, symbol, and exchange combination. 

You have flexibility to customize how these signals are saved—you can plug in your own storage methods.

The class handles reading and writing of signal data, ensuring that the process is consistent and doesn’t lose information. 

If you need to change the storage mechanism, there are functions that allow you to easily switch between different adapters, like a file-based one or a dummy one for testing.

It also includes methods to clear the cached storage instances, which is important if your working directory changes during the strategy execution.

## Class PersistSignalInstance

This class helps you save and retrieve signal data persistently, like keeping track of what a trading strategy has learned over time. It essentially acts as a reliable file system wrapper, ensuring your data is stored safely and consistently. 

Each instance is tied to a specific trading symbol, strategy name, and exchange, creating a unique identifier for where the data should be saved. The class handles the underlying file storage, and provides a way to wait for the storage to be fully ready. 

You can use it to load previously saved signal data using `readSignalData` or to store new signal data (or clear existing data) using `writeSignalData`. It is designed to be robust, even in situations where your program might crash unexpectedly.

## Class PersistSessionUtils

This class helps manage how your trading sessions are saved and loaded, ensuring your progress isn't lost. Think of it as a safe-keeping system for your trading data.

It intelligently caches session data, so it doesn’t have to reload everything every time. It’s organized based on the strategy, exchange, and specific part of your trading system (frame) you’re using.

You can customize how this data is stored, choosing between a standard file-based system or providing your own storage method. The system handles writing and reading data safely and efficiently.

It has tools to initialize the storage, clear out old data, and even simulate storage (useful for testing). The `waitForInit` function makes sure everything is set up correctly.

If you’re switching to a new storage method or want to refresh the cached data, you can clear the cache.  You also have the ability to clean up individual session data when it’s no longer needed.

## Class PersistSessionInstance

This class provides a way to save and load session data, specifically designed for trading strategies. It acts as a middleman, using files to store information related to a particular strategy, exchange, and symbol. Each trading strategy's data is kept separate, identified by its name, the exchange it's running on, and a unique frame name. 

Think of it as a way to remember where you left off with a trading strategy – like pausing a game and being able to resume later exactly where you were.

It handles writing and reading this data to files, and because it uses a structured approach, ensures different trading strategies don’t interfere with each other’s saved information. The class doesn’t handle the actual cleanup of temporary files; that's taken care of by a separate utility function.


## Class PersistScheduleUtils

This class helps keep track of scheduled signals – those automated actions a strategy takes at specific times – and makes sure they're saved correctly. It’s designed to work seamlessly with ClientStrategy when it's running in live mode.

Think of it as a smart system that automatically manages where and how these signals are stored, creating a specific storage location for each strategy, symbol, and exchange combination. 

It’s built to be reliable, ensuring that even if something goes wrong, your scheduled signals aren't lost. You can even customize how these signals are stored by providing your own storage solution.

Here’s a breakdown of its key parts:

*   **`PersistScheduleInstanceCtor`**: This defines what kind of storage system is used.
*   **`getScheduleStorage`**: This automatically creates the correct storage for each strategy.
*   **`readScheduleData`**: Retrieves the stored signal information.
*   **`writeScheduleData`**: Saves the signal information.

You have options for how to configure this, including using the default file-based storage, a dummy storage for testing (where nothing is actually saved), or a completely custom storage solution. The `clear()` function is useful when the environment changes between strategy runs.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, provides a way to reliably store and retrieve scheduled trading signals. It's designed to be a concrete implementation of a more general interface, ensuring your trading system remembers its schedule even if things go wrong. Think of it as a safe keeper for your trading plan.

It uses a file to persistently store the schedule, employing safeguards to prevent data corruption. The schedule is identified by a unique combination of the symbol, strategy name, and exchange name.

Here's a quick rundown of what you can do with it:

*   You initialize it with the symbol, strategy, and exchange it manages.
*   It helps get the storage ready.
*   `readScheduleData` lets you pull out the currently stored scheduled signal.
*   `writeScheduleData` allows you to update the stored signal, or clear it entirely if needed.



Essentially, this class gives you a dependable method for maintaining and restoring your schedule information.

## Class PersistRiskUtils

This class helps manage how your trading positions are saved and retrieved, ensuring your data is reliable even if things go wrong. It keeps track of different risk profiles and uses a special system to make sure each profile gets its own storage instance.

It allows you to customize how this storage works by providing different constructors – you can use a standard file-based approach, or even a "dummy" version for testing where nothing is actually saved.

The `readPositionData` method lets you load the saved position information for a specific risk profile and exchange, while `writePositionData` allows you to save new or updated position data.  These operations are handled carefully to minimize the risk of data loss.

If you need to change how the data is stored – for example, if your working directory changes – you can clear the existing storage cache to force a refresh. The `usePersistRiskAdapter` method gives you control over the specific type of storage used.

## Class PersistRiskInstance

This class provides a way to store and retrieve position data persistently, acting as a reliable layer for your trading strategies. It's designed to safely handle saving and loading data related to risk management. 

Think of it as a file-based system that automatically keeps track of your positions, ensuring that even if things go wrong, your data is preserved.

The class uses a specific identifier ("positions") to organize the data it stores, which helps keep everything consistent. You can initialize the storage using `waitForInit`. To get the existing position data, use `readPositionData` specifying when the data was recorded. When updating the position data, `writePositionData` is used, automatically saving the changes safely.


## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, making sure things run smoothly and reliably. It keeps track of these signals based on factors like the trading symbol, strategy, exchange, and timeframe. 

It’s designed to be efficient, using a system that avoids creating the same storage instances repeatedly for the same combination of factors. This approach reduces unnecessary overhead and keeps things fast.

You can customize how the signals are stored by plugging in your own storage methods. It handles reading and writing these signals, and makes sure that even if something crashes, the recent signal state remains safe. It also allows you to clear the stored data, which is useful in certain situations. You can easily switch between different storage options – a standard file-based system, a dummy version for testing, or something completely custom.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent trading signal data for a specific asset, strategy, exchange, and timeframe. It’s designed to work with file-based storage, ensuring the saving process is reliable.

The class keeps track of important details like the asset symbol, strategy name, exchange, timeframe (frameName), and whether it’s a backtest or live trading environment. 

It handles the complexities of writing data to a file safely and automatically manages how this data is stored, using a unique identifier based on the asset symbol.

You can use `waitForInit` to make sure the storage is ready before you try to read or write data. `readRecentData` allows you to retrieve the last saved signal, and `writeRecentData` lets you store a new signal, along with the time it occurred. 

Essentially, this component provides a convenient and robust way to keep a record of your most recent trading decisions.

## Class PersistPartialUtils

This class provides tools for safely saving and retrieving partial profit and loss information for your trading strategies. It’s designed to handle situations where a strategy might be paused or restarted, ensuring no data is lost.

The system intelligently manages storage for each trading symbol and strategy combination, creating a dedicated space for each.  You can customize how this data is stored by swapping in different storage "adapters," allowing for various persistence methods like using files or a simple dummy for testing.

The `readPartialData` and `writePartialData` functions handle accessing and updating this information, ensuring operations are reliable.  If a storage instance doesn't exist yet, it's automatically created when needed.

There's also a handy "clear" function to wipe the storage, which is particularly useful if your strategy’s working directory changes. Lastly, options are available to easily switch between a standard JSON-based storage and a dummy implementation for development.

## Class PersistPartialInstance

This class helps you save and load pieces of information related to your trading strategies, specifically when dealing with data that might not be complete. It’s designed to work with files, ensuring your data is safely stored and updated.

The class keeps track of the trading symbol, the name of your strategy, and the exchange you’re using. It uses a unique identifier (signalId) to organize the data and uses a special technique to make sure writes are reliable, even if something goes wrong during the process. 

The `waitForInit` method prepares the storage space for your data.  `readPartialData` lets you retrieve incomplete data using a specific signal identifier.  Finally, `writePartialData` allows you to save this partial data, again associating it with a signal identifier. It's like a safe place to store temporary results.


## Class PersistNotificationUtils

This class provides tools to manage how notification data is saved and retrieved, ensuring a reliable and consistent process. It handles the creation of storage mechanisms, making sure the right one is used depending on whether you're running a backtest or a live trading scenario.

It uses a clever system to remember which storage mechanism it’s currently using, so you don't have to worry about recreating them each time. You can even swap in your own custom storage method if you need something specific, and the class will remember that choice.

The class keeps notifications individually stored as files, identified by a unique ID. It's designed to be safe even if your program crashes unexpectedly, safeguarding your notification state. The `readNotificationData` and `writeNotificationData` functions allow you to get and save this data.

If your working directory changes, you might need to refresh the storage, and the `clear` function lets you do just that. The `useJson` and `useDummy` functions are shortcuts to switch to the standard file-based or a placeholder storage for testing respectively.

## Class PersistNotificationInstance

This component handles persisting notification data to files, ensuring your system remembers important information even if things go wrong. It's designed to be reliable, using atomic writes to prevent data corruption in case of crashes. 

Each notification gets its own file, making it easy to manage and locate specific data. When you need to retrieve notifications, it goes through each file individually. 

You can control whether this functionality is used in a backtesting scenario during its initialization. 

Internally, it uses a storage mechanism to handle the actual file operations. The `waitForInit` method prepares the storage, and `readNotificationData` retrieves all the stored notification information. Finally, `writeNotificationData` saves a collection of notifications, each identified by a unique ID.

## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, helps manage how data is saved and retrieved, particularly for crash-safe memory persistence within the backtest-kit. It's designed to make sure data is stored reliably and efficiently.

It uses a system of memoization, which means it creates and reuses storage instances based on a combination of signal and bucket names to avoid unnecessary work. You can even customize how memory instances are created by providing your own constructor.

The class offers several functions:

*   `waitForInit` sets up the storage for a given context.
*   You can read, check for the existence of, write, and soft-delete memory entries.
*   `clear` helps refresh the internal cache when certain environment changes occur.
*   `dispose` cleans up storage when a signal is no longer needed.

It also allows you to switch between different implementations for storing data, like using a default file-based system or a dummy version that doesn’t actually save anything.  The `listMemoryData` method allows for iteration over stored data, which is helpful for rebuilding indexes.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve memory data, acting as a default implementation for a more general interface. It uses files to keep your data safe, ensuring that information isn't lost when your application restarts.

It allows you to read, write, and delete memory entries, identified by a unique ID.  Deleted entries aren't actually removed from the file system, but are marked as deleted instead, which can be useful for certain scenarios. When you need to see all available memory data, it filters out the entries that have been marked as deleted.

The `waitForInit` method makes sure the underlying storage is ready before you start using it.  The `dispose` method doesn’t do anything directly, as the overall cleanup of resources is handled elsewhere.

## Class PersistMeasureUtils

This utility class helps manage how your trading strategies store and retrieve data from external sources, like APIs. Think of it as a way to remember API responses so you don't have to repeatedly fetch the same information.

It uses a clever system of caching, meaning it keeps track of data based on a combination of timestamps and symbols. You can even customize how this data is stored, choosing different adapters for flexibility.

The system handles writing, reading, and deleting data safely and reliably, even if your strategy encounters unexpected issues. 

Here's a bit more detail on what you can do:

*   **PersistMeasureInstanceCtor:** This allows you to change how the caching system actually functions.
*   **getMeasureStorage:** A factory for creating the cache instances.
*   **readMeasureData, writeMeasureData, removeMeasureData:** These are the core actions for interacting with the cached data.
*   **usePersistMeasureAdapter:** Lets you swap in different storage mechanisms for specific needs.
*   **listMeasureData:**  Provides a way to view all the stored data for a particular category.
*   **clear:**  Resets the caching system when you need to start fresh.
*   **useJson, useDummy:**  Convenient shortcuts to use a standard file-based cache or a "dummy" cache for testing.

## Class PersistMeasureInstance

This class provides a way to store and retrieve measure data to disk, acting as a persistent layer for your backtesting framework. It manages a specific "bucket" or folder where the data is saved.

The system handles file operations safely and allows for "soft deletes," where data isn't actually erased but marked as removed. You can think of it like archiving—the data remains available but isn’t actively used.

The `readMeasureData` method fetches a single data entry by its unique key, returning nothing if the entry is missing or marked as removed. `writeMeasureData` lets you save new data entries, and `removeMeasureData` performs the soft delete.

When you need a list of all available data, `listMeasureData` provides a sequence of keys for entries that haven't been marked as removed, allowing you to easily iterate and process only the active data.  The system also has an initialization method, `waitForInit`, which ensures the storage is ready before data operations are performed.

## Class PersistLogUtils

This class helps manage how your trading logs are saved and loaded, ensuring they are handled safely and reliably. It uses a cached version of the logging system to avoid unnecessary overhead.

You can customize how the logs are stored by providing your own logging adapter. This is useful if you need to change the underlying storage mechanism, or if you want to use a dummy logger for testing purposes.

The `readLogData` method retrieves all existing log entries, while `writeLogData` adds new entries; importantly, it avoids creating duplicates.

If you need to switch between different logging configurations, like using a file-based approach or a completely dummy setup, this class provides convenient methods for doing so. Clearing the cached instance is necessary when the working directory changes to make sure logs are correctly persisted.

## Class PersistLogInstance

This component handles storing trading data, specifically log entries, using files. It acts as a reliable way to keep track of what happened during a backtest or live trading session.

Each entry is saved as its own JSON file, making it easy to access individual pieces of information. Importantly, the system only *adds* new entries; it doesn't change or delete existing ones, ensuring data integrity.

The `waitForInit` method gets things started by preparing the underlying storage. `readLogData` retrieves all the logged entries by scanning through the files, and `writeLogData` adds new data while avoiding accidental overwrites—it’s designed to be crash-safe and keep your data protected.

## Class PersistIntervalUtils

This component manages how your backtest kit knows which intervals have already fired. It essentially keeps track of signals that have been processed.

Data is stored in a special directory, `./dump/data/interval/`, where each file represents a specific interval execution.

The presence of a file indicates the interval has already been processed; its absence suggests it hasn’t, or potentially returned null last time.

You can customize how these markers are stored using adapters, allowing you to switch between file-based storage, a JSON-based approach, or even a dummy implementation that doesn't actually persist anything.

The system uses a clever caching mechanism to avoid redundant work when dealing with multiple intervals.

You can clear this cache if your working directory changes during the backtesting process.

Functions are provided to read, write, and delete these interval markers, and to list all markers associated with a particular bucket.

## Class PersistIntervalInstance

This class provides a way to store and manage interval data, like marker positions, persistently on disk. It's designed to be a reliable way to keep track of where intervals should fire, even if your application restarts. 

It uses a file-based system to store this data, ensuring that it's saved safely. 

When you delete a marker, it's not actually erased; instead, a flag is set to indicate it's "soft-deleted". This allows you to effectively undo the deletion if needed, and prevents data loss. 

The `listIntervalData` method is smart; it only shows you markers that haven't been soft-deleted, so you don't have to worry about dealing with old or invalid data.

You can initialize the storage when needed using `waitForInit`.

You can read a specific marker’s details using `readIntervalData`, write new marker data with `writeIntervalData`, and “delete” a marker (soft delete) using `removeIntervalData`.

## Class PersistDictionaryUtils

This class helps you reliably store and retrieve dictionaries, which are essentially collections of data, used within your trading strategies. It's designed to make sure your dictionary data doesn't get lost, even if there are crashes or interruptions.

The system smartly manages these storage instances, creating one specifically for each signal and dictionary name combination. You can easily swap out how these dictionaries are stored, opting for a standard file-based approach or even a "dummy" adapter that does nothing for testing purposes. 

The class also handles the process of initializing storage, reading data back in, and writing updated data, all while ensuring things happen atomically to avoid errors. To keep things clean, it includes functions to clear the cache when needed, and to dispose of storage entries when they're no longer required. You can customize the way dictionaries are persisted by providing your own custom storage adapter, effectively replacing the default behavior.

## Class PersistDictionaryInstance

This class helps manage and store dictionary-like data persistently, typically to a file. It’s designed to be used with backtest-kit and ensures your data isn't lost. 

Think of it as a way to save and retrieve collections of information associated with a particular signal. 

When you create an instance, you'll need to provide a signal identifier and a name for the dictionary. 

The `waitForInit` method gets the storage ready, while `readDictionaryData` retrieves the data you previously saved, and `writeDictionaryData` stores new or updated data. Finally, `dispose` doesn't actually do anything directly, as cleanup is handled elsewhere.

## Class PersistCandleUtils

This class helps manage a persistent cache of historical candle data for trading strategies. It stores each candle as a separate JSON file, organized by exchange, symbol, time interval, and timestamp. 

The system checks if the cached data is still valid based on the expected number of files, and it automatically refreshes the cache when needed.

You can customize how the cache is implemented by swapping out the underlying storage mechanism, choosing between a default file-based system, a dummy version that doesn’t store anything, or providing your own custom solution. 

Essentially, it handles the nitty-gritty details of saving and retrieving candle data so your trading strategy can focus on analysis and decision-making. If your working directory changes, you'll need to clear the cache.


## Class PersistCandleInstance

This component handles saving and retrieving historical candle data, primarily for use in backtesting. It stores each candle as a separate JSON file, organized by its timestamp. When you need to retrieve data, it returns null if a timestamp is missing, signaling a need to fetch it from the original source.

To maintain a clean and consistent cache, writing new candle data is carefully managed: incomplete candles (those with a future close time) and candles that already exist are skipped. Any problematic or corrupted candles that are found during reads will trigger warnings, and are effectively treated as if they don't exist.

The component's constructor takes the symbol (e.g., stock ticker), candle interval (e.g., 1 minute, 1 hour), and the exchange name as input, defining the scope of the cached data.  It also includes properties for the symbol, interval, exchange name, and the underlying storage mechanism.

You can initialize the storage using the `waitForInit` method, and retrieve a range of candle data with `readCandlesData`, specifying the number of candles, the start timestamp, and an optional end timestamp.  Finally, the `writeCandlesData` method allows you to add candle data to the cache.

## Class PersistBreakevenUtils

This utility class helps manage and save the breakeven state of your trading strategies, ensuring consistency across sessions. It handles the behind-the-scenes work of reading and writing this data to files on your computer.

Think of it as a central place where your strategies remember important information about when and how they reached certain price points.

It intelligently creates and reuses these storage instances, so you don't have to worry about managing them directly. You can even customize how the data is stored—for example, you can switch to a "dummy" mode where nothing is actually saved to disk, which is useful for testing.

The data is organized in a clear file structure under a `breakeven` directory, with each strategy and symbol pair having its own dedicated file. This allows for easy organization and management of your trading data. To keep things simple, it remembers what PersistBreakevenInstance constructor to use, and lets you switch it if needed. If your working directory changes, you should clear the cache to ensure the utility is properly reinitialized.

## Class PersistBreakevenInstance

This class helps manage and store breakeven data, essentially acting as a persistent memory for your trading strategies. It's designed to be reliable, even if your application crashes unexpectedly.

It keeps track of data related to a specific trading symbol, strategy, and exchange. 

The core of its functionality involves reading and writing breakeven data, associating each piece of data with a unique signal identifier.

It initializes its storage and ensures that writing data happens safely, preventing data corruption. You'll use it to retrieve and save information about your breakeven points for different trading signals.


## Class PersistBase

PersistBase provides a foundation for reliably storing and retrieving data to files. It ensures data integrity by using atomic file operations, automatically checking for and repairing any corrupted files, and offering a way to iterate through stored data. The framework manages where these files are stored, determining the exact file path based on a unique identifier for each piece of data.

You can use this base class to easily store and load data like trading strategies or historical data.  It also helps in keeping things organized as it handles the creation of the necessary directories and validates existing data when initialized.  You can check if a particular piece of data exists, write new data, or get a list of all available data identifiers. The method `waitForInit` ensures that the storage location is properly set up and any issues with existing data are addressed right from the beginning.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategy take to execute. It works by listening for timing events and recording them, so you can later analyze where your strategy might be slow or inefficient.

Think of it as a detective for performance bottlenecks. It captures data about the duration of operations and related information and saves it.

You can tell this service to start paying attention to these timing events, and it will give you a way to stop listening when you're done.

It also makes sure you don't accidentally subscribe more than once, preventing problems.

The `loggerService` is used for displaying debugging information, and `track` is the core mechanism for logging the performance data.


## Class PerformanceMarkdownService

This service is designed to monitor and analyze the performance of your trading strategies. It listens for performance data, keeping track of metrics for each strategy you're running. It then calculates things like averages, minimums, maximums, and percentiles to give you a comprehensive view of how your strategies are doing. 

The service can automatically generate detailed reports in markdown format, highlighting areas where your strategies might be struggling. These reports, including bottleneck analyses, are saved to your logs directory.

You can subscribe to receive performance updates and unsubscribe when you no longer need them. There are methods to retrieve the collected data, get reports, and clear the accumulated performance information. To make the process manageable, each unique combination of symbol, strategy, exchange, frame, and backtest uses its own isolated storage.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It lets you gather and analyze performance data for specific symbols and strategies, giving you a detailed view of what's working well and where there might be bottlenecks. 

You can retrieve performance statistics, including averages, volatility, and percentile data to spot unusual behavior. 

The class can also automatically generate nicely formatted reports in markdown, making it easy to share your findings.

Finally, these reports can be saved directly to your hard drive, with the option to specify where to store them, so you can keep a record of your strategy’s evolution.


## Class PartialUtils

This class helps you analyze and report on partial profit and loss data, which is useful for understanding how your trading strategies are performing. Think of it as a tool for digging into the smaller, more frequent wins and losses that happen before a trade is fully closed.

It gathers data about these partial profit/loss events – things like when a profit or loss happened, what symbol it was related to, and what strategy was involved. This information is collected and stored, allowing you to generate reports and statistics.

You can use this to get a quick overview of the statistical data, produce formatted markdown reports showcasing the details of individual partial events (like the price, position, and timestamp), or even save those reports directly to files for later review. The reports include tables that list all the relevant details of each partial profit or loss, and provide a summary of overall performance. It’s all about getting deeper insights from the intermediate stages of your trades.


## Class PartialReportService

The PartialReportService helps you keep track of when your trades are partially closed out, either for a profit or a loss. It essentially logs these partial exits, noting the price and level at which they happened.

It works by listening for signals indicating partial profit or loss events. You need to tell it to start listening by subscribing, and it will then send you updates whenever a partial exit occurs.

You can stop it from listening by unsubscribing, which reverses the subscription process.

It utilizes a logger for any debugging output and has a built-in mechanism to prevent you from accidentally subscribing multiple times.


## Class PartialMarkdownService

This service helps you create and save reports detailing small profits and losses that happen during a trading simulation. It listens for these "partial" profit and loss events, keeps track of them for each symbol (like a stock ticker) and strategy (your trading rules). Then, it neatly organizes this information into readable markdown tables, along with summary statistics.

You can tell the service to listen for these events, and it will automatically keep track of everything. It also allows you to easily retrieve overall statistics or generate a full report of these smaller gains and losses. Finally, it provides a way to save these reports to your computer, so you can review them later. You can even clear all this data if you need to start fresh. The service keeps the data for each symbol and strategy separate, ensuring that information doesn't get mixed up.

## Class PartialGlobalService

This service acts as a central point for managing and tracking partial profits and losses within your trading strategy. It's designed to be injected into your strategy, making it easy to monitor and control these partial states.

Think of it as a middleman – it records important information about partial trades (like profits and losses) and then passes those details on to the connection service to handle the actual updates. This setup allows for consistent logging and a clear separation between your trading strategy and the underlying connection layer.

It provides several validation services to ensure the integrity of your strategy configurations and associated elements. 

You'll find methods to record and process profits, losses, and clears, all with centralized logging for easy monitoring and debugging. Essentially, it helps you keep track of partial trading outcomes in a structured and manageable way.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. Think of it as a central hub that keeps track of how much you've gained or lost on a trade before it’s fully resolved.

It creates a dedicated record – a `ClientPartial` – for each unique signal, ensuring that you're not mixing data from different trades. These records are cleverly cached, so it doesn't have to recreate them every time.

The service handles updating the profit, loss, and clearing of these records, ensuring that the information is accurate and consistent. It also makes sure these records are cleaned up when they are no longer needed, preventing unnecessary clutter.

Essentially, it’s a reliable system for handling the complexities of partial profit/loss tracking within your trading strategy.

## Class OrderTransientError

This `OrderTransientError` class is essentially a way to signal that an order-related issue is temporary and should be retried. It's not a special case for the framework itself; any unexpected error is treated as transient. Think of it as a clear way to express "this isn't a permanent problem, try again later."

When you encounter this error, it means the framework will automatically attempt to resend the order, but with a few important nuances depending on whether it's related to opening, closing, or checking the order. For example, when opening an order, the system will re-submit the order with the same identifier, and you need to confirm with the exchange that the prior order was successfully placed before retrying.

It's crucial to understand that a large number of these transient errors, indicating persistent issues, will lead to a fatal error and shut down the entire trading system. This distinguishes it from other error types that represent expected business outcomes.

The class includes utility functions like `isOrderTransientError` and `fromError` to help your application log and handle these errors consistently, even when dealing with different versions of the framework. During backtesting, these errors are not triggered, focusing the simulation on other aspects.

## Class OrderRejectedError

This error signals a definitive rejection of an order by the exchange—it's a situation where retrying won't work. You'll encounter it within the order processing channels, specifically when dealing with broker adapters or action handlers. When thrown, it immediately stops order attempts, preventing further retries and wiping out any existing retry attempts.

For open orders, the signal is dropped entirely, and for closing orders, the engine immediately initiates a forced closure, even bypassing retry loops. This isn't a fatal error; the system continues running, but it's a clear indication of a business-level problem, like insufficient liquidity or account restrictions.

It's crucial to only throw this error when the exchange explicitly communicates an unrecoverable business impossibility. Network issues should trigger a regular `Error` or `OrderTransientError` instead, allowing the framework's retry mechanisms to function.

Keep in mind that this error is specific to the order processing gates and shouldn’t be used in other check channels, as those are handled as transient errors. It's also identifiable by a unique runtime brand, making it robust across different module versions. It's only meaningful in live mode or tests that directly mock order synchronization.

## Class OrderDeletedError

The `OrderDeletedError` is a special error used within the trading framework to signal that an order has definitively been removed by the exchange – essentially, the exchange says it no longer exists. This isn't just a temporary communication issue; it means the order has been canceled by the user or some other external process.

You should only throw this error when performing order checks – things like confirming an active order or checking a scheduled order – and *never* during order placement or closing processes. When this error occurs, the framework immediately closes the position or cancels the scheduled order without further checks, treating it as a permanent state change. This is different from a temporary error which would trigger a retry.

Crucially, this error should *not* be thrown if an order simply hasn't filled or if there are network issues – those situations require a different error type. It's essential to use this error only when the exchange explicitly confirms the order’s deletion, as misuse can lead to unintended position closures. It operates as a distinct, unmodifiable error type that bypasses normal retry mechanisms.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading strategies, like when a signal is generated or an order is filled. Think of it as a central hub for all your notifications, allowing you to easily change *where* those notifications are sent – whether it's to a database, a simple memory store, or nowhere at all (for testing).

It uses a flexible design, so you can swap out different notification methods without altering your core trading logic.  You can easily switch between storing notifications in memory, persisting them to disk, or using a dummy adapter for testing purposes.

The `handle...` methods are how you send events – like signal confirmations, profit/loss updates, and order status changes – to your chosen notification backend. The `getInstance` property is automatically managed and refreshed when needed, ensuring your notifications are always using the correct configuration.  You can also manually clear the instance with `clear()` if your environment changes.

## Class NotificationHelperService

This service is designed to help manage and send out notifications related to trading signals. It's primarily used behind the scenes to ensure everything is working correctly and to broadcast important information about trading actions.

It performs validation checks on strategy, exchange, frame, risk, and action schemas, and it does this efficiently by remembering previously validated setups so it doesn't repeat the checks unnecessarily.

The `commitSignalNotify` function is the main way this service is used; it takes details about a signal, validates related components, and then sends out a notification to anyone who's listening for those updates. It handles all the complexity of preparing and sending the signal information, allowing other parts of the system to simply react to the notifications.

## Class NotificationBacktestAdapter

This component helps manage and send notifications during backtesting, offering flexibility in where and how those notifications are stored. It acts as a central point for sending various events like signals, profits, losses, order updates, and errors. You can easily switch between different notification methods: storing notifications in memory, persisting them to disk, or completely ignoring them (using a dummy adapter).

The system uses a factory pattern to easily change the notification backend without modifying the core backtest logic. 

To change notification behavior, use the `useDummy`, `useMemory`, or `usePersist` methods to select a different adapter. For more advanced customization, the `useNotificationAdapter` method allows you to provide your own custom notification adapter. If the working directory (`process.cwd()`) changes between strategy runs, remember to call `clear` to ensure the notification system uses the correct base path.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for handling notifications, both during backtesting and when live trading. It automatically receives and manages updates from various signals. 

You can easily access and retrieve all notifications, whether they're from backtest simulations or live trading sessions. 

To avoid redundant subscriptions, the system uses a 'singleshot' approach, ensuring each signal is subscribed to only once. 

When you're finished, the `dispose` function provides a clean way to remove all notifications and unsubscribe from signals, ensuring nothing is left running.


## Class MemoryLiveAdapter

This component provides a flexible way to manage trading memory during live execution. Think of it as a central storage for data related to your trades, allowing you to retrieve and analyze information as things happen.

It's designed to be adaptable, letting you easily swap out different storage methods – from storing everything in RAM for speed, to saving data to files for persistence across restarts, or even using a "dummy" adapter for testing.

You can use convenience functions to quickly change the storage backend. For example, `usePersist` saves data to files, while `useLocal` keeps everything in memory.

The adapter keeps track of these memory instances and cleans them up when signals are canceled.

There are also methods for writing, searching, listing, removing, and reading data from this memory, along with a `clear` function to reset the internal cache when needed, particularly when the working directory changes. This ensures your memory instances are correctly initialized with the new base path.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory for your backtesting processes. It acts as a central point for storing and retrieving data during backtests, allowing you to easily swap out different storage methods as needed.

By default, it uses an in-memory solution that's quick and convenient but doesn’t save data between runs. You can switch to a persistent storage option that saves data to files, or even a dummy adapter that simply ignores all writes for testing purposes.

The adapter keeps track of data using memoization, meaning it caches frequently accessed data to speed things up. To free up cached data for a specific signal, you can use the `disposeSignal` method.

You can interact with the memory using methods like `writeMemory` to store data, `searchMemory` for full-text searching, `listMemory` to view all entries, `removeMemory` to delete data, and `readMemory` to retrieve a single item.

If your working directory changes, be sure to call `clear` to refresh the memoized instances.

## Class MemoryAdapter

The MemoryAdapter acts as the central hub for managing memory storage, whether you're running a backtest or a live trading session. It automatically handles cleanup to avoid memory leaks when signals are finished.

You can control memory storage with `enable` and `disable` functions; `enable` sets up subscriptions to signal lifecycle events, and `disable` safely removes those subscriptions.

The adapter provides several functions to interact with memory: `writeMemory` lets you save data, `searchMemory` allows you to find data using a search query, `listMemory` retrieves all entries, `removeMemory` deletes specific entries, and `readMemory` fetches a single entry. Importantly, all these functions intelligently route the requests to either the backtest memory or live memory based on a flag.

## Class MaxDrawdownUtils

This class helps you understand and report on the maximum drawdown experienced by your trading strategies. Think of it as a tool to analyze the worst potential losses your strategies might face.

It provides a few key functions:

*   **`getData`**: This function lets you pull out the statistical data related to max drawdown for a specific trading symbol and strategy. You can specify whether it's a backtest or live data.

*   **`getReport`**:  It creates a nicely formatted markdown report summarizing all the max drawdown events for a given symbol and strategy.  You can choose which columns to include in the report.

*   **`dump`**: This function takes the same information and saves the markdown report directly to a file, which is useful for sharing or archiving your analysis. You can again choose which columns to display.

It's designed to work with data collected by another service – it doesn’t collect the data itself, but rather interprets what's already been gathered.

## Class MaxDrawdownReportService

The `MaxDrawdownReportService` is designed to track and record instances of maximum drawdown during a trading backtest. It monitors events related to maximum drawdown and saves these events to a JSONL database for later analysis.

To get it started, you’ll need to subscribe it to the `maxDrawdownSubject` to begin recording these events.  The service ensures that you don’t accidentally subscribe multiple times; the `subscribe` method will only set up the listener once.

When a new drawdown event is detected, the service creates a record containing details like the timestamp, symbol, strategy name, exchange, and the signal's properties – including open price, take profit, and stop loss levels.

If you want to stop the service from logging these records, you can use the `unsubscribe` method to detach it from the `maxDrawdownSubject`. This effectively pauses the logging process.

## Class MaxDrawdownMarkdownService

This service helps you create and save reports about maximum drawdown, which is a key measure of risk in trading. It listens for drawdown data and organizes it by symbol, strategy, exchange, and timeframe.

You can think of it as a collector and reporter for drawdown information.

Here's a breakdown of what it does:

*   **Subscription:** It connects to a stream of drawdown events. You need to subscribe to start receiving data. Don't worry about subscribing more than once—it handles that for you.  You can also unsubscribe to stop receiving data and clear the stored information.
*   **Data Retrieval:**  `getData()` lets you retrieve the accumulated drawdown statistics for a specific combination of symbol, strategy, exchange, timeframe, and whether it's a backtest.
*   **Report Generation:** `getReport()` creates a nicely formatted markdown report showing drawdown statistics.
*   **File Output:** `dump()`  generates the markdown report and saves it directly to a file on your system. You can specify the file path, or it will default to a standard location.
*   **Data Clearing:**  `clear()` allows you to erase the stored data.  You can clear everything at once or selectively clear data for a specific symbol/strategy/exchange/timeframe combination.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your backtest reports are saved. It provides a flexible way to choose different storage methods, like saving each report as a separate file, combining them into a single JSONL file, or even suppressing the output entirely. 

You can easily swap out the storage method using `useMd()`, `useJsonl()`, or `useDummy()`.  Behind the scenes, it efficiently manages these storage instances, making sure there's only one for each type of report (like backtest results or live trading data).

If you need to change the way Markdown is generated, you can adjust the constructor being used via `useMarkdownAdapter()`.  The `writeData()` method is responsible for actually writing the content, and it automatically creates the necessary storage if it doesn’t already exist. Finally, `clear()` can be useful if your working directory changes during testing, forcing a refresh of the storage.

## Class MarkdownUtils

This class provides tools to control the generation of markdown reports for different parts of the trading framework, like backtests or live trading. You can turn on or off the markdown reporting for specific areas, allowing for customized reporting. 

To start reporting in a particular area, you use the `enable` function, which sets up the necessary listeners and data collection.  Remember to clean up afterward using the unsubscribe function it returns to avoid memory problems.

If you just want to stop reporting in a certain area, use `disable`.  This immediately stops data collection and report generation for those areas.

Finally, `clear` lets you wipe the existing report data for specific areas while still keeping the reporting active – a way to reset the reporting without disabling it completely.

## Class MarkdownFolderBase

This adapter allows you to generate trading reports as individual markdown files, organized into directories. Each report is saved as its own `.md` file, making it easy to browse and review your results.

The adapter automatically creates the necessary directory structure based on the specified path and filename.

It's designed for situations where you want clearly organized, human-readable reports, rather than a single combined file. Think of it as the go-to choice for easy manual review of your backtest results.

The `waitForInit` method doesn't actually do anything; folder-based adapters don’t need initialization.

The `dump` method is how you actually create the reports; it takes the markdown content and writes it to a file, automatically determining the file's location using the provided options.


## Class MarkdownFileBase

The `MarkdownFileBase` class provides a way to generate markdown reports and store them in a structured JSONL format. Think of it as a central hub for your trading reports, ensuring they're consistently formatted and easily accessible for further analysis.

It writes each type of report (like trade details or performance summaries) to its own file, using a predictable naming convention. The class handles the technical details like creating directories, managing file writes, and dealing with potential errors.

You can filter these reports later based on criteria like symbol, strategy, or exchange – making it easy to focus on specific aspects of your trading activity.

The `waitForInit` method gets things started by setting up the file and stream, and you can call it as many times as needed to be sure it's ready. The `dump` method is how you actually add your markdown content, automatically including metadata like timestamps and search tags. Importantly, it includes safeguards to prevent write operations from taking too long and to manage write volume.

## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility to switch between different storage methods. It’s designed to be easily customized, allowing you to plug in your own storage solutions.

You can choose between a few options: the default stores each markdown dump as a separate file, or you can opt to append everything to a single JSONL file. There’s also a dummy mode that’s useful for testing as it simply ignores any data you try to write. 

The adapter remembers your storage choices, ensuring consistency across your project, and it only creates storage instances when they’re actually needed. Switching between storage methods is simple with shortcuts like `useMd()` for file-based storage and `useJsonl()` for JSONL append. You can also define your own adapter using `useMarkdownAdapter`.

## Class MCPValidationService

This service helps ensure that your Model Context Protocols (MCPs) are set up correctly and dependencies are valid. It keeps track of all registered MCPs and checks that they exist and that the strategies they rely on are also properly defined. 

Think of it as a guardian for your MCPs—you register them once, and the service won't let you register the same one again. 

Here's what it does:

*   **Registration:**  You tell it about each MCP, along with its schema.
*   **Validation:**  It verifies that an MCP is registered before it's used and confirms its dependencies are sound. This process is efficient, as it only runs the check once for each MCP name.
*   **Listing:**  You can ask it to show you a list of all the MCP schemas it’s managing.

It uses a `loggerService` for reporting and a `strategyValidationService` to handle strategy validation, and internally uses a `_mcpMap` to keep things organized.

## Class MCPUtils

This class acts as a bridge, allowing external systems (like an agent) to interact with a live trading strategy. It provides tools to observe and even manually control the strategy's actions.

Think of it as a way to get reports on what's happening with the strategy and occasionally step in to open or close positions, or add to existing positions.

Here’s a breakdown of what it offers:

*   **Status Reports:** You can request a summary of the current portfolio, including open positions, profit/loss, and other key metrics. These reports are formatted as messages designed for an agent.
*   **Trade History:**  Get a log of past trades, showing how they performed (profit/loss, reasons for closing) so the agent can learn from previous actions.
*   **Agent Communications:**  Access messages sent *from* the strategy *to* the agent - essentially the strategy's own internal notes about its reasoning and actions, offering insight into its decision-making.
*   **Notifications:**  View specific trading events like position openings and closings, along with descriptions explaining *why* the trade occurred.  This helps understand the strategy's intent.
*   **Manual Actions:** It lets you manually open positions (specifying levels and stop-loss) and close any pending positions.
*   **DCA entries:** You can also add incremental entries to a pending positions.
*   **Signal Notifications:** Trigger notifications to be sent to the agent when specific positions or signals are triggered.

All actions and reports are carefully validated to ensure they align with the strategy's rules and risk management.  It is a singleton, so you'll only have one instance of it.

## Class MCPSchemaService

The MCPSchemaService acts like a central library for managing schema definitions related to Model Context Protocols (MCPs). It keeps track of these schemas, associating each with a unique name.

When a new schema is added or an existing one needs to be updated, the service performs a quick check to ensure basic requirements are met. 

The service’s core purpose is to provide these MCP schemas to other parts of the system, like MCPUtils, so they can understand and process data correctly when executing trading strategies and sending messages.

You can register new schemas, replace existing ones, or retrieve a specific schema by its name. This allows for flexibility when dealing with different models and contexts within your trading framework.

## Class LookupUtils

The `LookupUtils` class acts like a central record-keeper for what's currently happening in your backtests and live trading sessions. Think of it as a constantly updated list of running activities.

When a backtest, live session, or strategy iteration begins, it registers itself with `LookupUtils`. Similarly, when these processes finish, they're removed from the list.

This registry helps manage resources and potentially optimize performance – specifically, determining whether certain tasks should be paused to share processing time.

You don't create `LookupUtils` directly; it’s available as a singleton, meaning there's only one instance of it accessible throughout your code. 

The `addActivity` method is used to add new activities, and it's designed to handle cases where you might try to register the same activity multiple times.  `removeActivity` ensures that when a process finishes, it cleans up its entry in the registry, preventing "ghost" entries. Finally, `listActivity` provides a view of the current active activities.

## Class LoggerService

The `LoggerService` helps you keep your trading logs organized and informative. It's designed to automatically add important details to your log messages, like which strategy, exchange, or frame you're working with, along with specifics about the symbol, time, and whether it’s a backtest.

You can use the provided `log`, `debug`, `info`, and `warn` methods to record different levels of messages, and they all include these contextual additions. If you don’t set up a specific logger, it defaults to a "do nothing" logger so things will still run, but you won't see any log output. 

The `setLogger` method allows you to plug in your own custom logging solution if you need something different. It's a central piece of the framework, ensuring that all logging events provide useful context for debugging and analysis.

## Class LogAdapter

The `LogAdapter` is designed to provide flexible logging capabilities within your backtesting framework. It acts as a central point for handling log messages, allowing you to easily swap out different logging methods without changing your core code.

By default, logs are stored in memory, but you can switch to persistent storage on disk or even use a dummy adapter that discards all log messages. This makes it suitable for various situations, from detailed debugging to performance optimization or just silencing logs entirely.

The `useLogger` method lets you specify a custom logging class, while convenient shortcuts like `usePersist`, `useMemory`, and `useDummy` offer a quick way to change logging behavior.  The `clear` method ensures that when your working directory changes, the log adapter re-initializes, preventing potential issues across different strategy iterations.  You can access all log levels like `log`, `debug`, `info`, `warn`, and `agent` through this central adapter.

## Class LiveUtils

This class provides tools for live trading operations, simplifying interactions with the core trading engine. It's designed for convenience and resilience, allowing trading to recover from crashes and maintain state.

Here's a breakdown of what it does:

*   **Running Live Trades:** The `run()` method starts live trading for a specific symbol, continuously generating trade results. It handles crashes by saving and restoring state. The `background()` method does the same but doesn't display the results – ideal for tasks like data persistence.
*   **Signals & Position Management:** It offers methods for retrieving pending signals (`getPendingSignal`), checking for signals (`hasNoPendingSignal`), and getting information about the current position, like total holdings, cost basis, and price levels.
*   **Breakeven & Price Calculations:** You can check if breakeven has been reached (`getBreakeven`) and get information like the effective entry price and total investment.
*   **Position Metrics:** Many methods (`getPosition...`) provide details about the current position, including profit/loss, entries, and time elapsed.
*   **Control & Intervention:** Functions like `stop()`, `commitCancelScheduled()`, and `commitClosePending()` allow you to control ongoing trades without interrupting the entire process. You can also manually commit actions like take profit or stop loss orders.
*   **Data & Reporting:** It provides ways to access live trading statistics (`getData`), generate reports (`getReport`), and save reports to disk (`dump`, `list`).
*   **Pause/Resume:** The `setPaused()` method allows you to temporarily halt new trades, useful for maintenance or review.

This class acts as a central point for interacting with the live trading system, providing a stable and controlled environment. It uses a singleton instance for convenient access.

## Class LiveReportService

LiveReportService helps you keep a real-time record of your trading activity. It listens for events as your trading strategy runs – things like when it's waiting, opening a position, actively trading, or closing a position.

The service captures every detail of these events and saves them to a database, which lets you monitor and analyze what's happening as it's happening. 

You can think of it as a detailed logbook for your live trading.

Here's a breakdown of how it works:

*   It uses a logger to output debugging information.
*   The `tick` property is the core of processing and logging these events.
*   `subscribe` lets you connect the service to your trading strategy, and it ensures you won't accidentally subscribe multiple times. It also gives you a way to stop listening.
*   `unsubscribe` cleanly stops the service from receiving those live events.





## Class LiveMarkdownService

This service helps you automatically create reports summarizing your live trading activity. It keeps track of everything that happens – from periods of inactivity to when trades are opened, are active, and finally closed – for each of your trading strategies. 

The service generates easy-to-read markdown tables containing details about each event and calculates key trading statistics like win rate and average profit/loss. These reports are saved as `.md` files, making them simple to view and share.

You subscribe to the service to start receiving updates based on each tick, and can easily stop listening when you no longer need the reports. The service also has methods to retrieve accumulated data, generate reports, save them to disk, and clear out the stored data when needed. It uses a clever system to keep data for different trading setups completely separate, preventing any mix-ups.

## Class LiveLogicPublicService

The LiveLogicPublicService manages live trading and handles important details behind the scenes. It builds on the LiveLogicPrivateService, automatically passing along information like the strategy and exchange names to different functions, so you don’t have to pass them repeatedly.

Think of it as a way to seamlessly run trading strategies without getting bogged down in managing context.

It’s designed to run continuously, and even if things go wrong and the process crashes, it can recover its state from saved data.

Here's a breakdown of its key aspects:

*   **Runs Trading:** The `run` method is what you'll use to actually start the live trading process for a specific symbol.
*   **Automatic Context:** Context (like strategy and exchange names) is handled automatically – no need to manually pass it around.
*   **Continuous Operation:** It acts like an infinite stream of trading results.
*   **Reliability:** Crash recovery ensures your trading isn't lost due to unexpected interruptions.
*   **Logging:** It incorporates logger service for debugging and monitoring.
*   **Exchange Connection:** Uses exchange connection service to interact with the exchange.

## Class LiveLogicPrivateService

This service manages the ongoing process of live trading, designed to run continuously. It uses an asynchronous generator to stream results, meaning you get updates as they happen rather than waiting for a large batch. 

The core of its operation involves repeatedly monitoring the trading signals, creating a record of the current time, and then checking the status of those signals. Only significant events – when a position is opened or closed – are sent out as part of the streaming results. 

The service is built to be resilient; if it crashes, it will automatically recover and resume trading from where it left off. It’s also designed to be memory-efficient, avoiding the need to hold large amounts of data in memory at once.

To start live trading, you simply call the `run` method, providing the trading symbol you want to track. This will start an infinite generator yielding results.


## Class LiveCommandService

The LiveCommandService acts as a central hub for live trading operations within the backtest-kit framework. Think of it as a convenient interface to access the core functionality needed for live trading.

It bundles together several supporting services like logging, validation for strategies, exchanges, and risk parameters. These services work together to ensure everything is set up correctly before starting a live trade.

The `validate` function checks your trading strategy and its associated risk settings, and it remembers previous validations to speed things up if you're using the same strategy again.

The `run` function is the powerhouse—it’s an ongoing process that executes live trades for a specific symbol. It's designed to keep running indefinitely and includes mechanisms to handle unexpected errors and recover from crashes. Essentially, it handles the continuous flow of trading data and actions.

## Class IntervalUtils

The `IntervalUtils` class helps manage functions that should only run once during each time interval, preventing them from firing too frequently. It provides two ways to do this: one keeps track of when the function ran in memory, and the other stores that information in a file so it persists even if the program restarts.

Think of it as a way to make sure certain actions, like calculating a moving average or placing an order, only happen at the beginning of each trading period.

The `fn` property lets you wrap functions with in-memory tracking. The `file` property does the same thing but saves the information to a file for reliability.  Each function gets its own dedicated tracking mechanism.

If you need to clean up old tracking data or restart the tracking process, you can use the `dispose` and `clear` methods. The `resetCounter` method ensures that the persistent file-based tracking system starts fresh when needed, which can be useful when the working directory changes.

## Class HighestProfitUtils

This utility class helps you analyze and report on the highest profit events recorded during backtests or live trading. Think of it as a tool for understanding which strategies and symbols performed best.

It offers a few key functions:

*   `getData`: This allows you to fetch specific statistics related to the highest profit events for a particular symbol, strategy, and trading environment.
*   `getReport`:  This creates a nicely formatted markdown report showing all the highest profit events that occurred. You can customize what information appears in the report.
*   `dump`: This function does the same as `getReport` but directly saves the report to a file, which is great for archiving results.

It's designed to work with data collected through the `HighestProfitMarkdownService`, providing a convenient way to view and export your performance insights.

## Class HighestProfitReportService

This service is responsible for tracking and recording the highest profit achieved during a trading backtest. It constantly monitors incoming "highestProfit" events. Whenever a new highest profit is detected, it captures all relevant details about the trade – like the timestamp, symbol, strategy used, exchange, timeframe, signal ID, position size, and price levels – and stores this information in a structured JSONL report file.

To get started, you'll need to tell the service to begin monitoring for these profit events by calling the `subscribe` method. This starts the logging process.

If you want to stop the service from saving new records, you can use the `unsubscribe` method.  This cleanly disconnects it from the data stream and stops further reports being generated.  The `subscribe` method actually returns a function that you'll use to unsubscribe, ensuring a clean stop. You only need to subscribe once because subsequent calls will return the same unsubscribe function.


## Class HighestProfitMarkdownService

This service is designed to build and save reports detailing the highest profits achieved during trading. It listens for incoming data about profits and organizes it based on the symbol traded, the strategy used, the exchange involved, and the timeframe.

You can subscribe to receive these profit events, though the service prevents being subscribed to multiple times. When you unsubscribe, it completely clears all accumulated data and stops listening for new events.

The `tick` function handles each incoming profit event, sorting and storing it appropriately.

You can request specific data about profits using `getData`, which retrieves the accumulated statistics for a particular symbol, strategy, exchange, timeframe, and whether it was a backtest or live trade.  The `getReport` method generates a markdown formatted report of these statistics. If you need to save the report to a file, the `dump` method writes the markdown report to disk, creating filenames based on the trade details.

Finally, the `clear` method allows you to delete the stored profit information. You can clear a specific combination of symbol, strategy, exchange, timeframe and backtest type or clear everything entirely.

## Class HeatUtils

HeatUtils helps you visualize and understand how your trading strategies are performing across different assets. It’s like having a handy tool to create and share portfolio heatmaps.

The class automatically gathers statistics from all completed trades for a specific strategy, allowing you to quickly see how each symbol contributed to the overall portfolio results.

You can easily retrieve the raw data, generate a nicely formatted markdown report, or save the report directly to a file. The report shows key metrics like total profit/loss, Sharpe ratio, maximum drawdown, and the number of trades for each symbol, sorted by profitability. 

Think of it as a way to get a clear, organized view of your strategy's performance, making it easier to identify strengths and areas for improvement. It's designed to be simple to use, always available, and readily shareable.

## Class HeatReportService

HeatReportService helps you track and analyze your trading performance by recording when your signals close and generate a profit or loss. It focuses on closed signals, specifically logging them to a database for later analysis.

This service listens for signal events, automatically capturing data about closed positions. It's designed to provide a portfolio-wide view of your trading activity.

You can easily start and stop the service using the `subscribe` and `unsubscribe` methods, which prevent accidental duplicate subscriptions. The `tick` property handles the actual processing of signal events and logging them to the database. The service also uses a logger to provide useful information for debugging.

## Class HeatMarkdownService

This service helps you visualize and analyze your trading strategy’s performance with a heatmap. It listens for trading signals and aggregates data, creating detailed statistics for each symbol and your overall portfolio.

It automatically tracks things like total profit/loss, Sharpe Ratio (a measure of risk-adjusted return), and maximum drawdown (the largest peak-to-trough decline) for each symbol.

The service keeps track of data separately for each exchange, timeframe, and backtest/live mode, and it can generate reports in a readable Markdown format. It also handles potentially problematic math (like division by zero) gracefully.

You subscribe to the service to receive data updates and can unsubscribe when you’re done. The `tick` method processes incoming signals, focusing only on "closed" trades and storing the results.

You can retrieve the aggregated data using `getData`, generate formatted reports with `getReport`, or save the report to a file with `dump`.  Finally, `clear` allows you to reset the accumulated data—either for a specific configuration or completely.

## Class GeneralUnexpectedError

This class signals a serious, unexpected problem in your application – something that shouldn’t have happened according to the code's design. Think of it like a bug or a fundamental flaw in the system's logic. It’s not a typical error you'd handle gracefully; instead, it means something is broken and needs to be addressed immediately.

Unlike errors that represent expected business conditions, this error doesn’t trigger any special handling within the framework itself. It’s a straightforward marker to show that a malfunction has occurred.

When you encounter a situation where the code should be impossible, or an invariant is broken, throw this error. It’s designed to be used where Java code would use `Error` or `IllegalStateException`.

This error is different from the order-related error triad—like `OrderRejectedError`— which are specific to the order processing system.  `GeneralUnexpectedError` is a more general signal used in your application’s logic.

To identify this error, use the `isGeneralUnexpectedError` method and the `__type__` property which acts like a unique fingerprint that works even if you have multiple copies of the code. It helps in debugging by providing a clear message intended for developers, not for end-users.

## Class GeneralExpectedError

This error type helps your application distinguish between predictable, expected issues and genuine malfunctions. Think of it as a way to separate situations you can handle gracefully – like a validation failing or a precondition not being met – from unexpected bugs or system failures that need immediate attention. The framework itself doesn't do anything special with this error; it's purely for your application's error handling logic, allowing you to tailor responses based on the specific problem.

It’s different from the order-related error types used internally by the framework. You’ll typically use the order-specific errors within broker adapters, while `GeneralExpectedError` is designed for your application’s higher layers.

To identify these expected errors, you’ll use a special brand check (`__type__`) rather than `instanceof`. This ensures it works correctly even if your code is split into multiple bundles or uses linked packages, so you can confidently create custom error types by subclassing `GeneralExpectedError` and have them all recognized. The error message should contain the information a user would need to understand the situation and potentially take corrective action.

## Class FrameValidationService

This service helps you keep track of and verify your trading timeframes, often called "frames." Think of it as a central place to register all the different time periods you're using in your backtesting or trading strategies. 

It lets you add new timeframes with their associated configurations, and it provides a quick way to check if a specific timeframe actually exists before you try to use it. This prevents errors and makes your code more reliable. 

To make things efficient, the service remembers the results of validations, so it doesn't have to repeatedly check the same timeframe. You can also get a full list of all the timeframes you've registered.

## Class FrameSchemaService

The FrameSchemaService helps you keep track of your frame schemas in a reliable and organized way. It acts like a central registry where you can store and retrieve these schemas.

It makes sure your schemas are structurally sound by performing quick checks before they're officially added.

You can add new schemas using the `register` method, update existing ones with `override`, and easily retrieve them by name using `get`. The service uses a specialized registry to safely store these schemas and relies on logging services for context and debugging.

## Class FrameCoreService

FrameCoreService acts as a central hub for managing timeframes within the backtesting process. It relies on other services to handle connections and validation. 

Essentially, it provides a way to get a list of dates representing the timeframe you'll be using for your backtest—like specifying the exact dates you want to test a trading strategy on.

It's a foundational component, used behind the scenes to make sure everything runs smoothly and consistently. 

The `getTimeframe` method is your key tool here; it retrieves those crucial date arrays based on a symbol (like "BTCUSD") and a frame name (like "1h").

## Class FrameConnectionService

The FrameConnectionService helps manage and provide the correct backtest frame for your trading strategies. It acts as a central point for accessing different frame implementations, automatically routing requests based on the current context.

This service keeps track of which frames are needed, creating them initially and then reusing them for performance – this means it avoids creating the same frame multiple times. 

It also provides a way to clear these cached frames, ensuring that your backtest always uses the most up-to-date data and timeframe, preventing it from silently running with outdated information. You can think of it as a way to keep your backtest “fresh.”

You can use it to define specific start and end dates for your backtesting periods, limiting the data used for analysis. It implements an interface, `IFrames`, and offers functions for getting frames, clearing the cache, and retrieving timeframes for a specific symbol.


## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of your trading exchanges and make sure they're set up correctly. It's like a central manager for your exchanges, ensuring they're ready to go before you try to use them. 

You can register new exchanges with the `addExchange` function. 

Before you start any trading operations, use the `validate` function to double-check that the exchange you're planning to use actually exists. 

To see a complete list of all registered exchanges, the `list` function provides a handy overview. 

The service even remembers previous validation results, so it doesn't have to repeat checks unnecessarily, making things run faster.

## Class ExchangeUtils

The `ExchangeUtils` class helps you interact with different cryptocurrency exchanges in a standardized way. Think of it as a helper that simplifies common tasks like getting historical price data, calculating average prices, and formatting trade quantities.

It’s designed to be used easily, always available as a single, shared instance.

Here's what it can do:

*   **Retrieve historical candles (price charts):** `getCandles` fetches data for a specific trading pair and time interval, automatically calculating the date range.
*   **Calculate VWAP:** `getAveragePrice` figures out the volume-weighted average price.
*   **Get the latest price:** `getClosePrice` gives you the closing price from the most recent candle.
*   **Format trade sizes and prices:** `formatQuantity` and `formatPrice` ensure that trade sizes and prices are formatted correctly according to each exchange’s rules.
*   **Fetch order books:** `getOrderBook` retrieves the current order book for a trading pair.
*   **Retrieve trade history:** `getAggregatedTrades` brings in a list of aggregated trades.
*   **Flexible candle retrieval:** `getRawCandles` offers more control by allowing you to specify custom start and end dates.

The class also handles nuances like ensuring compatibility with older versions and providing protection against look-ahead bias during backtesting.

## Class ExchangeSchemaService

The ExchangeSchemaService helps manage a collection of exchange schemas, ensuring they're consistent and well-defined. It uses a specialized registry to safely store these schemas.

You can add new exchange schemas using the `addExchange()` function (represented here as `register`) and find existing ones by their name using `get()`.

Before adding a schema, `validateShallow()` checks to make sure all the necessary properties are present and of the correct types.

If a schema already exists, you can update parts of it using `override()`, allowing you to make changes without replacing the entire schema.

The service also keeps track of logging and manages the underlying storage registry itself.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges within the backtest-kit framework. It combines the functionality of connecting to an exchange and managing the execution context, which includes details like the symbol being traded, the specific time, and whether it's a backtest or live trading scenario. 

This service simplifies how data is retrieved from exchanges, ensuring that the correct parameters are passed along for each request.

It offers a collection of methods for retrieving various data points, including historical and future candles (for backtesting), average prices, and order books. These methods all incorporate the execution context, allowing for more controlled and accurate data retrieval.

The service also includes validation capabilities to ensure the exchange configuration is correct and efficient, avoiding unnecessary repeated checks. Formatting functions for price and quantity are also provided, tailoring the output based on the current context.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs requests to the correct exchange based on the current trading context. To avoid repeatedly creating connections, it remembers (caches) these connections for performance.

It handles common trading operations like fetching historical price data (candles), retrieving the next batch of candles based on the current time, getting the average price (either from a live exchange or calculated from historical data), and obtaining the closing price for a specific time interval.

Beyond basic data retrieval, it also ensures that prices and quantities are formatted correctly to comply with the specific rules and precision requirements of each exchange. You can request order book data and aggregated trade history as well. Finally, it provides a way to fetch raw candle data, offering flexibility in specifying the date range and number of candles needed.

## Class DumpAdapter

The `DumpAdapter` acts as a central point for saving data during your backtesting process, offering flexibility in where and how that data is stored. It’s designed to work with a "dump context" which ties the data to a specific signal and bucket, ensuring organization.

By default, it saves data as Markdown files, creating a separate file for each piece of information.

You can easily change where the data is saved by switching between different "backends": memory storage, a dummy backend that simply discards everything, or even a custom backend you define yourself.

Before you start saving data, you need to "enable" the adapter – this makes it listen for events related to signals.  When you’re done, you can "disable" it.  It’s safe to call enable and disable multiple times; they're designed to be idempotent.

The adapter provides a set of methods like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, `dumpError`, and `dumpJson` for saving different kinds of data.  `dumpMCPStatus` handles specifically Model Context Protocol messages.

You can clear the cached data if you need to, for example, when changing the working directory.


## Class DictionaryLiveAdapter

This component, `DictionaryLiveAdapter`, provides a flexible way to manage dictionaries during live trading, allowing you to easily change how the data is stored and persists. It acts as a bridge, or adapter, between your trading logic and the underlying dictionary implementation.

You can choose between several storage options: a file-based system that saves data across restarts (the default), an in-memory solution that's quick but temporary, a dummy adapter for testing, or even create your own custom storage method.

When a trading signal is cancelled or closed, `disposeSignal` clears out the data associated with that signal to keep things tidy.

The core functions let you read, write, delete, and check for data (`get`, `set`, `has`, `delete`), as well as list all the keys, values, entries and the number of entries (`keys`, `values`, `entries`, `size`). 

Finally, the `useLocal`, `usePersist`, `useDummy`, and `useDictionaryAdapter` methods provide convenient shortcuts for switching between the different storage backend options.

## Class DictionaryBacktestAdapter

This component, the DictionaryBacktestAdapter, provides a flexible way to manage and store data during backtesting. It acts as a middleman, allowing you to swap out different data storage methods without changing the core backtesting logic.

You can choose from several storage options: a simple in-memory storage (the default), a persistent storage that saves data to disk, a dummy storage that simply ignores all data, or even a custom storage solution you build yourself.

The adapter remembers the data it's holding for each trading signal, but it clears this memory when the signal is cancelled. You have methods to read, write, delete, and list data, and to check if a specific piece of data exists.

To change how your data is stored, you can easily switch between the provided options like switching to local, persistent or dummy storage, or even plug in your own custom storage mechanism. The adapter keeps track of how much data is available and presents them to the backtest process.


## Class Dictionary

This framework provides a special kind of storage, like a dictionary (or map) that's tied to specific trading signals. Think of it as a place to keep temporary information related to a particular signal – for example, storing calculated indicators or custom data.

It’s designed to be used within your trading strategies, but it operates a bit differently than regular data storage. The dictionary is linked to the specific signal being processed, ensuring everything stays relevant to that moment in time. Importantly, it avoids potential issues with using outdated information by tracking when data was written, ensuring you only see the most current version.

Before using a dictionary, you need to explicitly enable it. This helps manage the lifespan of the storage and prevents problems from stale data accumulating. You can then use methods like `get`, `set`, `has`, `delete`, `clear`, `keys`, `values`, and `entries` to interact with your signal-specific data.  Essentially, these methods handle all the necessary context resolution behind the scenes.

To stop using a dictionary, you disable it, which unsubscribes from signal lifecycle events and cleans up resources. You can disable it multiple times without issue.

## Class CronUtils

This class, `CronUtils`, helps schedule tasks to run at specific times within backtesting environments, especially when multiple tests are running in parallel. It makes sure a task only runs *once* even if several tests try to run it simultaneously.

Think of it as a central coordinator for time-based tasks within your backtesting setup.

Here's a breakdown of how it works:

*   **Registration:** You register your tasks (called "entries") with a name and a time interval.
*   **Parallel Coordination:** When multiple backtests hit the same scheduled time, this system ensures that only one instance of your task runs at a time, preventing conflicts.
*   **Memory Management:** It keeps track of which tasks have already run and cleans up old data to prevent issues.
*   **Lifecycle Integration:** You can "enable" this system to automatically trigger tasks based on the backtest's timing events. Disabling it cleans everything up.
*   **Disposal:** You can completely reset the system, clearing all registered tasks and timers.

The internal mechanisms involve using unique keys and generation counters to manage concurrent tasks and avoid conflicts. This class makes sure your scheduled tasks fire reliably, even in complex, parallel backtesting scenarios.

## Class ConstantUtils

The `ConstantUtils` class provides a set of predefined percentages used for setting take-profit and stop-loss levels, designed using a method related to the Kelly Criterion with risk decay. These values, expressed as percentages, represent how far the price needs to travel towards its target take-profit or stop-loss level to trigger different partial exits.

For instance, a final take-profit target of +10% will trigger `TP_LEVEL1` at +3%, `TP_LEVEL2` at +6%, and `TP_LEVEL3` at +9%. This allows for early profit capture while still allowing the trade to potentially reach its full potential.

Similarly, stop-loss levels are defined with `SL_LEVEL1` triggering at 40% of the distance to the final stop-loss and `SL_LEVEL2` at 80%, designed to progressively reduce risk and protect capital. These constants are intended to be used in strategies aiming for disciplined risk management and profit-taking.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading setup is mathematically sound and has a chance to be profitable. It checks your global configuration settings, looking for potential problems that could lead to losses.

It verifies that percentage-based settings like slippage and fees are non-negative, ensuring you're not artificially inflating costs.

A crucial check makes sure your minimum take-profit distance covers all potential expenses (slippage and fees) so you can actually make money when a take-profit target is reached.

The service also confirms that your range-related settings are logically consistent - for example, that a stop-loss distance is a reasonable value.

Finally, it ensures that any time or count based parameters, like timeouts or retry attempts, are positive whole numbers. This promotes stability and avoids unexpected behavior.

## Class ColumnValidationService

The ColumnValidationService helps you make sure your column configurations are set up correctly. It acts like a quality control checker for your column definitions. 

It verifies that each column has all the necessary pieces: a unique identifier (key), a descriptive name (label), a formatting instruction (format), and a setting to control visibility (isVisible). 

It also ensures that the identifier and name are text strings, that the formatting and visibility instructions are functions, and that you aren’t accidentally using the same identifier for multiple columns. Essentially, it prevents common errors and helps maintain consistency in your column setups. The `validate` function runs these checks across your entire configuration.

## Class ClientSweep

The ClientSweep is a tool designed to help you find the best settings for your trading strategies, often referred to as a "sweep." It efficiently tests trading ideas by simulating them against different market conditions without needing to run full backtests repeatedly.

It evaluates authors and their strategies independently, focusing solely on their performance in isolation. It doesn't factor in complex interactions between different ideas.

Here’s how it works:

1.  Each trading idea is analyzed once, looking at how it would have performed over a limited period.
2.  A list of authors who consistently perform poorly is automatically generated and excluded from the results.  This list is something you can directly apply to your live trading.
3.  The results are calculated based on realistic trading conditions, including fees and slippage.
4.  The best strategies are ranked using standard metrics like Sharpe Ratio and total profit.

The ClientSweep is designed to be used as a starting point; you still need to validate the identified parameters with a full backtest using the engine. Each run is independent, meaning it doesn’t rely on previous runs and is stateless. The system provides callbacks throughout the process, allowing you to monitor progress and get information at each stage of the evaluation.

## Class ClientSizing

This component handles determining how much of an asset to trade based on your chosen strategy. It's a flexible system allowing you to use different sizing methods like fixed percentages, Kelly Criterion, or Average True Range (ATR). 

You can also set limits on the minimum and maximum position sizes you’re willing to take, and restrict the maximum percentage of your capital used for any single trade. 

It’s designed to be adaptable, supporting callbacks that can be used for validation or to record trade sizing decisions. Essentially, it's the engine that translates your strategy’s signals into concrete trade sizes. 

The `calculate` method is the core of this functionality; it's what's called to figure out the position size based on the information you provide.


## Class ClientRisk

The ClientRisk component manages risk across multiple trading strategies, acting as a central control to prevent actions that could exceed predefined limits. Think of it as a safety net to ensure your overall portfolio stays within acceptable risk parameters.

It’s designed to handle things like maximum simultaneous positions and custom risk validation rules, drawing data from all active strategies and providing a shared view of portfolio risk. The component uses a map to keep track of active positions and reserves slots to avoid race conditions when multiple strategies are running concurrently. 

Signals are checked against these rules *before* they're executed, and both `addSignal` and `removeSignal` are used to update the status of open and closed positions, respectively. The system includes mechanisms for persisting this information, although this is skipped during backtesting. ClientRisk helps to prevent exceeding limits by checking signals and reserving placeholders for positions. Remember to always follow a successful check with either `addSignal` or `removeSignal` to avoid stale reservations.


## Class ClientFrame

The ClientFrame class is responsible for creating the timeline of historical data that your backtest will run against. Think of it as the engine that provides the sequence of dates and times for your trading simulation. It’s designed to avoid repeating the work of generating these timelines, using a caching system. You can configure how finely-grained the timeline is – from minutes to days – and even add custom checks or logging as the timeline is created. This class works closely with the core backtesting engine to provide the data it needs.

The `getTimeframe` property is the main method you'll use, allowing you to request a timeframe array for a specific trading symbol.  This array will be generated once and then cached for future use, speeding up your backtesting process.


## Class ClientExchange

This `ClientExchange` component acts as a bridge to get data from an exchange, designed to be efficient and reliable for backtesting and live trading. It offers several key features, including fetching historical and future candle data, calculating the volume-weighted average price (VWAP), and formatting prices and quantities according to exchange-specific rules. 

Here's a breakdown of what it does:

*   **Candle Data Retrieval:** It can pull historical candles from the past (going backwards in time) and future candles needed for backtesting (looking ahead). Both processes align timestamps to ensure accurate data.
*   **VWAP Calculation:**  It can determine the VWAP, a crucial metric for traders, based on recent trading activity.
*   **Data Formatting:** It automatically formats prices and quantities to match the specific conventions of the exchange.
*   **Flexible Candle Fetching:** The `getRawCandles` method gives you a lot of control, allowing you to specify start and end dates and limits to precisely tailor your historical data requests.
*   **Order Book & Trades:**  It can retrieve order book information and aggregated trade data.
*   **Memory Efficiency:**  It's built to be efficient, using prototype functions to reduce memory usage.



Essentially, this component makes it easier to access and work with exchange data within the backtest-kit framework.

## Class ClientAction

The `ClientAction` class is the core component for managing and executing custom logic within your trading strategies. Think of it as a central hub that connects your strategy's code to various events and actions that occur during trading, whether it's a live session or a backtest.

It initializes and manages an instance of your custom action handler, routing different types of events (like signal updates, breakeven notifications, or scheduled tasks) to the appropriate methods within that handler. This allows you to easily build complex features like real-time alerts, detailed logging, and sophisticated analytics.

Key features include ensuring your handler is initialized only once, providing methods for specific event types (live, backtest, breakeven), and offering a clean way to dispose of resources when the action handler is no longer needed.  Manual wiring allows you to customize how certain events are handled via callbacks, making it adaptable to various implementation needs.  Importantly, some of these events (like `orderSync` and `orderCheck`) pass exceptions directly to the underlying function, requiring careful error handling.

## Class CacheUtils

CacheUtils provides a way to automatically store and reuse the results of your functions, particularly useful for trading strategies. It’s like having a helper that remembers calculations so you don’t have to repeat them unnecessarily.

This utility focuses on two main types of caching: regular function caching and file-based caching for asynchronous functions. The `fn` method wraps your functions to cache their results based on time intervals, ensuring that results are refreshed when new data becomes available. The `file` method takes it a step further, saving results to disk. This is helpful for slow operations or when dealing with large datasets that you want to persist.

You don't need to create CacheUtils yourself; it's designed to be used as a single, shared instance. If you need to completely remove a function's cached data, you can use the `dispose` method. The `clear` and `resetCounter` methods are for special cases when you need to refresh the cache or file indices, usually when your working directory changes between strategy runs.

## Class BrokerBase

This base class, `BrokerBase`, is designed to help you create custom adapters that connect your trading strategies to different exchanges. Think of it as a starting point for building a bridge between your code and a real trading platform.

It provides a foundation with default behavior for common trading actions like placing orders, canceling them, and managing stop-loss and take-profit levels. You'll likely want to extend this class to actually implement the logic for interacting with a specific exchange.

When you use this class, all events – like order placement or position closures – are automatically logged, which is great for debugging and auditing.

**Here's a breakdown of how it works:**

1.  **Initialization:**  The `waitForInit()` method allows you to perform any necessary setup, like logging into your exchange account.  It's crucial for asynchronous initialization.
2.  **Event Handling:** As your trading strategy runs, specific events trigger methods like `onOrderOpenCommit` (opening a position), `onOrderCloseCommit` (closing a position), and others.  The default implementations simply log these events. You'll customize these methods to handle the actual exchange interactions.
3.  **Lifecycle:** It follows a simple lifecycle – initialization, event handling during execution, and no explicit cleanup (cleanup is handled during initialization or externally).

This framework is designed to be modular.  You can override only the methods you need to customize, while the defaults handle the rest. It streamlines the process of creating your own exchange adapters, providing a solid foundation to build upon. You are logging and managing every event for more reliable and debuggable trading.


## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman, handling communication with your trading broker and ensuring safe operations within the backtesting framework. Think of it as a gatekeeper – it intercepts actions like opening or closing trades before they actually happen, giving you a chance to control the process.

During backtesting, this communication is essentially skipped, letting your strategy run without interacting with a live broker. However, in real-time trading, it relays these actions to your broker via a proxy.

The `BrokerAdapter` is responsible for a variety of tasks, from sending signals for opening and closing positions to pinging the broker for updates and handling scheduled orders.  It also provides a safeguard against errors – if a communication with the broker fails, the underlying trading logic won't be affected, preserving the integrity of your backtest or live trade.

You register your broker's implementation using `useBrokerAdapter` and activate the adapter with `enable`, which subscribes to internal signals.  `disable` removes these subscriptions, and `clear` resets the system, useful when environment changes occur between different strategy runs.  Specific actions like partial profit or loss adjustments, trailing stops, and average buy orders also pass through this adapter for controlled execution.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events within your backtesting or live trading environment. It's like a central place to gather and display information about when your strategies reached breakeven points.

You can retrieve aggregated statistics, such as the total number of breakeven events, for a specific symbol and strategy combination.

It can also generate detailed markdown reports that show individual breakeven events, including things like the entry price, current price, and timestamp, presented in an easy-to-read table format.

Finally, you can easily save these reports to files, named based on the symbol and strategy, making it simple to track and review breakeven performance over time. Think of it as a tool for organizing and understanding your breakeven data.

## Class BreakevenReportService

This service helps you keep track of when your trading signals reach their breakeven point. It listens for these "breakeven" moments and records them in a database.

Think of it as a digital notebook specifically for noting when your trades start to become profitable.

The service saves details about each breakeven event, allowing you to analyze your signal performance over time.

You can easily start monitoring breakeven events using the `subscribe` method, which also gives you a way to stop listening with `unsubscribe`. It makes sure you're not accidentally monitoring the same events multiple times.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you keep track of and document breakeven events for your trading strategies. It listens for these events and organizes them, creating detailed reports in a readable markdown format. 

These reports include statistics like the total number of breakeven events, and they're automatically saved to your computer in a structured directory. 

You can subscribe to receive these events in real-time, and easily retrieve accumulated data or generate reports for specific symbols and strategies. The service also provides a way to clear out all or specific stored data when it's no longer needed. It is designed to be flexible, allowing you to customize the reports and storage locations.

## Class BreakevenGlobalService

This service acts as a central hub for managing and tracking breakeven points within the trading system. It's designed to be injected into strategies, providing a consistent way to handle breakeven calculations and ensuring everything is logged properly.

Think of it as a middleman – it receives requests related to breakeven, logs those actions, and then passes them on to another service that handles the actual work. This keeps things organized and allows you to monitor breakeven operations from a single point.

It relies on other services for tasks like validating strategy configurations and managing connections, and it uses a logger to record what’s happening at a global level.  The `check` function determines if a breakeven event should occur and the `clear` function resets it when a signal ends.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and tracks breakeven points for your trading signals. It's designed to efficiently handle these calculations by creating and storing a single breakeven tracker for each signal, reusing them as needed. 

Think of it as a central hub for breakeven calculations. It’s responsible for setting up and managing the individual breakeven trackers (ClientBreakeven instances) and ensuring they function correctly.

When a check or clear operation needs to happen, it delegates that work to the appropriate tracker. The service automatically cleans up these trackers when signals are no longer needed, preventing resource buildup. This service works closely with other parts of the system, like the ActionCoreService, to ensure everything operates smoothly. It's particularly important for how your strategy interacts with and reacts to signals.

## Class BacktestUtils

This utility class provides helpful tools for running and analyzing backtests. It acts as a central point for common operations related to backtesting, like running the tests, getting details about positions, and generating reports.

The `run` function is the main way to execute a backtest for a specific symbol and strategy, providing a stream of results as the test progresses. You can also run backtests in the background with `background` if you just need to log information or trigger other actions without needing to examine individual ticks.

Need to know something about a particular position? Functions like `getTotalPercentHeld`, `getRemainingCostBasis`, and `getPositionPnlCost` give you details on position size, cost basis, and profit/loss. The `getPendingSignal` and `getScheduledSignal` functions let you access the signals that are actively controlling the strategy.

You can also use functions to check conditions, such as `hasNoPendingSignal`, and interact with the strategy through functions such as `stop`, `commitClosePending`, and `commitCreateSignal`. `commitAverageBuy` function is used to simulate adding more entries to existing signals.


## Class BacktestReportService

The BacktestReportService is designed to meticulously record what's happening during your backtest strategy’s execution. It acts like a detailed observer, capturing every significant lifecycle event of your signals—when they're idle, opened, active, and closed.

This service listens for those events, and then saves a complete record of each tick event, including all the details, into a database. This allows for in-depth analysis and easy debugging after a backtest is complete.

You'll use the `subscribe` method to start this monitoring process, and it makes sure you don't accidentally set up multiple subscriptions. The `unsubscribe` method lets you stop the recording when you're finished. A logger service is built in for helping with debugging.

## Class BacktestMarkdownService

The BacktestMarkdownService is designed to automatically create and save detailed reports about your trading strategies during backtesting. It listens for trading signal events, specifically focusing on signals that have already closed.

It keeps track of these closed signals for each strategy and symbol you're testing, using a clever system to ensure each combination has its own dedicated data storage. This service then compiles the data into easy-to-read markdown tables, which are saved as files on your computer within the `logs/backtest/` directory.

You can request overall statistics for a specific symbol and strategy, or generate a full report in markdown format. The service also provides options to clear out the accumulated signal data when it's no longer needed, either for a specific test or a complete cleanup.

To enable reporting, you’ll need to connect the service to your backtest environment, subscribing to the tick events. When you're finished, be sure to unsubscribe to prevent unnecessary processing.

## Class BacktestLogicPublicService

This service helps you run backtests by automatically managing the context needed for your strategies. It simplifies things by handling the details of which strategy, exchange, and frame of data the backtest is using.

It wraps another service to ensure that when your strategy needs data – like historical prices or trading signals – it automatically knows which specific context to use.

Here's what you can do with it:

*   **Constructor:** It doesn’t take any input when it’s created.
*   **Properties:** It has internal services for logging, the underlying backtest logic, managing time, frame schemas, and exchange connections.
*   **`run` method:** This is the main way to run a backtest. You provide the symbol you're backtesting and a context object (specifying the strategy, exchange, and frame names).  The `run` method then streams back the results of the trading simulation, letting you see how the strategy performed over time. The context is automatically passed to the underlying functions, so you don’t have to worry about explicitly providing it.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is designed to efficiently run backtests of your trading strategies. It works by first obtaining the timeframes needed for the backtest. Then, it processes each timeframe, fetching necessary data and executing the trading strategy.

When a trading signal triggers an action, the service retrieves the corresponding candle data and runs the backtest logic. It intelligently skips timeframes until the signal is closed, ensuring accurate simulation.

The service streams the results of each completed trade directly, avoiding the need to store everything in memory – this makes it suitable for even very long backtests. You can also stop the backtest early if needed.

It relies on several other services to function, including those for handling strategy core logic, exchange data, timeframe management, actions, and time/price metadata. Essentially, this service orchestrates the entire backtesting process.

## Class BacktestCommandService

This service acts as a central hub for running backtests within the framework. It provides a straightforward way to access backtesting capabilities, designed to be easily integrated into your applications.

It handles various validation processes, like checking the strategy, associated risks, and the consistency of exchange and frame configurations. To speed things up, it remembers previously validated combinations to prevent unnecessary repeated checks.

You can use it to initiate a backtest for a specific trading symbol, providing context details about the strategy, exchange, and frame being used. The backtest will generate a stream of results, detailing what would have happened to your trades – whether they were scheduled, opened, closed, or cancelled.

## Class ActionValidationService

The ActionValidationService helps keep track of your action handlers, those pieces of code that respond to specific events in your trading system. Think of it as a central directory and quality control for these handlers.

It lets you register new handlers so the system knows they exist and are ready to be used. Before any action is taken, it can quickly check that the required handler is actually present, preventing errors. 

To speed things up, it remembers the results of past validation checks, so it doesn’t have to re-check the same handler repeatedly.

You can also get a complete list of all registered handlers if you need to review them or debug issues.


## Class ActionSchemaService

The ActionSchemaService helps you manage and organize the blueprints for your actions, ensuring they're structured correctly and work as expected. It acts like a central control panel for defining how different actions should behave. 

This service keeps track of all your action schemas in a way that’s safe and reliable.  It makes sure your action handlers only use the methods you've specifically allowed and won't accidentally try to access unexpected functionality.

You can register new action schemas with this service.  Before accepting a new schema, it checks that everything is set up correctly.  Existing schemas can also be updated – you don't have to re-register an entire action just to change a small detail.

The service uses a type-safe storage system and leverages logging to provide context and insights into its operations. It’s a core component, used behind the scenes to set up and manage the actions within your application.

## Class ActionProxy

ActionProxy acts as a safety net when running your custom trading logic within the backtest-kit framework. It automatically catches and handles any errors that might occur within your code, preventing the entire system from crashing. Think of it as a protective layer ensuring your strategies run smoothly even if they have unexpected issues.

Essentially, it wraps all your action methods – like `init`, `signal`, `breakevenAvailable`, and others – in a way that any errors are logged and reported without disrupting the trading process. If a method isn't implemented by your strategy, ActionProxy gracefully handles it, preventing errors.

The framework uses a factory pattern to ensure ActionProxy instances are created consistently, and it provides a central place to manage error reporting during strategy execution. `fromInstance` is how you create these protected handlers. The `orderSync` and `orderCheck` methods are exceptions to the error-capturing rule, and any errors there are meant to be handled higher up.

## Class ActionCoreService

This service acts as a central hub for managing actions within your trading strategies. It’s responsible for orchestrating how actions are executed, ensuring they're properly validated and dispatched to the right places.

Here’s a breakdown of what it does:

*   **Manages Action Execution:** It takes action lists defined in your strategy schemas and runs them sequentially, invoking specific handlers for each action.
*   **Validates Configurations:** Before anything happens, it thoroughly validates the strategy's context (name, exchange, frame) and associated actions and risks to catch potential issues early.  This validation is memoized for efficiency.
*   **Lifecycle Events:**  It handles a range of events related to signal creation, modification, and cancellation, routing them to registered actions. This includes things like initial setup (`initFn`), signal processing (`signal`, `signalLive`, `signalBacktest`), and cleanup (`dispose`).
*   **Synchronization and Checks:** It provides mechanisms to synchronize order-related actions and checks the status of pending orders.

Essentially, it handles all the behind-the-scenes work of getting actions to run properly within your strategies, so you don’t have to. The service provides specific methods to deal with various lifecycle events, such as risk rejections, order synchronization, and ping notifications. It's a critical component for ensuring reliable strategy execution.

## Class ActionConnectionService

The ActionConnectionService is like a central dispatcher for different actions within your trading strategies. It makes sure that requests for specific actions, like signaling or handling breakeven points, get routed to the correct implementation. To make things efficient, it remembers (caches) these implementations so it doesn't have to recreate them every time they're needed, using the strategy, exchange, and frame name to keep things organized.

This service uses several supporting components for its operations, including logging, schema management, and core strategy services.

It provides a range of methods for handling different events, including signals, breakeven calculations, partial profit/loss management, scheduled tasks, and order synchronization. Each of these methods ensures the event reaches the appropriate action handler.  There are specialized methods for backtesting and live trading scenarios.

Finally, you can clear the cached action implementations when they're no longer needed, and the `clear` function allows for targeted removal from the cache based on specific parameters.

## Class ActionBase

This class, `ActionBase`, is designed to help you extend the trading framework with your own custom actions. Think of it as a starting point for handling events like notifications, logging, and implementing complex strategies. It takes care of the basic logging for you, so you don’t have to write that boilerplate code repeatedly.

When you create your own custom action, you’ll likely extend this base class, overriding methods to tailor its behavior. The framework calls these methods at various points during the trading process, like when a signal is generated, a profit or loss milestone is reached, or the strategy is finishing up.

You’ll be given a strategy name, frame name, and action name upon creation, giving you context for each action that takes place.  Initialization happens during the `init()` method, which you can use to set up any necessary connections or resources.

Several events trigger specific methods:

*   `signal()`: Called for every tick/candle in all modes.
*   `signalLive()`: Called only when actively trading.
*   `signalBacktest()`: Called only when backtesting.
*   `breakevenAvailable()`: Notified when the stop-loss moves to the entry price.
*   `partialProfitAvailable()`:  Called when a profit target is reached.
*   `partialLossAvailable()`: Called when a loss target is reached.
*   `pingScheduled()`, `pingActive()`, `pingIdle()`: Monitor different states of signals.
*   `riskRejection()`:  Called when a signal fails risk checks.

Finally, the `dispose()` method ensures that your action cleans up after itself when it’s no longer needed. This is the place to close connections and free resources.
