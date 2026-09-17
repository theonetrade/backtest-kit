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

The WalkerValidationService helps you keep track of and make sure your parameter sweep configurations, often called "walkers," are set up correctly. It acts as a central place to register these walkers, so you know they exist and are ready to use.

This service also makes things faster by remembering the results of validations – if a walker has already been checked, it won’t need to be re-validated.

You can add new walkers using `addWalker()`, check if a walker exists and its related strategies are valid with `validate()`, and get a list of all registered walkers using `list()`. It integrates with other validation services to ensure strategies, risks, and actions are all in order as part of the walker configuration.

## Class WalkerUtils

WalkerUtils provides a helpful toolkit for working with walkers, which are essentially automated trading strategies. It simplifies running and managing these strategies, especially when you need to log their progress or stop them. 

Think of it as a central place to start, stop, and retrieve information about your walkers. It automatically handles some of the more complex setup, like figuring out the correct settings based on the strategy's definition.

You can use it to:

*   Run a walker to compare different strategies for a specific trading symbol.
*   Start a walker in the background for tasks like logging or callbacks without needing to see all the detailed results.
*   Safely stop a walker, ensuring current trades finish normally but preventing any new ones from being generated.
*   Retrieve comprehensive data and reports about a walker’s performance, including details about various strategies.
*   Save these reports to a file.
*   See a list of all active walkers and their current status.

It's designed to be easy to use, providing a single, consistent way to interact with your walkers.

## Class WalkerSchemaService

The WalkerSchemaService helps you keep track of your walker schemas, ensuring they are consistent and correctly structured. It uses a special storage system to guarantee type safety.

You add new schemas using the `addWalker` function, and you can find them again later by their name using `get`. 

Before adding a new schema, `validateShallow` checks that it has all the necessary properties and that they are of the expected types.

If you need to update an existing schema, `override` lets you make changes without replacing the whole thing. 

This service relies on a logging system and a registry to manage schemas effectively.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It listens for updates from the optimization process and saves key details like metrics and statistics to a database.

Think of it as a record-keeper for your strategy experiments.

You can subscribe to receive these updates and, just as importantly, unsubscribe when you no longer need them to prevent redundant logging. The service also helps you monitor your progress and identify the best performing strategies during the optimization. It uses a logger to provide helpful debugging information as well.

## Class WalkerMarkdownService

This service helps create and save reports in Markdown format for your trading strategies, specifically focusing on how a "walker" – a process that tests a strategy – performs. 

It listens for updates from the walker as it runs, carefully recording the results of each strategy being tested.  Think of it as keeping score for your trading experiments.

The service uses a clever system to store this data, ensuring each walker has its own dedicated space, and then formats the results into easy-to-read Markdown tables. These reports are then saved to your logs, providing a historical record of your strategy testing.

You can subscribe to receive these updates as they happen, unsubscribe when you're done, and even clear out old data to start fresh.  It provides functions to fetch specific data, generate reports, and dump them to disk, allowing you to analyze and share your trading strategy performance.


## Class WalkerLogicPublicService

This service helps manage and run your trading strategies, often called "walkers," in a structured way. It builds on a private service to handle the core logic, but adds a helpful feature: automatically passing along information like the strategy name, exchange, frame, and walker's name with each run.

Think of it as a layer that simplifies how you execute your strategies.

The `run` function is key; it's used to execute a comparison of walkers for a particular symbol, sending along the necessary context data.  This function returns an asynchronous generator that produces results as they become available. It effectively starts the backtesting process for all strategies.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps you compare different trading strategies against each other. It manages the process of running each strategy and provides updates as they finish. 

It keeps track of the best performing strategy as the tests progress and ultimately delivers a complete, ranked list of results. 

Think of it as a coordinator that uses other services to handle the actual backtesting and reporting.

The `run` method is the main way to use it - you provide a symbol, a list of strategies you want to compare, a metric to optimize for, and some context information about the exchange, frame, and walker.  It then executes each strategy one after another and gives you a stream of results as they come in.


## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with walker functionality within the backtest-kit framework. It provides a straightforward way to access and manage various services related to walkers, strategies, exchanges, and frames, making it easy to integrate these components into your applications. 

Think of it as a convenient layer that simplifies dependency injection, handling the underlying complexity of walker logic.

It uses several services internally, including those for logging, validating strategies, exchanges, frames, walkers, schemas, and validating risk and actions.  The validation process is even checked twice to ensure accuracy and stability.

The `run` method is your primary tool for performing actual walker comparisons. It takes a symbol and context information, allowing you to execute the comparison process and receive results in a streaming fashion.

## Class TimeMetaService

The TimeMetaService helps you keep track of the most recent candle timestamp for each trading setup you're using. It's designed to provide this timestamp even when you're not actively executing trades, like when triggering a command between ticks.

Think of it as a central place to find the current time for your strategies.  It stores this timestamp for each combination of symbol, strategy, exchange, and timeframe.

It automatically updates these timestamps after each tick, so you don't have to worry about manually keeping them current. If a timestamp isn’t available immediately, it waits briefly to see if one arrives.

You can clear the stored timestamps to release memory and ensure you’re working with fresh data, which is important at the start of any trading simulation or live session. This service is designed to be managed centrally and kept synchronized by other parts of the system.

## Class SystemUtils

SystemUtils helps keep your backtest sessions separate and clean. It prevents one test from accidentally messing with another's data.

Think of it as creating a temporary bubble around each backtest.

The `createSnapshot` method lets you essentially freeze the current state of all event listeners. It clears out the listeners for a particular backtest, so you can run a new one without interference. Then, it provides a way to restore them later, putting everything back as it was before.

## Class SyncUtils

SyncUtils helps you understand what's happening with your trading signals. It collects and organizes data from signal openings and closings to give you a clear picture of your trading activity.

You can use it to get summarized statistics, like the total number of signals opened and closed.

It can also generate detailed reports in Markdown format, which includes a table with lots of useful information about each signal: the symbol traded, direction, prices, profit/loss, and more.

Finally, you can easily save these reports to files on your computer for later review, with filenames that clearly identify the symbol, strategy, exchange and whether it's a backtest or live run.

## Class SyncReportService

The SyncReportService is designed to keep track of signal synchronization events, specifically when a signal is opened (like a limit order being filled) or closed (a position is exited). It captures detailed information about these events, including profit and loss (PNL) and the reason for closing. 

This service listens for these synchronization events and stores them in a report database, creating a comprehensive record for auditing order management processes.

To prevent accidental duplicate subscriptions, it uses a system called "singleshot" which ensures only one subscription is active at a time.

Here's a quick rundown of what you can do:

*   You can subscribe to receive these synchronization events. The subscription will automatically unsubscribe itself after.
*   You can unsubscribe directly to stop receiving events, even if the subscription hasn't been explicitly cleared.
*   It uses a logger service to output debugging information if needed.


## Class SyncMarkdownService

This service is responsible for gathering and presenting information about signals, like when they're opened and closed. It listens for signal events and organizes them based on factors like the symbol, strategy, exchange, and timeframe.

Think of it as a record-keeper for your trading activity. It accumulates all these signal lifecycle events and then formats them into readable reports.

You can subscribe to receive these signal events, and it prevents accidental multiple subscriptions. When you unsubscribe, it completely clears all the stored data.

The `tick` function is the workhorse that handles each individual signal event, adding a timestamp to it and storing it properly.

You can request statistics (like total events, opens, and closes) for a specific trading scenario. 

The service can generate reports in markdown format, which you can then save to disk. You can also clear all stored data or just data for a specific setup. This allows you to track how your strategies are performing and identify potential areas for improvement.

## Class SweepValidationService

This service helps ensure that the data configurations you're using (called "sweeps") are correctly set up and compatible.

It keeps track of all registered sweeps, making sure they still exist and that the exchanges they rely on are valid when you try to use them. Think of it like a safety net to prevent errors.

When you add a new sweep, it checks to make sure you haven't already registered one with the same name. It's designed to prevent duplicates, unlike some other parts of the system.

You can also ask this service to show you a list of all the sweeps it's currently tracking.

Here’s a breakdown of its main functions:

*   **Adding Sweeps:**  You register a sweep with its configuration details.
*   **Validation:** It checks if a sweep exists and whether its exchange dependencies are correct. It does this efficiently, only validating once per sweep name.
*   **Listing:** It provides a way to see all the registered sweeps.

## Class SweepUtils

SweepUtils provides a way to test and rank many trading ideas simultaneously, essentially running a "sweep" across different strategies. It profiles each idea using a single candle and then evaluates them based on several metrics like Sharpe ratio, Sortino ratio, profit, and recovery.

The framework lets you tweak various parameters, like exit strategies (hard stops, trailing takes, profit locks, and time limits), to see how they impact performance. Importantly, it doesn't attempt to combine or prioritize ideas from different authors; each author's ideas are evaluated independently.

Author performance is judged based on whether an idea resulted in a profit before hitting a stop-loss, providing statistics on hits, miss, and hit rate. A “rule” is determined by the combination of hold time, profit lock, stop loss, and trailing exit.

You can customize how the results are ordered, but this affects only the presentation; it doesn’t change the underlying calculations or winner selection.

The `run` function is the core of the system. It takes a set of trading ideas and executes the entire simulation process, from generating profiles to ranking the results. It handles data cleaning (removing duplicate ideas or those from different symbols) and applies the defined grid axes to shape the testing environment. The chosen parameters are ultimately validated by a real engine backtest.

## Class SweepSchemaService

The SweepSchemaService acts like a central record keeper for sweep schemas, ensuring they're properly registered and accessible. It maintains a list of sweep schemas, identified by their unique names.

When a new schema is added, it undergoes a quick check to confirm basic requirements are met. This service is crucial because it's the source from which ClientSweep instances are built.

You can register new schemas, effectively creating entries in this record. If you try to register a schema with a name that already exists, it will replace the old one. 

It’s also possible to make partial changes to existing schemas, allowing you to update specific aspects without redefining the entire schema.

Finally, you can retrieve a schema by its name when you need to use it.

## Class SweepGlobalService

SweepGlobalService is the main way to interact with the sweep functionality. It acts as a gatekeeper, making sure the sweep you're requesting actually exists and works with the exchanges involved. 

It then handles the complex process of running a sweep, which includes filtering ideas, evaluating them based on predefined criteria, and determining their rankings.

Here's a breakdown of what you'll find within this service:

*   **loggerService:** Used for logging messages and debugging.
*   **sweepConnectionService:** Manages connections and cached data related to sweeps.
*   **sweepValidationService:** Checks the validity of sweep references.
*   **run:** This is your primary method. You provide a symbol, a sweep name, and a list of ideas, and it returns the complete sweep results after validation and evaluation.

## Class SweepCoreService

This component, the SweepCoreService, acts as the central engine for running simulations. It verifies that everything needed for a sweep – like the symbol and related data – actually exists and is accessible. 

Think of it as the gatekeeper and coordinator. It checks everything is set up correctly and then passes the work along to other parts of the system to perform the actual simulation steps, which involve filtering, evaluating, and ranking different strategies. 

It's connected to other services for logging, managing sweep connections, and ensuring data validity. The `run` method is the main entry point for starting a sweep simulation.


## Class SweepConnectionService

This service manages the connections and lifecycle of sweeps, acting as a central point for interacting with them. It handles creating and caching sweep clients, ensuring you don't recreate them unnecessarily.

Think of it as a smart factory for sweep clients; you ask for a sweep by name, and it gives you a ready-to-use client, remembering it for future use. If the sweep definition is missing certain details, it provides default values.

You can run entire simulation processes through this service, providing data and receiving results.

If you need to refresh the sweep clients entirely, you can clear the cache, forcing a re-creation from the original definitions.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and ensure the correctness of your trading strategies. It acts like a central manager for your strategies, registering them as they're added and making sure they're properly set up. 

Think of it as a safety net – it checks that a strategy exists before you try to use it, and it also verifies that any related risk profiles and actions are valid. To improve speed, it remembers the results of past validations so it doesn’t have to repeat the same checks over and over.

You can use this service to:
*   Add new strategies to its registry.
*   Validate existing strategies to confirm their configurations are correct.
*   Get a complete list of all registered strategies.

It relies on other services – the risk validation and action validation services – to handle more specific checks. The service keeps a private record of all the strategies you've registered.

## Class StrategyUtils

StrategyUtils helps you analyze and understand how your trading strategies are performing. It provides tools to collect data about strategy events, like when a strategy cancels a scheduled order or takes a profit. You can use it to see how many times each type of event has occurred and to create detailed reports summarizing those events.

These reports display key information about each event, including the symbol traded, the strategy used, the price at the time, and when the event happened. You can customize which pieces of information are included.

Finally, StrategyUtils makes it easy to save these reports to files, which can be helpful for sharing your results or keeping a record of your strategy's history. The file names clearly indicate the symbol, strategy, exchange, and whether it's a backtest or live trade.

## Class StrategySchemaService

This service acts as a central hub for managing strategy schemas, keeping track of their definitions and ensuring they are consistent. 

It uses a special registry to store these schemas in a type-safe way, making it less prone to errors.

You can add new strategy schemas using the `addStrategy()` method (or `register` in code), and then retrieve them later by their name using `get()`.

Before adding a new strategy, the service will quickly check its structure using `validateShallow()` to make sure it has all the necessary pieces in place.

If a strategy already exists, you can update it by using the `override()` function which allows to apply partial changes to existing schema. 

The service also has an internal logger which help to debug related issues.

## Class StrategyReportService

This service helps you keep a detailed record of what your trading strategies are doing by writing each action to a separate JSON file. Think of it as creating an audit trail for your strategy's decisions.

To start using it, you need to "subscribe" to the service; this tells it to begin logging events.  Then, whenever your strategy takes actions like canceling a scheduled order, closing a pending trade, taking partial profits or losses, or adjusting stop-loss levels, the service will record these events.

Crucially, unlike other reporting methods, this service writes each event to disk immediately. This is excellent for making sure you have a complete record, even if something goes wrong.

When you're finished, you "unsubscribe" to stop the logging. This ensures you aren't unnecessarily writing data.

There are several functions you’ll use to log specific events, such as `cancelScheduled`, `closePending`, `partialProfit`, `partialLoss`, `trailingStop`, `trailingTake`, `breakeven`, `activateScheduled`, and `averageBuy`. Each of these provides context around the actions being taken, like the strategy name, exchange, frame, timestamp, and performance data.

It’s important to call `subscribe` before you start logging and `unsubscribe` when you are done to ensure proper setup and cleanup.

## Class StrategyMarkdownService

This service helps you track and report on strategy events during backtesting or live trading. It's designed to gather information like when signals are canceled, positions are closed, or take profits/stop losses are adjusted.

Instead of writing each event immediately to a file, it temporarily stores them in memory. This makes it faster and more efficient to generate reports later.

To start using it, you need to "subscribe" to begin collecting events. Then, as your strategy executes, events like `cancelScheduled`, `closePending`, or `partialProfit` are automatically recorded.

You can then retrieve those events using `getData` to get raw statistics, `getReport` to create a formatted markdown report, or `dump` to save that report as a file.  Once you're finished, remember to "unsubscribe" to clear the collected data and stop the tracking.

The `getStorage` property manages how it stores those events, creating a new storage area for each unique combination of symbol, strategy, exchange, frame, and whether you're in backtest mode.

You can clear the collected data if needed, either for a specific strategy or all of them.

## Class StrategyCoreService

The StrategyCoreService acts as the central hub for strategy operations within the backtest-kit framework. It handles core logic like validating strategies, retrieving pending signals, and calculating key position metrics.

It's built on top of other services: StrategyConnectionService (for interaction with the strategy itself) and ExecutionContextService (for managing context like symbol and timeframe).

This service provides methods for accessing and managing a trading position’s state, including:

*   Retrieving signals, cost basis, and P&L information.
*   Checking for breakeven, stop conditions, and paused states.
*   Calculating various performance metrics like drawdown and profit distance.
*   Performing actions like partial profit/loss, averaging buys, and canceling scheduled signals.

The service employs memoization for validation, ensuring performance. Many methods also include backtest mode support and rely on a provided execution context. Actions often delegate to underlying services for actual execution.

## Class StrategyConnectionService

This class acts as a central router for strategy operations within the backtest framework. It manages different `ClientStrategy` instances based on the symbol and strategy name, ensuring each trading strategy operates in isolation. Think of it as a smart dispatcher, directing requests to the right trading logic.

Here's a breakdown of its key functions:

*   **Routing & Caching:** It efficiently retrieves and caches `ClientStrategy` instances, preventing redundant object creation for the same strategy.
*   **Initialization:** It makes sure a strategy is properly set up before any trading actions are performed.
*   **Signal Handling:** It provides methods to retrieve and manage pending, scheduled, and activated signals.
*   **Position Management:** It offers functionalities to check and manipulate various position-related details like percent held, cost basis, P&L, and partial closures.
*   **Backtesting & Live Trading:** Provides separate methods for running simulations (`backtest`) and live trading (`tick`).
*   **Control & Monitoring:**  You can stop, pause, and cancel strategies, and view their current status.
*   **Risk & Partial Management:** It includes methods to validate and execute partial profit, loss, and trailing adjustments.
*   **DCA Functionality:** Provides comprehensive methods to manage and calculate information related to Dollar Cost Averaging (DCA) entries.

Essentially, this service provides a clean, organized, and performant way to interact with and control your trading strategies within the backtest environment.


## Class StorageLiveAdapter

This component manages how your trading signals are stored, offering flexibility by letting you choose different storage methods. It acts as a central point for interacting with your storage, whether you're using persistent storage on disk, keeping data in memory, or using a dummy adapter for testing.

It's designed to be adaptable; you can easily swap out the storage backend by specifying a different constructor for the storage utility.

The `getInstance` property is a clever way to ensure the storage utility is created only when needed and cached for efficiency. If your working directory changes, it's important to use `clear()` to force a fresh creation of the storage utility.

The `handleOpened`, `handleClosed`, `handleScheduled`, and `handleCancelled` methods forward events to the currently selected storage adapter, ensuring consistent handling of signals. Functions like `findById` and `list` also delegate to the active storage adapter.

You can switch between different storage adapters quickly – use `useDummy()` for testing, `useMemory()` for temporary data, or `usePersist()` for the standard persistent storage on disk. The `useStorageAdapter` function allows for a more advanced swapping of storage backends.

## Class StorageBacktestAdapter

This component provides a flexible way to manage how backtest data is stored. It lets you choose different storage methods—like in-memory, persistent disk storage, or a dummy adapter for testing—without changing your core backtesting logic. It uses a design pattern that makes it easy to swap out storage implementations.

The `getInstance` property acts like a smart cache, so it only builds the storage utility once and reuses it, improving performance. Methods like `handleOpened`, `handleClosed`, and `findById` simply pass along actions to whatever storage method you've selected.

You can easily switch between storage options using methods like `useDummy`, `usePersist`, and `useMemory`.  `useStorageAdapter` lets you completely customize the storage mechanism. Remember to call `clear` if your base directory changes during a backtest iteration to ensure a fresh storage instance is used.

## Class StorageAdapter

The StorageAdapter is your central hub for handling both historical (backtest) and current (live) trading signals. It automatically keeps track of signals as they come in, and provides a single place to access them. 

You can turn the adapter on to begin tracking signals, and it ensures that it only subscribes to signal sources once to avoid unnecessary processing. If you need to stop tracking signals, simply disable the adapter – it’s safe to do this repeatedly.

Need to find a specific signal? The `findSignalById` method lets you search for signals by their unique ID. 

Also available are functions to list all backtest signals or all live signals stored within the adapter.

## Class StateLiveAdapter

The StateLiveAdapter helps manage the state of your trading strategies, especially when you're building more complex systems like those driven by LLMs. Think of it as a flexible way to store information about a trading signal – things like how long a position has been open and its highest gain – so that it survives even if your program restarts.

It offers different ways to store this data. By default, it saves everything to a file on your computer, so you don't lose progress. You can also choose to store it only in memory for faster testing, or use a dummy adapter to discard changes if you're just experimenting.

The adapter automatically remembers and updates this information for each signal, which is very useful for implementing trading rules that depend on historical performance.  When a signal is no longer active, the adapter cleans up its stored data.

You can easily switch between these different storage methods to tailor the adapter to your specific needs. To make sure your data is truly fresh, it's good practice to clear the adapter's cache if the program's working directory changes.


## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store the state of your trading strategies during backtesting. It allows you to easily switch between different ways of storing this data, like keeping it only in memory, saving it to files, or even using a dummy adapter that simply ignores changes.

You can choose between a few built-in options: the default in-memory storage, persistent storage using files, or a dummy adapter for testing.  The adapter also lets you use your own custom storage solutions if you need something more specialized.

The `disposeSignal` function is important for cleaning up old data when a trading signal is finished.  It clears out any cached data associated with that signal to prevent memory leaks and ensure accurate results.

`getState` lets you read the current state information, while `setState` is used to update that state as your strategy runs.  There's also a `clear` function to reset the entire cache, which is useful if the base directory for your strategy changes. It keeps track of things like peak performance and how long a position has been open, which is helpful for implementing rules that react to market behavior.

## Class StateAdapter

The StateAdapter is the central piece for managing the state of your backtests and live trading environments. It makes sure state information is handled correctly whether you're running a simulation or a live trade.

It automatically cleans up old state data when a signal is finished, preventing issues caused by outdated information.
It only subscribes to signals once to avoid unnecessary processes.

You can use `enable` to start the state management process, while `disable` stops it – and it's okay to call `disable` more than once.

`getState` lets you retrieve the current state value for a specific signal, and `setState` allows you to update that value. The adapter intelligently directs these operations to either the backtest or live state based on your configuration.

## Class SizingValidationService

The SizingValidationService helps you keep track of and verify your position sizing strategies. It acts as a central place to register your sizing methods, ensuring they are available before you try to use them. 

Think of it as a librarian for your sizing strategies – it knows what’s available and can check if a specific strategy exists.

To make things faster, it remembers the results of its checks, so it doesn't need to re-validate strategies unnecessarily.

You can use it to:

*   Register new sizing strategies with `addSizing`.
*   Confirm a sizing strategy exists before using it with `validate`.
*   Get a list of all registered strategies with `list`. 

This service simplifies managing and guaranteeing the integrity of your sizing configurations.

## Class SizingSchemaService

The SizingSchemaService helps you manage and store sizing schemas, which define how much of an asset to trade. It uses a system that ensures type safety, preventing errors from mismatched data.

You can add new sizing schemas using the `register` method and retrieve them later by their name using the `get` method. If a sizing schema already exists, you can update parts of it using the `override` method.

Before a sizing schema is stored, it undergoes a quick check using `validateShallow` to ensure it has all the necessary components and they are of the right type. This helps maintain the integrity of your sizing schema collection.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade. It's a central component that uses a connection service to perform the calculations and also includes validation checks. Think of it as the engine that translates your risk tolerance into a concrete position size. 

It's a global service, meaning it's accessible and used throughout the backtest-kit framework. The `calculate` method is the core function - you provide details about the trade (like risk parameters), and it returns the recommended position size. The `loggerService` helps track what's happening during these sizing calculations, and the `sizingValidationService` ensures the input data is correct.

## Class SizingConnectionService

The SizingConnectionService helps manage how your trading strategy determines the size of positions to take. It acts as a central hub for sizing calculations, directing requests to the correct sizing implementation based on a name you provide.

To optimize performance, it remembers (caches) frequently used sizing implementations, so it doesn't have to recreate them repeatedly.

It uses the `sizingName` parameter to determine which sizing method to use—think of it as telling it exactly which sizing rule to apply.  If your strategy doesn't have specific sizing rules defined, the `sizingName` will be an empty string.

The `getSizing` property is how you get the sizing implementation. It creates a sizing object the first time it’s used and then reuses it later.

The `calculate` method performs the actual sizing calculations, using the parameters and sizing method you specify. It takes into account risk management considerations when deciding how much to trade.


## Class SessionLiveAdapter

The `SessionLiveAdapter` helps manage and store data during live trading sessions, allowing you to easily swap out how and where that data is kept. It offers a flexible design where you can choose between different storage methods – keeping data in memory only, saving it to a file on your hard drive, or even discarding it entirely for testing purposes. 

You can easily switch between these storage options using helper functions like `useLocal`, `usePersist` (which is the default), and `useDummy`.  If you need even more control, you can also provide your own custom storage implementation. The adapter intelligently caches these storage instances, making them efficient to use. 

The `getData` function lets you retrieve existing session data while `setData` lets you update it.  Remember to call `clear` if the working directory changes between strategy runs to ensure fresh instances are created.

## Class SessionBacktestAdapter

This component provides a flexible way to manage session data during backtesting. It acts as an intermediary, letting you easily swap out how session data is stored and retrieved. By default, it uses an in-memory store, but you can switch to a persistent file-based storage or even a dummy adapter that ignores all data changes. 

The adapter keeps track of session data based on the trading symbol, strategy name, exchange, and timeframe, ensuring the correct data is used in each backtest.

To change the storage method, use the `useLocal`, `usePersist`, or `useDummy` functions. For advanced users, `useSessionAdapter` lets you plug in your own custom session management implementation. You can also clear the cached session data using `clear`, which is useful when the working directory changes during backtesting. This adapter retrieves and updates session values using `getData` and `setData` functions, respectively, promising data accessibility for your backtest runs.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data storage during both backtesting and live trading. 

It intelligently directs operations to either the backtest storage (SessionBacktest) or live storage (SessionLive) depending on whether you're running a simulation or a live trade.

You can retrieve data, like past signal values, by using the `getData` method, specifying the symbol, relevant strategy and exchange information, whether it's a backtest, and the timestamp. 

Similarly, the `setData` method lets you update signal values, ensuring the correct storage location is used based on the backtest flag. Essentially, this adapter simplifies data management by abstracting away the differences between backtest and live environments.

## Class ScheduleUtils

ScheduleUtils helps you easily monitor and understand how your scheduled signals are performing. It's a central place to gather information about signals waiting to be processed, those that were cancelled, and how long they're typically waiting.

Think of it as a toolkit for keeping track of your scheduled actions.

You can retrieve statistics for specific symbols and strategies to see how things are running.
It also generates clear, readable markdown reports, so you can quickly assess performance and identify any issues. Finally, you can save these reports directly to your computer for later review. 

The system keeps track of things like cancellation rates and average wait times, giving you insights into potential bottlenecks or problems with your scheduling. It's designed to be simple and convenient to use throughout your backtesting or live trading processes.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of how your scheduled signals are performing. It listens for events related to scheduled signals—when they're created, when they start, and when they're canceled.

It automatically calculates how long it takes between a signal being scheduled and when it actually executes or gets canceled. 

This information is then saved in a database so you can analyze delays and understand any issues affecting your trading.

You can easily start and stop the service from listening to signal events using the `subscribe` and `unsubscribe` functions, making sure you aren't accidentally listening multiple times. The `tick` property manages the actual processing of signal events and database logging.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you track and understand your scheduled trading signals by automatically generating detailed reports. It keeps tabs on when signals are scheduled and when they’re cancelled, organizing this information by strategy.

It creates easy-to-read markdown tables filled with information about each signal event, and also calculates helpful statistics like cancellation rates and average wait times. These reports are then saved as files, making it simple to review your strategy's performance over time.

You can subscribe to receive these updates in real-time, and the service is designed to prevent accidental multiple subscriptions.  You can also request specific data or reports for a particular symbol and strategy, or clear out all accumulated data if needed. The service handles the storage of this information efficiently and creates directories if they don't already exist.

## Class RiskValidationService

This service helps you keep track of your risk management setups and make sure they’re all valid before you use them in your trading strategies. Think of it as a central place to register your risk profiles – like maximum loss limits or position sizing rules – and double-check they're present before anything happens. 

It keeps a list of all the risk profiles you’ve defined, and provides a way to confirm that a particular profile exists before attempting to use it in your backtests or live trading. To speed things up, the results of these validations are stored, so the service doesn't have to repeatedly check the same configurations.

You can add new risk profiles, validate existing ones, and get a full listing of everything you’ve registered. This service helps prevent unexpected errors and ensures your risk management rules are properly in place.

## Class RiskUtils

This class helps you analyze and understand risk rejections within your trading system. It acts as a central point for gathering and presenting data about rejected trades, specifically focusing on events flagged as risky.

It collects information from risk rejection events, which include details like the symbol, strategy used, position, and the reason for rejection.

You can use it to get summarized statistics on rejections, such as the total count and breakdowns by symbol or strategy. It also allows you to generate detailed reports in Markdown format, displaying the events in a table with key information. Finally, you can easily save these reports to files for later review and analysis, with automatically generated filenames to keep things organized.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a well-organized and type-safe way. It uses a registry to store these schemas, ensuring consistency and reducing errors.

You can add new risk profiles to the registry using the `addRisk()` function, and easily find them later by their names using `get()`. 

Before adding a schema, `validateShallow()` checks it to make sure it has all the necessary parts.

If a risk schema already exists, you can update parts of it with `override()`.

The service also has a logger for keeping track of what's happening behind the scenes.

## Class RiskReportService

The RiskReportService helps you keep a record of when your risk management system blocks trades. It's designed to capture those instances where a signal is rejected, along with the reason why and details about the signal itself. 

This service listens for these rejection events and stores them in a database, allowing you to review them later for analysis or auditing. You can easily set it up to receive these events, and it prevents accidental duplicate subscriptions. 

When you’re done, you can unsubscribe to stop the service from processing these rejection events. The service also includes a logger to help you debug any potential issues.

## Class RiskMarkdownService

This service helps you create and save reports detailing risk rejections in your trading system. It listens for events signaling risk rejections and organizes them by symbol and trading strategy. 

You can think of it as a data collector and reporter for rejected trades.

The service compiles this information into easy-to-read markdown tables, complete with statistics like the total number of rejections, broken down by symbol and strategy. It then saves these reports as markdown files, making them accessible for review and analysis.

You subscribe to receive these rejection events, and the service carefully manages this subscription to prevent issues. It also provides functions to retrieve aggregated data, generate reports, save them to disk, and even clear out all accumulated data when necessary. The reporting is specific to a combination of symbol, strategy, exchange, frame, and backtest setting, ensuring accuracy and relevant information.

## Class RiskGlobalService

This service manages and validates risk limits during trading. It's a central component that works behind the scenes to ensure trading activity stays within defined boundaries.

It wraps other services related to risk connections and validations, providing a single point for managing these aspects.

The `validate` function efficiently checks risk configurations, remembering previous results to avoid unnecessary repeated checks.

The core functions include `checkSignal`, which determines if a trade is permissible based on risk rules, and `checkSignalAndReserve`, a safer version for concurrent environments that guarantees a placeholder is reserved before validation. 

You'll also find methods for registering (`addSignal`) and closing (`removeSignal`) trades with the risk management system. Finally, the `clear` function allows you to reset all, or a specific subset, of the risk data.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently routes risk-related operations to the correct implementation, ensuring that your trading logic adheres to predefined risk limits.

Think of it as a dispatcher that takes requests like "check if this trade is allowed" and sends them to the appropriate risk handler. To speed things up, it remembers previously used risk handlers, so it doesn’t have to recreate them every time.

The `getRisk` method is the key here – it's how you retrieve the specific risk handler you need, making sure it’s tailored to the exchange and frame you're dealing with.

The `checkSignal` method is what ultimately decides whether a trading signal is permissible, considering factors like portfolio drawdown and position limits.  `checkSignalAndReserve` does the same, but with extra care to avoid conflicts when multiple signals are coming in simultaneously.

Finally, `addSignal` and `removeSignal` are used to keep the risk management system updated as trades are opened and closed, and `clear` is there to reset the system when needed. This ensures the risk model stays in sync with the trading activity.

## Class ReportWriterAdapter

The ReportWriterAdapter is designed to handle and store your trading data, providing a flexible way to manage how that data is saved. It allows you to easily switch between different storage methods without changing the core logic of your trading strategies.

It keeps track of the storage used for each type of report (like backtest results, live trading data, or walker events), making sure you only have one storage instance for each. This improves efficiency and prevents conflicts.

By default, it saves data in JSONL format. However, you can easily change this to use a different storage method by providing your own adapter.

The `writeData` function is the main way to save your data; it automatically sets up the storage the first time you save a particular type of report. It also includes real-time event logging capabilities.

You can use `useReportAdapter` to change the way reports are stored, `clear` to reset the storage cache (important if your working directory changes), `useDummy` to temporarily stop writing data for testing, and `useJsonl` to go back to the default JSONL storage.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework produce detailed reports and log data. Think of it as a way to turn on or off specific monitoring for things like backtesting, live trading, or strategy performance.

You can use `enable` to start collecting data from the services you’re interested in, like backtests or live trades. This will cause those services to create JSONL files with relevant information which can be used for later analysis. Critically, `enable` gives you a function to *stop* the data collection later - don't forget to use it to avoid problems!

Conversely, `disable` allows you to stop monitoring specific services without affecting others. This is useful if you want to reduce the amount of data being generated or if you only need certain reports at certain times. It doesn’t require a special cleanup function like `enable`.


## Class ReportBase

This framework component, `ReportBase`, provides a way to log events to files in a structured, efficient manner. Think of it as a dedicated tool for capturing and storing data generated during trading simulations or backtests. It creates a single JSONL file for each type of report, ensuring that data is consistently written and organized.

The system handles file creation automatically and includes built-in safeguards to prevent data loss, like timeouts and a buffer to manage how quickly data is written. You can search within these reports using criteria like the trading symbol, the strategy employed, the exchange used, or the timeframe.

To start using it, you specify a report name and a base directory for storage. The `waitForInit` method sets everything up, and the `write` method adds new data to the file, automatically including helpful metadata like timestamps and search flags. This makes it easy to analyze and debug trading strategies after they've been run.

## Class ReportAdapter

The ReportAdapter helps you manage and store structured data, like events and analytics, in a flexible way. Think of it as a central point for handling where and how your reports are saved.

It's designed to be easily adaptable – you can swap out the storage mechanism without changing your core logic. The adapter remembers which storage method you're using, so you don't have to keep setting it.

If you need to quickly test things or disable report writing, there's a dummy adapter that simply ignores all writes. The default method is to write reports as JSONL files, which is a common format for event data.

You can clear the adapter’s memory if your working directory changes, ensuring that your reports are stored in the correct location. This is particularly useful during repeated strategy runs.


## Class ReflectUtils

This class provides tools for examining the performance of a trading position in real-time, whether you’re live trading or backtesting. It offers a unified way to get key metrics like unrealized profit and loss, peak profit levels, and drawdown information. This functionality is accessible through a single, globally available instance, simplifying your code.

You can use methods like `getPositionPnlPercent` and `getPositionPnlCost` to find the current unrealized P&L in percentage and dollars, respectively. For understanding performance extremes, methods like `getPositionHighestProfitPrice`, `getPositionMaxDrawdownPrice`, and related timestamp and P&L versions will be invaluable.

It also lets you check how long a position has been active (`getPositionActiveMinutes`), how long a signal has been waiting (`getPositionWaitingMinutes`), and calculate durations related to peak profit and drawdown (`getPositionDrawdownMinutes`, `getPositionHighestProfitMinutes`, `getPositionMaxDrawdownMinutes`).

Finally, it provides methods for understanding distances from the peak and trough, such as `getPositionHighestProfitDistancePnlPercentage` and `getMaxDrawdownDistancePnlPercentage`. These give you insights into how far your position is from its best and worst points. Keep in mind that most of these functions will throw an error if there’s no pending signal.

## Class RecentLiveAdapter

RecentLiveAdapter helps you manage and retrieve recent trading signals, and it's designed to be flexible. It uses an adapter pattern, allowing you to easily switch between different storage methods like persistent storage (saving signals to disk) or in-memory storage.

You can think of it as a central hub for fetching recent signal data, delegating the actual storage and retrieval to specialized components.  The `getInstance` property is a clever way to ensure you're always working with a current, cached version of the storage utility, which is rebuilt if needed.

You can control which storage method is active using `usePersist` for disk storage and `useMemory` for temporary, in-memory storage.  If your working environment changes, `clear` ensures a fresh start for signal retrieval by rebuilding the instance.  Finally, `useRecentAdapter` lets you plug in completely custom storage implementations if needed.

## Class RecentBacktestAdapter

This component manages how recent trading signals are stored and accessed. It provides a flexible way to switch between storing signals in memory or persistently on disk.

Think of it as a layer that sits between your backtesting code and the actual storage of signal data. You can easily change where that data lives without modifying the core backtesting logic.

It uses a factory pattern to create the storage utilities and caches them for speed, but offers a way to clear that cache when needed, like when the base directory changes. 

You can choose to use in-memory storage for quick, temporary analysis or switch to persistent storage to preserve signals across sessions. The adapter pattern allows you to plug in different storage mechanisms if needed.

## Class RecentAdapter

RecentAdapter is your central hub for managing recent trading signals, whether you're backtesting or running live. It automatically keeps track of signals and ensures you always have access to the most up-to-date information.

You can easily enable or disable this tracking; it's designed to prevent accidental duplicate subscriptions.

Need to know the latest signal for a specific trading pair and strategy? `getLatestSignal` retrieves it, prioritizing backtest data and protecting against look-ahead bias.  It even tells you how long ago the latest signal was generated using `getMinutesSinceLatestSignalCreated`, also with look-ahead bias protection.

If you need to check if any signals exist at all, `hasNoLatestSignal` provides a quick way to determine that, which is useful for preventing errors when calculating time since the last signal.

## Class PriceMetaService

PriceMetaService helps you reliably get the current market price for a specific trading setup – think symbol, strategy, exchange, and timeframe. It keeps track of these prices, updating them as new ticks come in.

Essentially, it's designed to give you access to the price outside of the usual trading cycle, like when you need to react to something between ticks.

It works by storing each price in a special container, and if a price hasn’t been received yet, it’ll wait a little while. If you’re already in the middle of a trading action, it pulls the price directly from the exchange.

The service is managed centrally, updated automatically by the system, and can be easily reset to clear out old information. You can clear all prices or just a specific one if needed, which is a good practice at the start of a trading session.


## Class PositionSizeUtils

This class offers tools to help determine how much of an asset to trade, a critical part of managing risk. 

It provides pre-built methods for common position sizing strategies, like fixing a percentage of your account at risk, employing the Kelly Criterion, and using Average True Range (ATR).

Each method has built-in checks to ensure the parameters you provide are compatible with the sizing technique being used. 

Think of it as a toolbox – you select the method that aligns with your trading style and the class handles the math and validation for you. 

Here’s a quick look at the available methods:

*   **fixedPercentage:**  Calculates position size based on a fixed percentage of your trading account that you're willing to risk.
*   **kellyCriterion:**  Determines position size using the Kelly Criterion formula, which aims to maximize long-term growth based on win rate and win/loss ratio.
*   **atrBased:**  Calculates position size based on the ATR, reflecting market volatility.

## Class Position

The `Position` utility helps you figure out where to set your take profit and stop loss prices when you're trading. It’s designed to work whether you're going long (buying) or short (selling).

The `moonbag` function is a quick way to calculate levels where your take profit is automatically set to a significant gain (50% from the current price) and your stop loss is determined by a percentage.

The `bracket` function is more flexible, letting you define both your take profit and stop loss as percentages. This allows for a more customized risk-reward profile.


## Class PersistStrategyUtils

This class helps manage how strategy data is saved and retrieved, especially those things that need to be done later, like user actions or signals. It's designed to work with the `ClientStrategy` to ensure those deferred actions are persisted correctly when the system is running.

It uses a clever system to create only one storage instance for each strategy, symbol, and exchange combination. You can even customize how that storage looks, choosing from different "adapters" like a file-based system or a dummy version for testing.

The class provides functions to read and write this deferred data. It automatically creates the necessary storage on the first time it’s used.

If you need to change the way strategies are persisted, or want to reset the caching, it offers methods to clear the cache or switch between different persistence adapters. This is useful when the working directory changes.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file. Think of it as a way to remember where your strategy left off, even if the program closes unexpectedly.

It automatically manages file operations to ensure your data is safe and consistent.

The class needs to know which asset your strategy trades (symbol), the name of the strategy, and the exchange it uses. It stores everything under a specific name ("strategy") within its file storage.

Here’s what you can do with it:

*   You can initialize the storage to make sure everything is ready.
*   You can retrieve the saved strategy data, or clear the saved data to start fresh.
*   It handles the actual saving and loading of the strategy’s data to the file.

## Class PersistStorageUtils

This class helps you manage and safely store signal data, ensuring that your backtest results and signals are preserved even if things go wrong. It intelligently creates and manages storage instances, making sure you don't have to handle the details yourself.

You can easily swap out the storage mechanism, using custom adapters for different storage solutions or falling back to the default file-based storage or even a dummy storage for testing. It also ensures that writing data is done carefully and reliably.

The class automatically creates a storage instance for both backtest and live modes and remembers these instances to avoid creating them repeatedly. If you change the working directory, it's important to clear this cache. 

Signals are stored individually as separate files, allowing for organized and manageable data persistence.


## Class PersistStorageInstance

This class provides a way to store trading signals to files, making your backtesting data persistent even if your application crashes. It acts as a bridge between your trading logic and the file system.

Each signal is saved as its own JSON file, making it easy to manage and access individual signals.

The `backtest` property simply indicates whether the storage is being used in a backtesting context.

You can use `waitForInit` to ensure the storage is ready before you start reading or writing data.

`readStorageData` retrieves all the stored signals, looping through each individual file.

`writeStorageData` is used to save a collection of signals, and it handles saving each signal separately and safely.

## Class PersistStateUtils

This class helps manage how your trading strategy’s state is saved and loaded. It ensures that each piece of data you want to persist – identified by a signal ID and a bucket name – has its own reliable storage location.

Think of it as a smart organizer for your strategy's memory.

It automatically handles creating the necessary storage for your data and uses a memoization technique, meaning it only creates the storage once for each signal and bucket combination. You can also easily swap out the default storage method for alternatives like dummy data for testing or a custom solution.

The `waitForInit` method allows you to control the initial setup of state storage, while `readStateData` and `writeStateData` are your go-to functions for accessing and updating your saved strategy information. Functions like `clear` and `dispose` help keep things tidy by clearing out old storage when it’s no longer needed, such as when you change the working directory or remove a signal. Finally, `usePersistStateAdapter` allows you to plug in your own custom ways of storing data.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a simple way to save and load trading state data to a file. Think of it as a reliable container for your important settings and data. It uses a file-based system, meaning your information is stored directly on your computer.

It organizes data using a unique identifier, combining a signal ID and a bucket name to keep things clearly separated. 

The `waitForInit` method prepares the storage area before any data is written.  You can use `readStateData` to retrieve previously saved information and `writeStateData` to save your current state.

Importantly, the `dispose` method doesn't do anything itself – it relies on a separate utility function to clean up any temporary memory caches.

## Class PersistSignalUtils

This utility class helps manage how signal data is saved and retrieved, ensuring that each strategy's data is handled correctly. It acts as a central point for dealing with signal persistence, keeping things organized and reliable.

The class remembers which storage method is active for each strategy, preventing redundant setup and improving efficiency. You can easily switch between different storage options like file-based storage, a dummy mode for testing, or a custom method you define yourself. 

The `readSignalData` function fetches the signal information, creating the storage if it doesn’t already exist, while `writeSignalData` saves the new or updated data, or clears the information entirely. It’s designed to handle situations where the application might crash or restart, ensuring data isn’t lost.

You can tell it what kind of storage to use with functions like `usePersistSignalAdapter`, `useJson`, or `useDummy`. The `clear` method is important for resetting the storage cache when the application's working directory changes.

## Class PersistSignalInstance

This class helps you reliably save and retrieve signal data for your trading strategies. Think of it as a secure way to keep track of your signals on disk.

It's designed to work with a specific trading symbol, strategy name, and exchange—effectively creating a dedicated space for each combination.

The class automatically handles file operations safely, minimizing the risk of data loss, even if your program unexpectedly crashes.

Here's what you can do with it:

*   **Initialization:** It sets up the underlying storage mechanism.
*   **Reading:** You can easily retrieve the saved signal data associated with a particular symbol.
*   **Writing:** It allows you to save new signal data or clear out existing data, again tied to the symbol.

Essentially, `PersistSignalInstance` ensures your signal data is stored consistently and safely.

## Class PersistSessionUtils

This class helps manage how session data is saved and loaded, making sure things are handled safely and consistently. It's designed to make it easy to persist data for different strategies, exchanges, and analysis frames.

The core idea is to create a system where session data is automatically stored in files, but you can also customize how that storage happens. It avoids creating redundant storage instances by keeping track of what's already been created.

You can easily swap out the default file-based storage for other methods, like using a dummy adapter for testing or providing your own custom implementation. There are utilities for clearing old data and ensuring cleanup when sessions are no longer needed. If you’re changing working directories, clearing the cached data is recommended. This ensures that the system handles data reliably, even if there are interruptions or crashes.

## Class PersistSessionInstance

This class helps save and load the state of your trading sessions, especially useful when you need to resume where you left off. It's designed to work with files, keeping track of things like your strategy and exchange settings.

It organizes data by strategy, exchange, and a unique identifier for each session (frameName), making sure each trading instance has its own dedicated storage.  The class also includes the symbol and backtest flag to prevent conflicts if multiple symbols are being tested with the same strategy.

You can use it to load previously saved session data, write new data to persist your progress, and the system handles cleanup automatically. The `waitForInit` method makes sure the storage is ready before you start, while `readSessionData` and `writeSessionData` handle loading and saving the actual session information. Finally, the `dispose` method doesn't actually do anything itself, instead relying on a separate utility function to manage cleanup.

## Class PersistScheduleUtils

This class helps manage how scheduled trading signals are saved and retrieved, ensuring data consistency even if things go wrong. It automatically creates storage for signals specific to each trading strategy and the markets it's trading. 

You can customize how these signals are stored by providing your own storage solution. The system only creates a storage instance once for a specific combination of market, strategy, and exchange.

If your application needs to reload its configuration or if the working directory changes, you can clear the stored data to force a refresh.

There are built-in options for using a standard file-based storage or a dummy storage for testing purposes.  This ensures your scheduled signals are handled reliably and consistently across different runs of your trading strategy.

## Class PersistScheduleInstance

This class provides a way to save and retrieve scheduled signals to a file, ensuring data persistence even if your application crashes. It’s designed specifically to work with strategies and exchanges, identifying signals by a unique combination of symbol, strategy name, and exchange.

Essentially, it wraps a file-based storage system to guarantee that writing data happens reliably.

The constructor sets up the unique identifier for each signal, combining the symbol, strategy name, and exchange name. 

You’ll use `waitForInit` to make sure the underlying storage is ready before attempting to read or write anything.  `readScheduleData` lets you pull back the saved signal information, and `writeScheduleData` allows you to update or clear that information.


## Class PersistRiskUtils

This class helps manage how active trading positions are saved and retrieved, especially for risk management. It keeps track of these positions separately for different risk profiles, ensuring data consistency. 

It allows for flexibility by letting you plug in different ways to store this data, whether it's using files, a custom system, or even a dummy version for testing. The class automatically handles reading and writing position data, and ensures these operations happen reliably.

You can easily switch between storage methods, such as using a file-based system, a custom adapter, or a dummy mode for testing. It’s designed to be crash-safe, meaning it can recover if something goes wrong during a trading session. It's primarily used by the ClientRisk component to remember active positions during live trading. 

The `clear` function is useful when your application’s working directory changes; it refreshes the storage cache.

## Class PersistRiskInstance

This class, `PersistRiskInstance`, provides a reliable way to save and retrieve risk data, specifically focusing on positions. It’s designed to work consistently across different parts of your trading system. 

It essentially handles the details of saving data to a file, making sure the process is safe and doesn't lose information even if something unexpected happens. 

Think of it as a secure vault for your position data, always labeled as "positions" and accessible in a predictable way.

Here's a breakdown of what it does:

*   It uses a fixed identifier to store all positions data together.
*   It makes sure writes are completed reliably, minimizing the risk of data loss.
*   You can trigger its initialization if needed.
*   It retrieves all existing position data.
*   It saves new or updated position data.

The class is built to be straightforward and easy to integrate into your backtesting or trading framework, allowing you to focus on the trading logic itself.

## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, making sure the process is reliable even if things go wrong. It's designed to be used by other tools for backtesting and live trading.

It keeps track of the storage for signals based on the symbol, strategy, exchange, and timeframe being used, ensuring that each combination has its own dedicated storage.

You can customize how the data is stored by providing your own storage constructor, which allows you to use different data formats or storage methods.  The system remembers these stored signals so they are readily available.

The class also helps ensure that writes to storage are done reliably.

It has a handy `clear` function which can be used to refresh its memory when your working environment changes.

Finally, there are some convenient shortcuts: `useJson` for standard file storage, and `useDummy` which is helpful for testing as it pretends to save signals without actually doing anything.


## Class PersistRecentInstance

This class helps you save and retrieve the most recent data for a specific trading strategy. It's designed to work with files, ensuring your data is stored reliably. 

Think of it as a way to remember the last signal your strategy generated. 

The class takes information like the trading symbol, strategy name, exchange, frame name, and whether it's a backtest or live session to identify where to store the data.

It uses these details to create a unique location for storing the data. 

You can use `waitForInit` to make sure the storage is ready, `readRecentData` to get the last saved signal, and `writeRecentData` to update it. It’s particularly useful for keeping track of key information during backtesting or live trading.


## Class PersistPartialUtils

This class helps manage and save partial profit and loss information for trading strategies, making sure that data isn't lost even if things go wrong. It uses a clever system to create storage areas for each strategy and trading symbol, ensuring each one has its own dedicated space. 

You can customize how this data is stored – for example, you could use a file, a database, or even a dummy setup for testing. The system automatically creates these storage areas when they're needed, and it makes sure that reading and writing data happens safely and reliably.

To keep things running smoothly, you can clear out the existing storage areas if the program's working directory changes. There are also shortcuts for using default storage methods like file-based persistence or a dummy instance that does nothing.


## Class PersistPartialInstance

This class, `PersistPartialInstance`, helps you save and load pieces of your trading strategy's data to a file. It's designed to be reliable, even if your program crashes unexpectedly.

Think of it as a way to save checkpoints for your strategy's progress. It uses the trading symbol, strategy name, and exchange name to organize where it stores this data.

Internally, it uses a file to store the data, ensuring that updates happen safely.  It assigns a unique identifier to each piece of data, making it easy to retrieve specific information later.

You can use `waitForInit` to make sure the storage is ready before you start saving or loading data. `readPartialData` fetches saved data for a specific signal, and `writePartialData` saves new or updated data.

## Class PersistNotificationUtils

This class provides tools to handle saving and retrieving notification data, ensuring it's done reliably and consistently across different testing environments. It acts as a central place to manage how notifications are stored, using a system that avoids data loss even if something goes wrong.

The class uses a clever technique called memoization, meaning it only creates a storage instance once per testing mode (like "backtest" or "live"), which improves efficiency. You can customize how these notifications are actually stored by providing your own storage implementation.

To get your notifications back, use `readNotificationData`. If the storage hasn't been created yet for the specific mode, this function will create it on the fly. Similarly, `writeNotificationData` is used to save the notifications.

If you want to use a different storage method, you can register a custom storage constructor with `usePersistNotificationAdapter`. `useJson` will switch back to the standard file-based storage, and `useDummy` will create a dummy storage where nothing is actually saved, useful for testing. You can also clear the cache using `clear`, which is useful when the working directory changes.

## Class PersistNotificationInstance

This class helps manage and save notification data persistently, like writing it to files so it’s not lost when your application restarts. It's specifically designed to work well with backtesting environments.

It stores each notification as its own individual file, making it easy to access and manage them.  The system uses atomic writes to prevent data corruption even if something unexpected happens during the save process.

To use it, you initialize it with a boolean indicating whether it's being used in a backtest scenario.  The `waitForInit` method prepares the storage for use.  You'll use `readNotificationData` to load all saved notifications and `writeNotificationData` to save new or updated notifications, ensuring they're securely stored and accessible later.

## Class PersistMemoryUtils

This utility class, `PersistMemoryUtils`, handles saving and retrieving data related to memory instances, especially when dealing with things like backtesting trading strategies. It acts as a central point for managing this data, ensuring it's stored consistently and efficiently.

Think of it as a smart system for keeping track of pieces of information. It keeps track of where these pieces are stored based on identifiers like signal IDs and bucket names.

Here's a breakdown of what it does:

*   It manages how memory data is stored on disk in a specific file structure.
*   It allows you to customize how memory instances are created, offering different options for persistence.
*   It initializes memory storage when needed and checks if data exists.
*   It safely writes, removes, and retrieves memory entries.
*   You can even use it to clean up and delete storage entries when they're no longer needed.
*   It provides a way to rebuild indexes of stored data.
*   It lets you easily switch between different storage methods, like using a file-based system or a dummy system for testing.

## Class PersistMemoryInstance

This class provides a way to store and retrieve data related to signals, using files to persist the information. Think of it as a specialized database for signal data. It lets you save data entries, identify them by a unique ID, and later read them back.

You can also "soft-delete" entries – marking them as removed instead of permanently deleting them.  When listing available data, those soft-deleted entries are excluded.

The class handles the technical details of saving and reading data to and from files, ensuring that changes are saved reliably.  It’s designed to work in coordination with other utilities to manage memory caching, so you don't have to worry about manually cleaning up resources. It’s initialized with a signal ID and a bucket name to organize data.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, ensuring that the data is persistently stored and readily available. It organizes cached data based on a combination of timestamp and symbol, using a system that creates a unique storage instance for each of these combinations.

The framework provides flexibility by allowing you to customize how this data is stored, either by providing your own storage implementation or using the built-in file-based or dummy options.

Key functions include reading, writing, and deleting cached data, all while ensuring the process is reliable and safe even if unexpected issues occur.  It also offers a way to clear the internal cache when necessary, like when the working directory changes. These features make managing and reusing API responses efficient and robust within your backtesting environment.

## Class PersistMeasureInstance

This class provides a way to store and retrieve measure data, like performance metrics, persistently to disk. It's designed to be a reliable way to save your data, ensuring changes happen completely or not at all. 

The `bucket` property defines where the data is stored on your file system.  

The `waitForInit` method ensures the storage area is ready before you start saving anything.

You can retrieve individual data entries using `readMeasureData`, which will return nothing if the entry doesn't exist or has been marked for deletion.

`writeMeasureData` is used to save new data, and `removeMeasureData` allows you to "soft delete" entries—meaning the data remains on disk but is excluded from regular listings.

Finally, `listMeasureData` provides a way to get a list of all the available (non-deleted) data keys in the bucket. It effectively filters out any entries that have been soft-deleted.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how your trading strategy's log data is stored and accessed. Think of it as a central place to handle saving and retrieving your log entries. It keeps a cached copy of the log instance, making things faster, and allows you to easily swap out different storage methods.

It uses individual files to store each log entry, which helps prevent data loss and makes it easier to track individual events.  The system is designed to handle crashes gracefully, making sure your log data remains safe.

You can customize how logs are stored by using different "adapters", essentially pluggable components that handle the persistence details. It also provides shortcuts for common adapters like a file-based system and a dummy adapter that does nothing – helpful for testing.  Clearing the cache ensures a fresh start when the working directory changes.

## Class PersistLogInstance

This class helps you store and retrieve log data persistently, typically to a file. It acts as a reliable record-keeper for your trading backtests.

Each log entry is saved as a separate file, ensuring that existing entries aren't accidentally erased. This design prevents data loss and makes sure your backtest history remains intact.

The system is designed to be crash-safe, meaning it handles unexpected interruptions gracefully.

You can use `waitForInit` to make sure the storage is ready before you start writing or reading. `readLogData` lets you pull all the saved log entries, and `writeLogData` adds new entries to the persistent storage, always appending them and skipping any IDs that already exist. The underlying storage mechanism itself is handled internally, allowing you to focus on the backtesting logic.

## Class PersistIntervalUtils

This class helps manage persistent markers that indicate when a specific interval has fired. It essentially keeps track of which intervals have already run, preventing them from firing repeatedly within the same time window.

The markers are stored as files in a directory structure under `./dump/data/interval/`.  If a file exists for a particular bucket and key, it means that the interval has already fired for that bucket. If the file is missing, it signifies the interval hasn't fired yet or returned null last time.

You can customize how these markers are persisted using adapter functions, switching between different persistence methods like a standard file-based approach, a JSON-based solution, or even a dummy implementation that performs no actual persistence.

The `clear` method is important to use when your working directory changes during a strategy run, ensuring the persistence cache is reset.

You can read, write, or delete these markers programmatically using the available methods to control when intervals are considered “fired.”

## Class PersistIntervalInstance

This class helps manage and store interval data persistently, essentially acting as a file-based archive for your trading strategies. It wraps another storage system to ensure that writes are handled safely and consistently.

Think of it as a way to keep track of when certain events should happen, like re-evaluating a trading rule. 

Here’s what it does:

*   **File Storage:** It uses files to store data, making sure that even if your program restarts, the information isn't lost.
*   **Soft Deletes:** When you want to "delete" a record, it doesn't actually erase it, just marks it as removed. This is useful because it allows intervals to re-trigger later if needed.
*   **Initialization:** It needs to set up the file storage before you start using it.
*   **Reading and Writing:** It provides straightforward ways to read and write this interval data to the storage.
*   **Listing Markers:** You can get a list of currently active (non-deleted) interval markers.



The `bucket` property defines the name of the storage folder. The `_storage` property is internal and represents the underlying file storage used.

## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate file. It's designed to be efficient by checking if the cached data is complete before loading it and automatically updating the cache when needed.

The class uses a system where it creates and manages instances of candle caches for each trading symbol, time interval, and exchange. You can customize how these cache instances are created, providing flexibility in storage methods. 

The `readCandlesData` function fetches the cached data, while `writeCandlesData` saves new data. If you need to change how the candles are persisted, you can use the `usePersistCandleAdapter` method to swap in a different caching mechanism, or you can revert to the default file-based approach with `useJson`.  The `clear` method allows you to refresh the cache when the working directory changes.

## Class PersistCandleInstance

This class helps you persistently store and retrieve candle data, acting as a bridge between your trading strategy and a file system. Think of it as a way to save snapshots of price action for later review or replay.

Each candle is saved as a separate file, making it easy to access individual data points.

If a candle is missing when you try to read it, the system treats it as if it needs to be re-fetched from the original data source.

When writing candles, it avoids saving incomplete data – only fully closed candles are stored, and it won't overwrite existing data. 

This design ensures that the storage grows consistently and avoids data corruption.  The constructor requires the symbol (asset being traded), the candle interval (e.g., 1 minute, 1 hour), and the exchange name for organization. The `waitForInit` method initializes the storage, while `readCandlesData` retrieves candles within a specified range, and `writeCandlesData` saves new candles.

## Class PersistBreakevenUtils

This class helps manage and save your breakeven data, which is crucial for tracking how your trades are performing. It acts as a central hub for reading and writing this data to files on your computer.

Think of it as a smart filing system specifically for breakeven information, making sure the data for each trade (identified by symbol, strategy, and signal) is stored and retrieved reliably.

It's designed to work efficiently – it only creates the necessary files and data structures when you actually need them. The system keeps track of these data files, so it doesn't have to recreate them every time.

You can customize how this data is stored, and even use a "dummy" mode to test your code without actually saving anything to disk.

The class uses a singleton pattern so you can easily access it from anywhere in your backtest-kit project, and the files are structured in a predictable way inside a directory called 'dump/data/breakeven'.

## Class PersistBreakevenInstance

This class provides a way to reliably store and retrieve breakeven data for your trading strategies. It’s designed to be crash-safe, ensuring your data isn't lost if something goes wrong.

Think of it as a secure container for keeping track of breakeven points, specifically linking them to a symbol, a trading strategy, and an exchange. 

It uses a file to store this information, making sure changes are written safely and atomically. 

The `waitForInit` method prepares the storage area when needed, while `readBreakevenData` lets you fetch existing breakeven data for a particular signal, and `writeBreakevenData` allows you to save new or updated data. 

Each piece of data is identified by a unique signal ID, ensuring you can easily find and manage it within your trading context.


## Class PersistBase

PersistBase provides a foundation for reliably saving and retrieving data to files. It's designed to prevent data loss by ensuring writes are atomic, meaning they either complete entirely or don’t happen at all. It automatically checks for and cleans up any damaged files to maintain data integrity. 

You can easily iterate through all the stored data using an asynchronous generator.  

The constructor takes an entity name and a base directory to organize your persistent data.  The `waitForInit` method sets up the initial storage directory and performs a one-time check and cleanup of existing files. 

The framework uses `readValue` to fetch data, `hasValue` to check if data exists, and `writeValue` to save data, all while ensuring file operations are performed safely.  `keys()` provides a way to access all of the entity IDs stored.

## Class PerformanceReportService

The PerformanceReportService helps you understand where your trading strategies are spending their time. It acts as a listener, catching timing information as your strategies run.

This service logs these timings, along with extra details, to a database, allowing you to identify bottlenecks and optimize performance.

You can tell it to start listening for these events, and it will automatically handle ensuring it doesn't subscribe multiple times. When you're done, you can unsubscribe to stop it from collecting data. 

It uses a logger to output debugging information and a `track` property to manage the tracking and logging of performance events.

## Class PerformanceMarkdownService

This service helps you keep track of how your trading strategies are performing. It listens for performance updates and organizes them, allowing you to see key statistics like average performance, best and worst results, and percentiles. 

You can ask it to create detailed reports, formatted in Markdown, which show not only the overall performance but also potential bottlenecks that might be impacting your strategy. These reports are saved to your logs directory.

The service keeps data isolated for each unique combination of symbol, strategy name, exchange, frame, and whether it’s a backtest – ensuring that your metrics are organized and specific. You can retrieve the data directly or request a formatted report. It also provides the ability to clear out all collected performance data when needed.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It provides tools to analyze and report on your strategies' performance metrics.

You can use it to gather aggregated performance data for specific symbols and strategies, receiving detailed statistics like counts, durations, averages, and percentiles to pinpoint potential bottlenecks.

The class also generates clear, readable markdown reports summarizing this performance data, making it easy to share and interpret.

Finally, you can directly save these reports to your hard drive, with a sensible default location, to keep a record of your strategies' evolution. This allows for easy tracking and comparison of strategies over time.

## Class PartialUtils

This class helps you analyze and understand partial profit and loss events that occur during trading. It provides a way to collect and summarize data related to these events, which is useful for evaluating strategy performance.

You can use it to get a statistical overview of partial profits and losses, allowing you to see key metrics like total events. It also lets you generate nicely formatted markdown reports that include a table of all partial profit and loss events, showing details like the action taken (profit or loss), the symbol traded, the strategy used, price levels, and timestamps.

Finally, you can easily save these reports to files, creating a record of your trading history in an organized and readable format. The reports are named using the symbol and strategy name, so you can quickly identify them. This makes reviewing and debugging strategies much easier.

## Class PartialReportService

The `PartialReportService` helps you keep track of when your trades partially close, whether it's for a profit or a loss. It acts like a diligent record keeper, noting down each time a portion of your position is exited.

Think of it as a system that listens for signals indicating a partial profit or loss has occurred. These signals come through `partialProfitSubject` and `partialLossSubject`.

The service carefully logs the price and level at which each partial exit happened, storing this data for later analysis. It uses a `ReportWriter` to ensure the information is saved.

To make sure things don’t get chaotic, the subscription process is carefully managed to prevent multiple registrations.

You can tell it to start listening with the `subscribe` method, which also gives you a way to stop it later. The `unsubscribe` method gracefully stops the service from receiving and logging those partial exit events. If you haven't subscribed, this method simply does nothing.

## Class PartialMarkdownService

The PartialMarkdownService helps you create and save reports detailing your trading performance, specifically focusing on profits and losses. It keeps track of each profit and loss event for every symbol and strategy you use, allowing you to analyze them in detail.

It listens for these profit and loss signals, builds up data for each combination of symbol and strategy, and then formats that information into easy-to-read markdown tables. You can request overall statistics or specific reports for a given symbol and strategy.

The service automatically saves these reports to disk, organizing them in a directory structure to keep things neat. It also provides ways to clear the accumulated data when needed, either for a specific trading setup or everything at once. Finally, it uses a logger to provide helpful output during its operations.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing and logging partial profit and loss tracking within the backtest framework. It’s designed to be injected into the ClientStrategy, offering a single point of access for these operations. 

It doesn’t handle the actual partial tracking itself; instead, it relies on the PartialConnectionService for that, acting as a layer of abstraction. 

Before any action is taken, the service logs relevant details to provide centralized monitoring of partial operations. This makes it easier to debug and understand how partial profit and loss calculations are progressing. 

Several other services, such as strategy and risk validation services, are also injected and utilized for data integrity and consistent configuration. Essentially, it’s a way to keep things organized and auditable when dealing with partial profit and loss calculations.


## Class PartialConnectionService

The PartialConnectionService manages how we track partial profits and losses for different trading signals. It essentially creates and keeps track of specialized objects, called ClientPartial instances, for each signal we're monitoring.

Think of it as a central hub for handling profit and loss calculations; it ensures there's a dedicated object responsible for each signal.

It uses a clever caching system to avoid creating the same object repeatedly, making things efficient.

Whenever a signal hits a profit or loss milestone, this service handles the updates and notifications.

When a signal is finished, this service cleans up its related data to prevent memory issues.

It's a core component that works closely with the ClientStrategy, ensuring that profit/loss information is accurately tracked and managed throughout the trading process.

## Class OrderTransientError

This error class, `OrderTransientError`, is a way to explicitly signal that an order-related issue is temporary and should be retried. It's not a special case for the backtest-kit itself; any generic error thrown during order processing is automatically considered transient. Think of it as a clear label for your code to show intent – a reader knows immediately that this isn't a permanent problem.

When a transient error happens, the system handles it differently depending on whether it's related to opening or closing an order, or a check. For opening orders, the system will retry the order with the same details. For closing orders, the position remains open, and the system tries again later.  For checks, the system tolerates the failure and continues monitoring.

However, repeated transient errors are critical – if the system keeps encountering them, it will signal a serious problem and halt execution. The retry counters are persistent, meaning a crash won’t reset them, and reconciliation steps are needed before resubmitting orders. This class is a way to maintain consistency with other error types, and it’s mainly useful for logging and application-level monitoring, as the framework itself doesn't specifically use it.

## Class OrderRejectedError

This error signifies a permanent rejection of an order by the exchange, meaning retrying the order is futile. It's specifically thrown within order-handling components like broker adapters or action handlers when the exchange definitively refuses an order.

When this error occurs, the framework immediately cancels pending order openings or forcefully closes existing positions, bypassing any retry mechanisms. The rejected signal ID is marked as consumed, preventing repeated attempts with the same ID.  The system will generate a fresh signal ID, allowing for a new attempt.

Crucially, only throw this error when a fundamental business issue prevents order execution, such as a delisted symbol or account restrictions. Network problems should trigger a standard error or `OrderTransientError`, allowing the framework's retry system to handle them.

It's important to remember this error’s significance is limited to live trading environments or when specifically mocked; during backtesting, the gates short-circuit. The error’s message is for informational purposes only, and identification relies on a runtime brand (`__type__`) rather than `instanceof` to account for potentially duplicated module instances.

## Class OrderDeletedError

This error, `OrderDeletedError`, signals a definitive confirmation from the exchange that an order you're tracking is no longer present – essentially, the exchange says it's gone. It's not just a temporary hiccup; it means the order was likely canceled by the user or liquidated.

You should only throw this error when dealing with order checks, specifically within adapter checks or action handlers – not during order creation or closure processes.  When thrown, the framework immediately resolves this as the order being "deleted," bypassing normal retry attempts.

If you're tracking an open position and this error arises, the position will be closed immediately, as if it were intentionally closed by the user. Similarly, for resting orders, the scheduled signal will be cancelled.

It's important to differentiate this from a filled order (which should be handled differently) or a temporary network issue (which is a different type of error). Throwing this error incorrectly can lead to premature closure of positions. This error is specifically for cases where the exchange has reported the order is gone, and isn’t a fault of your system.

This error is tied to specific order checks and isn’t meaningful outside that context.  It’s identified by a unique runtime brand to ensure it's recognized even when dealing with duplicate module instances. It's also only relevant in live trading, not backtesting scenarios.



The constructor creates a new `OrderDeletedError` object, and it includes a static method `isOrderDeletedError` for reliable type checking and a method `fromError` for creating the error from another object.

## Class NotificationLiveAdapter

This component helps you send notifications about your trading strategy's progress – things like signals, profits, losses, and order confirmations. It's designed to be flexible, letting you easily switch between different notification methods without changing your core strategy logic.

You can choose where your notifications are sent: keep them in memory for testing, store them persistently on disk, or completely ignore them with a dummy adapter. The system remembers the last used adapter so you don't have to configure it every time.

The `handle...` methods (like `handleSignal`, `handlePartialProfit`, etc.) are how your strategy communicates events to the notification system. These methods simply forward the information to the currently selected notification adapter.

You can retrieve all stored notifications using `getData`, and clear them completely with `dispose`.  If your environment changes (like when your working directory changes), be sure to call `clear()` to ensure a fresh notification adapter is created.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, particularly in the backtesting process. It ensures that the strategy, exchange, frame, risk, and action configurations are all valid before sending those notifications. To avoid unnecessary work, the validation process is remembered – it only runs once for each unique combination of strategy, exchange, and frame.

The service uses several other services to handle validation, logging, and managing strategy information. 

If you need to trigger a notification for a signal, you'll use the `commitSignalNotify` function, which handles the validation, retrieves the relevant signal data, and sends out the notification to subscribers and for persistent storage. This function takes information about the signal, the symbol, the current price, and the context of the signal.

## Class NotificationBacktestAdapter

This component, `NotificationBacktestAdapter`, provides a flexible way to manage notifications during backtesting. Think of it as a central hub for sending out information about events like signal generation, partial profits, errors, and more. 

It's designed to be adaptable – you can easily swap out the notification method (like sending notifications to a database, displaying them on a screen, or simply ignoring them). It starts with an in-memory notification system by default, but you can switch to persistent storage or a dummy mode for testing. 

The `handle...` methods are the core of what it does; these are the functions that get called when specific events happen during the backtest and are then relayed to the active notification system.  The `use...` methods are convenient shortcuts to change how notifications are handled.  The `clear` method is important for ensuring correct behavior when the environment changes during a backtest.

## Class NotificationAdapter

The NotificationAdapter acts as a central hub for managing notifications, whether you're running a backtest or a live trading environment. It automatically receives updates based on signals generated within the backtest kit.

This adapter smartly prevents duplicate subscriptions, ensuring that notifications are handled efficiently.

You can easily access and retrieve all stored notifications, differentiating between backtest and live data.

It's designed to be safe and reliable; you can disable it multiple times without issue.

Finally, a cleanup function allows you to completely clear and unsubscribe from all notifications when you're finished.


## Class MemoryLiveAdapter

This component provides a flexible way to manage data during live trading, acting as a central storage hub. It allows you to easily switch between different storage methods, such as keeping data entirely in memory, saving it to files on your hard drive, or even using a "dummy" mode that simply ignores all data.

Think of it as a customizable memory bank for your trading strategies.

Here's what it lets you do:

*   **Choose your storage:** You can select whether to store data in memory only, persist it to files, or discard it entirely.
*   **Manage data:**  It offers methods to write, read, search, list, and delete data entries.
*   **Clear cached data:** You can clear the cached data when necessary, which is useful if your working directory changes.
*   **Dispose of old data:** It provides a way to clear out old data associated with specific signals, ensuring your memory doesn't become cluttered.
*   **Customize storage:** You can even implement your own custom storage solutions and plug them into this framework.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage for your backtests. It acts as a central point, allowing you to easily switch between different storage methods without changing your core backtesting logic. By default, it uses an in-memory storage system based on BM25 for full-text searching, but you can swap this out for persistent storage on the file system or even a dummy adapter for testing purposes.

You can control the type of memory used via handy methods like `useLocal`, `usePersist`, `useDummy` and `useMemoryAdapter`, which let you quickly change how data is stored and retrieved.  The `disposeSignal` method clears out cached memory instances linked to a specific signal, important for cleanup when a signal is finished.  

Methods like `writeMemory`, `searchMemory`, `listMemory`, `removeMemory`, and `readMemory` provide the core functionality for interacting with the memory storage, enabling you to write data, search for specific content, list all entries, delete records, and retrieve individual items. Finally, `clear` allows you to reset the memory cache, ensuring fresh instances are used when the base path changes.

## Class MemoryAdapter

This adapter acts as the central hub for managing memory storage, whether you're running a backtest or a live trading scenario. It handles the subscription to signal events, automatically cleaning up old data to prevent issues with stale information.

The `enable` property lets you turn on memory storage, ensuring the adapter listens for lifecycle events and clears out any outdated data.  Conversely, `disable` lets you safely turn off this functionality, even if called multiple times.

You can use `writeMemory` to save data, `searchMemory` to find data using a full-text search, and `listMemory` to view all stored entries.  Need to delete something? `removeMemory` takes care of that.  Finally, `readMemory` allows you to retrieve a specific item based on its ID. The adapter intelligently directs these operations to the correct memory system (backtest or live) based on the configuration provided.

## Class MaxDrawdownUtils

This utility class helps you analyze and understand maximum drawdown events during trading. It acts as a central place to gather information about how much your strategies have lost at their worst points. 

You can think of it as a tool to pull together all the data about max drawdowns, generated during backtesting or live trading.

Specifically, you can use it to:

*   Get a complete set of drawdown statistics for a particular symbol and strategy combination.
*   Generate a formatted markdown report detailing all recorded drawdown events, allowing you to easily review and share the data.
*   Save that markdown report directly to a file for later reference or distribution. 

The information it provides helps in assessing risk, comparing strategies, and optimizing your trading systems.

## Class MaxDrawdownReportService

This service is designed to keep track of maximum drawdown events, saving them for later analysis. It monitors for drawdown changes and records them in a structured JSON format.

To start the process, you need to subscribe to the drawdown events.  The service ensures that you only subscribe once, preventing repeated registrations.  You'll receive a function to unsubscribe later, which you'll use when you're done.

If you no longer need to monitor drawdown events, you can unsubscribe to stop the recording process.

Each recorded event includes important details like the timestamp, the trading symbol, the strategy name, the exchange, the timeframe, and specifics of the signal – including its position, price levels (open, take profit, and stop loss) and current price. This gives you a complete picture of the drawdown situation at that exact moment.


## Class MaxDrawdownMarkdownService

This service is designed to automatically generate and save reports detailing maximum drawdown, a crucial metric for assessing risk in trading. It listens for drawdown events and organizes them, allowing you to easily retrieve and analyze this information.

You can start receiving these events by subscribing, and stop them by unsubscribing which also clears the stored data. 

The `getData` method lets you retrieve the accumulated drawdown statistics for a specific symbol, strategy, exchange, and timeframe.  `getReport` then transforms those statistics into a readable Markdown report, and `dump` writes that report directly to a file. 

Finally, `clear` provides a way to reset the stored data, either for a specific trading setup (symbol, strategy, etc.) or completely across all setups. This is useful for starting fresh or managing storage space.

## Class MarkdownWriterAdapter

This component helps manage how your backtest results are saved as markdown files. It provides a flexible system where you can easily switch between different storage methods, like saving each report to its own file, appending everything to a single JSONL file, or even disabling markdown output entirely. The system remembers which storage method is being used, preventing the creation of multiple instances of the same type.

You can change the default storage method, which initially creates a separate markdown file for each report. To change this, use the `useMarkdownAdapter` method to specify a different storage constructor.

The `writeData` method handles actually writing the markdown content to the chosen storage. This also ensures the storage is set up the first time you use it.

The `useMd` method sets up the default folder-based storage. The `useJsonl` option combines all reports into a single JSONL file. If you don't need any markdown output at all, use `useDummy` to effectively silence the markdown generation. 

Finally, if your working directory changes, you'll want to clear the storage cache to ensure everything is saved correctly using the new path.


## Class MarkdownUtils

This class helps you manage how and when reports are created in markdown format for various parts of your trading system, like backtests, live trading, or performance analysis. 

You can choose to turn on markdown reporting for specific areas of the system using the `enable` method. When you do this, the system will start collecting data and creating markdown files.  It's really important to remember to unsubscribe from those services later using the function that's returned; otherwise, the system might use up memory.

If you want to stop markdown reporting for just a few areas while keeping it on elsewhere, use `disable`.

Finally, if you want to reset the data being used for reports without stopping the reporting itself, `clear` allows you to do that.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate backtest reports, with each report saved as its own individual markdown file. It's designed to create a well-organized directory structure for your reports, making them easy to browse and review manually.

Each report gets its own `.md` file, named and placed based on configuration options that control the path and filename. The adapter automatically handles creating the necessary directories to store these reports. 

Initialization isn't required as it writes directly to files, offering a simple and direct approach to report generation.

To use it, you specify the report target key during instantiation.  The `dump` method is used to write the actual markdown content to the designated file and directory.

## Class MarkdownFileBase

This component handles writing markdown reports in a structured JSONL format, making it easy to centralize and process your trading data. It automatically creates the necessary directories and files, and ensures writes are handled reliably with built-in error handling and timeout protection.

The adapter uses a specific file naming convention, writing each report type to its own file. Each line within these files represents a markdown report, including the content itself alongside important metadata like the symbol, strategy, exchange, frame, and signal ID – allowing for flexible filtering and analysis later.

You don't have to worry about managing file streams or handling write errors; this adapter takes care of it all. The `waitForInit` method lets you initialize the file and stream, and the `dump` method simplifies the process of adding new reports, automatically including the required metadata and timestamp. This promotes a clean and organized approach to logging and reviewing your trading results.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, offering flexibility with different storage methods. You can easily switch between storing your markdown as individual files or appending them to a single JSONL file. 

It’s designed to be adaptable – you can even provide your own storage implementation if needed. The adapter also remembers which storage type you're using, so you don't have to specify it repeatedly.

For convenience, `useMd()` quickly sets up the default folder-based storage. `useJsonl()` provides a shortcut to use the JSONL storage method. If you just want to test something without actually saving data, `useDummy()` will discard any write attempts.

## Class MCPValidationService

The MCPValidationService helps ensure that the models and strategies your application relies on are correctly set up and working together. It keeps track of all registered Model Context Protocols (MCPs), which define the structure and dependencies for your models.

When you register a new MCP, this service makes sure it's unique – you can’t register the same MCP name twice. 

If you try to use an MCP, this service will quickly verify that it exists and that the associated strategy is valid.  This validation happens only once per MCP name to save time. 

You can also ask this service to list all the MCPs it's managing, giving you a clear view of your application’s model context setup.

## Class MCPUtils

This class provides tools to connect your trading strategy to an agent, allowing for communication and manual control. It acts as a bridge, translating strategy events into messages the agent can understand, and enabling the agent to influence the trading process.

You can request status updates on the portfolio, view a history of past trades, and see messages directly from the strategy itself – almost like hearing the strategy's thoughts. 

There are also methods to manually open and close positions, and add entries for a dollar-cost averaging (DCA) strategy.  These actions are carefully checked to ensure they align with the strategy’s rules and risk management.

To get a snapshot of the current portfolio, use `getStatus`. To see how trades have unfolded, check `getHistoryMessages`.  If you want to see what the strategy itself is thinking, use `getAgentMessages`.  For detailed records of position actions, there's `getNotificationMessages`. Finally, you can initiate actions like `commitPositionOpen` to open positions, or `commitPositionClose` to close them – all while the system validates the operation.

## Class MCPSchemaService

The MCPSchemaService acts like a central library for managing blueprints, or schemas, that describe how different parts of a trading system communicate. It keeps track of these blueprints, organized by a unique name. 

When a new blueprint is added, the service does a quick check to ensure it’s structurally sound.

It's used by other parts of the system to understand how to interact with various trading strategies and to create the messages that are exchanged.

Here's what you can do with the service:

*   **Register a new blueprint:** You can add a new blueprint to the library, associating it with a specific name. If a blueprint with that name already exists, it will be replaced with the new one.
*   **Modify a blueprint:** You can update an existing blueprint, changing some of its details while keeping the rest the same.
*   **Retrieve a blueprint:** You can look up a blueprint by its name to use it in your system.

The service relies on a logger to help with troubleshooting and validation.

## Class LookupUtils

This component acts as a central record of what's currently happening in your backtests and live trading sessions. Think of it as a live log of activities. 

Whenever a backtest, live run, or a step within a strategy begins, a record is added to this registry. When those activities finish, the records are removed.

The `addActivity` function registers new activities, and importantly, it's safe to call multiple times with the same activity; it will just update the entry. Conversely, `removeActivity` cleans up after an activity concludes, which is critical to ensure no records are left behind if something goes wrong.

Finally, `listActivity` provides a snapshot of the currently running processes, allowing you to see what's actively executing. It's like taking a picture of everything that's happening right now.

## Class LoggerService

The `LoggerService` helps you keep your trading logs organized and informative. It automatically adds important details to your log messages, such as which strategy is running, which exchange is involved, and the specific timeframe being used.

If you don’t provide your own logging setup, it falls back to a “do nothing” logger to avoid errors.

You can customize the logging behavior by providing your own logger implementation. The service then uses this custom logger for all its logging functions: `log`, `debug`, `info`, and `warn`. 

These functions all add context to your log messages, making it easier to trace issues and understand what's happening during your backtests. The `methodContextService` and `executionContextService` handle the context injection, and you can replace the default logger with `setLogger`.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage and store log messages within your backtesting framework. Think of it as a central hub for all your logging needs, allowing you to easily swap out different logging methods without changing your core code. By default, logs are kept in memory, but you can switch to persistent storage on disk, a dummy adapter that ignores all log messages, or even a JSONL file adapter.

The adapter uses a system where you can specify a "log factory" – a constructor for how the log messages are stored. It efficiently manages the actual logging instance, creating it only when needed and reusing it for speed.

You can interact with the logs using convenient methods like `log`, `debug`, `info`, `warn`, and `agent`, each for different levels of detail.  The `getList` method lets you retrieve all the stored log entries. To change how logs are handled, the `useLogger` method is the key – it sets the specific logging method to use.  Methods like `usePersist`, `useMemory`, `useDummy`, and `useJsonl` offer shortcuts to switch between common logging configurations.  Finally, the `clear` method ensures a fresh logging instance when things like the working directory change, which is important for consistent behavior during strategy iterations.

## Class LiveUtils

This class provides tools for live trading operations, acting as a central point for managing live trading runs. It's designed to be a singleton, meaning there's only one instance of it used throughout the system, simplifying access.

The core functionality lies in `run()`, which starts a live trading session for a specific symbol and strategy. This process recovers from crashes by saving state, so trading can resume where it left off.  `background()` is similar but runs the live trade without providing direct output.

Several helper functions allow you to check the status and details of a running trade, like retrieving the pending signal, calculating the total position size, or determining if breakeven has been reached. You can also retrieve information like the effective entry price, and the number of units or cost invested.

More advanced features include getting details of partial closes, DCA entries, and timing metrics (e.g., minutes active, minutes until expiration).

You can also manually control a running trade by canceling scheduled signals, closing pending positions, or even activating a scheduled trade early. It also allows to pause and resume live trading sessions, and control and modify stop loss and take profit.

Finally, functions are available to generate reports, retrieve data, and list active trades, helping you monitor and analyze trading activity.


## Class LiveReportService

The LiveReportService helps you keep a detailed record of what your trading strategy is doing in real-time. It listens for events like when a trade is idle, opened, active, or closed.

Essentially, it captures every important step of your trading signals. 

This information is then logged and saved to a database, allowing you to monitor your strategy's performance and analyze its behavior as it’s actually running.

To make sure you don’t accidentally log events multiple times, it uses a mechanism to prevent duplicate subscriptions.  You can subscribe to receive these live events and unsubscribe when you're finished. The subscription process returns a function that you can call to stop receiving the events.

## Class LiveMarkdownService

This service helps you automatically create detailed reports of your live trading activity. It constantly monitors what's happening in your strategies, tracking events like when a trade is opened, active, or closed. 

It compiles this information into well-formatted Markdown tables, providing key stats like win rate and average profit/loss. These reports are saved to your computer as individual files, making it easy to review and analyze your trading performance.

You can subscribe to receive live updates or unsubscribe when you no longer need them.  You can also get specific data or reports for individual strategies and symbols, or clear out all the collected data if you want to start fresh.  The service organizes data based on symbol, strategy name, exchange, frame, and whether it's a backtest, ensuring a clean and organized reporting system.


## Class LiveLogicPublicService

LiveLogicPublicService is a service that helps manage and run live trading operations, making things easier by automatically handling important information like the strategy and exchange being used.

It works by building on top of another service, LiveLogicPrivateService, and adding context management to avoid needing to pass details repeatedly.

The service continuously generates trading results – think of it like a never-ending stream of updates – and is designed to be resilient, automatically saving and restoring data if a crash occurs. It tracks time using the system clock to ensure real-time progression.

To start the process, you provide the symbol you're trading and the strategy and exchange names; the service takes care of the rest, automatically managing the necessary details during execution.


## Class LiveLogicPrivateService

This service handles the complex process of running live trading strategies. It's designed to continuously monitor market conditions and execute trades, working like an engine that never stops.

Think of it as a tireless worker that constantly checks for trading opportunities. It uses an infinite loop to keep things running smoothly.

The core functionality revolves around an asynchronous generator, meaning it streams results efficiently and doesn’t consume excessive memory.  It provides results only when trades are opened or closed, skipping the periods when trades are active or idle.

If something goes wrong and the process crashes, it will automatically recover and resume trading from where it left off, thanks to built-in crash recovery.  You provide it with a symbol (like a stock ticker), and it takes care of the rest.


## Class LiveCommandService

The LiveCommandService acts as a central hub for live trading operations, providing a simplified way to interact with the underlying live trading logic. Think of it as a convenient gateway for accessing live trading features within the backtest-kit framework. 

It handles validations, such as checking your strategy and risk configurations for correctness, and caches these validations to improve performance.

The core functionality lies in the `run` method, which allows you to initiate live trading for a specific symbol. It’s designed to be a continuous, resilient process—if something goes wrong, it automatically attempts to recover and continue trading. This 'infinite' generator feeds you tick-by-tick results, indicating whether trades are opened, closed, or cancelled.

## Class IntervalUtils

The `IntervalUtils` class provides a way to control how often your functions are executed, especially useful within trading strategies. Think of it as a way to prevent a function from running too frequently, ensuring it only triggers at specific, defined intervals.

There are two primary ways to use this: in-memory and persistent file-based. The in-memory approach keeps track of when a function has last run, so it won't re-run until the next interval.  If your function returns `null`, it's treated as a retry and the timer pauses.

The persistent, file-based version is even more robust. It uses a file to store the "fired" state, meaning that even if your application restarts, the interval tracking is preserved. This is very helpful for long-running strategies.

The class provides a singleton instance named `Interval`, making it easy to access these utilities. You can also manually clear or dispose of these tracked functions, helpful when your environment changes, such as when the current working directory (`process.cwd()`) is updated between strategy runs. Finally, there's a counter reset to handle potential conflicts when the base path changes.

## Class HighestProfitUtils

This class helps you analyze and report on your highest profit trades. Think of it as a tool for understanding which strategies performed best.

It's designed to work with data collected about profitable trades, specifically information recorded as "highestProfitSubject" events.

You can use it to:

*   **Fetch statistics:** Get a summary of the highest profit data for a particular trading symbol, strategy, exchange, and timeframe.
*   **Generate reports:** Create formatted markdown reports that detail all the highest profit events for a given symbol and strategy. These reports help you visualize and understand performance.
*   **Save reports to a file:** Easily save the generated markdown report to a file for later review or sharing. 

It's a singleton, meaning there's only one instance of this class available, and it provides these functions as static-like methods.

## Class HighestProfitReportService

This service helps track and record the highest profit moments achieved during a backtest. It keeps an eye on a specific data stream, `highestProfitSubject`, and whenever a new profit record is made, it saves that information to a database.

The service focuses on capturing the details of that moment, including things like the time, trading symbol, strategy name, exchange, timeframe, and the specifics of the trading signal (position, price levels, etc.). The strategy and signal information comes directly from the signal details.

To get it running, you need to "subscribe" to the data stream. Once subscribed, the service actively monitors for new profit records and saves them.  To stop this monitoring, you "unsubscribe." Importantly, you can only subscribe once – subsequent attempts will simply return the same unsubscribe function.

## Class HighestProfitMarkdownService

This service is designed to create and store reports detailing the highest profits achieved by a trading strategy. It listens for incoming data about these profits and organizes them based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these profit updates, and the service makes sure you don’t accidentally subscribe multiple times. Unsubscribing clears all accumulated data and stops the service from receiving further updates.

The `tick` method handles each individual profit update, carefully placing it into the correct storage category.

You can retrieve the accumulated profit statistics for a specific combination of symbol, strategy, exchange, and timeframe using `getData`. The `getReport` method turns this data into a formatted markdown report, and `dump` saves this report as a markdown file to your disk.  Finally, `clear` lets you erase all or just some of the stored data, allowing you to start fresh.

## Class HeatUtils

HeatUtils helps you visualize and understand the performance of your trading strategies using heatmaps. 

Think of it as a tool that gathers and summarizes data from all your strategy's trades, breaking it down by individual symbols and then giving you an overall portfolio view.

It provides functions to retrieve the raw data, generate a nicely formatted markdown report, or even save that report directly to a file. 

You can easily customize the report to show specific columns like total profit/loss, Sharpe ratio, maximum drawdown, and the number of trades executed. It's designed for easy access as a single, readily available tool.


## Class HeatReportService

The HeatReportService helps you track and analyze your trading decisions by recording when signals are closed and how profitable they were. It listens for these "closed signal" events across all your symbols and stores this information in a database, allowing you to create heatmap visualizations to understand patterns in your portfolio’s performance. 

It’s designed to only capture signals that have actually closed, along with their profit and loss data. The service ensures it only registers one subscription to avoid issues.

To start using it, you’ll subscribe to receive signal events, and when you’re finished, you can unsubscribe to stop the data logging. The `tick` property handles processing these events and writing them to the database.

## Class HeatMarkdownService

This service helps you visualize and understand the performance of your trading strategies by creating a heatmap of your portfolio. It listens for signals about your trades and aggregates data, providing both overall portfolio statistics and detailed breakdowns for each individual trading symbol.

You can subscribe to receive updates in real-time and unsubscribe when you no longer need the data. The service automatically handles calculations and avoids errors that might arise from unexpected data.

It can generate reports in Markdown format, making it easy to share your results and track your progress. You can also save these reports directly to a file.

The service uses a clever system to manage its data, so you can clear out old information and start fresh when needed, either for a specific strategy or for all strategies. This allows you to examine performance in isolation or across different setups.


## Class GeneralUnexpectedError

This class signals a serious, unexpected problem within your application – something that shouldn't logically happen if the code is working correctly. Think of it as a "this is broken" indicator, much like Java's `Error` class. The framework doesn't actively handle this type of error; it's meant to be a clear marker for developers indicating a bug or a violated assumption.

It's the opposite of `GeneralExpectedError`, which signifies anticipated situations you can gracefully handle.  When you encounter a situation that represents a fundamental flaw in the system, throw a `GeneralUnexpectedError`.

This error isn’t tied to any specific part of the framework like order processing; it’s a general signal that should halt the current operation, get logged, and not be ignored.

Identifying a `GeneralUnexpectedError` is done using a unique runtime brand (`__type__`) rather than `instanceof`, ensuring it works even if your codebase has multiple versions of the same module. The error message itself isn’t meant for the user; it’s for the developers to diagnose the root cause of the problem. If you're working within broker adapters, use the order-related error types; elsewhere in your application logic, use `GeneralUnexpectedError` to highlight unexpected malfunctions.

## Class GeneralExpectedError

This class, `GeneralExpectedError`, helps you distinguish between predictable problems in your application and genuine malfunctions. Think of it like the "Exception" in Java – it signals a known, expected condition, not a bug or system failure.

The framework itself doesn’t do anything special with this error; its purpose is to help *you* organize your error handling. You can use it to create separate "catch" blocks in your code: one for handling expected conditions (like validation failures or a missing precondition) and another for dealing with real errors.

It’s different from order-related errors handled by the framework's internal systems. Use those for broker-specific issues, and `GeneralExpectedError` for application-level scenarios.

To identify a `GeneralExpectedError`, use the `isGeneralExpectedError` function, not `instanceof`. This ensures it works correctly even if you’re using multiple copies of the library. The `message` property usually contains information to display to the user when something goes wrong but is expected. If you create your own custom error types based on `GeneralExpectedError`, they'll automatically be recognized by the framework thanks to inheritance.

## Class FrameValidationService

This service helps you keep track of and verify your trading timeframe configurations. It acts as a central registry, ensuring that the timeframes you're using actually exist before your backtests or trading strategies try to use them. To make things efficient, it remembers whether a timeframe is valid, so it doesn't have to re-check it every time.

You can add new timeframes using `addFrame`, providing a name and a schema to describe its structure. Before performing any actions related to a timeframe, use `validate` to confirm it's registered.  If you need a quick overview of all the configured timeframes, `list` provides a straightforward way to get a list of them. It’s designed to simplify and protect your framework from unexpected errors due to misconfigured or missing timeframes.


## Class FrameSchemaService

The FrameSchemaService helps keep track of different frame schemas, acting like a central directory. It uses a specialized system to store these schemas in a way that helps prevent errors. 

You can add new frame schemas using the `register` method, providing a unique name and the schema details. If a schema already exists, you can update parts of it using the `override` method.

To get a specific frame schema, you use the `get` method, providing the frame's name.

Before a schema is added, the `validateShallow` feature checks to make sure the basic structure is correct and all necessary elements are present. This helps catch simple mistakes early on. 


## Class FrameCoreService

FrameCoreService acts as a central hub for managing timeframes within the trading backtest environment. It relies on a connection service to fetch the necessary timeframe data. Think of it as the engine that provides the chronological sequence of data points for your backtest to run against.

It offers a single method, `getTimeframe`, which allows you to request a specific set of dates for a given trading symbol and timeframe name (like "1m" for 1-minute intervals). This method handles the details of retrieving and preparing those dates for your testing logic. 

Essentially, it simplifies the process of getting the timeline data needed to execute your trading strategies in a historical context.


## Class FrameConnectionService

FrameConnectionService acts as a central hub for managing and accessing different backtest frames. It automatically directs requests to the correct frame implementation based on the current method context, essentially figuring out which frame you need without you having to specify it directly. 

To improve performance, it remembers the frames it creates, so it doesn't have to recreate them every time. This "memoization" is crucial for efficiency.

The service also handles the backtest timeframe, defining the start and end dates for your backtest.

You can clear the cached frames to ensure the backtest uses the most up-to-date timeframe data, preventing issues where it might be working with old data.

Finally, `getTimeframe` allows you to retrieve the specific start and end dates for a given symbol and frame, setting the boundaries for your backtest.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify your trading exchanges. It acts as a central place to register your exchanges and make sure they’re still valid before your strategies try to use them. This service remembers the results of its checks, making things faster overall.

You can add new exchanges to the service using `addExchange`, and confirm an exchange is ready to use with `validate`.  If you need a quick overview, `list` will give you a full rundown of all exchanges currently registered. It also provides a way to manage the exchanges and track their configurations.

## Class ExchangeUtils

The `ExchangeUtils` class offers a convenient way to interact with different exchanges within the backtest-kit framework. Think of it as a helper that simplifies common tasks like retrieving data and formatting values to match exchange-specific rules.

It’s designed to be easy to use, providing functions for fetching candles (historical price data), calculating average prices, and getting the latest closing price. 

You can use it to grab order book information, and aggregated trade data, all while ensuring the data is correctly formatted for the specific exchange you're using.

The `formatQuantity` and `formatPrice` functions handle the tricky part of converting numbers to strings that conform to each exchange's precision requirements.

Importantly, it manages a separate, isolated instance for each exchange, so you don’t have to worry about things getting mixed up. When fetching data, it intelligently calculates the appropriate time range based on the interval and limit you provide, and automatically adjusts for backtesting scenarios.

## Class ExchangeSchemaService

The ExchangeSchemaService helps keep track of information about different cryptocurrency exchanges, making sure the data is consistent and reliable. It uses a special system to store these exchange details in a way that avoids errors.

You can add new exchange information using the `addExchange` function, and retrieve existing information using its name.

The service has a built-in validation process that checks if new exchange data has all the necessary information and is in the correct format before it's stored.

It also allows you to update existing exchange information – think of it as making small corrections rather than a complete replacement.

If you need to find details about a specific exchange, you can simply ask for it by its name, and the service will provide the stored information.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for all interactions with an exchange, making sure that information about the trading environment, like the symbol, time, and backtest status, is passed along correctly. It’s designed to work behind the scenes for other services, like those handling backtesting and live trading.

This service handles tasks like retrieving historical and simulated future candle data, calculating average prices, and obtaining order book information. It simplifies how the framework interacts with the exchange by automatically injecting relevant context into those interactions.

Several methods, like `validate`, ensure the exchange setup is correct and efficient. Methods such as `getCandles`, `getAveragePrice`, and `getOrderBook` are all designed to be flexible, supporting both backtesting and live trading environments. Formatting methods allow price and quantity to be adjusted based on the context of the trade. It also provides access to raw candle data for more granular control.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It automatically directs requests to the correct exchange based on the currently active trading context. To improve performance, it remembers previously used exchange connections, avoiding the need to re-establish them repeatedly.

This service provides methods for common exchange operations, such as retrieving historical price data (candles), fetching the latest price averages, obtaining order book information, and accessing trade data. It handles details like formatting prices and quantities to ensure they adhere to each exchange's specific rules. 

The service’s ability to fetch "next" candles is particularly useful for backtesting and live trading, allowing progression through time. It's designed to operate seamlessly in both backtesting environments and live trading scenarios.

## Class DumpAdapter

The DumpAdapter helps you save information during your trading tests, providing a way to record details like messages, records, tables, text, errors, JSON data, and MCP statuses. It's flexible, letting you choose where this data is stored – by default, it creates markdown files, but you can switch to storing it in memory, discarding it completely, or using a custom solution. 

Before using it, you need to "enable" the adapter, which sets it up to listen for signal events and clean up old data. Conversely, "disable" stops this monitoring. 

You can easily switch between storage options: `useMarkdown` (the default, creating markdown files), `useMemory` (saving data to memory), `useDummy` (effectively ignoring the data), or `useDumpAdapter` which lets you bring your own custom storage method.  If you are switching between different working directories, `clear` helps to make sure that old data isn't hanging around.

## Class CronUtils

This class, `CronUtils`, helps schedule tasks to run at specific times within a backtesting framework, especially when running tests in parallel. It's designed to ensure each task runs only once, even if multiple tests try to trigger it at the same moment.

Think of it as a way to coordinate actions across different test runs to avoid conflicts.

**How it works:**

When you register a task (using `register`), it's assigned a unique identifier and tracked internally. When it's time for the task to run, a special "promise" is created. All parallel tests wait for this promise to settle, guaranteeing only one instance of the task executes at a time. This ensures that resources aren't overused and results are consistent.

There are different ways to register tasks: globally (affecting all tests) or specific to a particular symbol in a test.  It also has methods to clear previously fired tasks, reset the entire system, and shut down the scheduling. This helps manage the state and restart the scheduling process if needed. It is exported as singleton, `Cron`.

The `enable` and `disable` methods are used to connect and disconnect the cron functionality to the core engine, allowing tasks to run automatically as the backtest progresses. `dispose` clears all scheduled tasks and resets the system to a clean slate.


## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages used for setting take-profit (TP) and stop-loss (SL) levels. These values are designed using a Kelly Criterion approach, incorporating exponential risk decay, to optimize profit-taking and risk management. Think of them as pre-calculated steps towards your ultimate take-profit or stop-loss targets.

For example, TP_LEVEL1 is set at 30%, so it triggers when the price moves 30% of the way towards your final take-profit goal.  TP_LEVEL2 is at 60%, and TP_LEVEL3 at 90%, providing incremental profit-taking opportunities. Similarly, SL_LEVEL1 at 40% serves as an early warning, while SL_LEVEL2 at 80% provides a final safety net. These constants help automate your trading strategy by defining these critical levels.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading configurations are mathematically sound and have the potential to be profitable. It's like a safety check for your settings!

It verifies several key aspects of your configuration, including that percentages like slippage and fees are non-negative. More importantly, it ensures your take profit distance is set high enough to cover all trading costs.

The service also checks that numerical values, like timeouts and retry counts, are positive integers, and that range constraints, such as stop-loss distances, are logically consistent. Finally, it validates settings related to data handling, like the number of candles requested. 

Think of it as a final safeguard to catch any configuration errors before you start backtesting.


## Class ColumnValidationService

This service helps ensure your column configurations are set up correctly, making sure they align with the expected structure and prevent issues down the line. It examines your column definitions, verifying they include all the essential properties like a unique key, a descriptive label, a formatting function, and a visibility setting.

It also checks that the key and label properties are strings, and that the format and visibility properties are actually functions that can be executed. Finally, it makes sure that each column has a unique key, avoiding conflicts and ensuring consistent behavior. This service is designed to catch potential errors early, making your column configurations more reliable.

## Class ClientSweep

The `ClientSweep` is a powerful tool designed to efficiently search for optimal parameters for trading strategies. It helps discover the best settings for strategies, like hard stop levels, trailing take profits, hold durations, and author restrictions, by testing them against a range of market data. This process happens without running a full backtest for each possible setting, saving significant time.

Importantly, it evaluates trading ideas individually, focusing solely on their performance without considering interactions between authors or any overall "swarm" effect.

The sweep works by taking a set of trading ideas and running them through a series of steps:

1. It first prepares the ideas, filtering and organizing them based on publication time and author.
2. It then generates performance profiles for each idea, based on historical market data.
3.  A ban list for authors is created based on their historical performance, excluding those who consistently underperform.
4. These profiles are then evaluated across a grid of parameter settings to determine the most promising combinations.
5. Finally, the best-performing parameters are ranked using various criteria like Sharpe ratio and total profit.

The `run` function initiates this entire process for a specific trading symbol.  It's important to remember that the `ClientSweep` suggests parameters; thorough validation with a full backtest engine is necessary to confirm the real-world performance. The sweep is stateless, meaning each run is independent and produces an independent result.

## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on various strategies. It's a flexible system that lets you control position sizing using methods like fixed percentages, Kelly Criterion, or Average True Range (ATR).

You can also set limits on the minimum and maximum position sizes, and define a maximum percentage of your capital that can be used for any single trade.

The `calculate` method is the core – it takes in parameters and figures out the appropriate position size, respecting all the configured rules and constraints. It's what the backtest engine uses to decide exactly how much to trade.

## Class ClientRisk

The ClientRisk class is designed to manage portfolio-level risk, acting as a safeguard to prevent trading signals that exceed configured limits. It's a shared resource among multiple trading strategies, allowing for a comprehensive view of risk across the entire portfolio. Think of it as a central control point, ensuring that no single strategy oversteps its boundaries.

This class keeps track of active positions, using a specific naming convention to identify them across strategies. It's used internally by the trading system to validate each signal *before* a trade is executed. 

The constructor takes configuration parameters. The `params` property holds these settings, and `_activePositions` is a map keeping tabs on all currently open trades.  `_reservedKeys` handles temporary placeholders when signals are being validated – ensuring concurrency safety. `waitForInit` handles initializing these positions and `_updatePositions` persists them.

The `checkSignal` method is the core of risk validation, evaluating a signal against predefined rules and triggering callbacks based on the outcome. Its counterpart, `checkSignalAndReserve`, provides a concurrency-safe version which reserves a position spot before validation.

Finally, `addSignal` registers a new, opened signal, while `removeSignal` cleans up when a signal is closed. Both methods are called when a trading signal is opened or closed, respectively.


## Class ClientFrame

The ClientFrame helps create the timeline of data your backtesting needs. It's responsible for generating arrays of timestamps representing the historical period you’re testing on. 

To avoid unnecessary work, it caches these timeframes, so the same period isn't recalculated repeatedly. 

You can adjust how far apart these timestamps are, from as close as one minute to as far as one day. 

It also allows you to add your own checks and record information as the timeframes are generated. This is particularly useful when working with BacktestLogicPrivateService to simulate trading over historical data.

The `getTimeframe` property provides the function that does the heavy lifting, creating and caching the timeframe array for a given symbol.


## Class ClientExchange

This `ClientExchange` class is like a translator and data provider for your trading backtests, handling communication with the actual exchange. It provides a bunch of useful functions for getting historical and future market data.

It can fetch candles (price data) – both looking back in time and forward to simulate a backtest. It helps calculate VWAP (a common price indicator) and format prices and quantities to match the exchange’s specific rules.

You can retrieve the last completed candle's closing price, or get a full order book. There's even a way to fetch aggregated trades, intelligently stepping backwards through time to get a sufficient number. 

The whole design focuses on efficiency and preventing "look-ahead bias" (using future data to make decisions in the past) by carefully controlling how far back or forward in time data is retrieved. It’s built to be flexible, handling different date ranges and limits for your data requests.

## Class ClientAction

The `ClientAction` class is the backbone for handling custom actions within a trading strategy, providing a structured way to manage and execute logic. It essentially acts as a bridge between the core strategy engine and your custom code, routing events to your handlers. Think of it as a central dispatcher for various signals and lifecycle events related to your strategy's operations.

It manages the creation and cleanup of your action handlers, ensuring they are initialized only once and properly disposed when no longer needed.  These handlers are where you’ll implement things like connecting to external services (like Telegram or Discord for notifications), managing state with tools like Redux, or gathering data for analytics.

The framework provides specific methods, like `signal`, `signalLive`, `breakevenAvailable`, and many others, each corresponding to a different event type (like a signal arriving, a partial profit level being hit, or a risk rejection occurring). These methods then forward those events to your configured handlers.

For more advanced scenarios, you can manually wire events through `scheduleEvent` and `pendingEvent`, allowing for fine-grained control over how your strategy reacts to various signals.  It's important to note that certain functions like `orderSync` have special considerations around error handling, as exceptions will directly propagate upwards.


## Class CacheUtils

CacheUtils helps you speed up your code by automatically remembering and reusing results from functions, especially when working with data that changes over time. Think of it like a smart assistant that avoids recalculating things you've already figured out.

It provides two main ways to use this: `fn` for regular functions and `file` for functions that can also store their results in files for even faster access.  The `file` option creates persistent files in a specific directory to hold cached data, which is helpful for longer-term storage and retrieval.

If you need to completely clear out the cached results for a function, the `dispose` method does just that – it wipes everything out so the function will recalculate from scratch.  For cases where your working environment changes, `clear` and `resetCounter` allow you to invalidate all cached data and reset index counters, ensuring your cache stays fresh and organized. Each function you wrap gets its own isolated cache to prevent interference between different parts of your code.

## Class BrokerBase

This base class, `BrokerBase`, helps you create custom adapters to interact with different exchanges or brokers. Think of it as a starting point for plugging your trading framework into a real exchange.

It provides default behavior for common actions like placing orders, updating stop-loss and take-profit levels, and tracking position changes. You’ll need to extend this class and implement the specific logic for your target exchange.

The class handles logging all these actions, making debugging easier. You can simply extend it to add your exchange-specific code, focusing on the core trading logic without having to worry about the basic structure.

**Key things to remember:**

*   `waitForInit()` is used to set up your exchange connection before trading begins.
*   Methods like `onOrderOpenCommit` handle placing orders, while `onOrderCloseCommit` deals with closing positions.
*   Events are triggered during live trading, but are skipped during backtesting.
*   You can add custom logic for actions like partial profit or loss closures, and trailing stop adjustments.

The framework handles many of the underlying details, such as retry mechanisms and error handling. You focus on implementing the exchange-specific parts, making your code more organized and reusable.


## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman, handling communication with your trading broker and ensuring order operations are controlled. It's a critical piece for both live trading and backtesting.

During backtesting, it essentially does nothing – it skips all broker-related actions, making the simulation run faster. In live trading, it relays those actions to your actual broker. Think of it as a safety net and translator.

It provides several "commit" methods (`commitOrderOpen`, `commitOrderClose`, etc.) that are triggered by various events within the trading system.  These methods are called automatically in certain situations, but you can also call them directly.

The adapter also manages signals like open/close orders and pings, automatically sending them to your broker when activated. 

Key functions include:

*   **`useBrokerAdapter`**:  You use this to tell the framework *which* broker connection you want it to use.
*   **`enable`**: This turns on the broker communication, setting up the necessary connections.  It's a one-time setup.
*   **`disable`**: This turns off broker communication and cleans up resources.
*   **`clear`**:  This resets the adapter, useful if your trading environment changes (like when you switch between different test environments).

It intercepts certain order adjustments (partial profits, trailing stops, breakevens, and average buy orders) *before* they're finalized, allowing for potential intervention and error handling. This is a chance to validate or reject an action before it hits the live market.



The `BrokerAdapter` ensures order events are handled safely and reliably, whether you're testing strategies or executing trades in real-time.

## Class BreakevenUtils

This class provides tools to analyze and report on breakeven events in your trading backtests. Think of it as a way to get a clear picture of how often your strategies hit breakeven points and understand the details surrounding those events.

It offers ways to retrieve summarized statistics about breakeven occurrences and to generate detailed markdown reports showing individual events, including information like entry price, position, and timestamp.

You can also easily export these reports as files, making it convenient to review your strategy's performance over time. The reports include a table of events and a summary of key metrics. The files are named with the symbol and strategy name for easy organization.


## Class BreakevenReportService

The BreakevenReportService is designed to keep a record of when your trading signals reach their breakeven point. It actively monitors for these "breakeven" events and saves them to a database, allowing you to analyze and track your trading performance.

Think of it as a diligent record keeper for your trading signals.

It uses a "logger" to help with debugging and a process called `tickBreakeven` to handle the actual recording.

To start tracking breakeven events, you use the `subscribe` method. This prevents accidental duplicate registrations and provides a way to stop listening later by returning an unsubscribe function. If you need to stop monitoring, use the `unsubscribe` method.

## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and store reports about breakeven events for your trading strategies. It listens for these events and keeps track of them for each symbol and strategy you're using. 

It then generates easy-to-read markdown tables that summarize this data, including overall statistics like the total number of breakeven events. These reports are saved as files on your computer, organized by symbol and strategy.

You can subscribe to receive these events in real time, or request specific reports or statistics on demand. The service also allows you to clear out the stored data when it's no longer needed, either for a specific combination of symbol, strategy, exchange, frame, and backtest, or for everything. Essentially, it automates the process of tracking and documenting your breakeven points.

## Class BreakevenGlobalService

This service acts as a central point for tracking breakeven calculations within the system. It's designed to be injected into the core trading strategy, simplifying how the strategy interacts with the underlying breakeven mechanisms. Think of it as a gatekeeper – it handles logging all breakeven actions before passing them on to the actual connection service.

Several validation services are also available and injected to check the existence of various components like strategies, risks, exchanges, frames and actions.

It’s responsible for ensuring that breakeven calculations are performed correctly and provides a place to monitor those operations. The `check` method determines if a breakeven event should occur, while `clear` resets the breakeven state when a signal is closed.  The `validate` method makes sure the strategy and associated risk configurations are valid, and remembers previous validations to avoid unnecessary repeats.


## Class BreakevenConnectionService

The BreakevenConnectionService manages tracking breakeven points for trading signals. It’s designed to efficiently create and manage individual breakeven tracking objects, ensuring that you don't create unnecessary instances.

It acts as a central point for retrieving these tracking objects, keeping them cached for performance and automatically cleaning them up when signals are no longer active. This service handles the setup, checks, and clearing of breakeven states, making it easier to integrate breakeven tracking into your strategies.

Think of it as a factory that makes and maintains ClientBreakeven objects, remembering them for reuse and removing them when they’re no longer needed. The process involves getting or creating a ClientBreakeven based on the signal ID, running checks or clearing actions, and finally, cleaning up the cached instance. This allows your trading strategies to keep a close eye on when a trade has reached its breakeven point.

## Class BacktestUtils

The `BacktestUtils` class provides helpful tools for running and analyzing backtests within the framework. Think of it as a utility belt for your trading strategies.

You can use it to easily start a backtest for a specific symbol and strategy, or to run one in the background without immediate results. It also allows you to check things like the pending signal or total percentage of the position currently held.

Need to know the current cost basis or the remaining time on a scheduled signal? This class has methods for that. You can even manually commit actions like closing a partial position or adjusting a stop-loss.

The class also provides ways to retrieve detailed reports and statistics about your backtest results, and even to list all running backtest instances. It's designed to make the backtesting process more accessible and insightful.


## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what's happening during your backtests. It essentially acts as a diligent observer, capturing every significant moment in a trading signal’s lifecycle – when it's idle, when it’s opened, actively generating trades, and when it’s closed.

This service listens for these signal events and diligently logs them, including all the pertinent details, to a SQLite database. This allows for in-depth analysis and debugging of your backtesting strategies.

You can think of it as setting up a system that automatically creates a log file for your backtests, making it much easier to understand why certain decisions were made and how the strategy performed.

To get this logging functionality running, you'll subscribe to the backtest signal emitter. The subscription prevents multiple connections, ensuring a clean and reliable log. And when you're done, you can easily unsubscribe to stop the logging process. If you haven't subscribed in the first place, unsubscribing does nothing.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for price updates (ticks) during a backtest and keeps track of when trading signals are closed.

It organizes this information, generating easy-to-read markdown tables that show the details of each closed signal. These reports are then saved as files on your computer, making it simple to review and analyze your strategy's performance.

The service uses a clever storage system to keep data separate for each symbol, strategy, exchange, timeframe, and backtest, ensuring everything is well-organized. You can request data or reports for a specific combination of these factors, or clear out all accumulated data if you want to start fresh.

To use it, you subscribe to receive price updates and the service takes care of the rest. When you’re finished, you can unsubscribe to stop receiving updates.

## Class BacktestLogicPublicService

This service helps you run backtests in a structured way, handling all the necessary setup and context behind the scenes. It acts as a bridge between your backtest logic and the underlying system.

Think of it as a conductor of an orchestra; it manages the flow of information and ensures everything happens in the right order. 

It automatically provides the strategy, exchange, and frame names to your backtesting functions, so you don't have to pass them manually. 

You interact with it primarily through the `run` method, which takes a symbol as input and returns a stream of results (like signals to open, close, or cancel positions). This makes the backtesting process simpler and more organized.

The service uses a logger to track events, a time management service to handle dates, a schema service for frame information, and an exchange connection service.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService orchestrates the backtesting process, working asynchronously to handle data efficiently. It begins by retrieving timeframes, then processes each one, simulating trading activity.

When a trading signal appears, the service fetches necessary candle data and executes the backtest logic. 

It then strategically skips timeframes until the trading signal concludes, before providing the final results.

This entire process streams results one at a time, avoiding large data storage and offering the possibility to stop the backtest early.

Key components like the strategy core, exchange core, frame core, action core, and time/price meta services are all essential parts of this backtesting engine. The `run` method is the primary way to start a backtest, accepting a symbol and returning a stream of results.

## Class BacktestCommandService

BacktestCommandService acts as a central point for accessing backtesting features within the framework. It's designed to be easily integrated into your application using dependency injection.

It manages several key services, including those for logging, validating strategy schemas, assessing risk and actions, and interacting with the core backtest logic.

The `validate` function checks if a strategy and its associated risk configurations are correctly set up, remembering previous checks to make things faster.

The `run` function is how you actually execute a backtest. You specify the trading symbol and provide context like the strategy and exchange names, and it returns a stream of results detailing trades – opens, closes, cancellations, and scheduled actions – that occurred during the backtest.

## Class ActionValidationService

The ActionValidationService helps you keep track of and verify your trading actions, ensuring everything is set up correctly. Think of it as a central manager for your action handlers.

It lets you register new action handlers using `addAction`, effectively adding them to its internal record.  

Before you actually use an action, you can use `validate` to double-check that it exists and is properly configured.  

For efficiency, it remembers previous validation results, so it doesn't have to re-validate the same actions repeatedly.  

If you need to see all the action handlers you've registered, `list` provides a simple way to get a full listing. 


## Class ActionSchemaService

The ActionSchemaService helps you organize and manage the blueprints for your trading actions. Think of it as a central place to define what actions your system can perform, ensuring everything is properly structured and safe.

It keeps track of these blueprints, called action schemas, and makes sure they adhere to specific rules, like ensuring that the methods used in your actions are valid.

You can register new action schemas, update existing ones, and easily retrieve them when needed.  The service uses a type-safe system for storing these schemas, preventing unexpected errors.

It validates that action handlers only use allowed public methods, and even allows for private methods to exist within your action classes.

You can use the `register` method to add a new action schema, the `override` method to make small changes to an existing one, and `get` to retrieve a schema for use elsewhere in your application.

## Class ActionProxy

ActionProxy acts like a safety net for your custom trading actions, ensuring your strategies don't crash due to unexpected errors. It's essentially a wrapper around your action handlers (like `init`, `signal`, `dispose`, etc.) that catches any errors that might occur during their execution. 

Think of it this way: if a piece of your custom code has a bug, ActionProxy will log the error and keep the entire backtest running, preventing a complete halt.

Here's a breakdown of how it works:

*   **Error Handling:** It's designed to prevent errors in your custom action logic from bringing down the entire backtest system. All methods are wrapped in `try...catch` blocks.
*   **Factory Pattern:** You don't directly create an ActionProxy; instead, you use `fromInstance()` to create it, ensuring it's properly configured.
*   **Method Handling:** It checks if the underlying action handler has implemented a specific method before attempting to call it, gracefully handling cases where a method is missing.
*   **Different Signal Events:** It provides specialized methods for handling signal events from different sources: general signals (`signal`), live trading (`signalLive`), and backtesting (`signalBacktest`).
*   **Special Cases:** Some methods like `orderSync` and `orderCheck` are deliberately *not* wrapped in error handling, allowing errors to propagate to specific error handling mechanisms.
*   **Lifecycle Events:** Handles various lifecycle events like initialization (`init`), cleanup (`dispose`), and scheduled events (`pingScheduled`, `scheduleEvent`), ensuring stability throughout the entire trading process.
*   **Breakeven, Profit & Loss:** Includes handlers for breakeven, partial profit and partial loss events.



Essentially, ActionProxy makes sure that errors in your custom action handlers don't derail your backtests or live trading executions.

## Class ActionCoreService

The `ActionCoreService` is the central hub for managing actions within your trading strategies. It’s responsible for coordinating the execution of actions defined in your strategy's configuration.

Here's a breakdown of what it does:

*   **Action Management:** It retrieves a list of actions from your strategy's schema and ensures each action is valid before running.
*   **Event Routing:** The service routes different types of events (like market ticks, breakeven notifications, or scheduled pings) to the appropriate actions, ensuring they're handled in sequence.
*   **Initialization and Cleanup:** It handles the initial setup of actions (`initFn`) and cleans up when a strategy is finished (`dispose`).
*   **Validation:** The `validate` property allows you to check if your strategy's settings and configurations are correct before running, and it does this efficiently by remembering previous validations.

Essentially, the `ActionCoreService` simplifies the process of organizing and executing actions within your backtesting or live trading environment. The various functions (`signal`, `signalLive`, `pingScheduled`, etc.) each trigger specific actions based on events happening in the trading environment. These actions can include things like executing trades, updating positions, or generating alerts. The `orderSync` and `orderCheck` functions are critical for coordinating actions and ensuring consistency across your strategy. Finally, `clear` function provides a way to reset the action data, either for a specific action or globally.

## Class ActionConnectionService

The ActionConnectionService acts as a central dispatcher for actions within your trading strategies. It takes requests for specific actions and ensures they are handled by the correct implementation. To make things efficient, it remembers (caches) the action implementations it's already created, so it doesn't have to recreate them every time.

This service relies on other components like the logger, action schema service, and strategy core.

The `getAction` property is key – it's how the service finds the right action handler. It uses a combination of the action's name, the strategy it belongs to, the exchange, and the frame to pinpoint the correct implementation. The `initFn` is responsible for preparing the action for use, including potentially loading saved data.

There are also several methods like `signal`, `signalLive`, `breakevenAvailable`, and others. These act as connectors, delivering events (like market signals or order updates) to the relevant action handler.  Each of these methods takes a specific type of event and routes it to the correct place.

Finally, the `clear` method lets you explicitly remove a cached action, which can be useful in certain situations like when resetting or updating a strategy.

## Class ActionBase

The `ActionBase` class is your foundation for creating custom actions within the backtest-kit framework. Think of it as a starting point for handling events and extending the core functionality.

It's designed to simplify building custom logic for things like state management, notifications, logging, and analytics.  You don't need to implement every method – the base class provides defaults for most of them, making development easier.  Each method automatically logs events for tracking and debugging. You'll get information about the strategy, frame, and specific action being executed.

The lifecycle of an action handler includes initialization (`init`), event handling (`signal`, `signalLive`, `signalBacktest`, etc.), and cleanup (`dispose`).  These events cover various situations: receiving signals, hitting breakeven or profit/loss targets, monitoring scheduled or active signals, and dealing with risk rejections.

When you extend `ActionBase`, you're working with a clear structure – a constructor that takes strategy details, and a series of event handlers you can override to inject your custom logic at specific points in the trading process.  Be mindful of lifecycle management, using `init` to set things up and `dispose` to clean up resources when the process is complete.
