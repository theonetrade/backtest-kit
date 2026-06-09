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

The Walker Validation Service helps you keep track of and verify your parameter sweep configurations, also known as walkers. It acts like a central registry, letting you add new walker configurations and quickly check if a specific walker exists before you try to use it.

To help things run smoothly, the service remembers the results of past validations, so it doesn’t have to repeat checks unnecessarily.

Here's what you can do with it:

*   **Register Walkers:** Easily add new walker setups to the system.
*   **Validate Walkers:** Double-check that your walker and related strategies are set up correctly. This validation extends to the strategies’ risks and actions too.
*   **List Walkers:** Get a complete list of all walkers currently managed by the service.

The service relies on other components like the logger, walker schema, strategy validation, strategy schema, risk validation, and action validation services. It also uses an internal map to keep track of all the walkers you've added.

## Class WalkerUtils

WalkerUtils is a helper tool that simplifies running and managing automated trading analysis processes, often called "walkers." Think of it as a central hub for controlling these analysis jobs.

It automatically handles some of the technical details, like identifying which data source to use and keeping track of the analysis's progress. 

You can easily start a walker analysis, run it in the background without seeing the details, or stop it completely. WalkerUtils also provides ways to retrieve the results and generate reports summarizing the performance of different trading strategies.

It's designed to be easy to use, working as a single, readily available instance. This makes managing multiple walkers for different assets and strategies much simpler. You can also check the status of all currently running walkers to monitor progress.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema designs for walkers, ensuring they are consistent and well-defined. It uses a special system for storing these designs in a safe and organized way.

You can add new schema designs using `addWalker()` and find them later by their names.

The service also checks new designs to make sure they have the basic elements they need before they're officially registered.

It's possible to update existing schema designs too, by changing only certain parts of them.

Finally, you can easily retrieve a specific schema design by providing its name.

## Class WalkerReportService

WalkerReportService helps you keep track of how your trading strategies are performing during optimization. It's designed to listen for updates from your optimization process and neatly store those results in a SQLite database. 

Think of it as a meticulous record-keeper for your strategy experiments. It logs each test run, including key metrics and statistics, and highlights the best-performing strategies and the overall optimization journey. 

You can subscribe to receive these updates, and there's a built-in safeguard to prevent accidental duplicate subscriptions. When you're done, just unsubscribe to stop the flow of data. The service uses a logger for any needed debugging.

## Class WalkerMarkdownService

This service helps you create and save reports about your trading strategies' performance. It listens for updates as your strategies run, keeping track of their results for each strategy.

The service uses a special storage system to ensure each strategy's results are kept separate. It then takes that data and turns it into easy-to-read markdown tables that compare different strategies. These reports are automatically saved as files on your computer, making it simple to review your progress.

You can subscribe to receive updates as the strategies are running, and unsubscribe when you no longer need those updates. You can also clear out the stored data if you want to start fresh. The `dump` function lets you specify a custom path for saving the report, and you can choose which data columns to display.


## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of "walkers," which are essentially the core units of work within the backtest-kit framework. It builds upon a private service to automatically pass along important information like the strategy name, exchange, frame, and walker name with each request. 

Think of it as a layer that simplifies how you run walkers and ensures relevant context is always available.

The `run` method is the primary way to trigger a walker comparison for a specific symbol. You provide the symbol and some basic context, and it will execute the backtests for all associated strategies.


## Class WalkerLogicPrivateService

WalkerLogicPrivateService helps you compare different trading strategies. It handles the process of running each strategy and keeping track of how they're performing.

Think of it as an orchestrator – it takes a symbol, a list of strategies you want to test, and a metric to optimize for.  It then runs each strategy one after another.

As each strategy finishes, it gives you updates, allowing you to monitor progress and see which strategies are doing well.

Finally, it provides you with a ranked list of all the strategies based on their performance. Inside, it uses BacktestLogicPublicService to actually run the backtests.

## Class WalkerCommandService

WalkerCommandService acts as a central hub for interacting with the walker functionality within the backtest-kit framework. It’s a straightforward way to access the core walker logic, designed to be easily used with dependency injection.

This service relies on several other services for managing and validating different aspects of the backtesting process, including validations for strategies, exchanges, frames, and the walker itself, alongside schema services for strategies and risks.

The `validate` method is particularly important; it’s responsible for double-checking the configurations of your walkers and strategies, ensuring everything is sound before a backtest begins.

Finally, the `run` method is how you actually trigger the comparison process for a specific trading symbol, while also passing along important context like the walker's name and the exchange and frame being used.

## Class TimeMetaService

TimeMetaService helps keep track of the most recent candle timestamps for your trading strategies. It acts like a central record, storing the latest time information for each symbol, strategy, exchange, and timeframe you're using.

Think of it as a convenient way to get the current candle time even when you're not directly in the middle of a trading tick – for example, if you need to know the time for a command that runs *between* ticks.

It keeps these timestamps stored in a special system, updating them automatically whenever a strategy completes a tick. If the timestamp hasn't been set yet, it'll wait a short time before giving up, ensuring you get accurate information.

You can clear out these stored timestamps if you need to, either for all strategies or just for a specific one, to make sure you’re always working with fresh data. This is especially important at the beginning of a backtest or live trading session. Essentially, it provides a reliable source for candle time information throughout your trading process.

## Class SystemUtils

SystemUtils helps keep your backtest sessions clean and separate. It prevents one backtest from accidentally affecting another by managing how information is shared between them.

Think of it like creating a temporary bubble around each backtest.

The `createSnapshot` method allows you to freeze the current state of all shared events. This essentially "clears" them, ensuring a fresh start for your backtest. Later, you can restore the original state.


## Class SyncUtils

SyncUtils helps you understand what's happening with your trading signals by providing insights into their lifecycle. It gathers information about signal openings and closures, compiling statistics and generating detailed reports.

You can retrieve overall statistics for a given symbol and trading strategy using `getData`, which pulls aggregated metrics from the recorded signal events.

To get a deeper dive, `getReport` creates a markdown document that lists all the signal events, showing details like signal ID, actions taken (opening or closing), position specifics (direction, prices, stop-loss, take-profit), and performance metrics.

Finally, `dump` makes it easy to save these reports to a file, automatically organizing them into a directory with a descriptive filename including the symbol, strategy, exchange, frame, and whether it was a backtest or live signal.

## Class SyncReportService

The SyncReportService helps keep track of what's happening with your trading signals. It's designed to record significant events like when a signal is opened (usually when an order fills) and when it's closed (when a position is exited).

Think of it as an auditor for your trading activity, providing a detailed record of signal lifecycle. It listens for these events and saves them, including important information like profit and loss (PNL) and why a signal was closed.

To ensure you're not accidentally recording the same events multiple times, it includes a built-in mechanism to prevent duplicate subscriptions. You can use the `subscribe` method to start listening for events, and the `unsubscribe` method to stop.

## Class SyncMarkdownService

This service is designed to collect and generate reports about signal synchronization events during trading, whether it’s a backtest or live trading. It keeps track of each signal's lifecycle, including when it opens and closes, along with any reasons for closure.

You start by subscribing to receive signal sync events. Once you subscribe, you'll receive updates as signals open and close. A key feature is that you only need to subscribe once – subsequent calls to subscribe will simply return the same unsubscribe function to avoid unnecessary re-subscriptions.

The service organizes this data into buckets based on the symbol, strategy, exchange, frame, and whether it's a backtest. You can request the data for a specific bucket using `getData`, retrieve a formatted markdown report with `getReport`, or save the report directly to a file using `dump`.  

Finally, you can clear out the accumulated data, either for a specific set of parameters or for everything, using `clear`. This is useful for starting fresh or freeing up memory. When you're done, `unsubscribe` completely stops the process, clears all data, and disconnects from the event stream.

## Class StrategyValidationService

The StrategyValidationService helps you keep track of and confirm your trading strategies are set up correctly. It acts like a central organizer for your strategies, ensuring each one exists and any linked risk profiles and actions are also valid. This service makes sure everything is in order before your strategies are used.

It lets you register new strategies using `addStrategy`, and lists all registered strategies with `list`. To verify a strategy and its linked elements, you can use `validate`, which also caches results to improve performance. It relies on other services, `loggerService`, `riskValidationService`, and `actionValidationService`, to handle logging and specific validations.

## Class StrategyUtils

StrategyUtils helps you understand and analyze how your trading strategies are performing. It acts as a central place to gather information about events like taking profits, stopping losses, and adjusting positions.

You can use it to retrieve statistical data, like how often different actions are taken for a specific strategy and symbol. It also allows you to create detailed reports in a readable Markdown format.

These reports present all the events associated with a strategy in a structured table, including key details like price, percentages, timestamps, and whether it was a backtest or live trade. 

Finally, you can easily save these reports directly to a file, creating a record of your strategy's activity, with the file name automatically incorporating details like the symbol, strategy, and timestamp.


## Class StrategySchemaService

This service helps you keep track of different trading strategy blueprints, ensuring they’re all structured correctly. It acts like a central repository for these blueprints, making them easy to find and manage.

The service uses a special system to store these blueprints in a way that catches errors early on.

Here's what you can do with it:

*   **Register new blueprints:** You can add a new strategy blueprint to the registry using `addStrategy()`.
*   **Retrieve blueprints:**  Find a specific blueprint by its name using `get()`.
*   **Ensure blueprints are well-formed:**  The `validateShallow` function checks that each blueprint has all the necessary components and that they are of the expected types. This is done before a blueprint is officially stored.
*   **Update existing blueprints:** Modify an existing blueprint, only changing the parts you need, with the `override` function.



The service has a `loggerService` to keep track of what's happening and `_registry` which stores the blueprints.

## Class StrategyReportService

This service is designed to create a detailed audit trail of your trading strategy's actions. It persistently logs events like canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting trailing stops and take profits, and moving break-even points to disk as individual JSON files.

Think of it as a constant recorder for your strategy, capturing every important action. This differs from other reporting methods that hold everything in memory, because this one writes events immediately.

To start logging, you need to subscribe to the service. Once subscribed, you can use the various methods (cancelScheduled, closePending, partialProfit, etc.) to record specific events. Each of these methods provides a lot of detailed information about the event, like the symbol being traded, the strategy name, the current price, and profit/loss data. When you are done logging, you must unsubscribe to stop the process. This ensures a clean and persistent record of your strategy's activity.

## Class StrategyMarkdownService

This service helps you track and report on the actions your trading strategies take during backtesting or live trading. Instead of writing every event immediately to a file, it holds them in memory, allowing you to gather a lot of data before generating reports.

Think of it as a temporary buffer for strategy events.

Here’s how it works:

1.  **Start Collecting:** Use `subscribe()` to tell the service to start watching for things like signals being canceled or orders being closed.
2.  **Events Happen:** Your strategies trigger actions (like closing a trade at a profit), and the service quietly records them.
3.  **Get Reports:** When you’re ready, you can use `getData()` to get raw statistics, or `getReport()` to create a nicely formatted Markdown report.  You can even customize which details appear in the report.
4.  **Save Results:** The `dump()` function lets you save those reports to a file.
5.  **Stop Collecting:** When you're done, `unsubscribe()` clears the memory and stops the service from collecting any more data.

The service uses a clever caching system to efficiently store data for each symbol and strategy combination. It also has ways to selectively clear out events if you want to start fresh. It's structured so that you initiate data collection and then later retrieve and report on that data.

## Class StrategyCoreService

This service acts as a central hub for managing trading strategies within the backtest framework. It provides access to various utility functions and services related to strategy execution and monitoring.

The service handles tasks like validating strategy configurations, retrieving pending signals, calculating position-related metrics (cost, PnL, entry prices, etc.), and managing scheduled signals. It leverages other services like StrategyConnectionService and ExecutionContextService to provide these functionalities, ensuring consistent and contextualized operations.

Several methods allow access to position details, including total cost, entry prices, partial close history, and performance metrics like maximum drawdown and profit distances. These are useful for in-depth analysis and monitoring of trading strategy performance. Furthermore, functions are available for controlling strategy execution, such as stopping, canceling scheduled signals, and closing pending orders. Finally, the service handles caching and validation to optimize performance and prevent redundant operations.


## Class StrategyConnectionService

The `StrategyConnectionService` acts as a central router for trading strategies within the backtest-kit framework. It's designed to efficiently manage and execute strategy logic, ensuring the right strategy is applied to the correct trading symbol.

Here's a breakdown of its key features:

*   **Smart Routing:** It intelligently directs strategy calls to the correct implementation based on the trading symbol and strategy name, using a caching mechanism for speed.
*   **Performance Boost:** It avoids repeatedly creating strategy instances by caching them, which significantly improves performance.
*   **Initialization Safeguard:**  It enforces proper initialization before any trading actions are performed.
*   **Comprehensive Support:** It handles both live trading (`tick()`) and backtesting (`backtest()`) operations.
*   **Detailed Data Access:** It provides methods to retrieve information about pending signals, including profit/loss calculations, position size, entry prices, and scheduled signal details.
*   **Control & Management:** You can stop strategies, cancel scheduled signals, and even trigger partial profit or loss exits.
*   **Safety Checks:** It validates partial profit/loss and trailing stop/take adjustments before execution.

In essence, this service simplifies strategy management, optimizes performance, and ensures the reliability of your trading tests.


## Class StorageLiveAdapter

The `StorageLiveAdapter` acts as a central hub for managing how your trading signals are stored, providing flexibility in choosing where that data lives. It uses a pattern that allows you to easily swap out different storage methods – whether that's a persistent storage on disk, an in-memory solution, or even a dummy adapter for testing.

You can easily switch between these storage options using methods like `usePersist`, `useMemory`, and `useDummy`.  The adapter automatically handles events like signals being opened, closed, scheduled, or cancelled, forwarding these actions to the currently selected storage.

It also keeps track of when signals were last updated with `handleActivePing` and `handleSchedulePing`, ensuring your data is accurate. To change the way signals are saved, use `useStorageAdapter` and provide a constructor for the storage utils you want to use.  The `clear` method is important; call it if your working directory changes during backtesting so that the storage utils are reinitialized correctly.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` helps manage how backtest data is stored, giving you flexibility in choosing where that data lives. It acts as a bridge, allowing you to easily switch between different storage methods like persistent storage (saving to disk), memory-only storage, or even a dummy adapter that does nothing.

You can easily change the storage backend using methods like `usePersist`, `useMemory`, and `useDummy`, making it adaptable to different testing scenarios. It handles events like signals being opened, closed, scheduled, or cancelled, forwarding those actions to the currently selected storage adapter.

The `getInstance` property is a clever shortcut that builds and remembers the storage utility instance to avoid unnecessary rebuilding. If the environment changes, use `clear` to force a fresh start. The adapter also provides methods to find signals by ID and list all stored signals, again leveraging the chosen storage implementation. Finally, it provides specialized handling for ping events related to active and scheduled signals, ensuring timely updates.

## Class StorageAdapter

The StorageAdapter is the central component for managing your trading signals, handling both historical backtest data and current live data. It automatically keeps track of signals as they come in, ensuring they're saved correctly.

You can turn the storage functionality on to start receiving and storing signals, and it's designed to only subscribe once to avoid unnecessary activity. Conversely, you can easily turn the storage off to stop signal updates, and it’s perfectly fine to do this repeatedly.

Need to look up a specific signal? The `findSignalById` function lets you retrieve it using its unique identifier, searching through all your stored signals. 

Want to review your historical performance? The functions `listSignalBacktest` and `listSignalLive` allow you to view all the signals recorded for backtesting and live trading respectively.

## Class StateLiveAdapter

The `StateLiveAdapter` provides a flexible way to manage and store the state of your trading signals. Think of it as a central hub where information about your trades – like how far they've gained or lost – is kept and updated. It's designed to work with different storage methods, allowing you to choose between keeping data in memory (fast but temporary), saving it to files (persistent across restarts), or using a dummy adapter for testing.

It’s particularly useful for advanced strategies, like those using LLMs to evaluate trade performance. For example, if a trade hasn't met certain criteria after a set time, it might be automatically closed. The `StateLiveAdapter` remembers key details like peak profit and how long a position has been open, even if your application restarts.

You can easily switch between different storage backends – in-memory, file-based, or a custom implementation. To clean up old data or when your working directory changes, you can clear the cached data. The `disposeSignal` method allows you to clear the cached information for a particular signal when it's no longer needed. Functions like `useLocal`, `usePersist`, and `useDummy` offer quick ways to change the storage backend.

## Class StateBacktestAdapter

The `StateBacktestAdapter` provides a flexible way to manage and store state information within your backtesting framework. Think of it as a central hub for keeping track of important data during a backtest, allowing you to easily switch between different storage methods.

It comes with a few built-in options: a default in-memory store, a file-based storage for persistence, and a dummy adapter for testing purposes. You can also plug in your own custom storage solutions.

The adapter is designed to track specific metrics like peak performance and how long a position has been open, which can then be used to trigger automated actions based on predefined rules, such as exiting a trade. 

To keep things clean and efficient, it caches state data for each signal, but provides a method (`disposeSignal`) to clear this cache when a signal is no longer needed. You can easily change the storage method using `useLocal`, `usePersist`, or `useDummy` to experiment with different approaches.  The `clear` method is important for ensuring data freshness when running multiple backtests.

## Class StateAdapter

The StateAdapter is the central hub for managing your trading state, handling both backtesting and live trading scenarios. It automatically manages subscriptions to signals, ensuring that things are cleaned up properly when a signal is no longer needed, which prevents issues with stale data.

You can enable the adapter to start tracking state, and disable it to stop.

To get the current state of a signal, you use `getState`, providing details like the signal’s ID and bucket name. Similarly, `setState` lets you update the state, directing the operation to either the backtest or live environment based on your needs. It’s designed to be a reliable way to access and modify your trading state.


## Class SizingValidationService

This service helps you keep track of and double-check your position sizing strategies. Think of it as a central hub for all your sizing rules.

It lets you register new sizing strategies, so you know exactly what's available. 

Before you use a sizing strategy, you can ask this service to verify that it exists, preventing errors. 

To speed things up, it remembers previous validation results so it doesn’t have to repeat checks.

Finally, it provides a simple way to view a list of all the sizing strategies you’ve registered.



The service has a few key functions:

*   `addSizing`:  Registers a new sizing strategy.
*   `validate`: Confirms a sizing strategy exists.
*   `list`: Shows you all registered sizing strategies.

## Class SizingSchemaService

This service manages a collection of sizing schemas, which define how much of an asset to trade. It uses a type-safe registry to store these schemas, ensuring consistency and preventing errors.

You can add new sizing schemas using `register` and update existing ones with `override`.

To get a specific sizing schema, use `get` and provide its name.

Before a sizing schema is added, `validateShallow` checks it for essential properties and correct data types to maintain data quality. This helps catch any structural issues early on.


## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade in each operation. It's a central component, handling position sizing calculations.

It uses a connection service to perform these calculations and also includes validation checks.  Think of it as the engine that figures out the right size for your trades based on your risk tolerance and other factors.

The `calculate` method is the core – it takes parameters about the trade (like risk amounts) and a context, then returns the calculated position size. The service also keeps track of logging, connection, and validation services for its operations.


## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within your trading strategies. It acts as a central point, directing sizing requests to the correct sizing implementation based on a name you provide.

To improve performance, it remembers (caches) these sizing implementations, so it doesn't have to recreate them every time.

Essentially, you tell it which sizing method you want to use (like fixed percentage or Kelly Criterion), and it handles the rest. If no sizing configuration is present, the sizingName will be an empty string.

The `getSizing` property retrieves these sizing implementations from the cache, creating them if they don't already exist.

The `calculate` property is the workhorse – it takes parameters like risk levels and uses the selected sizing method to determine the appropriate position size. It intelligently routes the calculation to the right sizing logic.

## Class SessionLiveAdapter

This framework component, `SessionLiveAdapter`, provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub for session information that can easily be swapped out for different storage methods.

By default, it uses a file-based system to preserve data across restarts, but you can switch to an in-memory option for quick testing or a dummy adapter that simply discards data.  It keeps track of your session data, linked to specific symbols, strategies, exchanges, and timeframes.

You can retrieve session values (like current settings or intermediate calculations) and update them as needed during a live trading run. 

The `useLocal()`, `usePersist()`, `useDummy()`, and `useSessionAdapter()` functions offer a convenient way to change the underlying storage mechanism without modifying the rest of your code. If your project's working directory changes, using `clear()` will ensure that new session adapters are initialized correctly.

## Class SessionBacktestAdapter

This component, the SessionBacktestAdapter, helps manage and store data during backtesting simulations. Think of it as a flexible container for holding information about trades and market conditions.

It's designed to be adaptable, allowing you to easily switch between different ways of storing that data. By default, it uses a simple in-memory storage, meaning data disappears when the program ends. However, you can change it to save data to files, or even to a dummy adapter that simply ignores any changes.

The adapter intelligently remembers the data it's holding, so it doesn't have to recalculate or reload it unnecessarily.

Here's what you can do with it:

*   **Switch Storage Methods:** Choose between an in-memory (fast, but temporary), file-based (persistent), or dummy (for testing) storage solution.
*   **Read Data:** Retrieve the current state of a session for a specific trading symbol and conditions.
*   **Update Data:** Record new values and observations during the backtest.
*   **Clear Cache:**  If your working directory changes, you can refresh the adapter’s memory to ensure data is handled correctly.

## Class SessionAdapter

The SessionAdapter acts as a central hub for handling data related to both backtesting and live trading sessions. It intelligently directs data retrieval and storage operations to the appropriate system – either the backtest environment or the live environment – depending on whether you’re running a test or a real trade. 

You can use `getData` to fetch existing data for a specific signal, providing details like the trading symbol, strategy name, exchange, frame, and a timestamp.  Similarly, `setData` lets you update that signal data, again routing it correctly based on your testing or live status. Essentially, it simplifies data management by abstracting away the differences between backtesting and live trading.


## Class ScheduleUtils

This class helps you monitor and understand how your scheduled trading signals are performing. It’s designed to make it easy to gather information and create reports about signals that are waiting to be executed. 

You can use it to see the statistics for a specific trading symbol and strategy, including information about signals that were cancelled.

It also generates nicely formatted markdown reports summarizing the signals, and can even save those reports directly to a file. Think of it as a tool for keeping an eye on your scheduled signal flow and making sure things are running smoothly.


## Class ScheduleReportService

The ScheduleReportService helps you keep track of when signals are scheduled, opened, or cancelled, which is really useful for spotting any delays in your trading. It essentially listens for signal events and records them, along with the time it took from scheduling to when they were actually acted upon or abandoned.

It uses a logger to provide some debug information, and it’s designed to prevent accidentally subscribing multiple times, which could lead to issues.

You subscribe to the service to start receiving these signal events, and when you're done, you unsubscribe to stop the process. The `subscribe` method provides a way to stop listening to the signals and helps ensure you don't subscribe to events multiple times. The `unsubscribe` method ensures you stop receiving those events if you no longer need them.

## Class ScheduleMarkdownService

The ScheduleMarkdownService helps you keep track of your scheduled trading signals and generate reports. It listens for signals being scheduled and cancelled, then organizes this information for each trading strategy. 

You can request reports in a readable Markdown format, which includes details about each signal and helpful statistics like cancellation rates and average wait times. These reports are saved to your logs directory, making it easy to review your trading activity.

The service uses a clever storage system that keeps data separate for each combination of symbol, strategy, exchange, frame, and backtest, ensuring that reports are accurate and well-organized. You can subscribe to receive signal events, unsubscribe when you're done, and clear out the collected data when you need to start fresh. You can also clear data for specific strategies or clear everything at once.

## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management settings and make sure they're set up correctly. Think of it as a central place to register and check your risk profiles before you use them in your trading strategies.

It lets you add new risk profiles using `addRisk`, ensuring everything is accounted for.

Before any operations, you can use `validate` to confirm a specific risk profile actually exists.

To improve performance, the service caches the results of these validations so it doesn’t have to repeat checks.

Finally, `list` gives you a simple way to see all the risk profiles that are currently registered and managed by the service.

## Class RiskUtils

This class helps you analyze and report on risk rejection events within your trading system. It acts as a central place to gather information about why trades were rejected, allowing you to identify and address potential issues. Think of it as a tool for auditing your trading decisions and understanding why the system might have stopped a trade.

You can use it to get overall statistics about rejections, like the total number of rejections or how many occurred for each symbol and strategy. It can also generate detailed reports in markdown format, which includes a table listing each rejection event with relevant details such as the symbol, strategy, position, price, and the reason for the rejection.

Finally, this class can automatically save those reports to files, making it easy to keep a record of your risk management decisions and share them with others. The files are named systematically to easily identify which symbol and strategy they relate to.

## Class RiskSchemaService

The RiskSchemaService helps you organize and manage your risk schemas in a structured way. It keeps track of your risk profiles, ensuring they're stored safely and with type checking.

You can add new risk profiles using the `addRisk()` method (represented here as `register`), and easily find them again by their name with the `get()` method.

Before adding a risk profile, the `validateShallow()` function quickly checks to make sure everything is set up correctly, like confirming the necessary information is present.

If a risk profile already exists, you can update parts of it using the `override()` method, making adjustments without replacing the entire schema. 

The service utilizes a registry to store the risk schemas, and it has access to logging and execution context information for detailed monitoring.

## Class RiskReportService

This service helps track and analyze why signals are being rejected by your risk management system. It acts like a digital record keeper, capturing details of each rejected signal, including the reason for rejection and the signal's information.

Think of it as a safety net; it ensures you don't lose important information about potential problems in your trading strategy or risk controls.

To get it working, you'll need to tell it to start listening for rejection events.  It prevents accidental duplicate subscriptions, making sure things run smoothly. When you’re done, you can easily tell it to stop listening too. It uses a logger service to provide debugging information.

## Class RiskMarkdownService

This service helps you create detailed reports about rejected trades based on risk rules. It listens for "rejection" events happening during your trading simulations or live trading.

Essentially, it keeps track of why trades are being rejected, organizing the information by the traded asset (symbol), your trading strategy, and the specific conditions of the trade. 

The service then generates reports in a readable Markdown format. These reports include statistics like the total number of rejections and a breakdown by symbol and strategy.  It automatically saves these reports to a designated folder on your computer.

You can subscribe to receive these rejection events, unsubscribe when you no longer need them, and clear the accumulated data when necessary.  There are also functions to retrieve specific data or generate reports for particular trading setups. The system ensures that data for different symbols, strategies, exchanges, frames, and backtest scenarios are kept separate.

## Class RiskGlobalService

This service manages and enforces risk limits within the trading system. It's a central component for ensuring trades adhere to predefined risk parameters, and it's used behind the scenes by both automated strategies and the public-facing trading tools.

It works closely with a connection service to validate risk configurations, and it keeps track of validations to avoid repeating the same checks unnecessarily. The service provides functions to verify if a trade should be allowed based on risk rules, and there’s a specialized version that guarantees safe handling of concurrent requests – preventing multiple trades from passing validation simultaneously when resources are limited.

You can use it to register new trades (signals) and record their details, and also to remove records when trades are closed. Finally, it offers a way to clear out all risk data or to selectively remove data for specific risk settings.

## Class RiskConnectionService

This service acts as a central hub for handling risk management within your trading system. It intelligently connects your trading strategies to the correct risk assessment tools, ensuring your trades adhere to pre-defined limits.

Think of it as a traffic controller, directing risk-related requests to the right place. It remembers previously used risk assessment tools to speed things up, avoiding unnecessary re-creation.

Here's a breakdown of what you can do with it:

*   **Risk Checks:** It validates trades against limits like portfolio drawdown, symbol exposure, and position counts. When a trade is rejected due to risk constraints, it will signal this event.
*   **Signal Management:** You can register new trades ("addSignal") and close existing ones ("removeSignal") within the risk management system.
*   **Concurrency Safe Checks:**  A special function, `checkSignalAndReserve`, guarantees safe trading even when multiple trades are happening at the same time.
*   **Cache Clearing:**  You can manually clear the cached risk assessment tools if needed.
*   **Configuration:** It relies on external services to understand risk definitions and time-related data.

## Class ReportWriterAdapter

The ReportWriterAdapter helps you manage where your trading data and reports are stored, making it easy to switch between different storage methods. It acts as a middleman, allowing you to swap out the specific technology used to store data without changing the rest of your code.

The adapter intelligently keeps track of your report types, like backtest results or live trading data, and ensures only one storage instance exists for each type throughout your application.

You can easily change the default storage method by providing a new adapter constructor.

The `writeData` method handles the actual writing of data, and it automatically sets up the storage the first time data is written for a particular report.

If you want to temporarily disable data storage, you can use the dummy adapter which simply ignores all writes. Alternatively, you can always revert back to the default JSONL (JSON Lines) storage. 

The `clear` method is helpful when your working directory changes because it forces a new storage instance to be created based on the updated path.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework are recording data for reports. You can think of it as a way to turn on or off detailed logging for things like backtests, live trading, or performance analysis.

The `enable` property lets you choose which types of reporting you want active.  It sets things up so the system starts capturing relevant events and writing them to JSONL files, providing real-time data for analysis.  Crucially, you’ll get a function back that you *must* call when you're done with that reporting – it cleans up all the listeners to prevent memory issues.

The `disable` property allows you to stop reporting for specific areas without affecting others. This is useful if you only need data from certain parts of the system at a given time. It instantly stops the logging and releases resources for those specific areas. Note that unlike `enable`, it doesn't provide a cleanup function – the disabling happens immediately.



Essentially, ReportUtils gives you fine-grained control over the framework’s reporting and data collection.

## Class ReportBase

This class provides a way to consistently log trading events to files, making it easier to analyze your backtests later. It writes each event as a single line in a JSON file, organized by report type.

The system handles writing these files efficiently, dealing with potential delays and ensuring data isn't lost. It automatically creates the necessary directories and includes useful metadata with each event, like the trading symbol, strategy used, and the time of the event.

You can think of it as a central place to record what's happening during your backtests, designed for both real-time logging and later analysis. It ensures data is written reliably, even if the process takes a little longer. The initialization is performed once, guaranteeing setup consistency.


## Class ReportAdapter

The ReportAdapter helps manage where trading data and analytics are saved, offering a flexible way to change storage methods without altering the core trading logic. It remembers which storage method is active, so you don’t have to keep configuring it. 

Think of it as a central point for controlling how your trading reports are stored, with options like saving to JSONL files or even using a "dummy" adapter that effectively ignores any data. The system automatically creates and reuses storage instances based on the report type to optimize performance.

If you need to switch to a new base directory during backtesting, clearing the adapter cache ensures fresh storage instances are used. It simplifies structured event logging, making it easier to build analytics pipelines for your trading strategies.


## Class ReflectUtils

This utility class, `ReflectUtils`, provides a centralized way to monitor key position metrics like profit, loss, and drawdown during trading. Think of it as a real-time dashboard for your strategies.

It simplifies access to position data, ensuring consistency and validation across your system.  You can use it in both backtesting and live trading scenarios. This is a singleton, so you'll use the same instance throughout your application.

Here's what it lets you track:

*   **Profit & Loss (PNL):**  It can calculate PNL as a percentage or in dollars.
*   **Peak Performance:**  Find the highest profit price and timestamp, along with related PNL values.
*   **Drawdown Analysis:**  Determine the maximum drawdown price and timestamp, along with the time elapsed since the highest profit and deepest drawdown points.
*   **Position Duration:** Track how long a position has been active and how long a signal has been waiting.
*   **Distance from Peaks:**  Calculate how far current prices are from the highest profit and deepest drawdown levels, expressed as PNL percentage or cost.

These metrics help you understand your strategy's risk profile and performance characteristics. All functions handle situations where a position isn't active, returning null in those cases.

## Class RecentLiveAdapter

This component, `RecentLiveAdapter`, manages how recent trading signals are accessed and stored. Think of it as a central hub for getting the most up-to-date signal data. It’s designed to be flexible, allowing you to easily switch between different storage methods without changing the core logic of your trading strategies.

It comes with a default persistent storage option that saves signals to disk and a memory-based option for faster, temporary storage. You can choose the storage method you need.

The `RecentLiveAdapter` simplifies retrieving the latest signal and determining how long ago it was generated. It also includes a way to clear its internal cache, which is important when your working directory changes during a trading process to ensure you're using the correct storage location.  You can easily swap out how signals are stored by providing your own adapter.

## Class RecentBacktestAdapter

This component helps manage and access recent trading signals, offering flexibility in how those signals are stored. It acts as a bridge, allowing you to easily switch between storing signals in memory or persistently on disk.

Think of it as a central point for getting the most recent signals related to a specific trading strategy and market. 

It keeps track of which storage method you're using – memory or persistent storage – and provides simple commands to change that. When you need to refresh the signal storage due to changes in the environment (like a change in the working directory), a special 'clear' function ensures you're using the latest configuration. The system caches the storage instance to avoid unnecessary rebuilds and maintains a factory for creating these instances.

## Class RecentAdapter

This component, called RecentAdapter, handles storing and accessing recent trading signals whether you're backtesting or running live. 

It automatically updates its storage whenever new data arrives, and it guarantees you always have access to the most up-to-date signal for any specific trading scenario. 

To prevent unwanted subscriptions, it ensures only one subscription happens at a time.

You can turn on and off this storage functionality.

Retrieving a signal is easy – just specify the symbol and context (like strategy and exchange), and it finds the latest signal, being careful not to look into the future.

It also allows you to determine how long ago that latest signal was created, helping you understand how recently signals are being generated.

## Class PriceMetaService

PriceMetaService helps you reliably get the latest market price for a specific trading setup – think of it as a central price tracker. It keeps track of prices for each symbol, strategy, exchange, and timeframe combination, updating these prices after every tick.

You can use it to get the current price even when you're *not* actively executing a trade – useful for things like calculating order sizes outside of the normal trading cycle. If a price hasn't been received yet, it will wait briefly for the information to arrive.

It’s designed to work seamlessly with other parts of the system; for instance, when running a live trade, it will automatically fetch the price directly from the exchange. The service is managed centrally, making sure prices are updated and stale data is cleared when a strategy begins. 

You can clear the tracked prices for individual setups or globally to ensure data remains fresh and conserve memory.

## Class PositionSizeUtils

This class helps you figure out how much of an asset to trade based on different strategies. It's a collection of tools for position sizing, meaning it helps determine the right amount to invest in a trade.

Each sizing method – like fixed percentage, Kelly Criterion, or ATR-based – is implemented as a reusable function within this class.

These functions take information about your account balance, the asset's price, and other factors specific to the chosen method to calculate the appropriate position size. Importantly, each sizing method checks that the provided information makes sense for that particular strategy. 

The class provides these calculations as ready-to-use methods, simplifying your trading strategy implementation.

## Class Position

The `Position` framework provides tools to help you determine ideal take profit and stop loss prices for your trades. It handles the complexity of adjusting these levels based on whether you're going long or short.

The `moonbag` function helps you set up a simple strategy where your take profit is a fixed percentage above or below your entry price.

The `bracket` function gives you more control, allowing you to define your own take profit and stop loss percentages to create custom bracket orders. This lets you tailor your risk management strategy more precisely.

## Class PersistStorageUtils

This class helps manage how your trading signals are saved and loaded, especially when dealing with backtesting and live trading environments. It provides a way to store signal data persistently, ensuring that your progress isn't lost.

The core idea is that each signal is saved as its own file, making it easy to manage individual signals. This approach also makes the process more reliable, with built-in safeguards against crashes.

You can customize how signals are stored by swapping out the default storage mechanism for your own. The system intelligently caches these storage setups to avoid unnecessary work.

If something changes in your environment – for example, if the current working directory shifts – you can clear the cache to ensure things are refreshed. There are also pre-built options for using a standard file-based system or a dummy storage for testing purposes. The `getStorage` and `readStorageData` methods handle loading and saving all of your signals for either backtesting or live trading.

## Class PersistStorageInstance

This component handles persisting trading signals to files, acting as a reliable storage mechanism. It's designed to work well whether you're running a backtest or a live trading system.

Each signal is saved as its own JSON file, making it easy to manage and retrieve individual pieces of data. The system reads signals by examining all available file keys, and uses special techniques to ensure data integrity even if something goes wrong during the saving process.

The `waitForInit` method ensures the storage is ready before you start writing data, and `readStorageData` lets you access all the saved signals. When you're ready to save, `writeStorageData` takes a collection of signals and stores them, referencing each one by its unique identifier.


## Class PersistStateUtils

This class provides tools for managing how your trading strategy's state is saved and loaded, ensuring it can recover gracefully from interruptions. It's designed to keep track of the data your strategy needs to remember, like order books or historical prices, and store it safely.

It cleverly avoids creating duplicate storage instances for the same data, streamlining the process. You can even customize how the data is stored, allowing for different storage solutions beyond the default file-based system.

The class includes helpful functions to initialize storage, read existing data, write updates, and clean up old data when it's no longer needed. There's even a "dummy" mode for testing, where all operations are ignored, so you can run your strategy without actually saving anything to disk. Finally, it lets you swap in your own custom storage mechanisms if you need something different.

## Class PersistStateInstance

This class, `PersistStateInstance`, is designed to help you save and load trading state information consistently. It’s a convenient way to store data related to a specific signal, using a unique identifier and a designated "bucket" for organization. Think of it as a way to keep track of your progress over time.

It manages the actual file storage for you, ensuring your data is written safely.

Here's a bit more detail:

*   You provide a signal ID and a bucket name when creating an instance, acting as labels for the state you’re managing.
*   `waitForInit` gets things started by setting up the storage.
*   `readStateData` retrieves previously saved data using the bucket name.
*   `writeStateData` saves new data back, again using the bucket name to pinpoint where it should go.
*   `dispose` is a special method that does nothing directly; instead, it relies on a helper function to clean up cached data – so you don't have to worry about that.

## Class PersistSignalUtils

This class helps manage how trading signals are saved and loaded, ensuring that the information is reliable even if something goes wrong. It keeps track of signal data for each trading strategy and the specific markets it’s applied to.

The system uses a clever trick called memoization to create and reuse signal storage instances, ensuring efficiency. You can also customize how this data is stored by providing your own way of creating instances. 

The `readSignalData` method retrieves the saved signal information, while `writeSignalData` allows you to update or clear it.  If a signal is needed for the first time, this automatically creates a storage instance.

If you need to switch between different ways of saving signals – like using a file-based system, a custom adapter, or even a dummy system for testing – the `usePersistSignalAdapter`, `useJson`, and `useDummy` methods let you do that.  Finally, `clear` is used to reset the caching mechanism when needed, like when the working directory changes.

## Class PersistSignalInstance

This class provides a way to reliably save and retrieve signal data to a file. It's designed to be a safe and consistent way to store information related to your trading strategies, ensuring that even if your application crashes, the data isn't lost. 

The class stores data based on a unique identifier formed from the trading symbol, strategy name, and exchange name. It essentially acts as a wrapper around a file-based storage system, making sure writes happen safely.

Here's what it lets you do:

*   **Initialization:** It prepares the underlying storage system for use.
*   **Reading Signal Data:** It allows you to retrieve previously saved signal data, identified by the trading symbol.
*   **Writing Signal Data:** It lets you save signal data, or clear existing data, again using the trading symbol as the identifier. 

It uses the symbol, strategy name and exchange name to organize and locate the data files.

## Class PersistSessionUtils

This class helps manage how trading session data is saved and loaded, ensuring your strategies don't lose progress. It essentially acts as a smart manager for session files.

It keeps track of where session data is stored, using a predictable file structure like `./dump/session/<strategyName>/<exchangeName>/<frameName>.json`. 

You can customize how these sessions are persisted, choosing between different storage methods – a standard file-based approach, a dummy (no-op) option for testing, or even providing your own custom storage solution. 

It handles creating and managing these storage instances, remembering them so it doesn't have to recreate them every time, which makes things more efficient.

There's a handy `waitForInit` function to help set up the session storage initially, and functions for reading and writing data.

If you switch storage methods, or if the working directory changes, you can clear the cache to force it to re-establish the connection. You can also manually remove specific session data using `dispose`.

## Class PersistSessionInstance

This class helps you save and load session data for your trading strategies, acting as a persistent storage layer. It’s designed to work with a specific strategy and exchange, using a unique identifier (frameName) for each saved session.

The class manages writing data to a file in a safe way and doesn't handle cleaning up temporary memory caches itself; that's done by a separate utility.

Here's what you can do with it:

*   You can initialize its storage.
*   It allows you to retrieve existing session data based on its identifier.
*   You can save new session data to the storage, associating it with the identifier.
*   It handles the cleanup of resources by relying on another utility.

## Class PersistScheduleUtils

This class helps manage how your trading strategies keep track of scheduled signals – those automated actions you want to happen at specific times. It's designed to be reliable, even if your program crashes unexpectedly.

It cleverly remembers which storage methods to use for each strategy, so you don't have to configure them repeatedly. You can also plug in your own custom ways to store this information, like using a different file format or database. 

The class automatically creates and manages the storage for scheduled signals, and makes sure writing and reading data happens safely. This is particularly important for the `ClientStrategy` which uses this to maintain its scheduled signals when it's actively trading.

If you need to change how your scheduled signals are saved (for example, if you move your project directory), there's a way to clear the internal memory and force it to re-initialize. There are also built-in options to use a standard file-based system or a "dummy" system that does nothing, which is handy for testing.

## Class PersistScheduleInstance

This class provides a way to save and retrieve scheduled trading signals to a file, ensuring your data is persistent even if things go wrong. It's designed to work with a specific trading strategy and exchange, identifying signals by a unique symbol.

The class automatically handles writing data safely to prevent data corruption.

Here's a breakdown of how it works:

*   **Initialization:** The `waitForInit` method sets up the underlying file storage – you'll need to call this to get things started.
*   **Reading Signals:** `readScheduleData` fetches a saved signal for a specific symbol, returning `null` if nothing is found.
*   **Saving Signals:**  `writeScheduleData` lets you store a new signal or clear out an existing one for that symbol. 

Essentially, it’s a reliable system for keeping track of your scheduled trading actions.

## Class PersistRiskUtils

This class, PersistRiskUtils, helps manage and save the details of your active trading positions – things like how much risk you're taking – in a reliable way. It's designed to work closely with ClientRisk, especially when you're actively trading.

The class efficiently stores and retrieves these position details, ensuring each risk profile has its own dedicated storage. You can customize how this storage works by providing your own "constructor" for the storage mechanism. 

It's also built to handle situations where things might go wrong – it ensures your position state remains consistent, even if there are unexpected crashes.

Here’s a breakdown of how you interact with it:

*   It keeps a record of which storage “factories” to use, preventing unnecessary creation of new storage instances.
*   It offers functions to read and write position data, automatically creating the storage if it doesn't exist yet.
*   You can easily swap out the storage method – whether it's using files, a custom adapter, or even a dummy storage for testing purposes where no data is actually saved.
*   You can clear the memory of previously used storage configurations if your working directory changes.



Essentially, this class provides a robust and flexible way to keep track of your trading positions and make sure they're safely stored.

## Class PersistRiskInstance

This class helps manage and save your trading positions to a file, ensuring that the data isn't lost even if something unexpected happens. It’s designed to work within a specific trading context, identifying positions using a standard key.

Essentially, it wraps another storage system to make sure updates are saved safely and reliably.

Here’s a breakdown of what it does:

*   **Initialization:** The `waitForInit` method sets up the storage system.
*   **Reading Data:** The `readPositionData` method retrieves the saved positions data based on the time you specify.
*   **Saving Data:** The `writePositionData` method writes new or updated position data, storing it with the designated key.

It's configured with a `riskName` and `exchangeName` to clearly identify the context of the positions being saved. The `STORAGE_KEY` is hardcoded, making sure all positions are stored under the same identifier.


## Class PersistRecentUtils

This class helps manage how recent trading signals are saved and retrieved, ensuring the system remembers important data across different trading contexts. Think of it as a smart storage system specifically designed for trading signals.

It keeps track of signals for each trading symbol, strategy, exchange, and timeframe, using a clever technique called memoization to optimize performance – it only creates and uses storage instances when needed.

You can even customize how these signals are stored by providing your own storage mechanisms. This includes options for using standard file storage or even a "dummy" storage for testing purposes where data isn't actually saved.

The class automatically handles reading and writing these signals safely, making sure nothing gets lost even if the system crashes.  If you're working with backtesting or live trading, this class is essential for ensuring consistent signal management.

Here's a bit more detail on what you can do:

*   **Control how signals are stored:** Choose between file storage, a custom adapter, or a dummy adapter for testing.
*   **Clear the stored data:** Clear the cache when necessary, like when the working directory changes.
*   **Retrieve the latest signal:** Easily get the most recent signal for a specific trading setup.
*   **Save a new signal:** Securely write a new signal to the storage, ensuring it's preserved for later use.

## Class PersistRecentInstance

This class helps you save and retrieve recent trading signals, like the last signal generated by a strategy. It's designed to store this data persistently on your file system, so you don’t lose it when your application restarts.

The class works by combining the trading symbol, strategy name, exchange name, frame name, and whether it's a backtest or live run to create a unique identifier for where to store the data. Think of it as organizing your signal data into labeled folders.

You can use `waitForInit` to make sure the underlying storage is ready. `readRecentData` lets you load that last saved signal, and `writeRecentData` saves a new one. This class ensures that saving this data happens reliably, even if something unexpected occurs.

## Class PersistPartialUtils

This class, PersistPartialUtils, helps manage and save partial profit and loss data for your trading strategies. It ensures data is stored reliably and safely, even if there are unexpected interruptions. 

Think of it as a smart system for remembering how much profit or loss you've made on specific trades.

It cleverly creates storage areas for each symbol and strategy combination, ensuring each has its own dedicated space. You can even customize how this data is stored using your own storage methods.

The class automatically handles reading and writing this data, making sure the process is consistent and secure. It also has a way to clear its memory to handle situations where the program’s working directory changes. 

Finally, for testing or simpler scenarios, you can switch to a dummy storage mode where nothing is actually saved.

## Class PersistPartialInstance

This component handles saving and retrieving partial data—think of it as a way to temporarily store information during a trading process. It’s designed to work with files, making sure your data is saved reliably even if something unexpected happens. 

It uses a combination of a unique identifier for each trading signal and a special file storage system. The unique identifier is based on the trading symbol, strategy name, and exchange name.

The `waitForInit` method gets the underlying storage ready to go. 

`readPartialData` allows you to load any saved partial information associated with a specific trading signal. `writePartialData` is used to save any data you need to hold onto temporarily for a trading signal. This helps keep things consistent and prevents data loss.

## Class PersistNotificationUtils

This class helps manage how notification data is saved and retrieved. It provides a way to store notifications persistently, ensuring that even if there's a crash, the data isn't lost. 

It uses a clever system where it remembers which notification storage method to use, preventing unnecessary re-creation. You can even customize how notifications are stored by plugging in your own storage method. 

Each notification is stored as its own file, identified by a unique ID. Think of it as a helper tool for other parts of the system that need to reliably save and load notification information, such as live and backtest environments.

You can change the underlying storage mechanism, for example, switching to a dummy storage for testing purposes or back to the default file storage. It also has a "clear" function that’s useful when the base directory changes, making sure everything is refreshed.

## Class PersistNotificationInstance

This class offers a reliable way to save and retrieve notification data, acting as a persistent storage layer for your trading framework. It's designed to handle notifications, treating each one as a unique file in a JSON format, identified by its ID. The storage system is built to be safe even if there are interruptions – it uses atomic writes to ensure data integrity.

You can initialize the storage when needed using `waitForInit`, ensuring everything is ready before you start using it. To get all your saved notifications, `readNotificationData` will pull them from the storage, scanning through each individual file. And when you need to update or add notifications, `writeNotificationData` will save them securely, one at a time. It leverages a file-based approach and also accounts for whether you're running a backtest or live execution.

## Class PersistMemoryUtils

This utility class helps manage how memory data is saved and loaded, ensuring it’s handled safely, especially if the application crashes. It keeps track of where each piece of data is stored, using a specific location based on a signal ID and bucket name.

The system uses a clever approach: it creates a storage instance only when it's needed, and it remembers which instances it's already created, avoiding unnecessary work. 

You can customize how data is persisted by swapping out the default storage mechanism with your own. The `usePersistMemoryAdapter`, `useJson`, and `useDummy` methods let you easily switch between different approaches, like using files, or completely ignoring persistence for testing.

The class provides functions to read, write, and delete memory entries, and a way to list all existing entries for rebuilding indexes. It’s designed to be reliable and efficient, making sure your data is handled correctly, even in challenging situations. Finally, a `clear` method exists to refresh the storage, and `dispose` to clean up after signals are removed.

## Class PersistMemoryInstance

This class provides a way to store and retrieve memory data persistently, using files. Think of it as a system for saving information that needs to be kept even when your application restarts.

It uses a specific file location (defined by `bucketName`) to store data associated with a particular signal (`signalId`).

The class allows you to read individual memory entries using their ID, check if a specific entry exists, and write new or updated data.  You can also remove entries – this doesn't actually delete the file, but marks it as removed.

When you need to see all the saved data, `listMemoryData` retrieves only the entries that haven't been marked for removal. 

Finally, `dispose` doesn’t actually do anything itself; it relies on a separate utility function to manage related cleanup tasks.

## Class PersistMeasureUtils

This utility class helps manage and store data retrieved from external APIs, ensuring that the data persists even if your program restarts. It cleverly uses a system of "buckets" to organize the data, where each bucket is based on a combination of a timestamp and the symbol being tracked.

The class uses a special constructor to create these buckets, and you can customize this to use different storage methods. 

It provides functions to read, write, and remove data from these buckets.  Importantly, these functions automatically create the bucket if it doesn't already exist when you first try to use it. A "soft delete" feature lets you remove data by marking it as removed rather than completely deleting it.

You can also tell this class to use a special "dummy" mode, which is helpful for testing as it simulates the actions without actually saving anything. Finally, it has a way to clear its internal cache of bucket instances, which you should do when the program’s working directory changes.

## Class PersistMeasureInstance

This component provides a way to save and retrieve trading data persistently, like results from a backtest. It acts as a middleman, wrapping a simpler storage system to ensure that changes are written reliably. Data can be removed without actually deleting the file – instead, a flag marks it as removed, allowing for easy recovery if needed. 

The system organizes data into "buckets," which are essentially folders for different backtesting projects or strategies. 

Here's a breakdown of what it lets you do:

*   **Initialization:** It sets up the storage location before you start using it.
*   **Reading Data:** You can fetch specific data entries by their unique key. If a piece of data has been "soft-deleted," it won’t be returned.
*   **Writing Data:** You can save new data entries or update existing ones.
*   **Removing Data:** Soft-deletes entries, meaning they’re archived rather than completely erased.
*   **Listing Data:** Gets a list of all available data entries, excluding those that have been soft-deleted.

## Class PersistLogUtils

This class, `PersistLogUtils`, helps manage how your trading strategy's logs are saved and retrieved. It acts as a central point, keeping track of a single log instance to avoid confusion.

You can easily swap out the default log storage mechanism with your own custom solution if needed, using functions like `usePersistLogAdapter`. This lets you experiment with different ways of saving your log data without changing the core trading logic.

The logs themselves are stored as individual files, each identified by a unique ID, ensuring data integrity and easy access. It's designed to handle unexpected crashes safely, making sure your logs aren't lost.

Functions like `readLogData` and `writeLogData` provide simple ways to load and append log entries, while `clear` helps to reset things when the program's working directory changes.  Finally, there are shortcuts like `useJson` and `useDummy` for quickly switching to the default or a no-op log storage for testing.

## Class PersistLogInstance

This component manages the persistent storage of trading logs, acting as a reliable record of your backtesting process. It's designed to safely store each log entry as a separate JSON file, making it easy to access and review individual events. 

The system writes to the log file in an append-only manner, ensuring that existing data remains untouched and preventing accidental overwrites. It's also built with crash-safety in mind, using atomic writes to protect against data corruption.

Before you can start using the log storage, you'll need to initialize it, and retrieving all log entries involves scanning through the storage keys. This component offers methods for reading all existing log data and writing new log entries, making it simple to integrate into your backtesting framework.


## Class PersistIntervalUtils

This component manages how your backtest kit strategy remembers which time intervals have already been processed. It acts as a persistence layer, saving markers in files located under `./dump/data/interval/`. 

Think of it as a way to avoid re-processing the same interval multiple times during a backtest. The presence of a file indicates the interval has already been handled. 

You can configure how this persistence works by swapping out the default file-based storage with alternatives like a JSON file or even a dummy implementation for testing. The `usePersistIntervalAdapter` method allows you to register your own persistence logic.

The `readIntervalData` and `writeIntervalData` methods handle reading and writing these markers, and lazily set up the bucket data if needed. `removeIntervalData` allows you to "soft delete" a marker. Finally, `listIntervalData` lets you see all the intervals that have been processed for a specific time period.  If your working directory changes, remember to clear the cache using `clear()`.

## Class PersistIntervalInstance

This class helps manage and store interval-based data, essentially acting as a persistent storage layer. It uses a file-based system to keep track of these intervals. 

You can think of it like a central record keeper for your interval data. It wraps another storage component to ensure writes are handled reliably.

It provides methods to read, write, and delete (soft delete – meaning the data remains but is marked as inactive) interval markers. The `listIntervalData` function lets you see which intervals are currently active, excluding those that have been soft-deleted, so you only get the intervals that are ready to fire again. 

The bucket property identifies the storage location for the interval data.


## Class PersistCandleUtils

This class helps manage a cache of historical candle data, storing each candle as a separate JSON file. It's designed to be persistent, meaning the data survives between sessions or strategy runs.

The cache is intelligently validated to ensure it's up-to-date, and it automatically handles situations where data might be missing. It uses a factory pattern to create specific cache instances based on the symbol, interval, and exchange.

You can customize how these candles are stored and retrieved by plugging in different candle cache constructors.  There's also a dummy implementation available that's useful for testing or scenarios where you don't need actual data persistence. Finally, a clear method is available to reset the cache when necessary, like when your working directory changes.

## Class PersistCandleInstance

This component handles persistent storage of candlestick data, essentially acting as a cache for your trading backtests. It stores each candle as a separate JSON file, organized by its timestamp.

Think of it like this: it keeps track of historical candle data so you don't have to repeatedly fetch it from an exchange.

If a candle’s data isn't found, the `read` function will return null, indicating that a fresh fetch is needed.

When writing data, it's designed to be conservative: incomplete candles (those that haven’t fully closed yet) and duplicate timestamps are automatically skipped to ensure data integrity.

You can initialize the storage with `waitForInit`, and then use `readCandlesData` to retrieve a range of candles.  `writeCandlesData` allows you to save newly obtained candles to the storage.

The storage is tied to a specific symbol, interval (like 1 minute or 1 hour), and exchange.

## Class PersistBreakevenUtils

This class helps manage and save the breakeven data for your trading strategies. It’s designed to handle situations where you need to remember the breakeven points for specific trades, allowing you to resume where you left off.

The system uses a persistent storage layer to save and load this data, organizing it in a specific file structure under a 'breakeven' directory.  It avoids repeatedly creating these storage instances by remembering them, creating only one for each combination of trading symbol, strategy, and exchange.

You have flexibility in how this data is stored; it supports using a standard file-based approach, a dummy (non-persistent) approach for testing, or even plugging in your own custom storage mechanism.  It’s easy to switch between these options.  If your working directory changes (like when running multiple strategy iterations), you can clear the system’s memory to ensure it re-initializes correctly.


## Class PersistBreakevenInstance

This class provides a way to save and retrieve breakeven data persistently, using files to store the information. It’s designed to be reliable, even if your program crashes unexpectedly.

The class is linked to a specific trading symbol, strategy name, and exchange. It uses a file to store data, and each piece of data is identified by a unique signal ID.

To get started, you'll need to provide the symbol, strategy name, and exchange name when creating an instance. 

The `waitForInit` method makes sure the storage is ready before you start working with it.

The core functions are `readBreakevenData` which fetches existing data, and `writeBreakevenData` which saves new or updated data associated with a specific signal. Essentially, it lets you safely store and load breakeven calculations.

## Class PersistBase

This class provides a foundation for storing and retrieving data to files, making sure the process is reliable and efficient. It's designed to handle situations where you need to save information persistently, like trade history or account states.

The class manages where your data is stored, automatically verifying and cleaning up files to prevent corruption. You can easily loop through all stored items and it includes safeguards to prevent problems when deleting files.

It essentially gives you a way to save and load your data safely and conveniently, handling potential issues and offering a straightforward way to work with all your stored items. The constructor sets the name of the entity being stored and the directory where files are located. It also automatically initializes the directory and validates the files within.


## Class PerformanceReportService

This service helps you keep tabs on how long different parts of your trading strategy take to execute. It listens for performance events, like how much time is spent on calculations or data fetching. 

These timing details are then recorded in a database, allowing you to identify slowdowns and areas for optimization. 

You can subscribe to receive these performance updates, but the system ensures you only do this once to avoid issues. When you're done, you can unsubscribe to stop receiving these events. The service also uses a logger to help with debugging.

## Class PerformanceMarkdownService

This service helps you monitor and understand how your trading strategies are performing. It listens for performance data and organizes it, keeping track of metrics for each strategy. 

You can then request summary statistics like averages, minimums, maximums, and percentiles to get a broad picture of performance. It even creates detailed reports in a readable markdown format, pinpointing potential bottlenecks and saving them to your logs folder. 

The service handles the complexities of managing this data, ensuring that each combination of symbol, strategy, exchange, frame, and backtest setting gets its own dedicated storage area. You can subscribe to receive these performance updates, and it's easy to stop listening when you no longer need the data. Finally, it provides methods to retrieve specific data, generate reports, and completely clear all stored performance information.


## Class Performance

The Performance class is your tool for understanding how well your trading strategies are performing. It lets you gather key statistics for specific symbols and strategies, giving you a clear picture of their efficiency.

You can request detailed performance data, broken down by different types of operations, including timings, averages, and volatility measures.

It's also capable of generating easy-to-read markdown reports which show not only the raw numbers but also visually highlight potential bottlenecks in your strategy’s execution. 

Finally, it allows you to save these performance reports directly to your hard drive, making it simple to track progress over time and share your findings.

## Class PartialUtils

This class provides tools for analyzing and reporting on partial profit and loss events, which are smaller, incremental gains or losses that occur during a trading simulation or live trading. It's designed to help you understand how your trading strategies are performing in detail.

You can use it to retrieve statistical summaries of these events, giving you an overview of total profit/loss counts. It can also generate comprehensive markdown reports, presenting each partial profit/loss event in a nicely formatted table with details like action type (profit or loss), symbol traded, strategy used, position taken, level reached, price at the time, and timestamp.

Furthermore, it offers the ability to save these reports directly to files, organizing them by symbol and strategy name for easy reference. The reports are created in markdown format, making them readable and shareable. The file naming convention ensures that you can easily identify the report's content.


## Class PartialReportService

This service helps you keep track of when your trades partially close, whether it's for a profit or a loss. It listens for signals whenever a portion of your position is exited at a specific price and level. 

Think of it as a detailed record of every time you take some money off the table during a trade.

To use it, you'll subscribe to receive these signals – you can always unsubscribe later to stop the process. The service logs these partial exit events with details about the price and level at which they happened and then saves them to a database. It's designed to avoid accidentally subscribing multiple times and ensures that you can cleanly stop the process when needed.


## Class PartialMarkdownService

This service helps you keep track of and report on the profits and losses happening during your trading backtests. It listens for profit and loss signals, organizes them by symbol and strategy, and then generates nicely formatted markdown reports.

The service accumulates data for each symbol and strategy combination, ensuring that reports are specific and relevant. You can generate markdown tables that detail each profit and loss event, and also get overall statistics like the total profit or loss.

Reports are saved as files on your disk, making it easy to review and analyze your trading performance. You can also clear the accumulated data to start fresh or if you need to reset your reporting.

To make things efficient, the service uses isolated storage for each unique combination of symbol, strategy, exchange, frame, and backtest setting. Subscribing to the service allows you to receive events, and you can unsubscribe when you no longer need those updates.

## Class PartialGlobalService

This service manages partial profit and loss tracking for your trading strategies, acting as a central point for logging and handling these operations. It’s designed to be injected into your strategies, providing a consistent way to track and manage partial gains and losses. 

Essentially, it sits between your trading strategy and the underlying connection layer.

Here's how it works:

*   It logs all partial operations, giving you a centralized view for monitoring.
*   It uses other services to validate your strategy and associated configurations, preventing errors.
*   It delegates the actual tracking work to a connection service.

The `profit`, `loss`, and `clear` methods are used to record and reset partial profit/loss states, which are then logged and handled by the connection service. This service helps ensure a well-organized and traceable system for managing your partial trading results.

## Class PartialConnectionService

The PartialConnectionService manages the tracking of partial profits and losses for trading signals. It's designed to create and maintain records for each signal, ensuring that the system efficiently keeps track of gains and losses without creating unnecessary overhead.

Think of it as a central hub that handles individual signal tracking. It creates a special record, called a ClientPartial, for each signal, remembering its details and keeping track of its profit or loss. These records are stored temporarily, so they aren’t always recreated, which saves resources.

When a signal experiences a profit or loss, this service is responsible for updating those records and notifying the system. If a signal is closed, the service cleans up the related record to prevent problems later. This service is set up to work with the overall trading strategy and is managed through a dependency injection system.

## Class NotificationLiveAdapter

The `NotificationLiveAdapter` helps you send notifications about your trading strategies – things like signal events, profit updates, or errors. It's designed to be flexible, allowing you to easily swap out different ways of sending those notifications.

You can choose between a few different notification methods: a default in-memory storage, persistent storage to disk, or even a dummy adapter that does nothing (useful for testing).  The `useMemory`, `usePersist`, and `useDummy` methods let you quickly switch between these options.

The adapter handles various events like signals, partial profits/losses, strategy commits, synchronization, risks, and different types of errors. Each event triggers a notification, which is then passed to the currently selected adapter. 

The `getInstance` property cleverly caches the notification adapter instance, so you don’t have to create it every time you need it.  If your environment changes (like when `process.cwd()` updates), you can use `clear()` to force a fresh instance to be created. Finally, `getData` lets you retrieve the notifications that have been recorded, and `dispose` clears them out when you no longer need them.  You can also customize the adapter itself by providing your own notification adapter constructor using `useNotificationAdapter`.

## Class NotificationHelperService

This service helps manage and send out notifications about signals, especially within the backtesting process. It streamlines the process by performing validation checks only once for each unique combination of strategy, exchange, and frame.

Think of it as a behind-the-scenes helper, mostly used internally by the framework. You'll interact with it indirectly when setting up actions and callbacks.

Here’s a breakdown of its parts:

*   It uses several other services for tasks like validating schemas (checking if configurations are correct) and managing strategy information.
*   The `validate` function checks these schemas, but it's smart: it remembers the results so it doesn’t repeat the same checks multiple times. This makes things more efficient.
*   The `commitSignalNotify` function is the main way to trigger a notification. It validates everything, figures out the signal details, sends the notification to interested listeners, and saves the information.

## Class NotificationBacktestAdapter

This class acts as a central point for handling notifications during backtesting. Think of it as a flexible system that lets you choose *where* those notifications are sent – whether it's to memory, a file, or even nowhere at all (a "dummy" option).

It's designed to be adaptable; you can easily swap out the underlying notification mechanism without changing the core backtest logic. The default is to store notifications in memory, but you can switch to persisting them to a file or completely disable them for testing purposes.

The class provides methods for handling different types of events like signal updates, profit/loss events, strategy commits, errors, and more. These methods essentially pass the event data to the currently selected notification system.

You have convenient shortcuts to quickly change the notification backend: `useDummy`, `useMemory`, and `usePersist`. You can also completely customize the backend by providing your own notification adapter. If you change working directory during backtest process, remember to call `clear` to reset the instance.

## Class NotificationAdapter

This component handles all your notification management, both for testing and live trading. It keeps track of important events like signal updates, profit/loss alerts, and error messages.

It automatically subscribes to relevant signals to keep your notifications current, and ensures you don't accidentally subscribe multiple times, preventing redundant notifications.

You can easily retrieve all stored notifications, specifying whether you want backtest or live data.

When you're finished, a cleanup function ensures everything is properly unsubscribed and cleared. It's also safe to call the disable function multiple times if needed.

## Class MemoryLiveAdapter

This component provides a flexible way to manage memory storage for live trading, allowing you to swap out the underlying storage mechanism as needed. It uses an adapter pattern, meaning you can easily change how data is stored without modifying the core trading logic.

By default, it persists data to files on your computer's file system, so your trading memory survives restarts. However, it also offers options for storing data entirely in memory – useful for testing or when persistence isn't required – or even discarding data entirely.

You can interact with the memory using methods to write, search, list, remove, and read entries. When signals are closed or canceled, the adapter automatically cleans up memoized instances to prevent memory leaks. The `clear` method is especially useful when your working directory changes during strategy execution, ensuring a fresh start.

## Class MemoryBacktestAdapter

This adapter provides a flexible way to manage memory storage during backtesting. It allows you to choose different storage backends, ranging from simple in-memory storage to persistent file-based storage, or even a dummy adapter for testing purposes. You can easily switch between these options using methods like `useLocal`, `usePersist`, `useDummy`, and `useMemoryAdapter` to tailor the storage behavior to your specific needs.

The adapter keeps track of memory instances for each signal and bucket combination, and it provides functions for writing, searching, listing, removing, and reading memory entries.  Important functions include `disposeSignal`, which cleans up memoized instances when a signal is closed, and `clear`, which is useful to ensure that your backtest uses fresh memory instances if the working directory changes. When you need to clean up old memory instances, the `disposeSignal` method is crucial for efficient resource management.

## Class MemoryAdapter

The MemoryAdapter acts as a central hub for managing memory storage, whether you're running a backtest or a live trading environment. It handles subscribing to signal lifecycle events, which ensures that old data is cleaned up when signals are finished, preventing memory from becoming cluttered. 

It provides methods for writing, searching, listing, removing, and reading memory entries, intelligently directing these requests to either the backtest or live memory systems based on the provided configuration. The 'enable' property manages subscriptions, and 'disable' allows for safe and repeated unsubscriptions. A special feature prevents multiple subscriptions to the same signal, ensuring efficient resource use.


## Class MaxDrawdownUtils

This utility class helps you analyze and understand maximum drawdown events, which represent the largest peak-to-trough decline during a trading period. It offers straightforward ways to access and present this drawdown information.

You can use it to fetch detailed statistical data for a specific trading symbol and strategy, including important metrics about how the strategy performed.

It also allows you to create and download markdown reports that clearly display all the drawdown events recorded. 

Finally, you can generate a report saved directly to a file, streamlining your analysis workflow.

## Class MaxDrawdownReportService

The MaxDrawdownReportService helps track and record the largest drops in your trading strategy's performance, also known as maximum drawdown. It monitors events indicating a new drawdown has occurred and saves these events to a database for later analysis.

Think of it as a system that keeps an eye on how far your strategy's equity dips, and then diligently logs those dips with important details.

To make sure it only runs once, the service uses a special subscription mechanism: you subscribe to receive drawdown events, and attempting to subscribe again will just return the original unsubscribe function. This prevents accidentally starting the recording process multiple times.

When a new drawdown event is detected, the service saves a record that includes the time, the traded symbol, the strategy's name, the exchange, the timeframe used, the backtest details, the signal's ID, the position size, the current price, and the original order parameters like take profit and stop loss levels. These records are stored in a specific format, ready for review and reporting.

Finally, you can unsubscribe to stop the recording of drawdown events altogether.

## Class MaxDrawdownMarkdownService

This service helps you create and save reports about maximum drawdown, a key risk metric in trading. It listens for drawdown data and organizes it based on the trading symbol, strategy, exchange, and timeframe. 

You can think of it as a data collector and reporter for drawdown information.

It offers a way to retrieve the raw data, generate formatted markdown reports, and even save those reports directly to a file. 

Before using the reporting features, you need to subscribe to the data stream.  Subscribing ensures it starts gathering the drawdown data, and unsubscribing stops the process and clears everything.

You can selectively clear accumulated data - either for a specific combination of symbol, strategy, exchange, timeframe, and backtest type, or clear all data.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your backtest results are saved, offering different ways to store them. It's designed to be flexible – you can easily switch between storing reports as individual files, appending them to a single log, or even suppressing the output entirely. The system remembers which storage method is active, making sure you don't recreate storage locations unnecessarily.

You can change the default way reports are saved using `useMarkdownAdapter`. 

For a standard setup, `useMd()` creates separate files for each report. `useJsonl()` combines them into a single, growing log file.  If you just want to prevent any reports from being written, `useDummy()` will stop the process. 

The `writeData` method handles actually writing the content and ensures that the storage gets set up the first time it’s used. Finally, `clear()` can be used to reset the storage if things like your working directory change.

## Class MarkdownUtils

This class helps you manage how and when markdown reports are generated for different parts of your trading framework, like backtests or live trading. You can choose which areas to generate reports for, or disable them entirely.

It's designed to be extended, letting you customize the reporting further.

To start, you use `enable` to turn on markdown reporting for specific features. This will have those features start collecting data and creating reports.  **Important:**  When you’re done with these reports, make sure to use the "unsubscribe" function it gives you to clean up and prevent problems.

If you just want to stop reporting for a specific area, `disable` is the way to go. It will immediately stop the reporting for those services.

Finally, if you want to reset the data being collected for reports but keep the reporting feature running, you can use `clear`. This wipes the existing data so you start fresh.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate backtest reports, creating a separate markdown file for each report. It’s designed for situations where you want a clearly organized directory of human-readable reports. 

Each report gets its own `.md` file, and the file's location is determined by the `options.path` and `options.file` you specify.  The adapter also handles creating the necessary directories for you.

Essentially, it’s a simple approach that avoids managing streams and focuses on writing files directly. It's ideal when you need to easily browse and review your backtest results.

The `waitForInit` method is a no-operation; it's included for consistency but doesn't perform any specific actions because this adapter writes files directly.

The `dump` method is the core of the adapter, taking the markdown content and the options to build the file path and write the content to disk.


## Class MarkdownFileBase

This class provides a way to write markdown reports as JSONL data to files, designed for centralized logging and later processing. It creates a separate JSONL file for each type of report (like trade details or performance summaries). 

The adapter ensures these writes are done safely, with built-in protections against long delays (a timeout of 15 seconds) and handles situations where the file buffer is full. 

It organizes files in a specific directory structure, and includes metadata with each entry, making it easy to filter and search through your reports based on criteria like symbol, strategy, or exchange. To get started, you provide the type of report you're creating, and the adapter handles the file setup and writing process. The initialization happens automatically, but you can also manually trigger it if needed.


## Class MarkdownAdapter

The MarkdownAdapter helps you manage how your markdown files are stored, offering flexibility and efficiency. It lets you choose different ways to handle your markdown – either by creating individual files for each piece of content or by appending everything to a single JSONL file. 

The adapter remembers which storage method you’ve selected, so you don’t have to keep configuring it.

You can easily switch between storage options, reverting to the default folder-based approach or opting for the JSONL method. There’s even a "dummy" mode that's useful for testing, as it prevents any actual writing to files. It’s designed to be simple to use, providing shortcuts to commonly used adapter configurations.

## Class LookupUtils

The `LookupUtils` acts as a central record of what's currently happening in your backtests and live trading sessions. It keeps track of each individual backtest run, live trade execution, or even a step within a strategy.

Whenever a backtest starts or a live session begins, a record is added to this internal list. Similarly, when something finishes, the record is removed.

`Candle.spinLock` uses this information to determine whether or not to pause briefly—this helps optimize performance by avoiding unnecessary delays when only one task is running.

You don’t create an instance of `LookupUtils` directly; it’s a singleton available as `Lookup`. It's used internally and provides methods to add, remove, and list the active activities.


## Class LoggerService

The `LoggerService` helps you keep your logging organized and informative throughout your trading strategies and backtests. It’s designed to automatically add extra details to your log messages, like which strategy, exchange, or frame is being executed, and what symbol and timeframe is being analyzed. 

You can use your own existing logging setup by providing a custom logger, or if you don't specify one, it will use a default "no-op" logger that does nothing. 

The service includes several methods—`log`, `debug`, `info`, and `warn`—each designed for different levels of logging severity, all enhanced with this automatic context.  You can also swap out the default logger with your preferred implementation using the `setLogger` method.  The `methodContextService` and `executionContextService` properties handle injecting this contextual information.

## Class LogAdapter

The `LogAdapter` provides a flexible way to manage logging within your backtesting environment. It lets you easily switch between different logging methods, like storing logs in memory, persisting them to a file, or even disabling logging altogether.

Think of it as a central point for your logging needs, allowing you to plug in different logging implementations without changing much of your core code. The default is memory-based logging, but you can easily swap it out.

You can change the active logging method by using functions like `usePersist`, `useMemory`, `useDummy`, or `useJsonl`, which direct logging to disk, memory, or nowhere. There's also `useLogger` if you want to provide your own custom logging implementation. The `clear` function is useful when the environment changes, like when switching between strategy iterations. The `log`, `debug`, `info`, `warn`, and `getList` methods simply pass on their operations to the currently active logging implementation.

## Class LiveUtils

The LiveUtils class simplifies live trading operations by providing convenient access to the underlying system and offering helpful utilities. It acts as a central point for managing live strategies, handling crash recovery, and providing real-time insights.

It offers ways to start live trading, either with continuous results or in the background for side effects like logging or persistence. You can also get information about the current trading state, like pending signals, position details (cost, percentage closed, entry prices), and estimated durations.

The class provides methods for manually managing positions, such as canceling scheduled signals, closing active positions, adjusting stop-loss and take-profit levels, and adding DCA entries. It also facilitates reporting and data retrieval for detailed analysis of trading performance. Finally, you can get a list of active trading instances and their status.


## Class LiveReportService

LiveReportService helps you track your trading strategy’s activity in real-time by recording every significant event—like when a signal is idle, opened, active, or closed. It acts like a detailed logbook, saving all the specifics of each event to a database.

To use it, you'll connect it to your strategy's live signal events.

The service prevents accidental double-subscriptions to ensure accurate and reliable logging.

You can easily start and stop the service with the `subscribe` and `unsubscribe` methods. `subscribe` sets up the connection to receive events, and `unsubscribe` cleanly disconnects when you're done. It keeps track of whether it's subscribed and gracefully handles attempts to unsubscribe when not subscribed. 

The `tick` property handles the actual event processing and database storage, and the `loggerService` provides a way to debug what’s happening internally.


## Class LiveMarkdownService

The LiveMarkdownService is designed to automatically create and save detailed reports about your live trading activity. It keeps track of everything happening during your trades—from initial signals to when positions are opened, actively managed, and eventually closed.

It gathers data about each trade, like win rates and profit/loss, and organizes it into easy-to-read markdown tables. These reports are automatically saved to your computer's logs folder, specifically in a file named after your trading strategy.

You set it up once and it runs quietly in the background, listening for trading signals and building the reports. You can also request specific reports or clear the accumulated data when needed. It utilizes a clever storage system to keep the data for each trading strategy and setup neatly separated.

## Class LiveLogicPublicService

The LiveLogicPublicService helps manage live trading operations, acting as a bridge between public and private components. It simplifies things by automatically passing important information, like the strategy and exchange being used, to the functions that need it.

Think of it as a way to run your trading strategies continuously, even if there are hiccups.

Here's what it does:

*   It provides a continuous stream of trading results (open, closed, or cancelled signals).
*   It's designed to handle crashes – your trading progress will be saved and recovered.
*   It keeps track of time using the system clock to ensure accurate trading.
*   You provide the symbol you want to trade and the context (strategy and exchange).
*   It relies on the `LiveLogicPrivateService` for the core trading logic and `ExchangeConnectionService` for exchange communication.
*   It uses a logger to help debug and monitor your trading.

## Class LiveLogicPrivateService

This service handles the complex process of live trading, acting as an orchestrator for your strategies. It continuously monitors the market in an endless loop, checking for new trading opportunities. 

Each time it checks, it records the current time to ensure accuracy. The service then streams back only the most important results – when trades are opened or closed – avoiding unnecessary data. 

It’s designed to be memory-efficient and resilient, automatically recovering from crashes and resuming trading from where it left off.  The `run` method allows you to specify the symbol you want to trade, and it returns a stream of results you can process.

## Class LiveCommandService

The LiveCommandService acts as a central point for interacting with live trading features. It's a straightforward way to access the underlying live trading logic, designed to be easily used within your application.

This service relies on several other components, including services for logging, handling live logic, validating strategies, and assessing risks.

It includes a `validate` function that checks your trading strategy and related risk settings. This validation is optimized; it remembers previous checks so you don’t have to rerun them unnecessarily when using the same strategy and exchange.

The core functionality is the `run` method, which initiates the live trading process for a specific symbol. It provides important context, like the strategy and exchange names, to ensure everything operates correctly. This `run` method continuously generates results – essentially, it's an ongoing stream of trading updates – and automatically handles any crashes that might occur during live trading.


## Class IntervalUtils

IntervalUtils helps you control how often certain functions are executed, especially in situations where you want to ensure they only run once within a specific time period. Think of it as a way to prevent your code from running the same task repeatedly within a minute, hour, or day.

There are two main ways to use it: in-memory, where the state is temporary, or file-based, where the state is saved to disk and persists even if your application restarts. The file-based option is great for things you need to remember even after a reboot.

The `fn` utility is for functions you want to run once per interval in memory. If your function returns `null`, it won't trigger the timing, and you can retry it later.

The `file` utility wraps async functions and stores their state in a file, making the firing behavior persistent across process restarts.

You can clean up old, unused functions with `dispose` and completely reset the system with `clear`, which is useful when your working directory changes. Additionally, `resetCounter` helps avoid conflicts when you're dealing with situations where the working directory changes between strategy runs.


## Class HighestProfitUtils

This class helps you understand and report on the best performing trades your strategies have made. Think of it as a way to analyze which strategies are consistently generating the highest profits.

It works by gathering data from events that record profitable trades. 

You can use it to:

*   Get detailed statistics about a specific strategy's performance, including key metrics.
*   Generate a Markdown report that lists all the highest profit trades for a particular strategy and trading symbol.
*   Save that report directly to a file, making it easy to share or keep a record of your best results.

Essentially, it provides tools to visualize and document the most profitable moments of your backtesting or live trading.

## Class HighestProfitReportService

This service is responsible for keeping track of and recording the highest profit achieved during a backtest. It constantly monitors a specific data stream for new profit records, and whenever one is detected, it saves that information in a structured format (JSONL) for later analysis and reporting.

Think of it as a diligent observer that meticulously documents significant milestones in your trading strategy's performance.

The service uses a `ReportWriter` to actually write the data to a database.  Each recorded event includes details like the timestamp, symbol, strategy name, exchange, and specific price points (open, take profit, stop loss) related to the signal that triggered the profit.

To get it working, you need to subscribe it to the data stream; subscribing ensures it starts actively listening.  It’s designed to prevent accidental double-subscription.  Unsubscribing stops the recording process.


## Class HighestProfitMarkdownService

This service helps you create and save reports detailing the highest profit achieved for your trading strategies. It listens for data related to highest profits and organizes it based on the symbol, strategy, exchange, and timeframe you're using.

You can subscribe to receive these profit events, and the service ensures you don't accidentally subscribe multiple times. Unsubscribing completely disconnects it from the data stream and wipes out all accumulated information.

The `tick` function handles individual profit events, categorizing them for storage.

You can retrieve accumulated statistics using `getData` to see how a particular strategy performed. `getReport` builds a markdown report showcasing the events, and `dump` saves that report to a file, naming it based on the symbol, strategy, exchange, timeframe, and whether it's a backtest or live run.

Finally, `clear` allows you to erase the collected data, either for a specific strategy configuration or to wipe everything clean.

## Class HeatUtils

HeatUtils is a helpful tool for creating visual representations of your portfolio's performance. It simplifies getting and displaying information about how different assets performed within a particular strategy. Think of it as a way to quickly understand which symbols contributed the most to your gains or losses.

This tool automatically gathers data from all completed trades, making it easy to see how the overall strategy did and how each individual asset performed.

You can request data, create a formatted report, or even save the report directly to a file. The reports clearly show key performance indicators like total profit/loss, Sharpe Ratio, maximum drawdown, and the number of trades executed. The symbols are presented in order of profitability.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording closed trade signals. It focuses on capturing the important data—specifically, the profit and loss (PNL) associated with closed signals—across all your trading symbols.

This service connects to a signal emitter to listen for these closing events and diligently logs them. To prevent unintended consequences, it ensures that you only subscribe to these signals once.

You can start receiving these reports by using the `subscribe` method, which will give you a way to stop listening later with the `unsubscribe` method. Essentially, it’s a tool designed to give you a portfolio-wide view of your closed trades, making it easier to understand what’s working and what isn't.

## Class HeatMarkdownService

The Heatmap Service helps you visualize and understand the performance of your trading strategies. It listens to incoming trading data and organizes it, giving you a clear picture of how your portfolio is doing overall and for each individual asset. 

You can subscribe to receive real-time updates or unsubscribe when you no longer need them.  The service focuses on "closed" signals, filtering out other types of events.

It can generate summary statistics, like total profit, Sharpe Ratio, and maximum drawdown, both for individual assets and for your entire portfolio. These statistics are presented as organized tables, easy to read and share, and can even be saved to a file.

The service is designed to be flexible, letting you clear accumulated data for specific exchanges, frames, and backtest modes, or clear everything completely to start fresh. It uses a clever storage system to keep data separate for different configurations. The `dump` method lets you create these reports and save them as markdown files, clearly labeled with strategy and exchange details.

## Class FrameValidationService

This service helps you keep track of and confirm the validity of your trading timeframes. It's like a central organizer for all your timeframe configurations.

You can add new timeframes using `addFrame`, providing a name and a schema defining that timeframe.

Before you try to use a timeframe in your trading logic, `validate` checks to ensure it's been properly registered. This helps prevent errors.

To see what timeframes are available, `list` provides a complete list of registered schemas. The system remembers validation results, which improves speed.


## Class FrameSchemaService

The FrameSchemaService helps keep track of your trading frame schemas, making sure they're consistent and well-defined. It acts like a central place to store and manage these schemas, using a system that ensures type safety.

You can add new frame schemas using the `register` method, giving each one a unique name. If a schema already exists, you can update parts of it with the `override` function. 

Retrieving a schema is straightforward – just use the `get` method and the schema's name. Before adding a new schema, the service checks to make sure it has all the necessary components with the right types, using `validateShallow`. This helps prevent errors later on.

## Class FrameCoreService

FrameCoreService acts as the central hub for managing timeframes within the backtesting environment. It leverages a connection service to fetch timeframe data and a validation service to ensure its integrity. Think of it as the engine that provides the sequence of dates your trading strategy will operate on.

It’s a core, internal component, primarily used by the backtesting logic itself.

The `getTimeframe` method is its key function, allowing you to request a list of dates for a specific trading symbol and timeframe name – essentially setting the stage for each step of your backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different frames within the backtesting environment. It intelligently routes requests to the correct frame implementation based on the current method context. 

To improve performance, it keeps a record (memoization) of the frame instances it creates, so it doesn't have to recreate them every time you need them. 

This service also handles the timeframe settings for backtests, allowing you to specify a start date, end date, and interval for your analysis. When running in live mode, there are no frame constraints, so the `frameName` will be an empty string. 

You can think of it as the traffic controller for frames, ensuring everything goes to the right place efficiently.

It provides these key functionalities:

*   Automatically directs requests to the right frame.
*   Efficiently caches frequently used frames.
*   Manages the time period for backtests.
*   Provides the `getFrame` function for retrieving the memoized ClientFrame instances.
*   Offers the `getTimeframe` function to obtain the backtest timeframe boundaries for a given symbol.

## Class ExchangeValidationService

This service helps you keep track of your configured exchanges and makes sure they’re actually set up correctly before you try to use them. Think of it as a central place to register and check your exchanges.

You can add new exchanges using the `addExchange` function, providing a name and configuration details. 

Before running any operations, use the `validate` function to confirm an exchange exists, preventing potential errors. 

The service also keeps a record of all your registered exchanges, allowing you to view them with the `list` function. To speed things up, it remembers the results of past validations, so it doesn’t have to re-check things unnecessarily.

## Class ExchangeUtils

The ExchangeUtils class is designed to make interacting with different cryptocurrency exchanges easier and more reliable. It acts like a central hub, ensuring consistent data retrieval and formatting across various exchanges.

Think of it as a helper that handles the complexities of connecting to exchanges and getting the data you need.

It provides functions for retrieving things like historical candle data (price charts), current order books (buy and sell orders), and aggregated trade information.  A key feature is automatically calculating the correct time range for retrieving data, making sure your backtests and live trading strategies work accurately.

It also provides tools to ensure that quantities and prices are correctly formatted according to each exchange's specific rules, which is crucial for placing orders correctly. The class is designed to be easily accessed and used throughout your backtesting framework.


## Class ExchangeSchemaService

This service helps you keep track of information about different cryptocurrency exchanges. 

It uses a special system to ensure everything is typed correctly, reducing errors.

You can add new exchanges using `addExchange()` and find them again by name with `get()`.

Before an exchange is added, the service checks it has all the necessary details using `validateShallow()`.

If you need to update an existing exchange’s information, the `override()` function lets you do that.

The service uses logging to help you understand what’s happening behind the scenes and provides a secure way to store schemas.

## Class ExchangeCoreService

ExchangeCoreService is a central service that handles interactions with exchanges, ensuring that relevant information like the trading symbol, time, and whether it’s a backtest or live environment is always available. It builds upon other services to manage these details, and it's a key component used internally by the backtesting and live trading logic.

It provides a set of functions to retrieve data from exchanges, like historical candles, order books, and aggregated trades. These functions take into account the specific symbol, time frame, and whether the request is part of a backtest.  You can retrieve future candles for backtesting purposes as well.

The service also offers utility functions for formatting prices and quantities, and includes a validation step to ensure exchange configurations are correct, avoiding unnecessary repeated validations.  Essentially, it's a wrapper designed to make interacting with exchanges more consistent and aware of the current trading context.

## Class ExchangeConnectionService

The ExchangeConnectionService acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently directs your requests – like fetching candles or order books – to the correct exchange based on the configured settings. This service avoids repeatedly creating connections to exchanges by caching those connections, which helps improve performance.

It provides a consistent interface (`IExchange`) for accessing exchange data and functionality, regardless of the specific exchange being used.

Here’s a breakdown of what it offers:

*   **Automatic Exchange Selection:** It automatically figures out which exchange to use, based on settings.
*   **Cached Connections:** It remembers and reuses connections to exchanges to avoid unnecessary overhead.
*   **Data Retrieval:** You can use it to get historical candles, the next set of candles (useful for backtesting and live trading), the average price (either real-time or calculated from historical data), and order book information.
*   **Formatting:** It handles formatting prices and quantities to meet the specific requirements of each exchange.
*   **Flexible Candle Retrieval:** It allows for retrieving raw candles with custom date ranges and limits.

The service relies on other components like `loggerService`, `executionContextService`, `exchangeSchemaService` and `methodContextService` to manage logging, context, schema and method calls respectively.

## Class DumpAdapter

The DumpAdapter provides a flexible way to store various types of data generated during a trading backtest, like messages, records, and tables. It acts as a central point for these "dumps," allowing you to easily change where that data is saved – whether it's to files, memory, or even discarded entirely.

Think of it as a manager that handles writing different pieces of information, ensuring each piece is stored appropriately based on its type.

Before you start using it, you need to activate it using `enable()`, and deactivate with `disable()`. This ensures it's listening for the signals it needs to respond to. 

You can then use methods like `dumpAgentAnswer`, `dumpRecord`, `dumpTable`, `dumpText`, and `dumpJson` to persist your data.  The default behavior writes data to markdown files, but you have the power to switch backends.

You can easily switch the storage method using commands like `useMemory` to store data in memory or `useDummy` to effectively ignore the data.  `useDumpAdapter` lets you inject completely custom storage implementations too. 

Finally, `clear()` is useful for refreshing the adapter when you need it to use a new base path, like when your working directory changes.

## Class CronUtils

Okay, here's a breakdown of the `CronUtils` class, which helps schedule tasks within your backtesting framework, particularly useful for coordinating things across multiple parallel backtest runs.

Think of it as a way to run things at specific points in time during your backtests, like when a new candle appears. The key thing it does is ensure that even if many of your backtests try to run something at the same time, it only runs *once* and everyone waits for it to finish.

The `Cron` class manages these scheduled tasks.  It keeps track of which tasks are registered, when they should run, and whether they've already fired.  It's a singleton, meaning you only ever have one instance of it.

It uses several internal data structures to make this work reliably, including:

*   **`_entries`**:  A record of all the tasks you've scheduled, along with a counter to ensure that even if you re-register a task, the old version finishes first.
*   **`_inFlight`**: This is crucial for ensuring that tasks only run once at a specific time. It acts like a lock to make sure only one handler runs for a particular scheduled event.
*   **`_firedOnce`**:  Tracks tasks that should only run once, so they don't keep re-running.
*   **`_lastBoundary`**:  This makes sure that even if the backtest skips over a candle boundary, the task will still eventually run.

You register tasks using `register()` and remove them using `unregister()`.  `clear()` is useful for resetting things if you want to run a task again. `dispose()` completely resets the entire scheduling system. `enable()` connects the scheduler to the backtesting engine, and `disable()` disconnects it.

## Class ConstantUtils

This class provides a set of useful constants related to take-profit and stop-loss strategies, designed with a Kelly Criterion approach incorporating risk decay. Think of these constants as pre-calculated points along the way to your ultimate profit or loss targets.

For example, if your desired profit is 10%, the `TP_LEVEL1` at 30% would trigger when the price moves 3% in your favor, `TP_LEVEL2` at 60% triggers at 6%, and `TP_LEVEL3` at 90% triggers at 9%. This allows you to gradually secure profits as the price moves.

Similarly, the `SL_LEVEL1` and `SL_LEVEL2` constants provide points for managing risk and limiting potential losses, acting as early warnings and final exit points respectively.  They’re expressed as percentages of the total distance to your stop-loss target.

## Class ConfigValidationService

The ConfigValidationService is designed to make sure your trading configurations are mathematically sound and can actually lead to profits. It acts like a safety net, checking all the important settings defined in GLOBAL_CONFIG.

It scrutinizes things like slippage, fees, and profit margins, making sure they're set up correctly – specifically, percentages must be positive. 

Beyond basic values, it performs a critical check: ensuring that the minimum TakeProfit distance accounts for all potential costs like slippage and fees, guaranteeing a potential profit when the target is reached.

The service also verifies that your parameter ranges make logical sense – for instance, that a StopLoss distance is set appropriately. It also makes sure that any time-related or count-based settings are valid, positive integers. Finally, it validates candle-related parameters like retry counts and anomaly detection thresholds.

## Class ColumnValidationService

The ColumnValidationService helps ensure your column configurations are set up correctly and consistently. It acts as a safety net, checking your column definitions to prevent errors and unexpected behavior.

It meticulously examines all column configurations to verify they meet essential criteria. This includes making sure each column has the necessary properties like a unique identifier (key), a descriptive name (label), a formatting function (format), and a visibility function (isVisible). It also confirms that the keys used to identify each column are unique and that the identifiers and names are properly formatted as strings. The service is designed to catch potential issues early on, saving you time and frustration during development.


## Class ClientSizing

This component handles calculating the appropriate size of a position to take in a trade. It offers flexibility with different sizing methods like fixed percentages, Kelly Criterion, and Average True Range (ATR) based sizing.

You can also set limits to ensure your position sizes stay within defined boundaries, both minimum and maximum.

The `calculate` method takes trade parameters and returns the calculated position size, which is used by your trading strategy.  It's designed to give you control and insight into your position sizing approach.


## Class ClientRisk

ClientRisk helps manage risk across your trading strategies, ensuring they don't exceed defined limits. It’s like a safety net that sits between your strategies and the market, preventing them from taking actions that could lead to unwanted consequences.

It primarily focuses on controlling the maximum number of simultaneous positions across all strategies and allows for custom risk validations based on your specific needs. Think of it as a central control point for your trading activities, enabling analysis and coordination between different strategies.

The `checkSignal` method is key – it's the gatekeeper that determines whether a trading signal is allowed to proceed based on these risk parameters. If any validation fails, the signal is blocked.  `checkSignalAndReserve` takes this a step further, ensuring that validating a signal and reserving a spot in the system happens together securely, preventing race conditions in parallel strategies.

The `addSignal` and `removeSignal` methods are used to keep track of active positions – marking when a position is opened and closed respectively, ensuring the system always has an accurate view of the current trading landscape.  The system automatically saves and loads position data, but skips this step during backtesting. This class promotes consistent and controlled trading, especially when multiple strategies share the same risk profile.

## Class ClientFrame

The ClientFrame helps create the timeline of data your backtesting needs. It's responsible for generating arrays of timestamps representing the historical periods you're analyzing. To avoid unnecessary work, it cleverly caches these timelines, so it doesn’t recreate them if you need the same timeframe again.

You can easily control how frequently these timestamps are spaced, ranging from one minute to a whole day.  It also provides ways to run checks on the generated data and record information during the process. This component plays a crucial role in the backtesting process, working hand-in-hand with the core backtesting logic.

The `getTimeframe` method is the main tool here. It takes a symbol (like a stock ticker) and returns a promise that resolves to the array of dates representing that timeframe.  Remember that once generated, this timeframe will be saved in the cache.

## Class ClientExchange

This `ClientExchange` class is designed to connect your backtesting system to real-time or historical exchange data. Think of it as a bridge between your trading strategies and the market. It provides functions to retrieve historical and future candle data (price charts) for a specific trading pair and interval. You can also use it to calculate the VWAP (volume-weighted average price), a common indicator used by traders, or format prices and quantities to match exchange standards. 

Here's a breakdown of what it does:

*   **Data Retrieval:** It can fetch historical candle data going backward in time, and importantly, also get future candle data needed for backtesting strategies that rely on future information.
*   **VWAP Calculation:**  Calculates the VWAP, essentially giving you the average price a security has traded at throughout the day, weighted by volume.
*   **Formatting:** Formats price and quantity values correctly for different trading pairs, ensuring they adhere to the specific rules of the exchange.
*   **Flexible Data Fetching:** `getRawCandles` offers a lot of flexibility, letting you specify start and end dates, and even just a limit (how many candles you want).
*   **Order Book and Trades:** You can retrieve the current order book (showing bids and asks) and aggregated trade data, which represents combined trade information.

The system focuses on preventing "look-ahead bias" which is crucial for accurate backtesting – it ensures that strategies are not evaluated using data that wouldn't have been available at the time.  It does this by carefully controlling the time ranges used when retrieving data.  All its methods are optimized for memory efficiency by using prototype functions.

## Class ClientAction

The `ClientAction` component is the central piece for managing custom actions within your trading strategy. It essentially sets up and manages your action handlers, which are the pieces of code that handle specific events and integrate with external systems. Think of it as a conductor orchestrating your strategy's responses to different signals and conditions.

It handles the lifecycle of these action handlers, ensuring they’re properly initialized, events are routed to them, and that they're cleaned up when no longer needed. This makes it easy to add custom logic for things like updating state in a library like Redux, sending notifications via Telegram, or tracking performance metrics.

You don't typically interact with `ClientAction` directly; it’s used internally by the backtest-kit framework to integrate these custom action handlers.  It includes several methods like `signal`, `signalLive`, `signalBacktest` and others that act as entry points for different events, allowing your action handlers to react in a controlled and organized way. It uses a "singleshot" pattern for initialization and disposal, guaranteeing these actions happen only once.

## Class CacheUtils

CacheUtils provides a way to automatically cache the results of your functions, speeding up your backtesting process. It’s designed to be easy to use, automatically managing the caching for you.

Think of it as a helper that remembers what a function returned for specific inputs, so it doesn't have to recalculate it every time.

The `fn` method lets you cache regular functions based on time intervals (like 1-minute or 1-hour candles). This means the cache will refresh when the interval changes.

The `file` method is similar but caches the results to a file, which is great for larger datasets and persisting results across sessions. This file-based cache is stored in a predictable location.

If you need to completely reset the cache for a specific function, you can use the `dispose` method.  You can also clear *all* caches with `clear`, which is helpful when your working directory changes. Lastly, `resetCounter` ensures file caches start fresh when you need to.



Each function you want to cache gets its own isolated cache, so changes to one function's cache won't affect others.

## Class BrokerBase

This `BrokerBase` class is the foundation for connecting your trading strategies to real exchanges. It's designed to be extended, allowing you to build adapters for different brokers or exchanges without needing to write everything from scratch. Think of it as a starting point – you'll inherit from this class and provide the specific logic for interacting with your chosen exchange.

The class provides default actions that simply log what's happening, so you can focus on the exchange-specific parts. You’ll use it to handle things like placing orders, canceling orders, managing stop-loss and take-profit levels, and sending notifications.

Before your strategy starts, you'll use `waitForInit()` to set up connections – this is where you'd log in to the exchange or load configuration data. Then, as your strategy runs, you'll override specific methods like `onSignalOpenCommit` (when to open a new position) or `onPartialProfitCommit` (when to take some profits) to execute the corresponding actions on the exchange.

Various event methods are called when certain actions need to be performed like opening a position, closing a position, taking partial profits, setting stop-loss/take-profit levels and adding to a position via averaging. Each of these methods provides a default implementation that logs the event, but you would override this to perform the action on the exchange. There’s no need to override methods you don't use; the defaults provide a basic logging framework.

## Class BrokerAdapter

The `BrokerAdapter` acts as a gatekeeper for interacting with your brokerage, ensuring everything goes smoothly before any changes are made to your core trading system. It's essentially a safety net and a central point of control.

Think of it this way: it intercepts actions like opening/closing positions, setting stop-loss orders, or averaging into a trade, to make sure everything's valid *before* those actions are applied. If something goes wrong during this process, the trade won't happen, preventing potentially damaging mistakes.

During backtesting, these actions are skipped entirely—it's like a silent observer. In live trading, they're passed on to your actual brokerage connection.

You register your brokerage adapter to this system, and then activate it to enable the automatic handling of signal opening and closing. You can also manually trigger the other actions through specific methods. If you want to refresh your brokerage connection, you can clear its internal cache to ensure you're working with the latest settings.


## Class BreakevenUtils

The BreakevenUtils class helps you analyze and report on breakeven events in your trading system. It’s like a central place to pull together data about when your strategies hit breakeven points.

You can use it to get statistical summaries of these events, giving you insights into how often your strategies reach breakeven and other key metrics.

It can also create detailed markdown reports, presenting a table of all breakeven events for a particular symbol and strategy, including information like entry price, current price, and timestamp.

Finally, it allows you to automatically save these reports as markdown files, named according to the symbol and strategy, making it easy to review and share your results. The system keeps track of up to 250 breakeven events for each symbol-strategy combination.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals become profitable. It listens for these "breakeven" moments – when a signal has earned back its initial investment – and records them in a database.

Think of it as a logbook specifically for tracking when your strategies start making money.

It utilizes a "logger" to aid in debugging and a special "tickBreakeven" function to manage the recording of these events.

To start using it, you'll subscribe to the breakeven signal emitter; this ensures you only register for the signal once. Make sure to unsubscribe when you no longer need the service to prevent unnecessary database writes.

## Class BreakevenMarkdownService

This service helps you automatically create and save reports detailing breakeven events for your trading strategies. It listens for breakeven signals and organizes them, creating easy-to-read markdown tables.

The service generates reports for each symbol and strategy combination, storing them on disk so you can review performance over time. It also provides overall statistics about the total number of breakeven events.

You can subscribe to receive these signals, and the service keeps track of everything for you.  It's designed to be flexible, allowing you to retrieve data, generate reports, and clear data as needed, all while keeping the data organized and isolated for each specific trading setup. You can even specify which data you want to clear, or clear everything at once.

## Class BreakevenGlobalService

This service acts as a central point for managing breakeven calculations within the system. It's designed to be a simple intermediary, forwarding requests to a more detailed connection service while also keeping a record of what's happening through logging.

Think of it as a gatekeeper: it’s injected into the core strategy logic and handles all breakeven-related tasks, ensuring everything is logged and validated.

It relies on several other services, like validation and schema services, to confirm that the strategy and associated configurations are correct before any action is taken.

The `check` method is key – it determines if a breakeven event should occur and triggers it if needed, while `clear` handles resetting the breakeven state when a signal closes. This separation of concerns makes managing and monitoring breakeven operations much easier.

## Class BreakevenConnectionService

The BreakevenConnectionService helps keep track of breakeven points for trading signals. It’s designed to manage and create instances of ClientBreakeven objects, ensuring there's one for each unique signal.

Think of it as a central hub that builds and oversees these breakeven trackers. It reuses these trackers – memoizing them – so it doesn’t have to create new ones every time.

It works closely with other services, getting information from a logger and action core.

The main functions it provides are checking for breakeven triggers and clearing old breakeven data when a signal is closed. This process involves retrieving or creating a ClientBreakeven instance, doing the actual check or clear operation, and then cleaning up the memoized instance to prevent memory issues. It provides a way to efficiently handle and manage breakeven calculations for trading signals.

## Class BacktestUtils

This class offers helpful tools for backtesting trading strategies. Think of it as a central hub for running and analyzing backtests.

It provides functions to run backtests, either normally or in the background (useful if you just want to log results). You can also get information about a strategy's current position, like its pending signals, cost basis, and potential profit/loss.

Here’s a breakdown of what it does:

*   **Running Backtests:** The `run` and `background` functions handle the core backtesting process. `run` gives you results step-by-step, while `background` is for quieter, less intrusive runs.
*   **Signal Details:** Functions like `getPendingSignal`, `getTotalPercentClosed`, and `getPositionPnlPercent` let you inspect the state of a position. You can see what signals are active, how much of the position is closed, and calculate PnL.
*   **Position Metrics:**  Get detailed information about a position, including entry prices (`getPositionLevels`), partial close history (`getPositionPartials`), and estimated duration (`getPositionEstimateMinutes`).
*   **Managing Signals:** Control the backtest by canceling scheduled signals (`commitCancelScheduled`) or prematurely activating a scheduled signal (`commitActivateScheduled`).
*   **Adjusting Position:** Functions like `commitTrailingStop` and `commitAverageBuy` allow you to simulate adjustments to a trade during the backtest.
*   **Reporting & Analysis:**  Generate reports (`getReport`, `dump`) to summarize backtest results. You can also view a list of active backtests (`list`).



In essence, this class simplifies working with backtests, allowing you to get information and perform actions without diving deep into the backtest framework's core components.

## Class BacktestReportService

The BacktestReportService helps you keep a detailed record of what’s happening during your backtests. It essentially acts as a meticulous observer, tracking the lifecycle of each trading signal – from when it's idle, to when a trade is opened and active, and finally when it’s closed.

It works by listening for these signal events and carefully noting down all the relevant details for each event, including the type of event and the signal’s specifics. This data is then saved to a database, allowing you to analyze your strategy's behavior and hunt for any bugs or areas for improvement.

You can tell it to start listening for these events using `subscribe`, which gives you a way to stop listening later using the function it returns.  The `unsubscribe` method provides a direct way to stop listening if you've already subscribed.  It’s designed to prevent accidental duplicate subscriptions, ensuring accurate and reliable data collection.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your backtesting results. It works by listening for trading signals during a backtest and keeping track of how those signals performed.

It automatically organizes data for each strategy and trading symbol, creating separate storage for each combination to keep things tidy. You can then request these reports as markdown tables that show signal information.

These reports are saved to disk in a structured directory, making it easy to review and analyze your backtesting performance.

You can also clear out old backtest data to keep things clean, or request all the statistics and reports for a specific symbol and strategy.

To get started, you’ll need to subscribe to the backtest signal emitter so it can monitor the trading activity and start accumulating the data. Make sure to unsubscribe when you’re finished with the backtest to avoid unnecessary processing.

## Class BacktestLogicPublicService

This service helps you run backtests in a structured way, automatically handling important information like the strategy, exchange, and frame being used. It simplifies the process by taking care of passing this context data where it's needed, so you don't have to manually specify it every time.

It manages the underlying backtest logic and other support services, like time management and schema handling.

The `run` method is the key feature, letting you execute a backtest for a specific symbol. It provides results as a stream of signals, which represent events like orders being opened, closed, or cancelled, all while seamlessly incorporating the context information.


## Class BacktestLogicPrivateService

The BacktestLogicPrivateService is the engine that drives the backtesting process, focusing on efficiency and real-time data streaming. It works by first gathering the available timeframes, then methodically processing each one. When a trading signal appears (like a buy or sell instruction), it retrieves the necessary historical data (candles) and executes the backtest logic. The process then pauses, skipping forward in time until the signal is resolved – a trade is closed.

The beauty of this system is its memory efficiency. Instead of storing all the results in a large array, it delivers the results as they become available, one at a time, using an asynchronous generator. This makes it incredibly useful for long backtests where memory usage is a concern. You also have the flexibility to halt the backtest prematurely if needed.

The service relies on several core components: the strategy core (for executing trading decisions), the exchange core (for interacting with exchange data), the frame core (for managing timeframes), and a logger to track activity. It’s designed to be a private service, meaning it's not intended for direct external interaction. You interact with it through its `run` method, which starts the backtest for a specific trading symbol and provides a stream of results.

## Class BacktestCommandService

This service acts as a central point for initiating and managing backtests within the system. It provides a simplified way to access and utilize backtesting capabilities, designed to be easily integrated into other parts of the application.

The service relies on several other services, like those handling strategy schemas, risk and action validation, and the core backtest logic itself. These dependencies are injected during setup.

The `validate` property is an important optimization; it checks the strategy and its risk settings to ensure everything is correct. This validation is cached, so the same checks aren’t repeated unnecessarily for the same strategy.

The `run` function is the primary tool for performing a backtest. You provide it with a symbol (like a stock ticker) and some context - details such as the strategy name, exchange, and frame being used - and it will execute the backtest and return a series of results detailing how trades occurred.


## Class ActionValidationService

The ActionValidationService helps keep track of all your action handlers, ensuring they're available when you need them. Think of it as a central registry and quality control system for your actions.

You can add new action handlers using the `addAction` method, essentially registering them with the service. Before using an action, you can call `validate` to confirm it exists and is properly configured, preventing errors later.

To see what action handlers you've registered, the `list` method provides a handy overview. The service also uses a technique called memoization, which means it remembers the results of validations to make things run faster.


## Class ActionSchemaService

The ActionSchemaService is like a librarian for your trading actions, making sure everything is organized and correct. It keeps track of all your action schemas, which define how different parts of your trading system interact.

It ensures that these schemas are type-safe, meaning they follow a specific structure and use the correct data types. The service also checks that your action handlers – the pieces of code that actually *do* the actions – only use approved methods.

You can register new action schemas, which the service will then validate. 

It also allows you to update existing schemas—imagine changing a detail without needing to start from scratch. Finally, the service provides a way to retrieve these action schemas when they are needed by other parts of the system.


## Class ActionProxy

The `ActionProxy` acts as a safety net when using custom action handlers in your trading strategies. It’s designed to prevent errors in your custom code from crashing the entire backtesting or live trading system.

Think of it like a bodyguard for your code; it catches any errors that might occur within your custom handlers. Instead of a crash, the error gets logged and reported, allowing the system to continue running.

Here’s a breakdown of what it does:

*   **Error Handling:** It automatically catches errors within initialization (`init`), signal generation (`signal`, `signalLive`, `signalBacktest`), and other event handlers like `breakevenAvailable`, `partialProfitAvailable`, `pingScheduled`, `pingActive`, `pingIdle`, and `riskRejection`.
*   **Safe Execution:** It handles cases where your action handler doesn't implement all required methods gracefully, avoiding unexpected behavior.
*   **Factory Pattern:** You create `ActionProxy` instances using `fromInstance`, ensuring consistent error handling.
*   **Special Case:** The `signalSync` method is an exception to the error-catching rule; it allows errors to propagate to ensure critical synchronization issues are immediately addressed.
*   **Cleanup:** It also safely handles cleanup operations with `dispose`.

Essentially, `ActionProxy` lets you use your own custom code with confidence, knowing that any errors will be handled without disrupting the overall trading process. It is used to manage the lifecycle of actions.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within your trading strategies. It's responsible for coordinating how actions are executed, ensuring they're valid, and handling different signal events.

Essentially, it takes the list of actions defined in your strategy's schema, verifies everything is set up correctly, and then delivers signals (like market ticks, breakeven events, or scheduled pings) to the appropriate actions in a pre-defined order.

Here's a breakdown of what it does:

*   **Initialization:**  When a strategy starts, `initFn` makes sure each action is ready to go, loading any necessary data.
*   **Signal Routing:**  `signal`, `signalLive`, `signalBacktest` handle delivering market data and other events to the right actions based on whether it’s a live trade or a backtest.
*   **Event Handling:**  Specific methods like `breakevenAvailable`, `partialProfitAvailable`, and `pingScheduled` are dedicated to forwarding particular events to their corresponding actions.
*   **Validation:** `validate` ensures everything – the strategy itself, the exchange, the frame, and all actions – are properly configured before anything runs. It remembers previous validations to avoid unnecessary checks.
*   **Cleanup:** `dispose` cleans up the actions when a strategy finishes.
*   **Synchronization:** `signalSync` attempts to coordinate actions to ensure consistency.

The `clear` function gives you a way to wipe action data, either globally or specifically for a particular action and scenario. It relies on several services for validation and action management.

## Class ActionConnectionService

The `ActionConnectionService` is responsible for directing different types of events (like signals, breakeven notifications, and ping events) to the correct action handlers within your trading strategies. It acts as a router, ensuring each event is processed by the appropriate `ClientAction` based on its name, the strategy using it, and the specific trading frame. 

To improve performance, it cleverly caches these `ClientAction` instances, meaning it only creates them once for a given combination of action name, strategy, and frame. This helps prevent redundant initialization.

The service relies on several other components like a logger, schema service, and core strategy service to function correctly. 

You’ll find several methods for handling different event types—`signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`, ping related calls and more—each routing the relevant data to the associated action.  Finally, the `dispose` and `clear` methods provide ways to clean up resources when actions are no longer needed.

## Class ActionBase

This class, `ActionBase`, acts as a foundation for creating custom handlers to extend the backtesting framework's functionality. Think of it as a starting point for adding your own logic to how your strategies interact with the outside world, like sending notifications or collecting data.

It simplifies things by providing default implementations for various event handling methods, so you only need to focus on the parts you actually want to customize. You can use it to manage things like real-time notifications, track events, collect analytics, or trigger custom actions.

When you create an instance, it’s given information about the strategy, frame, and action it's handling. The lifecycle includes an `init` method for setup, a series of event handling methods (`signal`, `signalLive`, `signalBacktest`, etc.) for responding to different trading scenarios, and a `dispose` method to clean up when the strategy is done.

The event methods are triggered by specific occurrences, like a new signal, a breakeven level being reached, or a profit milestone being hit.  Each of these methods has a default logging implementation, but you can override them to perform custom actions based on these events, such as sending a message or updating a database. Finally, `dispose` provides a guaranteed opportunity to release any resources you’ve acquired during the strategy’s execution.
