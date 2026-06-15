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

The Walker Validation Service acts as a central hub for managing and verifying your parameter sweep configurations, often called "walkers." Think of it as a librarian for your optimization setups, keeping track of them and making sure they're all in order before you start a backtest.

It allows you to register new walkers, which define the ranges of parameters you want to test.  Before running any tests, you can use it to confirm that a walker actually exists and that all the strategies it depends on are also correctly configured. 

To speed things up, it caches the results of these validations so you don’t have to re-check everything every time.  You can also view a complete list of all the walkers you’ve registered. 

Essentially, this service ensures your walkers and the strategies they use are ready for backtesting and optimization.


## Class WalkerUtils

WalkerUtils helps you manage and run walker processes, simplifying how you interact with the underlying walker command service. Think of it as a central tool for executing and monitoring your trading strategies.

It provides a straightforward way to start walker comparisons, allowing you to easily specify the symbol and relevant context. You can even run walkers in the background if you just need to perform actions like logging or callbacks without wanting to analyze the real-time data.

To control your strategies, you can stop them from generating new signals, gracefully interrupting any ongoing processes and preventing future ones.

Need to examine the results? WalkerUtils offers convenient methods to fetch the complete data and generate a formatted report, even allowing you to customize which metrics are included. You can also save these reports directly to disk.

Finally, it keeps track of all active walker instances, giving you a quick overview of their status. WalkerUtils is designed as a single, readily available tool for managing these processes.

## Class WalkerSchemaService

This service helps you keep track of and manage different "walker" schemas – think of them as blueprints for how a particular trading process should behave. It uses a clever system to store these schemas in a way that helps prevent errors due to incorrect data types. 

You can add new walker schemas using the `addWalker` function (or, more technically, `register`), and then easily get them back later using their names with the `get` method.  Before adding a new schema, the `validateShallow` function quickly checks if it has all the necessary parts and if they’re the right types. If you need to update an existing schema, the `override` function lets you change specific parts of it without replacing the whole thing. The `_registry` property is the internal storage for the schemas, and `loggerService` handles logging.

## Class WalkerReportService

The WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It acts like a recorder, capturing the results of each strategy test and neatly storing them in a database. 

Think of it as a system that automatically logs metrics and statistics, allowing you to easily compare different strategy versions and see which parameters are leading to the best outcomes. It connects to the optimization process and makes sure you don't accidentally subscribe multiple times.

You can tell it to start listening for updates from the optimization process and it will send those updates to your database for later analysis. When you’re done, you can also tell it to stop listening, ensuring it doesn't keep collecting data unnecessarily.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you create and save detailed reports about your trading strategies’ performance during backtesting. It listens for updates as your strategies run, carefully collecting their results.

It uses a clever system to keep track of each strategy’s data separately, preventing them from interfering with each other. When it's time to create a report, it transforms the data into easy-to-read markdown tables that compare your strategies side-by-side.

These reports are then saved as files, making it simple to review and share your backtesting results. You can choose to clear old data, either for a specific strategy or all of them. It’s designed to be simple to set up and use, automatically managing the storage and generation of these valuable reports.


## Class WalkerLogicPublicService

This service helps manage and run "walkers," which are essentially automated processes for analyzing trading strategies. It builds upon a private service to automatically pass along important information like the strategy name, exchange, frame, and walker name – so you don’t have to manually include it in each call.

The `run` method is the core function, allowing you to execute walkers for a specific symbol, providing the necessary context. Think of it as kicking off the backtesting process for all your strategies, all while ensuring the right information is available.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies against historical data. It essentially acts as a coordinator, managing the process of running multiple strategies and presenting the results in a clear way.

It works by running each strategy one after another, providing updates on its progress as it goes. During this process, it keeps track of the best performance metric it observes. 

Finally, it gives you a complete report showing how all the strategies performed, ranked from best to worst. 

This service uses other components internally to handle the actual backtesting and data manipulation. It’s responsible for orchestrating the entire strategy comparison workflow. 

To use it, you’ll provide a symbol (like a stock ticker), a list of strategy names, the metric you want to optimize for (like profit or Sharpe ratio), and some context information about the exchange and data frame being used. The result is a generator that yields intermediate results for each strategy.

## Class WalkerCommandService

WalkerCommandService acts as a central access point for walker-related functionality, making it easy to incorporate into your applications. It simplifies interactions with the underlying walker logic and schema services.

This service is designed to be injected into your components, promoting a clean and organized architecture.

It bundles several validation services – strategy, exchange, frame, walker, strategy schema, risk, action – to ensure the configurations you're using are correct and consistent.  It performs extra validation steps to double-check critical configurations.

The `run` method is key; it executes a comparison process for a specific trading symbol, passing along important context like the walker, exchange, and frame names. This allows you to perform backtesting and analysis in a controlled and informative way.

## Class TimeMetaService

The TimeMetaService helps you reliably track the latest candle timestamp for each symbol, strategy, exchange, and frame combination. Think of it as a central place to get the current time during trading, even when you're not actively processing a tick.

It keeps a record of these timestamps, updated automatically after each tick by the StrategyConnectionService. If you need to know the current time outside of the normal tick processing flow, like when executing a command, this service provides that information.

It cleverly remembers these timestamps and will even wait briefly for the first timestamp to arrive if it's not already available. The service is designed to be efficient, caching these timestamps until you explicitly clear them to free up memory. You can clear individual timestamp records or clear them all, and it’s important to reset these when starting a new trading strategy to avoid using outdated information. It also utilizes existing context information when available, and its setup is handled automatically within the system.

## Class SystemUtils

SystemUtils helps keep backtest sessions separate and clean. It prevents one test from accidentally affecting another by temporarily disconnecting everything that's listening for events.

The `createSnapshot` function lets you take a picture of the current event listeners. This "snapshot" essentially clears out all the active listeners, allowing you to run a new backtest without any lingering influences from previous ones. After the backtest is complete, you can use the snapshot to restore the listeners to their original state.

## Class SyncUtils

SyncUtils helps you understand what's happening with your trading signals and how they're performing. It gathers data from signal events – when a signal opens a position and when it closes – to give you a clear picture of your trading activity.

You can use it to get aggregated statistics, like the total number of signals opened and closed. 

It can also create detailed reports in Markdown format, showcasing each signal’s information like its direction, price points, profit/loss, and reason for closure, displayed in an easy-to-read table.

Finally, you can easily save those reports to a file for later review or sharing, and the file names are automatically generated to include key details like the symbol and strategy.

## Class SyncReportService

The SyncReportService helps you keep track of what's happening with your trading signals by recording important moments to a report. It focuses on capturing when a signal is first created (like when a limit order is filled) and when it's closed (when you exit a position). 

Think of it as an auditor for your signals, noting the details of each signal's journey.

It listens for these events and writes the details – including profit/loss and why the signal closed – to a report file. 

To prevent accidental duplicate recordings, it makes sure only one subscription is active at a time. 

You can start receiving these signal updates by using the `subscribe` function, and stop them with `unsubscribe`.

## Class SyncMarkdownService

This service helps you keep track of and report on signal synchronization events during backtesting or live trading. It collects data about signal openings and closings, organizes it, and generates readable reports.

You start by subscribing to receive signal sync events. The subscription is designed to avoid accidental duplicate subscriptions. When you're finished, you can unsubscribe to stop receiving events and clear all collected data.

Each time a signal sync event occurs, the service processes it, adding details like timestamps and reasons for closures, and storing it along with information about the symbol, strategy, exchange, and time frame.

You can request statistics for specific combinations of these parameters – for example, to see the signal lifecycle for a particular strategy on a certain exchange. Or, you can get a full markdown report of the events. This report is also easily saved directly to disk.

Finally, the service allows you to completely clear all collected data, either for a specific setup (symbol, strategy, etc.) or for all data. This is useful for resetting or archiving old information.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of your trading strategies and make sure they're set up correctly. Think of it as a central hub for managing your strategies.

You can register new strategies using the `addStrategy` function, essentially adding them to the system's knowledge.

It also performs checks to ensure strategies exist and that any related risk profiles and actions are also valid, preventing errors later on.

For quicker checks, the service remembers previous validation results, a technique called memoization.

If you need to see all the strategies you've registered, the `list` function will provide you with a complete overview.

## Class StrategyUtils

StrategyUtils is a tool that helps you analyze and understand how your trading strategies are performing. It gathers information about events like closing positions, taking profits, or adjusting stop-loss orders.

It provides ways to access detailed statistics about these events, organized by symbol, strategy, and other factors. You can request a summary of key metrics or generate a comprehensive report in markdown format.

This report includes a table showing each event with relevant details such as price, percentage changes, and timestamps, along with a summary of event counts. The reports can also be saved directly to files for easy sharing and record-keeping. It’s like having a central place to understand the history and patterns of your strategy’s actions.

## Class StrategySchemaService

This service acts as a central place to store and manage different strategy schemas, which define how trading strategies are structured. It uses a special type-safe registry to keep track of these schemas, ensuring consistency and preventing errors.

You can add new strategy schemas using the `addStrategy()` method (represented by `register`), and retrieve them later using their names with `get()`. 

Before a new strategy is added, the service performs a quick check (`validateShallow`) to make sure it has the basic structure and properties it needs. If a strategy already exists, you can update parts of it using `override()`. The service also has access to logging tools via `loggerService` to help with debugging and monitoring.

## Class StrategyReportService

This service helps you keep a detailed audit trail of what your trading strategies are doing. Think of it as a meticulous record keeper, logging key events like when signals are canceled, positions are closed, or stop-loss orders are adjusted.

To start logging, you need to "subscribe" – this turns the service on. Then, whenever one of the events occurs (like taking a partial profit or setting a trailing stop), the service writes that information to a separate JSON file for each event. This is different from other reporting methods that collect events in memory.

To stop the logging, you "unsubscribe." This cleans up the service and prevents further events from being recorded.

The service is designed to work with several types of events:

*   **cancelScheduled:** Records when a scheduled signal is canceled.
*   **closePending:** Logs the closing of a pending signal.
*   **partialProfit:** Records when a portion of the position is closed at a profit.
*   **partialLoss:** Logs when a portion of the position is closed at a loss.
*   **trailingStop:** Records adjustments to the trailing stop-loss level.
*   **trailingTake:** Records adjustments to the trailing take-profit level.
*   **breakeven:** Logs when the stop-loss is moved to the original entry price.
*   **activateScheduled:** Logs activation of scheduled signal earlier than expected.
*   **averageBuy:** Records when a new average-buy entry is added to a position.

Each of these methods receives detailed information about the trade, like the symbol, price, and profit/loss metrics, so you can analyze exactly how your strategy is performing.

## Class StrategyMarkdownService

This service helps you track and report on your trading strategy's actions during backtesting or live trading. It acts like a recorder, capturing events like signal cancellations, pending order closures, and partial profit/loss executions.

Instead of writing each event to a file immediately, it temporarily stores these events in memory, which allows for generating comprehensive reports and statistics later.

Here’s how to use it:

1.  **Start Listening:** Use `subscribe()` to start collecting events.
2.  **Collect Events:** Your strategy's actions (like closing positions or adjusting stops) will automatically be recorded.
3.  **Get Data or Reports:** Use `getData()` to get aggregated statistics or `getReport()` to create a detailed markdown report. The report can be customized to show specific columns.
4.  **Save Reports:** `dump()` will generate and save a markdown report to a file with a timestamped name.
5.  **Stop Listening:**  When you’re done, use `unsubscribe()` to stop collecting events and clear the accumulated data.

The service is designed to be efficient by caching storage per symbol and strategy, preventing excessive file writing and improving performance. It’s also useful for analyzing strategy behavior and identifying areas for improvement.


## Class StrategyCoreService

This service acts as a central hub for managing strategy operations, injecting important information like the trading symbol, timestamp, and backtest mode into the process. It's used internally by other key services within the backtesting framework.

It bundles several other services (logger, connection, validation) to streamline operations.

Here's a breakdown of what it offers:

*   **Signal Management:** It can retrieve pending signals, scheduled signals, and related data like estimated duration and countdown times.
*   **Position Information:** You can get details about the current position, including cost, entry prices, DCA information, PnL, partial closes, and break-even points.
*   **Validation & Control:** It validates strategies and allows you to stop, cancel scheduled signals, or close pending positions.
*   **State Queries:** Provides real-time information about the position’s history, such as the highest profit/loss prices and distances.
*   **Backtesting & Ticking:** Used for performing backtests and advancing the simulation forward in time (ticking).
*   **Caching:** The `validate` method is cached to improve performance by avoiding redundant validations.
*   **User Signals:**  It allows for inserting user-supplied signals into the processing flow.
*   **Cleanup:** Facilitates clearing cached strategies and disposing of resources.



Essentially, it’s the go-to place for any operation related to a running trading strategy within the backtest environment.

## Class StrategyConnectionService

This class handles routing strategy operations to the correct client strategy implementation, essentially acting as a central dispatcher. It uses caching to improve performance and ensures strategies are initialized correctly.

Think of it as a smart switchboard for your trading strategies, making sure each strategy runs with the right data and resources.

Here's a breakdown of what it does:

*   **Routing:** It directs calls to strategy methods (like `tick()`) to the specific strategy that's responsible for a particular symbol.
*   **Caching:** It remembers which strategies are already loaded to avoid repeated setup, speeding things up.
*   **Initialization:** It makes sure a strategy is fully ready before you start using it.
*   **Handles Live and Backtesting:** It works whether you're running strategies live or testing them against historical data.

**Key Features:**

*   It manages which strategy is used for which symbol.
*   It keeps track of frequently-used strategies in memory for efficiency.
*   It makes sure each strategy is ready before it’s used.
*   It's designed to work equally well with live trading and historical backtesting.

**Important Methods:**

*   `tick()`: Runs a trading tick for a specific strategy.
*   `backtest()`: Executes a strategy using historical data.
*   `getStrategy()`: Retrieves the cached strategy instance.
*   `getPendingSignal()`: Gets the currently active pending signal (order) for the strategy.
*   Several `get...` methods:  Provide access to information about the current position, such as cost, PnL, and entry levels.
*   `cancelScheduled()`: Cancels a previously scheduled signal.
*   `closePending()`: Closes an existing pending position.


## Class StorageLiveAdapter

The `StorageLiveAdapter` helps manage how your trading signals are stored, allowing you to easily switch between different storage methods like disk, memory, or even a dummy adapter for testing. It acts as a central point for all storage operations, providing a consistent interface regardless of where the data is actually kept.

You can choose which storage method to use with quick commands like `usePersist`, `useMemory`, and `useDummy`.  The `getInstance` property automatically creates and caches the storage utils, so you don’t have to worry about recreating them repeatedly, but you can force a refresh with `clear` if necessary, particularly when changing working directories.

The adapter also handles specific signal events – openings, closings, scheduling, cancellations, and pings – by passing those events along to the chosen storage method. Methods like `findById` and `list` are also provided, which do the same. If you need to customize the storage mechanism entirely, you can set your own adapter using `useStorageAdapter`.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. It lets you easily switch between different storage methods, like using a database, keeping data in memory, or even using a dummy adapter that does nothing at all. This adapter uses a pattern that allows you to plug in different storage implementations without changing the core backtesting logic.

You can choose the storage method you want to use – persistent storage for saving to disk, memory storage for quick access, or a dummy adapter for testing – and the adapter will handle the details of interacting with that storage. It also provides methods for managing signals, such as finding a signal by its ID or listing all stored signals.

The adapter keeps a cached version of the storage utils to improve performance, but you can clear this cache when needed, especially when the environment changes. This ensures you’re always using the correct storage configuration for each backtesting run. It responds to different signal events – opened, closed, scheduled, and cancelled – forwarding those events to the currently selected storage adapter. It also handles special "ping" events for actively running and scheduled signals, keeping the `updatedAt` timestamps current.

## Class StorageAdapter

The StorageAdapter is the central component for handling both past (backtest) and current (live) trading signals. It automatically keeps track of incoming signals by listening for updates. 

You can easily access signals from either your backtest data or live data using the same methods.

To avoid unnecessary connections, the adapter uses a system to ensure it only subscribes to signal sources once.

If you need to stop tracking signals, a `disable` function is available, and it's safe to call this repeatedly.

Here's what you can do with the adapter:

*   Find a specific signal by its unique ID.
*   Retrieve a list of all backtest signals.
*   Retrieve a list of all live signals.

## Class StateLiveAdapter

The `StateLiveAdapter` helps manage and store the state of your trading strategies, allowing you to switch between different storage methods easily. It’s designed to be flexible, letting you use file-based storage, in-memory storage, or even a dummy adapter for testing.

The adapter uses a system of memoization, meaning it remembers previously fetched state data to avoid unnecessary work.  When a trading signal is finished or cancelled, you can use `disposeSignal` to clear out that memoized data.

The primary purpose of this adapter is to track key metrics like peak percentage gains and how long a position has been open – crucial for strategies that rely on large language models to confirm trading decisions.  The state it manages, such as these metrics, is saved even if your application restarts.

You can quickly change the way state is stored using convenience functions: `useLocal` for in-memory storage, `usePersist` for file-based storage (the default), and `useDummy` for discarding all writes. If you need something truly custom, `useStateAdapter` lets you plug in your own adapter implementation.  The `clear` function helps refresh the state when the underlying directory structure changes, ensuring your strategy always has a clean slate.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage state during backtesting, letting you choose where that data is stored. It’s designed to work with different storage options like keeping everything in memory, saving to files, or even discarding data entirely for testing purposes. This adaptability makes it easy to swap out how state is handled without changing the core backtesting logic.

To manage the state, you have methods to read (`getState`) and write (`setState`) values for each signal, tracking things like performance metrics over time. You can easily switch between storage types using helper functions like `useLocal` (in-memory), `usePersist` (file-based), and `useDummy` (for discarding data).  If you need something custom, `useStateAdapter` allows you to plug in your own storage solution.

The adapter also handles cleaning up old state data (`disposeSignal` and `clear`), especially important when the strategy is re-run or the working directory changes. It is particularly useful for implementing complex trading rules that rely on tracking a trade's performance over time, like the example provided where a trade is automatically exited if it hasn’t confirmed its thesis within a set timeframe and with a limited drawdown.

## Class StateAdapter

The StateAdapter is the central manager for handling state, both during backtesting and in live trading. It makes sure state isn't kept around unnecessarily when signals are finished.

It uses a clever "single-shot" approach to ensure you only subscribe to signals once, preventing unexpected behavior.

You can enable and disable the adapter, essentially turning state management on and off. Disabling is safe to do repeatedly – it won't cause problems.

To get the current state of a signal, the `getState` function is used, and it automatically directs the request to the correct storage (backtest or live).  Similarly, to update the state, the `setState` function handles routing the update.


## Class SizingValidationService

The SizingValidationService helps you keep track of and ensure your position sizing strategies are correctly set up within your trading system. It acts as a central place to register all your sizing methods.

You can use it to add new sizing strategies using `addSizing`, and to verify that a particular sizing strategy exists before using it in your trades with the `validate` function. This validation process is optimized for speed through caching, so it doesn't slow things down. 

Finally, `list` provides a way to see all the sizing strategies you've registered. Think of it as a checklist for your sizing configurations.

## Class SizingSchemaService

This service helps you organize and manage different sizing strategies for your trading backtests. It uses a special registry to keep track of these strategies, making sure they're stored in a safe and consistent way. You can add new sizing strategies using the `register` method, and if you need to update an existing one, the `override` method lets you make partial changes.  Need to use a specific sizing strategy?  The `get` method allows you to easily retrieve it by name. Before adding a new sizing strategy, a quick check (`validateShallow`) ensures it has the necessary components.

## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade. It's a central component that uses a connection service to perform the actual calculations and a validation service to ensure the sizing is valid. This service is used both by the internal workings of the backtest-kit and exposed for use in your own strategies. 

It keeps track of a logger for recording relevant information and manages the connections and validations needed for sizing. 

The core function, `calculate`, takes sizing parameters and a context object, then returns the calculated position size. This allows for flexible sizing decisions based on various factors.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within the backtest-kit framework. It acts as a central point for handling sizing operations, directing them to the correct sizing implementation based on a name you provide.

To improve efficiency, it remembers (caches) those sizing implementations so it doesn't have to recreate them every time.

Essentially, it simplifies the process of calculating position sizes, especially when you have different sizing strategies or risk management approaches.  If you don't have any specific sizing configuration, the sizing name will be an empty string.

The service relies on a `sizingName` to route requests, and it uses internal services for logging and sizing schema management. 

You can retrieve a sizing implementation with `getSizing`, and use the `calculate` method to determine the size of a position based on your defined risk parameters and the chosen sizing method.

## Class SessionLiveAdapter

The `SessionLiveAdapter` provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub for session information that can be easily swapped out with different storage methods.

By default, it uses a persistent storage system that saves data to your computer’s file system, ensuring your progress isn't lost even if the application restarts. 

You can also choose to use a temporary, in-memory storage for quick testing or a dummy adapter that simply ignores any data changes.

The adapter remembers the session data for each trading symbol, strategy, exchange, and frame combination, making it efficient to access and update.

For maximum control, you can even create and use your own custom session adapter.

To ensure fresh instances when your working directory changes, it's helpful to clear the adapter’s internal cache.

## Class SessionBacktestAdapter

This component provides a flexible way to manage session data during backtesting. Think of it as a central hub that handles storing and retrieving information about your trading simulations. It's designed to be adaptable, letting you easily swap out different storage methods without changing your core backtesting logic.

By default, data is held in memory for quick access, but you can switch to storing it persistently on disk or even using a "dummy" adapter that simply throws away any updates for testing purposes.  The `useLocal`, `usePersist`, and `useDummy` methods provide shortcuts to change these storage options.  You can also define your own custom storage solutions.

The `getData` and `setData` methods are your primary tools for interacting with the session data – they fetch values and update them during the backtest. To ensure data freshness when your working directory changes, the `clear` method allows you to purge the cached session instances, forcing them to be re-initialized.

## Class SessionAdapter

The SessionAdapter acts as a central point for handling data storage, whether you're running a backtest or a live trading session. It intelligently directs data requests and updates to the correct storage mechanism – either for historical backtesting data or real-time live data.

You can use `getData` to retrieve existing data points, specifying the symbol, context (like the strategy and exchange used), whether it's a backtest, and the timestamp. Similarly, `setData` allows you to update data, ensuring the information is saved appropriately for either backtest or live environments. This adapter streamlines your data management process.


## Class ScheduleUtils

The ScheduleUtils class helps you keep track of and analyze scheduled trading signals. It simplifies working with signal queues and logging, making it easier to understand how your strategies are performing over time. 

Think of it as a central hub for getting a quick overview of signal activity.

You can pull data about signal queues, see how often signals are cancelled, and calculate average wait times to identify potential bottlenecks. 

It's designed to be easily accessible, allowing you to quickly generate detailed reports in Markdown format, and even save those reports directly to your computer. The class ensures that all statistics are calculated consistently and that your reports are clear and well-organized.


## Class ScheduleReportService

The ScheduleReportService is designed to keep a record of when signals are scheduled, opened, and cancelled. It’s like a historian for your trading signals, meticulously logging each step in their lifecycle. 

It keeps track of how long signals take to move from scheduling to being either executed or cancelled, which is really useful for spotting potential delays. 

To make sure things don't get messy, it prevents multiple subscriptions, ensuring that it's only listening for events once. 

You can tell it to start listening for signals, and it will provide a way to stop listening later, ensuring controlled data collection. If you accidentally tell it to stop listening when it wasn't listening to begin with, it simply ignores the request.

## Class ScheduleMarkdownService

This service automatically creates reports detailing the scheduling and cancellation of signals for your trading strategies. It listens for signals that are scheduled or canceled and keeps track of these events, organizing them by strategy.

The service generates clear, readable reports in Markdown format that include information about each event, plus helpful statistics like cancellation rates and average wait times. These reports are saved to disk, making it easy to review your strategy's performance over time.

You can subscribe to receive these updates as they happen, or request a full report on demand. The service also lets you clear out older data when it's no longer needed. It uses a storage system that isolates data for each strategy and trading frame, ensuring your reports are accurate and well-organized.

## Class RiskValidationService

This service helps you keep track of and verify your risk management settings. Think of it as a central place to register different risk profiles and make sure they're properly set up before you use them in your trading strategies. 

It’s designed to be efficient, remembering the results of previous validations so it doesn’t have to re-check everything all the time.

Here's a breakdown of what it does:

*   You can add new risk profiles using `addRisk`.
*   The `validate` function ensures that the risk profile you need actually exists.
*   `list` lets you see a complete overview of all the risk profiles you've registered.
*   It uses a `loggerService` which is likely used for debugging purposes. 
*   Internally, it keeps a record of risk profiles in a `_riskMap`.

## Class RiskUtils

The RiskUtils class helps you understand and analyze risk rejection events within your trading system. Think of it as a tool for examining what went wrong and why. It gathers data about rejections—like when they happened, which symbol was involved, and the reason for the rejection—and presents it in useful ways.

You can use it to get statistical summaries of risk rejections, providing counts and breakdowns by symbol and strategy.

It can also generate easy-to-read markdown reports that show a table of all rejection events, including key details such as position, price, and the reason for the rejection.

Finally, you can export these reports directly to files, so you can keep a record of your risk management performance. The file names are structured to easily identify the symbol and strategy being analyzed.

## Class RiskSchemaService

This service helps you manage and store risk schemas in a structured way. It uses a special registry to keep track of these schemas, ensuring they are typed correctly.

You can add new risk profiles to the registry using the `addRisk()` method (represented by `register` in the code). 

To get a specific risk profile back, you use its name with the `get()` method.

Before adding a risk profile, the `validateShallow()` method checks that it has all the necessary properties and that they are of the expected types. This helps prevent errors later on.

If a risk profile already exists, you can update parts of it using the `override()` method, which applies partial changes to the existing schema. 

The service also has a logger to help track and debug any issues that might arise.

## Class RiskReportService

The RiskReportService helps you keep track of when your risk management system flags and rejects trading signals. It acts as a listener, catching those rejection events and recording them in a database.

This lets you later analyze why signals are being rejected and audit your risk management processes.

To start using it, you subscribe to the risk rejection events. This sets up the service to listen and log. You can always unsubscribe to stop the logging.

The service uses a logger for debugging output, and it's designed to prevent accidental multiple subscriptions that could cause issues. It’s built to be reliable and provide a clear record of rejected signals.


## Class RiskMarkdownService

The RiskMarkdownService is designed to automatically create and save reports detailing risk rejections encountered during trading. It listens for rejection events and organizes them by symbol and trading strategy. It then generates easy-to-read markdown tables summarizing these rejections, along with useful statistics like the total number of rejections for each symbol and strategy.

Reports are saved to disk, making them accessible for review and analysis.

You can subscribe to receive these rejection events and unsubscribe when you no longer need them. The service keeps track of the data and provides methods to retrieve statistics, generate reports, and save them to disk. You can also clear the accumulated data if needed, either for a specific symbol/strategy combination or all data. The service is structured to use isolated storage for each symbol-strategy-exchange-frame-backtest combination to maintain data integrity.

## Class RiskGlobalService

This service acts as a central hub for managing risk-related operations within the trading framework. It works closely with a connection service to ensure that trading actions adhere to predefined risk limits. 

It keeps track of validations to avoid unnecessary repetition and provides logging for transparency. 

The core functionality includes checking if a trade signal is permissible based on risk constraints, and a specialized version of that check that also safely reserves resources to prevent conflicts when multiple simultaneous requests are made.

It also handles the registration and removal of trade signals within the risk management system, and offers the ability to clear existing risk data, either selectively or completely. This component is essential for both the internal workings of trading strategies and the public-facing API.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It intelligently routes risk-related requests to the correct risk management component, ensuring that each trade adheres to the specified risk limits.

It uses a clever system to remember previously used risk management components, improving performance by avoiding repetitive setups. This caching is based on the risk name, exchange, and frame, which allows different risk profiles for different exchanges and timeframes.

The core functionality revolves around the `getRisk` method, which retrieves the appropriate risk management component, and `checkSignal`, which determines if a trade is permissible based on the predefined risk rules. There's also a more robust, thread-safe version, `checkSignalAndReserve`, for scenarios requiring guaranteed concurrency.

You'll use `addSignal` to register a new trade and `removeSignal` to close one, both routing the action through the correct risk management channel. Finally, the `clear` method lets you flush the cached risk management components when needed. Essentially, it's the gatekeeper ensuring your trades stay within acceptable risk boundaries.

## Class ReportWriterAdapter

This component manages how trading data and events are stored for analysis and reporting. It's designed to be flexible, allowing you to easily swap out different storage methods without changing the core trading logic.

It keeps track of the storage used for each report type (like backtest results, live trading data, or walker events) and makes sure you're only using one storage instance for each, which helps with efficiency. By default, it stores data in JSONL format, but you can change this.

You can control which storage method is used, and it automatically creates the storage when you first write data. 

It also has a handy "dummy" mode that prevents any data from being written, which can be useful for testing or when you don't need to save data. Finally, there's a way to clear out the cached storage instances, which is important if the program's working directory changes.


## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework generate detailed logs. You can choose to track backtests, live trading sessions, walker activities, performance metrics, and more.

Think of it as a way to turn on and off logging for specific areas without affecting others.

The `enable` function lets you subscribe to certain types of logging. It returns a function you *must* call later to turn off those logging services – otherwise, you risk your application using too much memory.

The `disable` function lets you quickly stop logging for specific services without needing a separate "unsubscribe" step; it stops the logging immediately.

ReportUtils is designed to be extended by other components, so you can tailor logging even further.

## Class ReportBase

This framework component, `ReportBase`, helps you log and analyze trading events by writing them to files. It’s designed to efficiently record data like trade executions or strategy signals in a standardized JSON format.

Think of it as a central place to collect information about what's happening during your backtests.

Each report type gets its own file, and the data is written in a way that's easy to search and filter. You can quickly find all trades for a specific symbol, strategy, or timeframe, for instance.

The system handles file creation, manages writing speed to prevent slowdowns, and includes safeguards to prevent data loss due to errors or timeouts. The initialization only happens once, even if you try to trigger it multiple times. You simply provide a name for your report type and a base directory where the files will be stored, and it takes care of the rest. Writing data involves passing it along with some metadata that makes filtering later much easier.

## Class ReportAdapter

The ReportAdapter helps manage how trading data and events are stored, allowing you to easily switch between different storage methods like JSONL files or other custom solutions. It's designed to be flexible and efficient, keeping track of storage instances to avoid creating unnecessary duplicates.

You can customize the adapter by providing your own storage constructor, essentially swapping out the underlying storage mechanism. 

If your working directory changes, you'll want to clear the cache to ensure storage instances reflect the new path. 

There's also a handy "dummy" adapter that lets you temporarily disable data storage entirely, useful for testing or scenarios where you don't need to persist data. Finally, the `useJsonl` method lets you quickly revert to the default JSONL-based storage.

## Class ReflectUtils

This utility class provides a way to track key performance metrics for your trading strategies, such as profit and loss (PNL), peak profit, and drawdown, in real-time. It simplifies accessing position state information from your strategies, ensuring consistency and validity across different environments (live or backtesting). Think of it as a central hub for getting these crucial data points.

It offers a set of methods to retrieve information like:

*   **PNL:** Both as a percentage and in dollar amounts for the current position.
*   **Peak Performance:** Records the highest profit price, timestamp, and PnL achieved during the position's life.
*   **Drawdown:** Tracks the worst loss experienced, including price, timestamp, and associated PnL.
*   **Time-Based Metrics:**  Provides information on how long a position has been active, how long it’s been waiting, and how long it's been in drawdown.

These methods all support both backtesting and live trading scenarios, and they automatically handle things like partial closes, DCA entries, slippage, and fees to give you an accurate picture of your strategy’s performance. Since it's a singleton instance, accessing these metrics is easy and convenient throughout your application. It’s designed to give you clear insights into your strategy’s behavior and risk profile.

## Class RecentLiveAdapter

The RecentLiveAdapter helps you manage and access recent trading signals, offering flexibility in how those signals are stored. It allows you to choose between persistent storage (saving signals to disk) or in-memory storage (keeping signals only in the current session).

You can easily switch between these storage methods using `usePersist` for disk storage and `useMemory` for in-memory storage.  The adapter also provides convenient functions to retrieve the most recent signal, calculate the time since a signal was last created, and handle active ping events, delegating these tasks to the currently selected storage backend.

To change the storage mechanism, you can use the `useRecentAdapter` method to specify a different storage class, and `clear` to reset the cached instance when changes occur like when the working directory changes. The system is designed so that you can swap out storage implementations without changing the rest of your code.

## Class RecentBacktestAdapter

This component provides a flexible way to manage and access recent backtest data, allowing you to choose between storing data in memory or persisting it to disk. It acts as a bridge between your backtesting logic and where your recent signal data is kept.

You can easily switch between in-memory storage (the default) and persistent storage using `useMemory()` and `usePersist()`.

The `clear()` function is important to use when your environment changes, such as when the current working directory updates, ensuring you get a fresh instance of the storage adapter.

The `handleActivePing`, `getLatestSignal`, and `getMinutesSinceLatestSignalCreated` methods provide access to the underlying storage adapter’s functionality.  You can also customize the storage backend itself by using the `useRecentAdapter` function to set a custom adapter constructor.

## Class RecentAdapter

The RecentAdapter manages how recent trading signals are stored and accessed, working for both backtesting and live trading environments. It automatically updates itself based on incoming data and provides a single, reliable way to get the most recent signal for a specific trading symbol and situation. To prevent issues with looking into the future, it ensures that any signal retrieved is from a time that occurred before a specified "when" date.

You can turn on this storage functionality with `enable`, which subscribes to updates, and safely turn it off with `disable`, even if you've disabled it before.  `getLatestSignal` allows you to retrieve that most recent signal, prioritizing backtest data before live data.  `getMinutesSinceLatestSignalCreated` calculates how much time has passed since that latest signal was generated, again referencing backtest data first and also using a "when" date to avoid future signal contamination. The system prevents multiple subscriptions by using a singleshot pattern.

## Class PriceMetaService

PriceMetaService helps your trading strategies access the most recent market price for a specific asset, strategy, exchange, timeframe, and whether it's a backtest or not. It acts like a central hub that remembers these prices, automatically updating them as new ticks come in from your strategies.

Think of it as a way to get the current price even when your strategy isn’t actively running, for example, when executing a command between ticks.

It keeps track of these prices in a special way: it creates a unique “container” for each price combination, and updates it as the strategy runs. If it doesn't have a price yet, it will wait a short time to see if one arrives, before letting you know.

The service is designed to work behind the scenes, automatically updating prices and allowing you to retrieve them. You can clear out all these tracked prices or just specific ones to avoid holding on to outdated information, particularly when starting a new backtest or live trade. It's a key component for keeping your trading system synchronized with market conditions.

## Class PositionSizeUtils

This class offers helpful tools for determining how much of an asset to trade, a process called position sizing. It provides different methods to calculate this size, each with its own approach. 

You'll find techniques like fixed percentage risk, which uses a predetermined portion of your account balance, and the Kelly Criterion, a more advanced method that considers win rates and win-loss ratios. There’s also an ATR-based approach, leveraging Average True Range to gauge volatility.

Before each calculation, the class checks to make sure the information you provide aligns with the chosen sizing method, helping to ensure accurate results. Think of it as a set of pre-built formulas to help you size your trades effectively.

## Class Position

The Position class offers helpful tools for determining take profit and stop loss prices when you're trading. It simplifies the process by automatically adjusting the direction of your levels based on whether you're going long or short.

You can use the `moonbag` function to quickly calculate take profit and stop loss levels. With this, your take profit is set at a fixed 50% gain from your entry price.

Alternatively, the `bracket` function provides more flexibility.  It lets you define your own custom take profit and stop loss percentages, making it ideal for more tailored trading strategies. It handles the direction of your order for you.

## Class PersistStrategyUtils

This class, `PersistStrategyUtils`, is designed to handle the process of saving and retrieving data related to your trading strategies. It essentially keeps track of temporary, deferred actions like queued orders or signals – things that haven't been fully processed yet.

Think of it as a safety net for your strategy's memory. It uses a clever system to create and manage these "memory snapshots" for each strategy running on a specific symbol and exchange.  The system also supports custom configurations, allowing you to choose how the data is stored.

You can even swap out different ways the data is persisted, like using a standard file-based system, a dummy instance for testing purposes (where nothing actually gets saved), or a custom adapter you create yourself.  The class is designed to be reliable, ensuring your strategy’s state is handled carefully, even in unexpected situations.  It also has a way to refresh its memory if something changes in the program's environment.

## Class PersistStrategyInstance

This class helps you save and load the state of your trading strategies to a file, ensuring that your progress isn't lost. It acts as a reliable container for your strategy’s data, specifically designed to work with the backtest-kit framework.

The class uses a predetermined identifier ("strategy") to store the strategy data within a shared storage area, simplifying the process of persistence. It’s designed to be resilient – even if something unexpected happens during saving, it tries to protect your data.

Here's a breakdown of how it works:

*   **Initialization:** It prepares the storage area when needed.
*   **Saving:** It allows you to save the current state of your strategy (or clear it completely).
*   **Loading:** It enables you to retrieve the previously saved strategy state.

The constructor requires the symbol, strategy name, and exchange name to define the context of the strategy being persisted. It leverages an internal storage mechanism to manage the file-based persistence. The `waitForInit` method is used to initialize the underlying storage. You can read and write strategy data using `readStrategyData` and `writeStrategyData` respectively.

## Class PersistStorageUtils

This class helps manage how signal storage data is saved and loaded, especially for persisting signals across sessions. It intelligently creates storage instances, remembering them so you don’t have to recreate them each time.

You can customize how the storage is handled, swapping in your own storage solutions or using pre-built options like a file-based storage or a dummy storage for testing.

The `readStorageData` method retrieves all your saved signals for a specific mode (like backtesting or live trading), and `writeStorageData` saves changes back. These operations are designed to be reliable, even if something unexpected happens during the process.

If you need to change the storage mechanism or the working directory changes, you can easily refresh the storage using the `clear` or `usePersistStorageAdapter` methods.  Alternatively, `useJson` and `useDummy` provide convenient shortcuts for standard or no-op storage.

## Class PersistStorageInstance

This class provides a way to persistently store trading signals to files, making your backtesting data reliable even if something unexpected happens. It's designed as the default method for saving and retrieving signals, creating a file for each signal identified by its unique ID. When reading, it automatically finds all signals by scanning the available file keys. 

The class ensures data integrity through atomic writes, which means your data is saved safely. 

You can control whether you're in backtest mode when creating an instance, and it uses an internal storage mechanism for managing the files. The `waitForInit` function sets up the underlying storage, and `readStorageData` and `writeStorageData` handle reading and writing all the signal data.


## Class PersistStateUtils

The `PersistStateUtils` class helps manage how your trading strategies store and retrieve their data. Think of it as a central organizer for your strategy's memory.

It smartly avoids creating multiple copies of the same storage for each strategy run. Instead, it keeps a record of where data is saved, creating instances only when needed.

You can also swap out the standard storage with your own custom solutions, or temporarily disable storage for testing purposes.

The system handles reading and writing data, and there’s a way to clean up old data when it’s no longer needed, especially important when running multiple strategies. To ensure compatibility when your working directory changes, you can clear the data cache.




The `waitForInit` function sets up the storage location initially but can be skipped if you don’t want the first time setup to always run. The storage location follows a predictable file structure.

## Class PersistStateInstance

This class, `PersistStateInstance`, provides a straightforward way to save and load state data related to a specific trading signal. It essentially manages a file on your computer to hold this information.

Think of it as a dedicated container for keeping track of the condition of a signal – perhaps its settings or calculated values – and ensuring that saving and loading that information happens reliably.

It organizes your data within a file using a unique identifier called a "bucket name," which acts like a folder for your specific signal’s data.

When you're done with the state, the `dispose` method doesn’t actually do anything itself; it relies on another component to handle cleaning up any internal caches. The main methods available are to initialize the storage, read existing data, and write new data.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, ensuring data is reliable even if there are interruptions. It keeps track of signal data for each strategy, symbol, and exchange, using a specialized storage system.

The class automatically creates and manages the storage for signals, and it handles reading and writing signal data as needed. If a signal hasn't been saved before, it creates a new storage instance on the first access.

You can customize how signals are stored by providing your own signal instance constructors. The system also has built-in options for using standard file storage or a dummy (no-op) storage for testing. It's designed to be very careful about data consistency, ensuring that updates are written correctly, even if something unexpected happens. Finally, there’s a way to clear the memory of storage locations if the working directory changes during a trading process.

## Class PersistSignalInstance

This class provides a way to reliably save and retrieve signal data for a specific trading strategy and exchange. It’s designed to handle situations where the program might crash unexpectedly, ensuring your data isn't lost.

Think of it as a safe place to store the current state of a signal—like the buy/sell recommendations—so you can reload it later.

The class uses the trading symbol, strategy name, and exchange name to uniquely identify the signal data it manages.  It handles the low-level details of writing data to a file in a way that prevents corruption.

You'll typically use it to load a signal when starting a backtest and to save the signal periodically during the backtest run. 

It initializes its storage and then allows you to read and write signal data using a symbolic key.

## Class PersistSessionUtils

This class helps manage how trading sessions are saved and loaded, ensuring your strategies can remember their state even if things go wrong. It acts as a central point for dealing with session data, providing a reliable way to persist information like order books or internal variables.

It intelligently caches session storage instances, meaning it only creates one for each unique combination of strategy, exchange, and frame name. This prevents unnecessary file operations and speeds things up.

You can customize how these sessions are stored, either using the default file-based approach or plugging in your own storage methods.

Here's a breakdown of what you can do:

*   **Initialization:** You can control when the session storage is set up initially, using `waitForInit`.
*   **Reading and Writing:**  `readSessionData` retrieves saved data, and `writeSessionData` saves new data. These operations are handled safely, ensuring data consistency.
*   **Testing and Debugging:**  `useDummy` allows you to simulate sessions without actually saving anything to disk, which is handy for testing.  `useJson` reverts to the default file-based storage.
*   **Cleanup:** `clear` clears the cached storage, useful when the program's working directory changes. `dispose` is used to clean up specific session storage entries.
*   **Customization:** `usePersistSessionAdapter` lets you replace the default storage mechanism with your own custom implementation.

## Class PersistSessionInstance

This class provides a way to save and load session data related to a specific trading strategy and exchange. Think of it as a place to persistently store information that needs to be remembered between sessions. 

It uses a file to store this data, ensuring changes are written reliably. Each piece of data is identified by a unique name within the file, specific to the strategy and exchange it belongs to.

When you’re setting things up, you’ll need to initialize the storage. Reading data retrieves the previously saved session information, while writing data saves the current state. 

Importantly, the `dispose` function doesn't actually do anything itself; instead, it relies on another utility function to handle cleaning up any related cached data.


## Class PersistScheduleUtils

This class provides tools to reliably save and load scheduled trading signals, ensuring your strategies continue running even if there are interruptions. It's particularly important when a strategy needs to remember what signals were planned before it was paused or stopped.

The class automatically manages the storage of these signals, creating a dedicated storage space for each trading strategy and the symbols it uses. You can even customize how these signals are stored, swapping out the default method for alternatives like using files or a dummy (no-op) option for testing.

If your strategy uses scheduled signals, this utility handles keeping them safe and consistent. The system initializes storage lazily – meaning it only creates the storage mechanism when needed.

For situations where your strategy’s working directory changes during a session, you should clear the storage to prevent unexpected behavior.

## Class PersistScheduleInstance

This class provides a way to reliably save and load scheduled trading signals to a file. It's designed to work with a specific trading symbol, strategy name, and exchange. 

Think of it as a safe place to store information about when a trading signal should be executed.

It uses the file system to persist the data, ensuring it's written in a way that minimizes the risk of data loss even if something goes wrong.

The `waitForInit` method sets up the underlying storage system.  `readScheduleData` retrieves the scheduled signal data associated with the symbol, and `writeScheduleData` saves or clears that data.  Essentially, this class handles the mechanics of keeping the scheduled trading information saved correctly.

## Class PersistRiskUtils

This class helps manage and save information about active positions, making sure that data is consistent and reliable, especially in situations where things might go wrong. It efficiently creates and uses storage for different risk profiles, allowing you to customize how this data is handled. 

The system remembers which storage to use for each risk profile, preventing unnecessary creation and ensuring performance. You can also swap out the default storage method for custom solutions or even a dummy version for testing. 

To keep things safe, it reads and writes data in a way that prevents conflicts, and it’s designed to recover from crashes without losing information.  The `clear` function helps refresh this memory when needed, for example, when the program's working directory changes. You can easily switch between different storage options like file-based, a custom adapter, or a "dummy" mode that doesn't actually save anything, which is great for testing.

## Class PersistRiskInstance

This class helps you save and retrieve trading positions to a file, ensuring data safety even if things go wrong. It's designed to work with a specific name for the risk and exchange you're tracking.

It automatically handles writing data to the file in a way that prevents data loss, even if the application crashes unexpectedly.

The class manages a persistent store for positions, identifying them using a predefined key.

To get started, you give it a risk and exchange name during setup.

You can use `waitForInit` to make sure the storage is ready before you start saving data.

`readPositionData` lets you retrieve the saved positions at a specific point in time.

`writePositionData` allows you to save new or updated position data, making sure it's written safely.

## Class PersistRecentUtils

This class helps manage and store recent trading signals in a reliable way, particularly useful for backtesting and live trading scenarios. It acts as a central hub, ensuring that the same storage mechanism is used consistently for a specific trading setup (symbol, strategy, exchange, and timeframe).

It automatically handles creating and managing these storage instances, so you don't have to. The system remembers which storage to use based on the context, and even lets you swap in custom storage options if needed.

You can choose between using the default file-based storage, a dummy storage for testing, or provide your own custom storage solution. If the storage changes between strategy runs, you can clear the memory to ensure a fresh start.

The `readRecentData` and `writeRecentData` functions make it easy to get and save the latest signals, automatically creating the storage if it doesn’t exist yet. The entire process is designed to be robust and safe, even in the event of crashes.

## Class PersistRecentInstance

This class, `PersistRecentInstance`, helps you save and retrieve the most recent trading signal data for a specific instrument. It’s designed to store this information in a file, ensuring it's safely written even if something goes wrong. 

Think of it as a way to remember the last signal generated for a particular trading strategy on a certain exchange and timeframe, whether you’re running a backtest or a live trading session. 

It does this by combining a unique identifier (based on the symbol, strategy, exchange, and timeframe) with a foundation for file storage. 

Here's a breakdown of what it does:

*   It stores details like the symbol, strategy name, exchange name, frame name, and whether it's a backtest or live session.
*   `waitForInit` prepares the storage space before any data is saved.
*   `readRecentData` retrieves the previously saved recent signal.
*   `writeRecentData` saves the latest signal data to the storage file.

## Class PersistPartialUtils

This class helps manage how partial profit and loss data is saved and retrieved, especially for live trading scenarios. It efficiently handles data storage, ensuring each trading strategy and symbol has its own dedicated storage area. The system remembers which storage methods are being used, allowing for customization.

It offers a way to swap out the default storage mechanism with alternatives, like using files or even a dummy (no-op) version for testing. To keep things reliable, reads and writes to this data happen in a consistent, controlled manner. If the environment changes drastically (like the working directory), you can clear the internal cache to ensure data is accessed correctly.

## Class PersistPartialInstance

This class helps you save and load intermediate trading data to a file, ensuring that your data isn’t lost even if things go wrong. It's designed to work specifically with backtest-kit, associating data with a symbol, strategy, and exchange.

The `PersistPartialInstance` uses a file to store this data and gives each piece of data a unique identifier based on the signal ID. It manages the storage safely, so you can be confident that your data is reliably written.

To get started, you'll provide the symbol, strategy name, and exchange name when creating an instance. The class then provides methods to read and write partial data – these are the snapshots of your trading process that you might want to save at different points. `waitForInit` prepares the underlying storage, and `readPartialData` retrieves saved data using the signal ID. Finally, `writePartialData` saves your partial data, also using the signal ID.

## Class PersistNotificationUtils

This class offers tools to reliably manage and store notification data, particularly important for applications needing to track notification history. It simplifies persistence by automatically handling storage instances and providing a way to customize how notifications are saved.

The class utilizes a clever system for managing storage – it only creates a storage instance once for each mode (like "backtest" or "live"), ensuring efficiency. 

You can tailor the storage behavior to your needs by swapping in different notification instance constructors. This offers flexibility to use a real file-based system, a JSON-based alternative, or even a dummy implementation for testing and development. 

For added robustness, it uses atomic operations when reading and writing data, which helps prevent data corruption and handles unexpected crashes gracefully. Each notification is stored as a separate file, uniquely identified by its ID. The `clear` function is useful when your working directory changes, ensuring fresh storage instances are used.


## Class PersistNotificationInstance

This component handles saving and retrieving notification data to files, providing a persistent storage solution. It's designed to be reliable even if things go wrong during the process.

Each notification is stored as its own individual JSON file, making it easy to manage and access specific notifications. The storage system keeps track of all available notifications using a straightforward list of keys.

It's built with safety in mind, using techniques to minimize data loss in unexpected situations. 

The `backtest` property determines whether the storage is being used for a backtesting environment or live operations. The underlying storage mechanism is managed by the `_storage` property.

You can use `waitForInit` to ensure the storage is ready before you start reading or writing data.  `readNotificationData` pulls all the saved notifications into a manageable format, while `writeNotificationData` lets you store new notifications or update existing ones by their unique ID.


## Class PersistMemoryUtils

This utility class helps manage how trading data is saved and loaded persistently, ensuring it survives crashes and restarts. It keeps track of data for each trading signal and bucket, organizing it in specific files.

You can customize how this persistence works by plugging in your own data handling logic. It provides functions to read, write, delete, and check for the existence of this data. There's also a way to clear the stored data or to clean up storage associated with signals that are no longer used.

To rebuild indexes or for other operations, you can iterate through all stored data entries for a specific signal and bucket. Convenient shortcuts let you switch between using file-based storage or a dummy, non-saving instance for testing purposes. The class intelligently avoids unnecessary initialization and uses caching to improve performance.

## Class PersistMemoryInstance

This class, `PersistMemoryInstance`, is designed to reliably store and retrieve data for your backtesting system, using files as its underlying storage. It provides a simple way to persist data related to a specific signal and bucket.

The constructor sets up the signal and bucket identifiers, which define where the data is stored.

It offers methods to read, write, and delete memory entries, with the ability to "soft delete" entries by marking them as removed – they’re still present in the file but filtered out when listing data.

`waitForInit` ensures the storage is ready before you start working with it. `readMemoryData` fetches data based on a unique ID. `hasMemoryData` quickly checks for the presence of a memory entry. `removeMemoryData` marks an entry for deletion without physically removing it. `listMemoryData` provides a way to iterate through all active (non-removed) memory entries.

Finally, the `dispose` method does nothing directly because resource management is handled separately by a utility function.

## Class PersistMeasureUtils

This utility class helps manage cached data from external APIs, making sure that information is saved persistently. It's designed to handle different storage options, allowing you to customize how and where the data is stored. The system keeps track of these storage instances, ensuring that each set of data (identified by a timestamp and symbol) is managed efficiently.

To simplify things, the system automatically creates the necessary storage instances when needed, so you don't have to worry about manual setup. It also provides tools to swap out different storage implementations, like using a file-based storage or a dummy implementation for testing.

Here's what you can do with this class:

*   Read data that’s already been saved.
*   Write new data to be saved.
*   Remove data entries – marking them for deletion rather than immediately deleting them.
*   Get a list of all stored entries within a specific data set.
*   Clean the system's memory of storage instances, which is useful when the working directory changes.
*   Choose between different storage methods easily.

## Class PersistMeasureInstance

This component handles persistent storage for your measure data, acting as a bridge between your trading logic and a file system. Think of it as a way to reliably save and load important information about your backtesting results.

It uses a specific "bucket" to organize your data, which is essentially a folder where your measure data files are stored. 

The system keeps track of removed entries by adding a "removed" flag, so you don't have to physically delete the files.  When you need a list of your data, you can request it and it will automatically filter out those that are flagged as removed.

Here's what you can do with it:

*   **Initialization:** You can ensure the storage is ready before starting your backtest.
*   **Read:** Retrieve specific measure entries using a key.
*   **Write:** Save measure data to the storage.
*   **Remove:** Mark entries as removed without deleting them entirely.
*   **List:** Get a stream of keys for all valid (non-removed) entries. 


## Class PersistLogUtils

This class provides tools for reliably storing and retrieving log data, ensuring that your backtesting process doesn't lose important information. It acts as a central manager for how log entries are saved, using a cached system to optimize performance. You can easily swap out the default storage mechanism with your own custom implementation if needed. 

The system reads and writes log entries, treating each entry as a separate file identified by a unique ID.  It's designed to be safe even if the application crashes during the log writing process.

The `usePersistLogAdapter` function lets you plug in different log storage methods. Functions like `useJson` and `useDummy` provide convenient shortcuts for switching between the default JSON-based storage and a dummy (no-op) mode for testing.  `clear` is useful for resetting the system when conditions change, such as when the working directory is updated.

## Class PersistLogInstance

This component handles saving and retrieving your trading logs to disk. It creates individual files for each log entry, ensuring each one is stored separately and uniquely identified. Think of it as a way to keep a complete, unchanging record of your trading activity.

The storage itself uses a file system, so it's relatively simple to manage and understand. Importantly, it's designed to be crash-safe, meaning it can recover data even if something goes wrong during the saving process.

You'll need to initialize the storage first. When writing data, new entries are added, but existing ones are ignored to prevent accidental overwrites – this makes it a true append-only system. To get your logs back, the system reads through all the stored files, reconstructing the complete history.

## Class PersistIntervalUtils

This component manages how the trading framework remembers when specific intervals have already happened. It essentially keeps track of which intervals have "fired" within different categories, storing this information in a directory called `./dump/data/interval/`. 

The system uses markers to indicate whether an interval has already executed for a particular category and key. A marker's existence means it’s already fired, while its absence means it hasn't.

You can customize how these markers are stored, choosing from default file-based persistence, a JSON-based system, or even a dummy implementation that does nothing. The framework lazily creates the storage for each category only when it’s first needed.

The `listIntervalData` method allows you to iterate through all the recorded intervals for a specific category.  If your working directory changes between strategy runs, the `clear` method needs to be called to refresh the memory.

## Class PersistIntervalInstance

This class provides a way to store and retrieve data related to intervals, using files as its storage. It essentially acts as a manager for interval data, handling the reading, writing, and removal of these markers. 

The data is stored in a specific "bucket," which is like a folder for organizing your interval information.  To ensure data integrity, it handles writing to the file safely and uses a "soft delete" method - instead of permanently removing data, it marks it as deleted, allowing for recovery later if needed.

You can use this class to fetch interval data using a unique key, to create or update interval markers, or to essentially "pause" an interval by soft-deleting its marker.  Finally, it offers a way to list all the active interval markers (those that haven't been soft-deleted) within a given bucket.


## Class PersistCandleUtils

This class, PersistCandleUtils, helps manage how your trading strategy's candle data (like open, high, low, close prices) is stored and retrieved. It's designed to keep things efficient by caching this data to disk.

Each candle gets its own individual file, making it easy to organize and manage. The system checks to make sure the cached data is still valid, and automatically updates when needed. 

It utilizes a factory to create these persistent candle instances, allowing for customization.

You can even switch between different ways of storing the data, like using a standard file-based method, or a dummy implementation that doesn't actually store anything. This is helpful for testing or specific needs. 

If your working directory changes, you'll want to clear the cache to ensure data integrity.


## Class PersistCandleInstance

This component provides a way to store and retrieve historical candle data persistently, typically using files. Think of it as a simple database for your price data.

It organizes candles as individual JSON files, making each candle easily accessible based on its timestamp. If a candle’s timestamp isn't found, it's considered a "miss" – signaling a need to re-fetch it.

When writing candles, it avoids saving incomplete data (those with future close times) and overwriting existing entries, ensuring the cache grows chronologically and avoids duplicates. 

The `waitForInit` method handles the setup of the underlying storage.  The `readCandlesData` method fetches a range of candles, and if even one is missing, it returns null, implying a need to fetch fresh data.  Finally, `writeCandlesData` is used to save candle information, always making sure to avoid incomplete data and overwriting. 


## Class PersistBreakevenUtils

This class helps manage and save breakeven data for your trading strategies. It's designed to keep track of breakeven states for different symbols, strategies, and exchanges.

Think of it as a central place where your strategies can store and retrieve information about when they've reached certain breakeven points.

It automatically handles saving this data to files, making sure it's stored safely. It also remembers what it has already saved, so it doesn't have to rewrite the information every time.

You can even customize how the data is saved – use the standard file-based storage, or use a dummy version for testing purposes.

If your working directory changes, it’s useful to clear the cache to make sure the data is reloaded correctly.

## Class PersistBreakevenInstance

This class provides a way to reliably save and retrieve breakeven data for your trading strategies. It's designed to be crash-safe, ensuring your data isn't lost even if something goes wrong.

Think of it as a persistent storage solution specifically for breakeven calculations. It uses files to store this information, and it organizes the data based on the signal identifier.

The class requires the symbol, strategy name, and exchange name during setup. It manages the storage internally, and offers methods to read and write breakeven data using signal IDs as keys. You can use `waitForInit` to ensure the storage is ready before you start working with it.


## Class PersistBase

`PersistBase` provides a foundation for saving and retrieving data to files in a reliable way. It's designed to make sure your data isn't lost or corrupted, even if things go wrong during the process.

It automatically manages the directory where your data is stored and performs checks to ensure the files are valid. 

You can easily read, write, and check for the existence of your data, and the system handles file operations in a way that prevents partial or incomplete writes.  It also provides a convenient way to list all the IDs of the data it manages.

The `waitForInit` method is a one-time setup step that initializes the data directory and verifies the integrity of any existing files. 

Think of `PersistBase` as a safety net for your data, ensuring consistent and reliable storage.

## Class PerformanceReportService

This service helps you keep track of how long different parts of your trading strategies take to execute, so you can identify and fix any slowdowns. It essentially listens for timing events during your strategy's run and records them in a database.

You can think of it as a detective for performance bottlenecks.

To start collecting these timing details, you’ll subscribe to a stream of performance events.  Make sure you unsubscribe when you're done to prevent unnecessary data logging.

The `loggerService` property is used for outputting debugging information, and the `track` property handles the actual logging of performance data.  The `subscribe` method allows you to receive these events, but it's designed to prevent accidentally subscribing multiple times.

## Class PerformanceMarkdownService

This service is designed to gather and analyze performance data related to your trading strategies. It listens for performance events, organizes metrics by strategy, and calculates things like average performance, minimums, maximums, and percentiles.

It also automatically generates detailed reports in markdown format, which includes analysis to pinpoint potential bottlenecks. These reports are saved to your logs directory, making it easy to review your strategy's performance over time.

You can subscribe to receive these performance events, and unsubscribe when you're done. The service allows you to retrieve aggregated statistics for specific symbols and strategies, and to clear the accumulated data if needed. A central function, `track`, handles the actual processing of performance events as they come in.

## Class Performance

The Performance class helps you understand how well your trading strategies are performing. It gives you tools to analyze and report on the efficiency of different parts of your strategy.

You can use it to get detailed performance statistics for a specific trading strategy and symbol, showing things like average execution times, volatility, and unusual spikes.

It also lets you create easy-to-read markdown reports that highlight areas where your strategy might be slow or inefficient.

Finally, you can save those reports directly to your computer for later review or sharing, with the option to customize which performance data is included.

## Class PartialUtils

This class helps you analyze and report on partial profits and losses during trading. Think of it as a tool for understanding how your strategies are performing in smaller chunks.

It gathers data about events like partial profits and losses, keeping track of things like when they happened, what symbol was involved, and the strategy used.

You can use it to:

*   Get a summary of your partial profit/loss statistics, like the total number of events.
*   Generate detailed markdown reports showing each individual partial profit/loss event in an easy-to-read table. The table shows action (profit or loss), symbol, strategy, signal ID, position, level, price, and timestamp.
*   Save those reports to a file for later review or sharing. The file name will automatically include the symbol and strategy name.

This class relies on other components to do the heavy lifting of gathering the data. It provides a simple way for you to access and present those results.

## Class PartialReportService

The PartialReportService helps you keep track of when your trading positions are partially closed, whether that’s due to profit or loss. It listens for signals indicating these partial exits and records details like the price and level at which they occurred. 

Think of it as a dedicated system for logging these "mini-exits" for later analysis and reporting.

You can tell it to start listening for these events using the `subscribe` method, which returns a function you can call later to stop the listening process. If you're done tracking partial exits, use the `unsubscribe` method, which safely stops the service from processing further events. 

The service uses a logger to help with debugging and relies on a `tickProfit` and `tickLoss` mechanism to record the events. The recorded data is then stored persistently.


## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on small profits and losses during trading, like keeping a detailed log of every little gain and loss. It listens for these events and organizes them by symbol and trading strategy.

It automatically creates reports in a readable markdown format, including helpful statistics like the total profit and loss count. These reports are saved to your disk, making it easy to review your trading activity.

You can subscribe to receive these partial profit and loss events, and unsubscribe when you're done. The service also allows you to retrieve data and generate reports for specific symbol-strategy combinations, and clear the accumulated data when needed. It manages the storage of this information in a way that keeps data separate for different trading setups.

## Class PartialGlobalService

The PartialGlobalService acts as a central hub for managing partial profit and loss tracking within the backtest-kit framework. It's designed to simplify how strategies interact with the underlying connection layer and provides a consistent place for logging these operations.

Think of it as a middleman – strategies receive it as part of their setup, and it passes on all the profit, loss, and clearing requests to a dedicated connection service. This service also keeps a record of those actions through logging, making it easier to monitor the system's behavior. 

Several services are injected into this component for validation purposes, ensuring that the strategy, risks, exchanges, frames, and actions are correctly configured. The `validate` property is a performance optimization, remembering previous validation results to avoid repeating checks. The `profit`, `loss`, and `clear` methods handle the actual profit/loss events and signal clearing, always first logging the action before passing it along.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It's designed to efficiently handle these calculations, creating and storing information about each signal.

Think of it as a central hub that ensures each signal has its own dedicated record for profit and loss, keeping things organized.

This service avoids creating duplicate records – it remembers previously created signal records, making it quick and efficient. When a signal closes, the service cleans up the associated data to prevent unnecessary buildup.

The service is integrated with other parts of the system, receiving information about trading activity and providing updates on profit and loss. It handles the complex details of calculating and managing these values so other parts of the system don't have to.

## Class NotificationLiveAdapter

This component helps manage and send notifications related to your trading strategies. It's designed to be flexible, allowing you to easily switch between different ways of sending those notifications – whether it's storing them in memory, saving them to a file, or even just ignoring them entirely for testing purposes.

You can choose between several notification methods: a default in-memory option, a persistent storage option, and a dummy option that simply discards notifications.  The system uses a "factory" to determine which notification method is currently active.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods act as intermediaries.  They take data specific to different events and pass it on to the currently selected notification method.  You can retrieve all stored notifications with `getData` and clear them with `dispose`.

To change the notification method, use `useDummy`, `useMemory`, `usePersist`, or `useNotificationAdapter`.  `useNotificationAdapter` lets you provide a custom notification class to use.  If you're dealing with situations where the working directory might change between strategy runs, it's a good idea to call `clear` to ensure a fresh notification adapter is used.

## Class NotificationHelperService

This service helps manage and send out notifications about signals within the backtest environment. It ensures that the configurations for strategies, exchanges, and frames are all correct before sending a notification.

The validation process is designed to be efficient; it checks the configurations only once for each unique combination of strategy, exchange, and frame.

The `commitSignalNotify` function is how the system actually sends out those notifications. It first double-checks that everything is configured properly, then retrieves the signal information and sends it out to registered listeners and for persistence. Think of it as a central point for ensuring accuracy and consistency when reporting on signal activity. 

## Class NotificationBacktestAdapter

This component manages notifications during backtesting, offering flexibility in how those notifications are handled. It's designed so you can easily switch between different notification methods without changing the core backtesting logic.

By default, notifications are stored in memory, but you can switch to persistent storage on disk or use a dummy adapter that simply ignores notifications.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, `handleSync`, `handleRisk`, `handleError`, `handleCriticalError`, and `handleValidationError` methods all pass data to the currently active notification system.  You can retrieve all stored notifications using `getData` and clear them using `dispose`.

The `useNotificationAdapter` method lets you explicitly define which notification implementation to use.  For convenience, `useDummy`, `useMemory`, and `usePersist` provide shortcuts for switching to the dummy, in-memory, and persistent adapters, respectively. The `clear` method is vital if your working directory changes between backtest runs, as it ensures a fresh notification instance is created.

## Class NotificationAdapter

The NotificationAdapter is the central hub for managing and storing notifications, both during backtesting and in live trading environments. It automatically receives notification updates by connecting to signal emitters, providing a consistent way to access all notifications regardless of whether they came from a backtest or a live trade.

To prevent duplicate notifications, it uses a "singleshot" pattern that ensures subscriptions happen only once.

Here’s what you can do with it:

*   **Enable:** Tell the adapter to start listening for notifications and storing them. It handles the connection to the signal emitters.
*   **Disable:** Stop the adapter from listening and clear out the stored notifications. Calling this multiple times is perfectly fine and won't cause problems.
*   **getData:** Retrieve all notifications, specifying whether you want backtest notifications or live notifications.
*   **dispose:** Completely clear all notifications for a specified environment (backtest or live).





## Class MemoryLiveAdapter

This component, the `MemoryLiveAdapter`, acts as a flexible storage system for trading memory, allowing you to swap out different storage methods easily. It offers a default setup that saves data to files, ensuring your information survives restarts. You can also opt for an in-memory-only solution that’s fast but volatile, a dummy adapter for testing purposes, or even create your own custom storage solution.

To manage your data, you can write new entries, search for existing ones using full-text search, list all entries, delete specific entries, or retrieve a single entry.

The `disposeSignal` method is important for cleanup – it clears out old memory instances when a trading signal is finished.

You can change the underlying storage mechanism with convenient functions like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter`, providing a lot of control over how data is handled. The `clear` method is helpful if your working directory changes, ensuring that the adapter refreshes its data.

## Class MemoryBacktestAdapter

The `MemoryBacktestAdapter` provides a flexible way to manage memory storage for backtesting, allowing you to choose different storage implementations easily. It’s designed to be adaptable, letting you swap out how data is stored without changing the rest of your backtesting code.

By default, it uses an in-memory storage system (MemoryLocalInstance) which is quick but doesn't save data between runs.  You can switch to persistent storage using `usePersist` which saves data to files, or a dummy adapter with `useDummy` for testing purposes.  For more customized behavior, you can use `useMemoryAdapter` to provide your own storage implementation.

The adapter keeps track of frequently used memory instances, improving performance.  You can manually clear this cache with `clear` – especially important if your working directory changes during a backtest.  There are methods for writing, searching, listing, removing, and reading data from memory.  `disposeSignal` is crucial for cleaning up resources when signals are completed.

## Class MemoryAdapter

The MemoryAdapter is the central hub for managing memory storage within the backtest and live trading environments. It intelligently handles writing, searching, listing, removing, and reading memory entries.

To start using memory storage, you need to enable it, which automatically sets up listeners that clean up old data when signals are closed, preventing memory leaks. Disabling it simply removes those listeners, and it’s safe to do so repeatedly.

The `writeMemory` function lets you store data, automatically directing it to either the backtest or live environment depending on your configuration. Similarly, `searchMemory` uses powerful full-text search to find what you need, `listMemory` retrieves all entries, `removeMemory` deletes specific entries, and `readMemory` fetches individual items.  All of these functions are intelligently routed to the correct environment based on your settings.

## Class MaxDrawdownUtils

This class offers tools for understanding and analyzing maximum drawdown events, which are important for assessing risk in trading strategies. It doesn’t create new instances; instead, you use it directly to access pre-calculated data and reports.

You can request statistical summaries of drawdown events, specifying the symbol, strategy, exchange, and timeframe for the data.

It also allows you to generate a detailed markdown report outlining all drawdown events for a specific combination of symbol and strategy, and you can even save this report directly to a file. This is useful for sharing results or archiving performance analysis. Finally, you can specify which columns to include in the report for a more customized view.

## Class MaxDrawdownReportService

The MaxDrawdownReportService is responsible for tracking and recording maximum drawdown events as they happen during a backtest. It essentially listens for drawdown updates and saves them to a database in a structured format for later analysis.

You set up the service by subscribing to a stream of drawdown data. Once subscribed, it automatically begins saving new drawdown records.

When a new drawdown occurs, the service captures a snapshot of all relevant data including timestamps, symbols, strategy names, prices, and signal details.

If you no longer need to record drawdown data, you can unsubscribe to stop the recording process. The service makes sure you don't accidentally subscribe multiple times.

## Class MaxDrawdownMarkdownService

This service is designed to automatically create and save reports detailing the maximum drawdown experienced during trading. It keeps track of drawdown data for each trading symbol, strategy, exchange, and timeframe.

You need to subscribe to receive drawdown events, and you can later unsubscribe to stop tracking and clear the data. 

The service provides methods to retrieve the raw drawdown data, generate a nicely formatted markdown report, or directly write the report to a file. 

You can clear the collected data, either for a specific trading combination (symbol, strategy, etc.) or for everything at once. This is useful for resetting the analysis or managing storage.

## Class MarkdownWriterAdapter

This component helps you manage where your trading reports and data are saved. It provides a flexible way to switch between different storage methods, like saving each report as a separate file, combining them into a single JSONL file, or completely disabling markdown output. It remembers which storage method you're using so you don't have to recreate it every time.

You can easily change the default storage method, or use pre-defined options like `useMd` for standard file-based reports, `useJsonl` for central logging, or `useDummy` to suppress output altogether. 

The system ensures that only one instance of each storage type exists, optimizing performance and preventing conflicts. If your working directory changes during a trading run, you can clear the cache to ensure fresh storage instances are created. This is particularly useful when iterating on strategies.

## Class MarkdownUtils

This class helps you manage how and when markdown reports are created for different parts of your trading system.

You can selectively turn on markdown reporting for things like backtests, live trading, or strategy performance analysis. 

When you enable reporting, the system starts gathering data and generating reports, and it's crucial to remember to later unsubscribe from those services to avoid memory problems.

Conversely, you can disable markdown reporting for specific areas without affecting others, which is useful if you temporarily don't need those reports.  Disabling doesn't require a special cleanup function; it stops reporting immediately.

Finally, there’s a way to clear the accumulated data for markdown reports, essentially resetting the report history, while keeping the reporting services active and listening for future events.

## Class MarkdownFolderBase

This adapter helps you create organized markdown reports by writing each report to its own individual file within a folder structure. Think of it as the standard way to generate reports, perfect for when you want to easily browse and review your results. 

Each report will be saved as a separate `.md` file, with the file's location determined by settings you provide, resulting in a tidy directory of reports. 

It doesn't manage streams or require any special setup; it simply writes the markdown directly to a file. This makes it a straightforward choice for generating readable and well-structured report directories. 

The `waitForInit` method does nothing because folder-based writing doesn't need an initialization process. The `dump` method is where the actual writing happens, taking the markdown content and the desired file options to create and populate the report file.


## Class MarkdownFileBase

The MarkdownFileBase class helps you create and manage markdown reports in a structured, easily processed way. It writes each type of report (like trade details or performance metrics) to its own JSONL file – a format ideal for automated analysis and combining data from different sources.

Think of it as a central hub for your markdown reports.

It handles the behind-the-scenes work of creating files, managing write operations, and ensuring reliability with features like timeout protection and error handling. You can easily filter these reports later based on criteria like the trading symbol, strategy used, or the exchange involved.

The `waitForInit` method sets up the necessary file and stream, and you can safely call this even if it’s already been run.  The `dump` method is your main tool – you provide the markdown content and any relevant metadata, and it neatly adds that information to the JSONL file. The system ensures that writes don’t overwhelm the process and includes a safety net to prevent operations from hanging indefinitely.

## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown data is stored, giving you flexibility in how it's handled. Think of it as a way to switch between different storage methods without changing your core code.

It lets you choose between storing each markdown file as a separate `.md` file (the default, folder-based approach), or combining them all into a single `.jsonl` file.  

To make things easy, there are shortcuts: `useMd` reverts to the default folder storage, while `useJsonl` switches to JSONL storage.

If you just need to test or temporarily avoid saving anything, `useDummy` provides a storage adapter that essentially ignores all write attempts.

You can also define your own storage adapters by providing a constructor function using `useMarkdownAdapter`, allowing for even greater customization. The adapter keeps track of instances to improve efficiency.

## Class LookupUtils

The `LookupUtils` class acts like a central record keeper for what's currently happening in your backtests and live trading sessions. It keeps track of each running activity, whether it's a full backtest, a live trade, or even a step within a strategy.

Think of it as a constantly updated list of what’s running, with each entry describing the activity.

The system uses this list to optimize performance; it helps decide whether to pause certain processes to avoid unnecessary work.

You don't need to create or configure it directly—it’s a pre-built component available as a singleton called `Lookup`. 

There are a few important functions: `addActivity` adds a new activity to the list, `removeActivity` cleans up when an activity is finished, and `listActivity` provides a snapshot of all active processes.  It's crucial to always remove an activity after adding it, especially if something might go wrong during the process, to prevent leaving incorrect records.

## Class LoggerService

The LoggerService is designed to help you keep your trading framework’s logging consistent and informative. It works by taking a logger you provide – or falling back to a silent one if you don't – and automatically adding extra details to each log message. These details include things like which strategy is running, which exchange is being used, and the current state of the backtest.

You can easily swap out the default logging behavior by setting your own custom logger. 

The service also manages the context information for logging, separating it into method context and execution context. This allows for more structured and detailed logging.

It provides several logging methods – `log`, `debug`, `info`, and `warn` – each adding the automatic context to your messages, making it easier to track down issues and understand what’s happening during your trading process.


## Class LogAdapter

The `LogAdapter` provides a flexible way to handle logging within your backtesting framework. It allows you to easily swap out different logging methods – whether you want to store logs in memory, save them to a file, or simply ignore them altogether. It uses a pattern where you can plug in different log implementations, and it defaults to an in-memory solution for convenience.

You can use handy shortcuts like `usePersist()` to save logs to disk, `useMemory()` to revert to the default in-memory storage, or `useDummy()` to completely disable logging.  It also provides methods like `log()`, `debug()`, `info()`, and `warn()` to categorize your messages.  The `useLogger()` function allows you to completely define how the logs are handled, while `clear()` helps ensure that logging refreshes when your environment changes.

## Class LiveUtils

The `LiveUtils` class provides tools for running and managing live trading sessions. It acts as a central point for interacting with the live trading system, offering conveniences like automatic crash recovery and persistence.

You can initiate live trading for a specific symbol and strategy using the `run` method. This creates an infinite generator that produces trading results, which are automatically saved to disk in case of errors, ensuring that your trading process can resume where it left off. The `background` function is similar but runs the trading process silently in the background.

To get real-time information about a live trading position, you can use functions like `getPendingSignal`, `getTotalPercentClosed`, and `getBreakeven`. These functions provide details about the currently active signal, position size, and potential profit points.

The class also includes functions to manage signals, such as `commitCancelScheduled` and `commitClosePending`, allowing you to manipulate trading actions without fully stopping the live trading process. To interact with a running strategy, functions such as `commitAverageBuy`, `commitTrailingStop`, and `commitTrailingTake` can be used to manage the positioning.

Finally, the utilities offer reporting and diagnostic capabilities, enabling you to generate reports on past trading activity with `getReport` or retrieving current statistical data with `getData`. This helps you monitor and analyze the performance of your live trading strategies.


## Class LiveReportService

The LiveReportService helps you keep a detailed record of what's happening in your live trading strategies. It actively listens for events related to your signals – like when they're idle, opened, active, or closed – and meticulously logs them into a SQLite database. 

This service acts like a detective, capturing every important detail about each trading signal. It uses a logger to output debug information and stores all the event data so you can monitor and analyze your live trading performance in real-time.

You can easily subscribe to these live events, and the system prevents you from accidentally subscribing multiple times. When you're done, the unsubscribe function cleanly stops the service from receiving and logging those events.

## Class LiveMarkdownService

This service is designed to automatically create and save detailed reports of your live trading activity. It keeps track of everything that happens during your trades – from the initial idle state to when a trade is opened, active, and ultimately closed.

The service gathers information from your trading strategy's tick events and organizes it into easy-to-read markdown tables. You’ll get key statistics like win rate and average profit and loss (PNL) for each strategy.

Reports are automatically saved as markdown files, making them simple to review and share. The reports are categorized by symbol, strategy name, exchange, frame, and whether it’s a backtest, ensuring you can easily find the data you need.

You can subscribe to receive these live tick updates, and unsubscribe when you no longer need them. The service also provides methods to retrieve specific data, generate reports, save them to disk, and even clear out old data when necessary, either for a specific trade setup or all of them.

## Class LiveLogicPublicService

LiveLogicPublicService is designed to manage and orchestrate live trading, simplifying the process by automatically handling context like the strategy and exchange being used. It builds upon LiveLogicPrivateService and uses MethodContextService to streamline function calls; you won't need to repeatedly pass context information.

It operates as a continuous, never-ending stream of trading results, presenting opened, closed, and cancelled signals. The system is robust; it's built to handle crashes and automatically recover from persistent state. Real-time progression is tracked using the current date and time.

You can start the live trading process for a specific symbol by using the `run` method, which also takes a context object. This method returns an async generator that continuously yields results.


## Class LiveLogicPrivateService

This service manages the continuous process of live trading, keeping everything running smoothly and efficiently. It acts as a tireless monitor, constantly checking the status of trading signals.

It works by continuously looping, capturing real-time data, and evaluating signals.  The service delivers updates – specifically when positions are opened or closed – as a stream of data, making it memory-friendly.

If things go wrong and the process crashes, it will automatically recover and resume trading, ensuring minimal disruption.  Essentially, it’s a reliable, ongoing engine for live trading, providing a steady flow of results without ever stopping.

The service relies on a logger, core strategy logic, and method context to function correctly.  You start the process by telling it which trading symbol you want to monitor.


## Class LiveCommandService

The LiveCommandService acts as a central hub for live trading operations, essentially providing a straightforward way to interact with the underlying live trading logic. It's designed to be easily integrated into your applications using dependency injection.

It handles validations, making sure your trading strategy and the exchanges you're using are set up correctly and safely.  These validations are cached, so you don't have to repeat them unnecessarily.

The `run` method is the core of the live trading process; it allows you to start and monitor live trading for a specific symbol. This method is designed to run continuously, automatically recovering from any crashes to keep the trading process going. It communicates trading results as they happen.

## Class IntervalUtils

IntervalUtils provides a way to control how often your functions are executed, particularly useful in trading strategies that operate on time intervals. Think of it as a guardrail to ensure a function only runs once during a specific time period.

It has two main modes of operation: one that keeps track of firing times in memory (`fn`), and another that stores this information in files for persistence (`file`). The file-based mode is handy because it remembers the state even if your application restarts.

The `fn` method lets you wrap regular functions, ensuring they don't run too frequently. The `file` method does the same for asynchronous functions and saves that information to a file, so process restarts don't affect the timing.

You can clean up old data using `dispose` to remove previously tracked functions and `clear` to completely wipe the internal cache. Finally, `resetCounter` helps to manage persistent files when your working directory changes between strategy runs. The whole system is designed to be easy to use with a single, shared instance called `Interval`.

## Class HighestProfitUtils

This class helps you analyze and report on your highest profit trading events. It's designed to work with data collected about profitable trades.

Think of it as a tool for generating reports and getting key statistics related to your best-performing trades. 

It provides a few handy functions:

*   `getData`: This function lets you pull out specific statistics for a given trading symbol, strategy, and environment (like exchange and timeframe).
*   `getReport`:  You can use this to create a markdown report showcasing all the highest profit events for a particular symbol and strategy.  You can also specify which columns to include.
*   `dump`: This function builds that same markdown report and saves it directly to a file, so you can easily share or archive it.

## Class HighestProfitReportService

The `HighestProfitReportService` is designed to keep track of your most profitable trading moments and record them for later analysis. It listens for events indicating a new highest profit has been achieved.

Each time a new highest profit is detected, it creates a detailed record including things like the timestamp, trading symbol, strategy name, exchange, timeframe, and the specifics of the signal – like the position size, current price, and order prices.

To get this service running, you need to subscribe to it, which begins the process of saving these profit records.  It's designed to only subscribe once, preventing duplicate registrations.  When you're finished, you can unsubscribe to stop the recording.


## Class HighestProfitMarkdownService

This service is designed to collect and report on the highest profit events generated by your trading strategies. It listens for these events and organizes them based on the symbol, strategy, exchange, and timeframe used.

You can subscribe to receive these events, and once subscribed, further subscriptions will not re-subscribe. Unsubscribing removes all accumulated data.

The `tick` method handles each incoming event, routing it to the correct storage location.

To retrieve the data, you can use `getData` to get specific statistics or `getReport` to generate a formatted markdown report. You can also `dump` the report to a file, automatically naming it with relevant information like the symbol, strategy, exchange, and timestamp.

Finally, `clear` allows you to erase all stored data, either for a specific combination of parameters or completely clearing everything.

## Class HeatUtils

HeatUtils helps you visualize and understand your trading portfolio's performance. 
It's like a tool that gathers all the important data about how different assets performed within a specific strategy.

You can easily request this data, which will show you a breakdown of each symbol's statistics, along with overall portfolio metrics. 

It also creates readable reports, formatted as markdown tables, showing key performance indicators like profit, Sharpe ratio, and drawdown, sorted by profitability. 

Finally, it can save these reports to files, automatically creating folders if needed, so you can keep a record of your portfolio's history. This utility is designed to be easily accessible, making it a straightforward way to analyze your trading results.

## Class HeatReportService

This service helps you track and analyze your trading results by recording when signals close, specifically focusing on profitability (PNL) data. It listens for these "closed signal" events across all your trading symbols and saves them to a database, allowing you to generate heatmap visualizations to understand patterns. 

The service uses a "singleton" approach to ensure it only registers with the signal event system once, avoiding unexpected behavior.

To start tracking, you’ll use the `subscribe` method to begin receiving those closed signal notifications; this returns a function you'll call to stop listening. When you’re finished, use the `unsubscribe` method to cleanly stop the process and prevent any further data collection. The `tick` property handles processing these signals, and the `loggerService` helps with debugging any issues.

## Class HeatMarkdownService

This service helps visualize your trading portfolio’s performance using a heatmap. It listens for trading signals and gathers data to present it in a clear, organized way.

It keeps track of statistics for each trading strategy, exchange, and time frame, storing them separately so you can analyze them individually. You can subscribe to receive updates as new trades happen, and easily unsubscribe when you no longer need them.

The service provides several key functions:

*   It provides a way to get consolidated data, showing portfolio-level metrics.
*   You can generate easy-to-read markdown reports for individual strategies and exchanges.
*   It offers the ability to save these reports directly to disk.
*   It allows for clearing all accumulated data, or clearing data for specific combinations of exchange, frame, and backtest mode, effectively resetting the heatmap.



It handles calculations carefully, preventing issues with missing or infinite values. It also remembers frequently accessed data to improve performance.

## Class FrameValidationService

This service helps you keep track of and verify your trading timeframe configurations. It acts like a central registry, allowing you to register new timeframes and quickly check if a specific timeframe exists before using it in your trading logic. To improve speed, it remembers the results of previous validations, so it doesn’t have to re-check them. 

You can add new timeframes using `addFrame`, and use `validate` to confirm a timeframe is registered. If you need a complete list of all your configured timeframes, `list` will return them. 

It also has a `loggerService` for handling logs and an internal map (`_frameMap`) to store the frames.

## Class FrameSchemaService

The FrameSchemaService helps keep track of the structure of your trading frames, ensuring they all have the information they need. It’s like a central directory for defining what a frame *should* look like.

This service uses a special registry to store these frame definitions in a way that helps prevent errors related to incorrect data types.

You can add new frame schemas using the `register` method and update existing ones with `override`.  If you need to use a frame, you can fetch its definition using the `get` method, retrieving it by name. Before adding a frame, the service checks its basic structure with `validateShallow` to verify essential properties are present.

## Class FrameCoreService

This service acts as a central hub for managing and retrieving timeframes used in backtesting. It relies on a connection to a data source and includes validation checks to ensure the accuracy of the timeframe data. Think of it as the engine that provides the sequence of dates your trading strategy will be tested against.

The `getTimeframe` method is the key function; it takes a symbol (like "BTCUSDT") and a timeframe name (like "1h" or "1d") and returns a promise that resolves to an array of dates representing that timeframe. This array defines the starting points for each step in your backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like minute, hourly, or daily data. It automatically directs requests for frame data to the correct ClientFrame based on the current trading context. 

To optimize performance, it keeps a record of previously accessed frames, so it doesn't have to recreate them every time. 

This service is essential for backtesting trading strategies, allowing you to define the specific start and end dates and intervals (e.g., 1-minute bars) for your historical data. When operating in live mode, it skips the frame-specific constraints.

Here’s a breakdown of its key components:

*   It utilizes a logger service, frame schema service, and method context service to function.
*   The `getFrame` function retrieves or creates the appropriate ClientFrame, ensuring efficiency.
*   The `getTimeframe` function fetches the start and end dates for a given symbol and frame, controlling the scope of the backtest.

## Class ExchangeValidationService

The ExchangeValidationService helps you keep track of and verify your configured trading exchanges. It acts like a central manager, registering new exchanges and making sure they're still valid before you try to use them. 

Think of it as a checklist system—you tell it which exchanges you're using, and it checks them for you. 

It also remembers past checks to avoid unnecessary re-validation, making things faster overall. You can add new exchanges, confirm if an exchange is set up correctly, or view a complete list of all your registered exchanges.

## Class ExchangeUtils

ExchangeUtils provides helpful tools for interacting with exchanges within the backtest-kit framework. Think of it as a central place to manage common exchange-related tasks.

It’s designed as a single, readily available instance to simplify using these functions.

You can use it to retrieve historical candle data, calculate average prices, and get the latest close price for a specific trading pair.  It automatically handles the complexities of calculating the correct time range for these requests.

The framework also offers functions to format quantities and prices, ensuring they adhere to the specific rules of each exchange. 

Need the order book or aggregated trade data? ExchangeUtils can fetch that too, handling the underlying complexities of time range calculations. If you require raw, unfiltered candle data, you can specify start and end dates to retrieve a custom set. The framework avoids look-ahead bias by using Date.now() when determining the date range for candle data.

## Class ExchangeSchemaService

The ExchangeSchemaService helps you keep track of information about different cryptocurrency exchanges in a reliable and type-safe way. It uses a registry to store these exchange details, ensuring consistency. 

You can add new exchange information using `addExchange()`, and retrieve it later by its name. 

Before adding, the service checks that the exchange data has the essential properties in the right format.

The `override` function lets you update existing exchange information with just the parts that need changing. It’s a convenient way to manage and update exchange data.


## Class ExchangeCoreService

This service acts as a central hub for interacting with exchanges within the trading framework. It's designed to handle common exchange operations while ensuring the right context – like the specific symbol, time, and whether it's a backtest – is passed along. 

It leverages other services to manage connections, validations, and contextual information.

Here's what it can do:

*   Retrieve historical candle data, and simulate fetching future candles for backtesting purposes.
*   Calculate average prices using VWAP.
*   Get the closing price from the most recent candle.
*   Format prices and quantities in a standardized way.
*   Fetch order book information.
*   Retrieve aggregated trade data.
*   Fetch raw candle data with detailed date and limit control.

Importantly, the service validates exchange configurations to ensure they're correct and remembers these validations to avoid repeating them unnecessarily. The service also injects information needed for the execution context, like symbol, time and backtest status.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes requests to the correct exchange based on the current context, making it easy to work with multiple exchanges without repetitive coding. 

It keeps track of previously used exchanges to improve performance, avoiding unnecessary setup. This service provides a full set of functionalities, including fetching historical candle data, retrieving the next set of candles based on the current timestamp, calculating average prices (either live or based on historical data), and getting the last close price.

You can also use it to format prices and quantities according to the specific rules of each exchange, ensuring compatibility. It provides access to order books and aggregated trade data as well, and offers flexible retrieval of raw candle data with custom date ranges. Essentially, it simplifies the process of communicating with and retrieving data from various exchanges within your trading framework.

## Class DumpAdapter

The DumpAdapter helps you save information during trading simulations, like messages, data records, and errors. Think of it as a flexible tool that lets you choose where to store that information – whether it's in Markdown files, memory, or even just discard it.

It automatically manages temporary storage spaces for each signal and bucket, making sure data is organized. You can easily switch between different storage methods, such as writing to markdown files, using memory for quick access, or creating a dummy adapter that simply ignores the data.

Before you start dumping data, you need to "enable" the adapter. When you’re finished, "disable" it. If you change the directory where the adapter operates, use the `clear` function to ensure a fresh start. You can also completely customize the adapter by providing your own implementation using `useDumpAdapter`.

## Class CronUtils

Okay, here's a description of the CronUtils class for backtesting.

This class provides a way to schedule tasks that run at specific times related to the simulated trading environment, particularly useful when parallel backtests are involved. It’s designed to ensure that these scheduled tasks are executed exactly once, even when multiple backtests attempt to trigger them simultaneously.

The `Cron` instance manages registered tasks (cron entries) and coordinates their execution. When you register a task, it's assigned a unique generation number to prevent conflicts and stale data.

The core of the system lies in how it handles concurrency. When several backtests try to execute a task at the same time, `Cron` ensures only one instance runs, preventing conflicts and maintaining data integrity.

Here's a breakdown of key components:

*   **Entries:** These are your registered tasks, stored with their unique generation numbers.
*   **In-Flight Handler Promises:** These act as locks, ensuring tasks only run once at a time.
*   **Fired-Once Marks:** These track tasks that have already completed, preventing re-execution.
*   **Last Boundary:**  This prevents missed ticks by advancing when a tick crosses a boundary, accounting for skips in time.
*   **Runtime Info:** When a task runs, it receives current information about the simulated trading environment.

You register tasks using `register`, remove them with `unregister`, and clear completed tasks with `clear`. The `enable` method connects the system to the backtesting engine, while `disable` disconnects it. Finally, `dispose` clears all registered tasks and connections, effectively resetting the system.

## Class ConstantUtils

The ConstantUtils class provides pre-calculated percentages for setting take-profit and stop-loss levels, all designed using a method inspired by the Kelly Criterion and incorporating risk decay. These constants represent points along the path to your ultimate profit or loss targets.

For example, TP_LEVEL1 is set at 30%, meaning it activates when the price reaches 30% of the distance to your final profit target. This allows you to lock in a portion of your gains early. TP_LEVEL2 and TP_LEVEL3 follow suit at 60% and 90% respectively, offering further opportunities to secure profits.

Similarly, SL_LEVEL1 at 40% acts as an early warning signal, helping to reduce your risk if the trade isn’t performing as expected, while SL_LEVEL2 at 80% ensures a final exit to avoid significant losses. These levels are intended to work together, helping you manage risk and maximize potential returns.

## Class ConfigValidationService

The ConfigValidationService helps make sure your trading setup is mathematically sound and can actually make a profit. It checks your global configuration settings, looking for things like negative percentages or time values that don't make sense.

Specifically, it ensures your take-profit distance is large enough to cover all trading costs, like slippage and fees, so you don't lose money when a trade hits its target. It also verifies that minimum values are less than maximum values for parameters like stop-loss distances, and that time-related settings are positive whole numbers. This service examines parameters related to candles, including how many you request and retry attempts. 

It uses a logger service to record any issues it finds during validation. The `validate` function is the core of this process, performing all the checks to keep your trading configuration healthy.


## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly. It checks your column definitions for several things to prevent errors later on.

It makes sure each column has all the necessary pieces: a key, a label, a format, and a visibility setting. It also verifies that all of these keys are unique so there's no confusion.

Beyond that, it confirms that the format and visibility settings are actually functions, and that the key and label fields are text strings. This service helps you catch problems early and keeps your column configurations consistent.

## Class ClientSizing

ClientSizing helps determine how much of your assets to allocate to each trade. It's a flexible component that uses different methods, like fixed percentages or more advanced techniques like Kelly Criterion or Average True Range (ATR), to decide on the right size for your positions. You can also set limits on the maximum position size, ensuring you don't overextend yourself.

It allows for custom validation and logging, making it easier to understand and control how position sizes are determined. This component is a key part of the backtest-kit framework and is used when actually executing trades within a strategy.

The `calculate` method is the core – it takes input parameters and returns the calculated position size. The `params` property holds the configuration settings for the sizing method.

## Class ClientRisk

ClientRisk helps manage risk across multiple trading strategies, acting as a central control point to prevent strategies from exceeding defined limits. It’s like a safety net that examines potential trades before they happen.

It tracks things like the maximum number of positions that can be held simultaneously across all strategies, and allows for custom validation rules. Think of it as a way to enforce specific trading rules and prevent unwanted outcomes.

The `checkSignal` method is the core of this process. It analyzes a signal to see if it’s permissible within the risk constraints. `checkSignalAndReserve` provides a more robust, concurrency-safe version that prevents race conditions when multiple strategies try to open positions at once.

When a signal is approved, `addSignal` records the new position, while `removeSignal` cleans up when a position is closed.  These methods are used by the strategy execution system to ensure trades happen responsibly and safely. It utilizes a map to keep track of active positions, and offers persistence features to save and load these positions, although this is skipped when running in backtest mode. The system prioritizes preventing unwanted, potentially damaging trades by carefully scrutinizing each signal before it’s allowed to execute.

## Class ClientFrame

The ClientFrame is responsible for creating the timelines used during backtesting. It's essentially a helper that builds arrays of timestamps representing the historical period you want to analyze. 

To avoid unnecessary work, it uses a caching system – once a timeframe is generated, it’s stored so it doesn’t have to be recreated. This speeds up the backtesting process.

You can control how finely the timeframe is divided, choosing intervals ranging from one minute to one day. It also allows for callbacks, allowing you to add custom checks and record activity during the timeframe generation.

The `getTimeframe` property is the core function – it's what you'll use to get the timestamp arrays for a specific trading symbol, and it leverages that singleshot caching.


## Class ClientExchange

This `ClientExchange` component acts as a bridge to access real-time and historical market data, essential for backtesting and live trading. It provides methods for retrieving historical and future candle data, calculating the Volume Weighted Average Price (VWAP), and formatting prices and quantities according to exchange-specific rules. Think of it as the data pipeline feeding your trading strategies.

Here's a breakdown of its key capabilities:

*   **Data Retrieval:** You can easily fetch historical candle data going backward in time or future candles needed for strategy execution. The system cleverly aligns timestamps to ensure accurate data retrieval.
*   **VWAP Calculation:** Need a quick average price? The `getAveragePrice` method efficiently computes the VWAP using the last few 1-minute candles, enabling you to understand price trends.
*   **Formatting:** It handles the tricky task of formatting prices and quantities to comply with the specific requirements of different exchanges.
*   **Flexible Data Access:** The `getRawCandles` function provides a wide range of options for retrieving data using various date ranges and limits.
*   **Order Book and Trades:** Access order book information and aggregated trade data to gain insights into market depth and recent activity.

The system is designed for efficiency and bias prevention, ensuring reliable and trustworthy data for your backtests and live trading operations.


## Class ClientAction

The `ClientAction` component is designed to manage and execute custom action handlers within the backtest-kit framework. Think of it as a central hub that initializes, routes events, and cleans up after your custom logic, whether that's managing state, logging activity, or sending notifications. It creates and manages an instance of your action handler, ensuring it’s set up and torn down properly.

The `waitForInit` property makes sure your action handler initializes only once, while `dispose` handles cleaning up resources. This component acts as a bridge between the core strategy execution and your custom functionality, allowing you to integrate things like state management (Redux, MobX), real-time alerts, or analytics.

It provides several event handling methods like `signal`, `signalLive`, and `signalBacktest` which are used to route events from different trading modes. There are also event handlers for specific situations like breakeven, partial profit/loss, scheduled and active ping events, risk rejections and syncing signals. The `signalSync` method is a crucial gateway for closing positions through limit orders, so any errors there are intentionally passed on for special handling.

## Class CacheUtils

CacheUtils helps you automatically store and reuse the results of your functions, which is particularly useful when dealing with time-sensitive data like trading strategies. It's like having a smart helper that remembers calculations so you don't have to repeat them unnecessarily.

The `fn` function lets you wrap regular functions to cache their results based on time intervals, ensuring that you’re working with the correct data for the appropriate timeframe.  Think of it as automatically remembering function results for specific periods.

If you're dealing with asynchronous functions that need to be cached persistently, the `file` function provides a way to store results on disk, making them available even after your program restarts. It’s like saving your calculations to a file so you can always pick up where you left off.

You can clean up memory and force recalculations using `dispose`, `clear`, and `resetCounter` which give you control over the caching process and ensure it stays in sync with your environment. `dispose` allows you to completely forget a function’s cached results, `clear` wipes out all cached data, and `resetCounter` ensures fresh file caches are created under changing conditions. Each of these can be helpful when you need to force a recalculation or manage cache size.


## Class BrokerBase

This class, `BrokerBase`, is your starting point for connecting your trading strategies to real exchanges. Think of it as a template—you inherit from it and provide the specific details for how to interact with a particular broker or exchange. It's designed to be flexible, with default "no-op" functions that simply log activity, meaning you only need to write the code that's unique to your broker.

Before your strategy can start executing, `waitForInit()` is called; this is where you would establish a connection to the exchange and authenticate. Then, as your strategy runs, a series of methods like `onSignalOpenCommit`, `onSignalCloseCommit`, and others are triggered, letting you place orders, manage stop-loss levels, track your positions, and send notifications. These methods offer default logging functionality that is helpful during development. You'll implement the actual exchange-specific logic inside these methods to handle events like opening a position, closing a trade, taking profits, or adding to a position with a DCA strategy. Essentially, it simplifies the process of building a custom adapter for any trading environment.

## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading logic and the actual broker. Think of it as a safety net—it intercepts actions like opening, closing positions, and adjusting stop-loss or take-profit levels. This ensures that if anything goes wrong during these operations, the changes to your trading system don't happen, keeping your system in a consistent state.

During backtesting, the adapter silently skips these actions to avoid making real broker calls. However, when trading live, it forwards those actions to your registered broker.

You configure the adapter by providing a broker implementation using `useBrokerAdapter`. Then, you activate it with `enable()`, which sets up automated handling of certain signal events.  `disable()` allows you to deactivate the adapter and `clear()` helps refresh the connection when needed, like if your working directory changes.  It is important to register a broker adapter before enabling it.

## Class BreakevenUtils

The BreakevenUtils class offers tools to analyze and report on breakeven events. It's like a central hub for gathering and presenting data related to when trades reached their breakeven point.

This class provides a way to extract statistical summaries of breakeven events, such as the total number of times breakeven was reached. 

You can also generate detailed reports, presented in markdown format, which show each individual breakeven event, including details like the symbol traded, strategy used, entry price, current price, and the date and time.

Finally, you can easily export these reports to a file, with the filename automatically generated based on the symbol and strategy. The class handles creating the necessary folders to store these reports.


## Class BreakevenReportService

The BreakevenReportService helps you track when your trading signals reach a breakeven point. It essentially listens for these "breakeven" moments and keeps a record of them.

Think of it as a historian for your trades – it captures the details of each breakeven achievement, storing them in a database for later examination.

To get it working, you'll subscribe to a signal emitter, which is like tuning into the channel that announces when a signal breaks even. The service then takes care of logging this information, and includes all the relevant details of that signal.

When you’re finished, you can unsubscribe, which stops the service from listening and logging any further breakeven events. It ensures you only log these events once, avoiding duplicate entries.

## Class BreakevenMarkdownService

This service is designed to automatically create and save reports detailing when trades reach their breakeven point. It monitors for breakeven events and keeps track of them for each symbol and strategy you're using.

The service compiles these events into nicely formatted Markdown tables, providing an overview of your trading performance and statistics like the total number of breakeven events. 

It then saves these reports as files, making it easy to review your trading history. You can also request data or reports for specific symbols, strategies, exchanges, frames, or backtests. Finally, you can clear out the collected data when it’s no longer needed.

## Class BreakevenGlobalService

This service acts as a central point for managing breakeven tracking within the system. It’s designed to be injected into the ClientStrategy, simplifying how different parts of the application interact with breakeven functionality.

Think of it as a middleman: it receives requests related to breakeven, logs these operations for monitoring purposes, and then passes them on to another service (BreakevenConnectionService) that actually handles the core breakeven calculations.

Several validation services are involved to ensure the correctness of the strategy and its related configurations before any breakeven actions are taken. This helps prevent errors and ensure data integrity.

The `check` method determines if a breakeven event should occur, while `clear` handles resetting the breakeven state when a signal closes, both with associated logging. The `validate` method ensures a strategy is correctly configured before proceeding.


## Class BreakevenConnectionService

The BreakevenConnectionService helps track and manage breakeven points for trading signals. It's designed to efficiently create and manage individual breakeven tracking objects, ensuring there's only one actively tracking each signal. 

Think of it as a smart factory that creates these tracking objects, keeps them organized, and cleans up when they're no longer needed. It caches these objects to avoid creating unnecessary ones, which helps with performance.

The service also handles the important tasks of checking if a breakeven condition has been met and clearing the tracking information when a signal closes. It works closely with other parts of the system and uses a clever caching mechanism to make sure everything runs smoothly.

## Class BacktestUtils

The `BacktestUtils` class offers convenient tools for running and analyzing backtests within the framework. Think of it as a central hub for interacting with backtest functionality.

It provides a simple way to execute backtests (`run` and `background`) for a specific symbol and strategy, with options for logging and silent execution. You can also retrieve currently active signals (`getPendingSignal`, `getScheduledSignal`) or check for their absence (`hasNoPendingSignal`, `hasNoScheduledSignal`).

Beyond execution, it offers a suite of methods for inspecting the state of a position, including its cost basis, percentage closed, and DCA entries. These tools help to understand the detailed performance of a trade.

`BacktestUtils` also allows you to interact directly with signals, activating them early (`commitActivateScheduled`), adding new DCA entries (`commitAverageBuy`), and modifying stop-loss and take-profit levels (`commitTrailingStop`, `commitTrailingTake`). It also provides functions to generate reports and get backtest statistics.  The `stop` method offers a means to prematurely halt a backtest. Finally, it exposes useful data like the position's estimated time, countdown, and various PnL metrics.

## Class BacktestReportService

This service helps record what’s happening during your backtest, specifically focusing on the signals your trading strategy generates. It keeps a detailed log of each signal’s lifecycle – when it's idle, when it's opened, when it’s actively trading, and when it's closed.

Think of it as a detective, meticulously documenting every event related to your signals. This information is then saved to a SQLite database, allowing you to later analyze your strategy's performance and troubleshoot any issues.

You'll use the `subscribe` function to have this service start listening for signal events.  It’s designed to ensure it only listens once, preventing duplicate data. Remember to use the `unsubscribe` function when you’re finished to stop the data collection. The service also has a built-in logger to help with debugging.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It listens for incoming market data (ticks) and focuses on signals that have already closed, keeping track of this information for each strategy you’re testing.

It organizes this data using a clever system where each combination of symbol, strategy, exchange, frame, and backtest gets its own dedicated storage area, preventing data from different tests from getting mixed up.

You can easily generate reports in a readable markdown format, including information like signal details, and automatically save them to your logs directory. The service also allows you to clear out old data if you need to free up space or start fresh.

To keep things tidy, you subscribe to receive market data and can later unsubscribe when you’re finished. The service also provides ways to get overall statistics and dump data directly to disk.

## Class BacktestLogicPublicService

The BacktestLogicPublicService helps you run backtests by handling the setup and context needed for your strategies. It builds upon the BacktestLogicPrivateService and automatically manages important information like the strategy name, exchange, and frame being used.

This means you don't have to manually pass this context information to every function—the service takes care of it.

Here’s a breakdown of what you'll find within:

*   **loggerService:** Provides access to logging and execution contexts.
*   **backtestLogicPrivateService:** The core backtesting logic.
*   **timeMetaService:** Handles time-related operations.
*   **frameSchemaService:** Manages frame schemas.
*   **exchangeConnectionService:** Connects to exchanges.
*   **run():** This is the main method to start a backtest. You tell it which symbol to test and the strategy, exchange, and frame details. The `run` method delivers results as a stream of signals, making it easy to process the backtest's output.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService helps manage and run backtests efficiently. It works by first getting the available timeframes and then processing them one by one. 

When a trading signal appears, it fetches the necessary candle data and then executes the backtest logic. The service intelligently skips over timeframes where there are no signals.

Importantly, it delivers results directly as a stream, rather than accumulating them into a large array, which saves memory.  You can stop the backtest early by breaking out of the stream.

The service relies on several other core services, including those for handling strategy logic, exchange data, timeframes, actions, and price information. The `run` method is used to initiate the backtest for a specific symbol and begin streaming the results.

## Class BacktestCommandService

This service acts as the central hub for running backtests within the system. It provides a straightforward way to access backtesting capabilities and is designed to work well with dependency injection.

Internally, it relies on several other services for tasks like logging, schema management, risk and action validation, and validating strategies, exchanges, and frames.

The `validate` function offers a way to confirm that your trading strategy and risk settings are properly configured, and it remembers previous validations to speed things up.

The core functionality is the `run` function, which executes a backtest on a specific symbol. When running, it includes important information like the strategy name, exchange, and frame being used. This function returns a series of results, detailing how the strategy would have handled market ticks – whether opening, closing, canceling, or scheduling orders.

## Class ActionValidationService

The ActionValidationService helps keep track of your action handlers, ensuring they're available when needed and boosting performance along the way. Think of it as a central manager for your actions.

You can add new action handler configurations using `addAction`, essentially registering them with the service.

Before using an action, `validate` checks to make sure the handler actually exists – preventing unexpected errors. This is super useful for ensuring your system behaves reliably.

To see what action handlers are currently registered, `list` provides a handy view of all your configurations.

The service also uses memoization, which is a clever technique to store results so validation checks don't have to be repeated unnecessarily, making things run faster.

## Class ActionSchemaService

The ActionSchemaService helps you keep track of and manage the blueprints for your actions – the different things your system can do. It makes sure these blueprints are consistent and follow the rules you set.

It uses a special system to ensure the blueprints are type-safe, meaning there are fewer chances of errors related to incorrect data types. 

The service checks that the methods your action handlers use are allowed, and it can handle private methods too. You can even update existing blueprints with just the changes you need, which is handy for making adjustments without having to recreate them entirely.

Here's a breakdown of what it does:

*   **Registration:** It lets you add new action blueprints to a central registry, making sure they're well-formed and don’t conflict with existing ones.
*   **Validation:** Before an action blueprint is accepted, it's checked for the correct structure and allowed methods.
*   **Overriding:** You can modify existing action blueprints with just the changes you need.
*   **Retrieval:** It provides a way to look up and retrieve the full configuration of an action blueprint when needed.

It relies on a `loggerService` to record events and uses an internal registry (`_registry`) to store the blueprints.

## Class ActionProxy

ActionProxy acts as a safety net for your custom trading logic. It automatically handles errors that might occur within your action handlers – things like initialization problems, signal generation issues, or cleanup tasks – preventing those errors from crashing the entire trading system. Think of it as a way to isolate and manage potential problems without halting the process.

It works by wrapping your action methods (like `init`, `signal`, `dispose`, etc.) in error-catching blocks. If anything goes wrong within these methods, the error is logged, an alert is sent, but the trading system keeps running. This makes it more robust.

The `fromInstance` method is how you create an ActionProxy – it takes your action handlers and wraps them for safe execution.  The `signal` methods handle events related to strategy evaluation, live trading, and backtesting. Other methods handle specific events, like breakeven or partial profit/loss occurrences and scheduled/active/idle pings. Crucially, the `signalSync` method isn’t wrapped in this error handling, as exceptions are intended to be passed directly to the creation function.


## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It's responsible for orchestrating the execution of actions defined in your strategy's configuration.

Think of it as a conductor leading an orchestra of actions. It fetches the list of actions from the strategy's blueprint, makes sure everything is valid (like the strategy name and the trading environment), and then sends signals to each action in the correct order.

Here's a breakdown of what it does:

*   **Initialization:** When a strategy starts, the `initFn` method initializes each action, potentially loading any persistent data they need.
*   **Signal Routing:**  It routes different types of signals – standard market data (`signal`), live trading data (`signalLive`), historical backtest data (`signalBacktest`), and specialized events like breakeven confirmations (`breakevenAvailable`), partial profit/loss triggers (`partialProfitAvailable`, `partialLossAvailable`), and ping events (`pingScheduled`, `pingActive`, `pingIdle`) – to the appropriate actions.
*   **Validation:** The `validate` method ensures that the strategy, the trading environment, and the associated actions are all correctly configured. It avoids redundant checks by caching validation results.
*   **Synchronization:** The `signalSync` method is crucial for coordinating actions, ensuring all agree on position adjustments.
*   **Cleanup:** The `dispose` method cleans up resources when a strategy finishes running.
*   **Data Clearing:**  The `clear` method removes action-related data, either for a specific action or globally.



Essentially, it provides a structured and reliable way to execute actions within a trading strategy, handling everything from validation to cleanup.

## Class ActionConnectionService

This service acts as a central dispatcher for different actions within your trading strategies. It takes care of figuring out the correct action to execute based on a given name, and it smartly remembers those actions so it doesn't have to recreate them every time. It uses information like strategy name, exchange, and timeframe to ensure the right action is used for the right context.

The service relies on several other components to function: a logger, a schema service, and a core strategy service.

It provides methods to handle various events like signals, breakeven points, partial profits/losses, and scheduled pings, directing them to the appropriate action for processing. You can use `getAction` to retrieve an action instance, and `clear` to remove an action from the cache when it’s no longer needed. This helps keep your strategy running efficiently and organized.


## Class ActionBase

This class, `ActionBase`, provides a foundation for creating custom handlers that respond to events within your trading strategy. Think of it as a pre-built framework to extend, rather than starting from scratch. It simplifies tasks like logging, and gives you access to information about your strategy.

When you build custom actions, you inherit from this base class. This gives you default behaviors for events, like signal notifications, breakeven updates, or loss thresholds – you only need to override the specific behaviors you want to customize. It automatically logs those events, and provides data about the strategy itself (name, timeframe, what action triggered the event).

The lifecycle of an `ActionBase` extends is straightforward: it initializes, responds to events as the strategy runs (like ticks, candles, or profit milestones), and finally cleans up when the strategy is complete. Events are triggered at different times—like every tick, only during live trading, or when specific profit or loss levels are reached—allowing you to build behavior suited to the situation. If you're sending notifications, managing database connections, or collecting metrics, this base class helps organize those actions within your trading framework.
