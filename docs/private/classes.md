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

The WalkerValidationService helps you keep track of and double-check your parameter sweep setups, often used for optimizing trading strategies. It acts like a central record, letting you register different parameter combinations (walkers) you want to test. 

Before you run a test with a specific parameter set, this service makes sure that the set actually exists, preventing errors and ensuring smooth operation.

To make things even faster, it remembers previous validation checks, so it doesn't have to repeat them unnecessarily.

You can use it to add new parameter setups, verify existing ones, and get a complete list of all the parameter sweeps you've configured.

## Class WalkerUtils

WalkerUtils simplifies working with walkers, which are used to analyze and compare trading strategies. It acts as a central point for running, stopping, and retrieving information about these walkers.

Think of it as a helper tool that handles the behind-the-scenes complexities of interacting with walkers, like automatically figuring out the correct settings for each one.

It lets you easily:

*   Run a walker analysis on a specific symbol, providing context like the walker's name.
*   Run walkers in the background for tasks like logging or callbacks without needing to handle the progress updates yourself.
*   Stop a walker, preventing it from generating any new signals while allowing existing ones to finish.
*   Retrieve the complete data and a formatted report summarizing the walker's results.
*   Save that report directly to a file.
*   See a list of all the walkers currently running, their status, and details.

WalkerUtils uses a special instance management system ensuring that each combination of symbol and walker has its own dedicated processing. It's designed to be easily accessible and used throughout your application.

## Class WalkerSchemaService

The WalkerSchemaService helps keep track of different schema definitions used for your walkers. It's like a central place to store and manage these schemas, ensuring they're consistent and well-typed.

It uses a special registry to store these schemas safely. 

You can add new schemas using the `addWalker()`-like function, and retrieve them later by their name.

Before a new schema is added, the service performs a quick check to make sure it has all the necessary components.

If a schema already exists, you can update parts of it without replacing the entire definition.

Finally, you can easily look up a schema using its name to get the full definition.


## Class WalkerReportService

WalkerReportService helps you keep track of your strategy optimization experiments. It acts like a recorder, capturing the results of your strategy tests as they happen.

The service listens for updates from the optimization process, storing key data like metrics and statistics. It remembers the best-performing strategy seen so far and helps visualize how your optimization is progressing.

You can tell it to start listening and it will give you a way to stop listening later on. It avoids accidentally receiving events more than once. If you stop listening, it won't bother you again. 

It uses a logging service for outputting debugging information.


## Class WalkerMarkdownService

The WalkerMarkdownService helps you automatically create and save detailed reports about your trading strategies. It listens for updates from your trading simulations (walkers) and keeps track of how each strategy is performing. 

It builds these reports using markdown tables, making it easy to compare different strategies side-by-side. The reports are saved as files on your computer, organized neatly within a specific folder.

You can subscribe to receive these walker updates, and unsubscribe when you no longer need them. The service also provides ways to retrieve specific data points, generate customized reports, and clear the accumulated data when needed. Each walker gets its own dedicated storage space to keep results organized. You can clear data for a specific walker or clear all data at once.

## Class WalkerLogicPublicService

This service helps coordinate and manage the execution of walkers, which are essentially automated trading processes. It builds upon a private service, adding a layer of convenience by automatically passing along important information like the strategy name, exchange, frame, and walker identifier between different parts of your system.

Think of it as a conductor ensuring all the pieces of a trading simulation work together smoothly and consistently.

The `run` method is your primary way to interact with this service; it takes a symbol (like a stock ticker) and some context data and then executes the walkers, generating results as it goes. This is used for running backtests and comparing different trading strategies. You don't have to manually pass context details—it's handled for you.

## Class WalkerLogicPrivateService

The WalkerLogicPrivateService helps manage and compare different trading strategies, like orchestrating a series of tests. It keeps you informed as each strategy runs, providing updates along the way. You'll see real-time tracking of the best-performing metric, ensuring you're always aware of which strategy is leading. Finally, it compiles all the results and ranks them, giving you a clear picture of how each strategy performed. 

It works by using the BacktestLogicPublicService behind the scenes to actually run the backtests.

The service has components to manage logging, backtest logic, Markdown formatting, and strategy schema.

The `run` method is the core function; it takes a symbol, a list of strategies to test, the metric you want to optimize for, and some contextual information. It then runs those strategies one after another and gives you progress updates as it goes.

## Class WalkerCommandService

WalkerCommandService acts as a central point of access for the walker functionality within the backtest-kit framework. Think of it as a convenient helper, simplifying how different parts of the system interact. 

It essentially wraps around more detailed logic to make it easier to use in various scenarios, particularly when using dependency injection to manage components.

The service relies on several other services internally, like those handling validation and logic for walkers, strategies, exchanges, and frames.

You can use the `run` method to execute a walker comparison, specifying the symbol you're interested in and providing context information about the walker, exchange, and frame involved. This method returns a generator that allows you to process the results incrementally.


## Class TimeMetaService

The TimeMetaService helps keep track of the latest timestamp for each symbol, strategy, exchange, and frame combination, essentially remembering when a candle closed. It’s especially useful when you need to know the current time outside of the regular trading tick cycle, like when executing commands between ticks.

It acts as a central memory for these timestamps, storing them in individual, cached records that are automatically updated as new ticks come in. If a timestamp hasn’t been received yet, it will wait briefly before giving up.

This service is designed to be simple to use and efficient. It automatically cleans up its cached timestamps when needed, which is important for ensuring you’re always working with the most current data. You can clear all of them or just a specific one if you’re starting a new backtest or trading session.

## Class SystemUtils

The `SystemUtils` class helps keep your backtesting sessions separate and clean. It prevents one backtest from accidentally messing with the settings or data of another.

Essentially, it creates a "snapshot" of the system's event listeners. This snapshot effectively clears those listeners temporarily. 

After a backtest is complete, you can use the snapshot to restore the listener state back to its original condition, ensuring a pristine starting point for the next test. This prevents conflicts and makes your backtesting environment much more reliable.


## Class SyncUtils

The SyncUtils class helps you understand what's happening with your trading signals by providing ways to access and review signal lifecycle information. It gathers data about signal openings and closings, keeping track of events like order fills and position exits. 

You can use it to get summaries of your trading activity, including statistics like the total number of signals, opens, and closes. It can also create detailed reports in markdown format, which include tables showing specific event details, like signal IDs, actions taken, prices, profit/loss information, and timestamps. 

Finally, this class allows you to easily save those reports to files so you can review them later, with the filenames organized by symbol, strategy, and whether the test was a backtest or live trade.

## Class SyncReportService

The SyncReportService helps you keep a detailed record of your trading signals. It watches for events related to signals – when they start and when they finish – and stores this information in a report file.

Think of it as a digital trail, useful for reviewing how your trades performed and understanding why decisions were made.

It keeps track of when a signal is initiated (like a limit order being filled) and when it’s closed (a position being exited), recording important details like profits and loss, and the reason for closing. 

To ensure you don’t accidentally duplicate these records, it only allows one subscription at a time. You can easily start and stop this tracking process using the `subscribe` and `unsubscribe` methods.

## Class SyncMarkdownService

This service helps you create detailed reports about your trading signals, specifically focusing on when they open and close. It automatically gathers information about each signal event, organizes it, and presents it in a clear, readable markdown format.

Think of it as a record-keeper for your trading activity, tracking the lifecycle of each signal.

Here's a breakdown of how it works:

*   **Keeps Track of Events:** It listens for signals opening and closing and stores information about each one, grouped by the symbol, strategy, exchange, and timeframe you're using.
*   **Generates Reports:** It compiles all the signal data into a markdown table, showing key details like when the signal opened, closed, and any reasons for closing. It also includes summary statistics like the total number of signals, opens, and closes.
*   **Saves Records:** These reports are saved to disk, making it easy to review your trading history and identify any patterns or issues.
*   **Subscription and Unsubscription:** You subscribe to receive these signal events, and when you are done, you unsubscribe, clearing all the accumulated data.
*   **Clearing Data:** You can either clear all the stored data, or target specific combinations of symbol, strategy, exchange, and timeframe to clear only those events.



You can request reports for specific combinations of symbol, strategy, exchange, and timeframe, view the raw data, or automatically save the reports to disk.

## Class StrategyValidationService

This service helps you manage and check your trading strategies to make sure they're set up correctly. It keeps track of all the strategies you've defined and verifies that everything related to them – like risk profiles and actions – is also valid. To make things faster, it remembers the results of validations so it doesn't have to repeat the same checks over and over.

You can add new strategies using the `addStrategy` method, which registers them for validation. The `validate` method lets you test individual strategies to confirm their setup. If you need a complete list of all the strategies you're using, the `list` method provides that. The service also depends on other validation services for risk and actions, and uses a map to store strategy information internally.

## Class StrategyUtils

StrategyUtils helps you analyze and report on your trading strategy's performance. It's like a central hub for gathering information about what your strategies are doing.

It provides ways to extract key statistics, such as how often different actions (like closing positions or setting stop-losses) are triggered.

You can also generate detailed reports in markdown format that summarize all the events a strategy experiences, displayed in a clear, organized table.

Finally, it allows you to easily save these reports to files, organized by symbol, strategy name, and other relevant information, so you can review them later. The reports include summaries of action counts to give you a quick overview.

## Class StrategySchemaService

The StrategySchemaService acts as a central place to store and manage different strategy schema definitions. It uses a special type-safe system to keep track of these schemas.

You can add new strategies to the registry using the `addStrategy()` function (though it’s internally represented as `register`). To find a specific strategy, you simply ask for it by name using the `get()` function. 

Before a strategy is added, it’s checked to make sure it has all the necessary information in the expected format with `validateShallow()`.  

If a strategy already exists, you can update parts of it, rather than replacing the entire definition, through the `override()` function. The `loggerService` provides access to context and logging functionalities within the service. The `_registry` property holds the actual strategy schema storage.

## Class StrategyReportService

This service is designed to keep a detailed record of what your trading strategies are doing, writing each action directly to files for auditing purposes. Think of it as a persistent logbook for your strategies, capturing events like canceling orders, closing positions, taking profits, and adjusting stops.

To start using it, you need to "subscribe" – this turns on the logging. Then, as your strategies execute, you’ll use the provided functions (like `cancelScheduled`, `closePending`, `partialProfit`, etc.) to record specific events. These functions pass information about the trade, like the symbol, price, and profit/loss data, to be included in the log.  Finally, when you're done, you "unsubscribe" to stop the logging.

Unlike some other reporting systems that hold information in memory, this service writes each event as it happens, providing a reliable audit trail of strategy actions. The `subscribe` and `unsubscribe` calls are managed to prevent multiple subscriptions running at once.

## Class StrategyMarkdownService

This service helps you keep track of what your trading strategies are doing and create easy-to-read reports. It acts as a central collector for different events triggered by your strategy, like canceling scheduled orders, closing positions, or adjusting take profit levels.

Think of it as a temporary holding area for your strategy's actions, instead of writing each action to a file immediately. This allows for better organization and more efficient reporting, especially when dealing with lots of trades.

To start using it, you need to "subscribe" to begin collecting events. Then, it automatically records these events as your strategy runs. When you're ready, you can use the `getData` method to get raw statistics or the `getReport` method to produce a nicely formatted Markdown report. Finally, when finished, "unsubscribe" to stop recording and clear the collected data.

It also has helpful features like creating a cached storage for events and allowing you to choose which details to include in your reports. You can even save these reports directly to files.

## Class StrategyCoreService

This class, `StrategyCoreService`, is a central hub for managing trading strategies within the backtest framework. It acts as a bridge between various services, injecting relevant context like the trading symbol, time, and backtest settings into different operations. Think of it as an orchestrator, handling core strategy logic and providing access to key information about a trading position.

It includes utilities for validating strategies, retrieving pending signals, calculating position statistics (like total cost, percentage closed, P&L), and providing methods to manipulate the active position, such as closing it, adjusting stops, or adding average buy orders. It also manages state by caching strategy instances for efficiency and offers methods for disposal and clearing.  Essentially, it’s your go-to place for interacting with and monitoring a live or backtested trading strategy.

Key capabilities include:

*   **Signal Management:** Fetching pending or scheduled signals, determining if a signal exists, and retrieving associated details.
*   **Position Metrics:** Calculating costs, P&L, entry prices, and DCA information for open positions.
*   **Position Control:** Methods for closing, adjusting, and modifying active trading positions (e.g., partial profits/losses, trailing stops).
*   **State Management:** Handling caching of strategies and providing cleanup mechanisms.
*   **Validation:** Ensuring strategies are properly configured and risk parameters are valid.

## Class StrategyConnectionService

The StrategyConnectionService acts as a central manager for your trading strategies, ensuring they're routed to the correct implementation based on the symbol and strategy name. Think of it as a smart switchboard connecting your trading logic to the right place.

It efficiently handles strategy operations – like calculating signals, managing positions, and calculating profits – by caching strategy instances for reuse. This improves performance.

Before anything happens, the service makes sure the strategy is properly initialized.  It supports both live trading ("tick") and backtesting ("backtest") operations.

Here's a quick look at some key functionalities:

*   **Retrieving Strategy Information:** You can use `getStrategy`, `getPendingSignal`, `getTotalPercentClosed`, and similar functions to get details about a specific strategy's status, like the current signal or position details.
*   **Position Management:** Functions like `partialProfit`, `partialLoss`, `trailingStop`, and `breakeven` allow you to adjust and manage the active positions.
*   **Controlling the Strategy:**  You can use `stopStrategy` to pause a strategy's signal generation and `dispose` to clean up resources.
*   **Scheduled Signals:** Features like `cancelScheduled` and `activateScheduled` deal with automated signal activations.

Essentially, it provides a consistent and efficient way to work with and manage your trading strategies.

## Class StorageLiveAdapter

The `StorageLiveAdapter` is designed to manage how your trading signals are stored, offering flexibility in where and how they're kept. Think of it as a central hub that can connect to different storage solutions like persistent disk storage, in-memory storage, or even a dummy adapter for testing. 

It uses an adapter pattern, meaning you can easily swap out the underlying storage mechanism without changing the rest of your code. The default is to use persistent storage, but you can quickly switch to memory storage or a dummy adapter if needed.

The adapter provides methods for handling various signal events (opened, closed, scheduled, cancelled) and retrieving signals by ID or listing them all. It also keeps track of signal activity through ping events, updating timestamps.

You can change the storage backend using `useStorageAdapter`, `useDummy`, `usePersist`, or `useMemory`, allowing you to customize storage behavior on the fly. If your base path changes during strategy runs, you can clear the cached instance using `clear` to ensure a fresh start with the updated path.

## Class StorageBacktestAdapter

The `StorageBacktestAdapter` provides a flexible way to manage how trading signals are stored during backtesting. It uses a design pattern that lets you easily swap out different storage methods without changing your core backtesting logic. 

You can choose between different storage options: persistent storage (saving signals to disk), in-memory storage (keeping signals only in memory), or a dummy adapter (which effectively ignores all storage operations).  The default is persistent storage.

This adapter handles various events related to signals – when they're opened, closed, scheduled, or cancelled – by passing those actions on to the currently selected storage method. It also allows you to find signals by their ID and list all stored signals.

The `useStorageAdapter` method allows you to specify the exact storage implementation you want to use, while `useDummy`, `usePersist`, and `useMemory` offer shortcuts to quickly switch between common storage options.  Finally, `clear` resets the adapter to the default in-memory storage and is particularly useful when the working directory changes.

## Class StorageAdapter

The StorageAdapter handles storing both signals from backtesting and live trading. It automatically keeps track of new signals as they come in by listening for updates.

You can easily access signals whether they originated from a backtest or are coming in live. 

To prevent issues with multiple subscriptions, it uses a "single shot" approach, ensuring it only subscribes once. 

If you need to stop the storage process, you can disable it which will unsubscribe from all signal sources.  It's safe to disable and re-enable multiple times.

You can search for a specific signal using its ID, or get lists of all signals from either your backtest data or live data.

## Class StateLiveAdapter

The StateLiveAdapter helps manage and store the state of your trading strategies, allowing for flexibility in how that state is handled. Think of it as a central hub for keeping track of important information about your trades.

It's designed to be easily customized, letting you swap out the storage method—you could use a file on your computer (the default), keep everything in memory for faster access, or even use a "dummy" version that doesn’t save anything.

The adapter is particularly useful for scenarios like LLM-driven trading rules, where you might want to automatically exit a trade if it hasn't performed as expected after a certain time. It remembers crucial data like peak performance and how long a trade has been open, even if your application restarts.

You can switch between different storage methods quickly using handy functions like `useLocal`, `usePersist`, and `useDummy`.  `disposeSignal` is used to clean up old data when a signal is completed. Finally, `clear` ensures a fresh start when your working directory changes.

## Class StateBacktestAdapter

The `StateBacktestAdapter` helps manage and store information about your trading strategy’s performance during backtesting. Think of it as a central hub for tracking key metrics.

It’s designed to be flexible, allowing you to easily swap out how and where this data is stored – whether in memory, on disk, or even just discarded for testing purposes. The default setting is an in-memory storage, meaning data isn't saved permanently.

This adapter is especially useful for implementing complex trading rules, like those based on LLM (Large Language Model) analysis, where you need to monitor things like how long a position has been open and its peak profit/loss. It keeps track of these details (`peakPercent` and `minutesOpen`) for each trading signal.

You can easily change the storage mechanism using helper functions: `useLocal` for in-memory, `usePersist` for file-based storage, `useDummy` to discard data, or `useStateAdapter` to use a completely custom solution.

The `disposeSignal` function is important; it ensures old data related to a specific trading signal is cleared when that signal is no longer active. The `clear` method is helpful when your base directory changes, guaranteeing fresh state instances are created.

## Class StateAdapter

The StateAdapter acts as a central manager for your trading state, whether you're running a backtest or a live trading session. It makes sure that the state is properly managed and cleaned up when signals are no longer active, avoiding potential issues with stale data.

You can enable the state storage, and it will automatically handle subscribing to signal events. It also uses a clever mechanism to prevent accidental duplicate subscriptions.  Conversely, you can disable state storage.

To retrieve the current state for a specific signal, use the `getState` method.  Similarly, to update the state, use the `setState` method. Both of these methods automatically direct the operation to the appropriate environment – backtest or live – based on your provided parameters.

## Class SizingValidationService

The SizingValidationService helps you keep track of and ensure your position sizing strategies are set up correctly. Think of it as a central place to register your sizing methods, like fixed percentage or Kelly Criterion. 

It makes sure each sizing method you're using actually exists before you try to apply it, preventing errors.

To make things efficient, it also remembers the results of these checks, so it doesn’t have to re-validate them repeatedly. 

You can add new sizing methods using `addSizing`, check if a sizing method is valid with `validate`, and see a complete list of registered methods with `list`.

## Class SizingSchemaService

The SizingSchemaService helps you keep track of your sizing schemas in a structured and reliable way. It uses a special registry to store these schemas, making sure they're consistently formatted.

You can add new sizing schemas using the `register` method, and update existing ones using `override`. To get a specific sizing schema back, simply use the `get` method, providing the schema's name.

The service includes checks to make sure new schemas have the necessary properties and types before adding them to the registry, ensuring data integrity. This validation happens during the registration process.


## Class SizingGlobalService

The SizingGlobalService helps determine how much of an asset to trade, acting as a central hub for these calculations. It leverages other services to handle the complexities of sizing, like ensuring the calculations are valid and connecting to necessary data sources. This service is the engine behind how strategies decide how much to invest in each trade.

It's essentially a bridge between the strategy logic and the underlying systems that manage position sizing.

Here’s a breakdown of what it contains:

*   It uses a `loggerService` for tracking what's happening.
*   It relies on a `sizingConnectionService` to get the necessary data for calculations.
*   A `sizingValidationService` ensures the sizing calculations are reasonable and safe.
*   The core function, `calculate`, takes parameters about the trade (like risk tolerance) and calculates the resulting position size.

## Class SizingConnectionService

The SizingConnectionService helps manage how position sizes are calculated within the backtest-kit framework. It acts as a central hub, directing sizing requests to the correct sizing implementation based on a name you provide. 

This service remembers which sizing methods have already been set up, so it doesn’t have to recreate them every time you need them – this makes things faster. 

Think of it as a smart router for sizing calculations, handling the details of choosing the right method and managing resources efficiently.

The service uses the `sizingName` parameter to determine which sizing method to apply and caches the associated sizing configuration for performance. When calculating, it takes into account risk management considerations to determine the appropriate position size. If your trading strategy doesn’t have specific sizing configurations, you can use an empty string for the sizing name. 

It relies on other services, such as `loggerService` and `sizingSchemaService`, to handle logging and schema management related to sizing configurations.

## Class SessionLiveAdapter

This component provides a flexible way to manage and store data during live trading sessions. Think of it as a central hub that allows you to easily switch between different storage methods for your session data.

It uses an adapter pattern, allowing you to plug in various storage backends like in-memory storage (fast but temporary), file-system based storage (data survives restarts), or a dummy adapter for testing purposes where data isn't actually saved.

You can quickly switch between these storage options using convenient functions like `useLocal`, `usePersist`, and `useDummy`.  If you need something even more specific, you can provide your own custom storage implementation.

The system intelligently caches session data based on factors like the trading symbol, strategy name, exchange, and frame, so it only retrieves or updates data as needed.  If the directory where your strategies live changes, the `clear` function helps ensure that fresh instances are created to reflect those changes. You can retrieve and update session values through the `getData` and `setData` methods.

## Class SessionBacktestAdapter

This component, the SessionBacktestAdapter, provides a flexible way to manage data during backtesting. Think of it as a central hub for storing and retrieving information related to a specific trading strategy's performance. It's designed to be easily customized, allowing you to choose where and how that data is stored.

By default, it keeps everything in memory, which is fast but loses data when the backtest ends.  You can switch to a persistent storage option that saves data to disk, or even a dummy adapter that simply ignores all updates—useful for testing.

The adapter intelligently remembers these settings, so you don’t have to repeatedly configure them. It’s organized around a specific trading setup – a particular symbol, trading strategy, exchange, and timeframe.  

You have convenient shortcuts to quickly switch between these different storage methods: `useLocal`, `usePersist`, `useDummy`, and `useSessionAdapter` for entirely custom solutions.  If things change, like the working directory, you can clear the adapter's memory to ensure fresh data.

## Class SessionAdapter

The SessionAdapter acts as a central point for handling data storage, whether you're running a backtest or a live trading session. It intelligently directs requests to the appropriate storage mechanism – either for historical backtesting data or for real-time data during live trading. 

You can use `getData` to retrieve data associated with a specific signal, providing details like the strategy, exchange, and frame name, as well as whether the operation is part of a backtest.  Similarly, `setData` allows you to update the stored data for a signal, again specifying context and whether it's a backtest scenario.  Essentially, it simplifies the process of managing session data by abstracting away the complexities of knowing where the data actually resides.

## Class ScheduleUtils

The ScheduleUtils class helps you understand how signals are being handled and delivered over time. It acts as a central tool for monitoring and reporting on scheduled signals, making it easier to identify and address any issues.

You can use it to gather statistics about signals waiting to be processed, those that were cancelled, and to calculate metrics like cancellation rates and average wait times. 

This class also allows you to automatically create detailed reports in a human-readable markdown format, giving you a clear picture of signal processing performance for specific trading strategies.

Finally, it provides a simple way to save these reports directly to your file system, making it easy to keep track of signal delivery performance over time. The class is designed to be easy to use, providing a single, consistent way to access these functions.

## Class ScheduleReportService

This service is designed to keep a record of scheduled trading signals, storing information about when signals are scheduled, when they start processing, and when they are canceled. It’s like a logbook for your automated trading.

The service listens for events related to signals, specifically when they are initially scheduled, when they transition to an active state, and when they are cancelled. It calculates how long each signal takes from scheduling to either execution or cancellation, providing insights into potential delays.

You can tell the service to start listening for these signal events using the `subscribe` method, and it will automatically handle receiving and logging these events.  When you’re done tracking, the `unsubscribe` method stops the service from listening. It’s important to use the unsubscribe function that `subscribe` returns to cleanly stop event reception.

## Class ScheduleMarkdownService

This service automatically creates reports detailing scheduled trading signals, making it easy to track and analyze your strategies. It listens for when signals are scheduled or cancelled, then organizes this information for each strategy you're using.

The service generates clear, readable reports in markdown format that include all relevant event details, along with key statistics such as cancellation rates and average wait times. These reports are saved to your logs directory, allowing you to review performance over time.

You can easily retrieve the accumulated data or reports for specific strategies, or clear all the collected data if needed. The service is designed to be efficient, using storage that is isolated to each unique combination of symbol, strategy, exchange, frame, and backtest. Subscribing and unsubscribing to signal events is managed in a way to prevent accidental duplicate subscriptions.

## Class RiskValidationService

The RiskValidationService helps you keep track of your risk management configurations and make sure they're set up correctly. It acts as a central place to register all your different risk profiles – think of it as a catalog – and offers a quick way to verify that a specific risk profile exists before you try to use it in your trading strategies.

To improve performance, the service remembers the results of previous validations, so it doesn’t have to check every time.

Here's what you can do with it:

*   You can register new risk profiles using `addRisk`.
*   You can confirm a risk profile's existence using `validate`.
*   You can get a complete list of all registered profiles with `list`. 



The service also has a `loggerService` for tracking activity and a `_riskMap` used internally.

## Class RiskUtils

RiskUtils helps you analyze and understand risk rejection events within your trading system. Think of it as a reporting tool that gathers information about why trades were rejected.

It collects data about rejections, including when they happened, which asset was involved, the strategy used, the position size, and the reason for rejection.

You can use it to get statistical summaries of these rejections, showing you total counts and breakdowns by asset or strategy.

It can also create detailed markdown reports that present these rejection events in a table format, including details like the price at the time of rejection and the number of active positions. 

Finally, you can easily export these reports to files, making it simple to share your findings or keep a record of your risk management performance. The reports are saved with a clear naming convention using the symbol and strategy name.

## Class RiskSchemaService

The RiskSchemaService helps you keep track of your risk schemas in a safe and organized way. It utilizes a registry to store these schemas, ensuring type safety. 

You can add new risk profiles using the `addRisk()` method (referred to as `register` in the code), and then retrieve them later by their assigned name using `get()`. 

Before adding a risk profile, `validateShallow()` checks that all the necessary properties are present and of the correct type, helping prevent errors.

If a risk profile already exists, you can update it with new information using `override()`, applying only the changes you specify. The service also has a logger for monitoring and debugging.

## Class RiskReportService

This service helps you keep track of when risk management rejects trading signals. It's designed to capture those rejection events – the reason why a signal wasn't allowed – and save them for later review and analysis.

Think of it as a logbook for risk rejections.

It connects to a system that handles risk and listens for signals that are being rejected.  Each time a signal is rejected, the service records the details like the reason and the specifics of the signal.  This information gets stored in a database so you can understand why those rejections happened and identify potential areas for improvement.

To use it, you'll subscribe to the risk rejection events, and when you're finished, you'll unsubscribe.  The subscription process is designed to prevent accidental multiple subscriptions, ensuring a clean and reliable connection. If you’re already subscribed, unsubscribing will simply stop the process without errors.


## Class RiskMarkdownService

This service helps you create and store detailed reports about rejected trades due to risk management. It listens for rejection events, keeps track of them for each symbol and strategy you’re using, and then neatly organizes them into readable markdown tables. 

You'll get useful statistics, like the total number of rejections and how they're distributed across different symbols and strategies. The reports are automatically saved as files, making it easy to review and analyze your risk management performance.

To start using it, you subscribe to receive rejection events, and the service handles the rest – accumulating data and generating the reports. You can retrieve statistical data, generate reports, or even clear out the collected data when it's no longer needed. It's designed to manage reports for each unique combination of symbol, strategy, exchange, timeframe, and backtest setting, keeping everything organized.


## Class RiskGlobalService

This service, RiskGlobalService, is the central point for managing and validating risk limits during trading. It acts as a layer on top of the connection service, ensuring trades adhere to predefined rules.

It keeps track of validations to avoid unnecessary checks and provides logging for transparency.

You can use it to verify if a trade is permissible (`checkSignal`), or to validate and immediately reserve resources for a trade (`checkSignalAndReserve`), which is particularly important in concurrent environments to prevent conflicts.

When a trade is approved, you'll use `addSignal` to register it with the system. Conversely, `removeSignal` cleans up when a trade is closed. Finally, `clear` allows you to wipe out all or specific risk data as needed.

## Class RiskConnectionService

This service acts as a central hub for managing risk checks within your trading system. It ensures that risk assessments are routed to the correct specialized risk handler based on a specific identifier, `riskName`. Think of it as a dispatcher for risk-related tasks.

It's designed to be efficient, using a technique called memoization. This means it remembers previously used risk handlers, so it doesn't have to recreate them every time you need them, boosting performance.

The `getRisk` function is the key to getting things done - it's how you fetch the appropriate risk handler. It remembers which handlers it's already created by keeping track of the exchange and frame names used.

The `checkSignal` function is what actually determines if a trade is allowed based on risk limits. It looks at things like how much you've lost in the past (portfolio drawdown), how much of your capital is exposed to a single asset (symbol exposure), and the number of positions you hold.  If a trade violates these limits, the system will notify you.

There's also a more robust version called `checkSignalAndReserve`, which not only checks the risk limits but also secures a spot for the trade in a system that tracks active positions. This is particularly important in situations where multiple trades might be happening at once.

The `addSignal` and `removeSignal` functions are used for when a trade opens and closes, respectively. They register and deregister a trade signal with the risk management system.

Finally, `clear` allows you to completely wipe out the memoized risk handlers.


## Class ReportWriterAdapter

This component provides a flexible way to manage and store reports generated by your trading strategies. It uses an adapter pattern, meaning you can easily swap out the underlying storage mechanism without changing your core code.

The system keeps track of storage instances for different report types like backtest results or live trading data, ensuring that only one instance of each exists throughout your application's lifetime.  

You can customize which storage adapter is used by providing a constructor function; otherwise, it defaults to JSONL storage. Data is written asynchronously, and the storage is initialized only when you first attempt to write data.

There are helper functions to switch between different adapters, including one that effectively disables all reporting and another to reset the cached storage instances. This is particularly useful if your working directory changes during a strategy run. It’s designed to make structured logging and analytics a straightforward part of your trading workflow.

## Class ReportUtils

ReportUtils helps you control which parts of the backtest-kit framework are recording data for reports. Think of it as a way to turn on or off logging for specific activities like backtesting, live trading, or performance analysis.

The `enable` function lets you pick and choose which services you want to start recording data for. It sets up the logging, including important details for filtering and analysis, and it gives you a special function to call later that will completely stop all those recordings at once.  Remember to use that function when you're done, otherwise you might have memory issues.

The `disable` function allows you to stop logging for particular services without affecting others. It stops the logging, frees up resources, and doesn’t require a special cleanup function – it stops immediately.

## Class ReportBase

The `ReportBase` class helps you log trading events to files in a consistent, append-only format. It’s designed to write data as JSONL (JSON Lines) entries, one file per report type, making it easy to collect and analyze information about your backtests.

This class handles the file writing process efficiently, including creating the necessary directories and managing potential write errors, making sure data isn't lost. You can search through these files later based on criteria like the trading symbol, strategy used, exchange, or signal ID.

The `waitForInit` method sets up the file and writing stream just once, even if called multiple times. The `write` method is how you actually record events, adding them as JSON objects to the file, complete with relevant metadata and a timestamp. This provides a structured way to keep track of your trading activity for post-processing and analysis.

## Class ReportAdapter

The ReportAdapter helps manage how trading data and analytics are stored, offering flexibility to switch between different storage methods. It's designed to simplify structured logging and analytics within your backtesting framework.

Think of it as a central point for controlling where your reports are saved.

You can easily swap out the storage mechanism – for example, switching from a standard JSONL file to a different format or a temporary "dummy" adapter that simply discards data.

The framework intelligently memoizes storage instances, ensuring that you only create one storage instance per report type to optimize performance and resource usage. This avoids creating multiple instances of the same storage type.

The adapter also supports lazy initialization, meaning it only creates the storage when the first report is written.

If your working directory changes during a backtest run (for example, during iteration), the `clear` method ensures that the adapter re-initializes storage with the correct path. The `useJsonl` method is a convenient way to go back to the default JSONL based storage.

## Class ReflectUtils

This class, `ReflectUtils`, offers a way to track key performance metrics for your trading positions – things like profit, loss, and drawdown – during backtesting or live trading. Think of it as a tool for analyzing how your strategy is performing in real-time.

It provides methods to retrieve information such as unrealized profit and loss (both percentage and dollar amounts), the highest profit achieved, and the depth of drawdowns experienced. It also calculates how long a position has been active or waiting.

`ReflectUtils` is designed to be easy to use – it's a single, readily available instance—allowing you to quickly access these metrics.  The `backtest` parameter lets you use these functions in both simulated (backtest) and live trading environments.

Essentially, it's a central hub for position performance data, giving you the information needed to evaluate and refine your strategies.


## Class RecentLiveAdapter

This class helps manage and retrieve recently generated trading signals. It's designed to be flexible, allowing you to choose where your signals are stored – either persistently on disk or just in memory for quicker access. 

The class uses an adapter pattern, letting you easily swap out the storage mechanism without changing much code.  By default, it uses persistent storage so your signals are saved even if the application restarts.

You can easily switch to in-memory storage if you prefer, which is useful for testing or when you don't need the signals to survive application restarts.

The class provides methods for getting the most recent signal, calculating how long ago it was created, and handling active ping events.  It also provides a way to completely reset the storage to the default persistent adapter.


## Class RecentBacktestAdapter

This component, `RecentBacktestAdapter`, acts as a bridge to store and retrieve recent trading signals. It’s designed to be flexible, allowing you to easily switch between storing signals in memory or on disk.

By default, it uses an in-memory storage, but you can switch to a persistent storage option that saves your data to disk.

It provides simple methods to get the latest signal, calculate the time since a signal was created, and manage the underlying storage mechanism. This adapter handles incoming "active ping" events and passes them on to the currently configured storage.

You can easily change the storage adapter it uses, swapping between memory and persistent options, or even providing a completely custom storage solution. It also includes a way to completely reset the adapter to the default memory-based configuration.

## Class RecentAdapter

The RecentAdapter is designed to keep track of the most recent trading signals, whether you’re running a backtest or a live strategy. It automatically updates its records by listening for incoming data.

You can easily retrieve the latest signal for a specific trading pair and strategy configuration using the `getLatestSignal` function. 

If you need to know how long ago the last signal was received, the `getMinutesSinceLatestSignalCreated` method provides that information.

To manage its connection to the data stream, the RecentAdapter offers `enable` to start tracking signals and `disable` to stop. A helpful feature prevents it from subscribing to data multiple times.



It's designed to be cleaned up properly when you're finished with it, ensuring no lingering subscriptions.

## Class PriceMetaService

The PriceMetaService helps you get the current market price for a trading symbol, strategy, exchange, and timeframe. Think of it as a central place to find up-to-date price information, especially when you need it outside of the usual trading tick cycle. 

It keeps track of prices in a special way, creating a memory of each price it knows about.  These prices are automatically updated after each trading tick by another service.

If you need a price quickly and don't want to wait, it will try to find the price right away. If the price isn’t immediately available, it waits briefly for a short time before giving up.

You can clear these stored prices to free up memory, either for everything or just for a specific trading setup. This is particularly useful when starting a new trading session to make sure you're working with fresh data. It's designed to be a simple, reliable way to access price data for your trading system.

## Class PositionSizeUtils

This class helps you figure out how much to trade based on different strategies. 

It offers several pre-built methods to calculate your position size, like using a fixed percentage of your account, employing the Kelly Criterion, or using Average True Range (ATR).

Each calculation method is designed with built-in checks to ensure the input data aligns with the chosen strategy, helping to avoid errors. 

You simply provide the necessary information for each method—like your account balance, entry price, and risk parameters—and the class handles the calculation. 

It’s a handy tool for automating and standardizing your position sizing process.

## Class Position

The `Position` class provides helpful tools for determining where to set your take profit and stop loss prices when trading. It simplifies the process by automatically adjusting the levels based on whether you're going long or short.

The `moonbag` property lets you quickly calculate take profit and stop loss levels using a specific strategy where the take profit is set at 50% of the current price. 

Alternatively, the `bracket` property calculates take profit and stop loss levels based on percentages you define for both, providing more flexibility in setting your risk and reward. You can specify both a stop loss percentage and a take profit percentage.

## Class PersistStorageUtils

This class helps manage how signal data is saved and loaded persistently, particularly for backtesting and live trading. It's designed to make sure your signal information isn't lost, even if there are interruptions.

It keeps track of storage instances, creating a new one for each trading mode (like backtest or live) and remembering them to avoid unnecessary creation.
You can also customize how the data is stored by providing your own storage adapter.

The `readStorageData` function gets all the saved signal data for a specific mode, while `writeStorageData` saves the current signal data.  These operations are handled carefully to prevent data corruption.

Each signal is stored as a separate file, identified by its ID.  This design ensures a crash-safe and robust system for managing signal states.

If you need to switch storage methods or clear out old configurations, you can use functions like `usePersistStorageAdapter`, `clear`, `useJson`, or `useDummy` to control the storage behavior. Essentially, `usePersistStorageAdapter` lets you define how the data is stored, while `useJson` reverts to the standard file-based storage and `useDummy` allows you to test without actual persistence.

## Class PersistStorageInstance

This class provides a way to store and retrieve trading signals persistently, using files on your computer. It's designed to work well even if your program unexpectedly closes, ensuring your data isn't lost.

Each signal you're working with gets its own individual file, making organization easier and allowing for efficient retrieval. When you need to load all signals, it goes through each file to gather the data. 

The constructor takes a boolean value indicating whether it’s being used in a backtesting scenario. The `waitForInit` method prepares the file storage for use. The `readStorageData` method retrieves all the saved signals. Finally, `writeStorageData` handles saving the signals to their respective files, ensuring data integrity.

## Class PersistStateUtils

This class provides a way to reliably save and load the state of your trading strategies, even if your program crashes or restarts. It handles the details of storing this data, ensuring that it's available when you need it.

It uses a clever system to manage these storage instances, making sure you're always working with the right one for each signal and bucket. You can even customize how this data is stored by swapping in different storage methods, such as a simple dummy adapter for testing or a file-based adapter for persistence. 

If your working directory changes between strategy runs, remember to clear the cached storage to avoid unexpected behavior. When a strategy's signals are no longer needed, it's a good idea to dispose of the associated storage entry to clean up resources. Finally, you can control which storage method is used by swapping adapters.

## Class PersistStateInstance

This class provides a way to save and load state information for your trading strategies, primarily using files. Think of it as a convenient place to store data that needs to be remembered between different runs of your backtest or trading system.

It uses a unique identifier (signalId) and a bucket name to organize this data within its storage. The constructor sets up these identifiers, and you generally won't need to interact with the internal storage directly.

To get started, `waitForInit` makes sure the storage is ready. `readStateData` fetches any previously saved data, returning it or null if nothing exists. `writeStateData` saves the current state to the storage.  `dispose` doesn't do anything on its own – it relies on a separate utility function for cleaning up resources.

## Class PersistSignalUtils

This class, PersistSignalUtils, helps manage how signal data is saved and loaded, especially important for strategies that need to remember their state. It keeps track of signal data for each trading strategy, symbol, and exchange combination.

Think of it as a smart storage system—it automatically creates the right storage mechanism based on how you configure it.

You can customize how this storage works by providing your own signal instance creators. It ensures that reading and writing this data is done reliably, even if there are unexpected interruptions.

It uses a system of memoization, which means it only creates the necessary storage when it's needed.

If you’re using the framework in a live trading environment, this component handles the persistence of the signals.

Here are some ways you can interact with it:

*   **Choose a storage method:** You can select a file-based storage, a dummy storage for testing, or plug in your own custom storage solution.
*   **Refresh the cache:** If your environment changes, you can clear the cached storage to ensure that it’s working with the latest settings.
*   **Read and write data:**  Methods are provided to retrieve existing signal data or save new data, creating the storage if it doesn't already exist.

## Class PersistSignalInstance

This class helps you reliably save and load signal data for your trading strategies. It's designed to be crash-safe, meaning your data won't be lost even if something unexpected happens.

It keeps track of signals based on the trading symbol, strategy name, and exchange. Think of it as a way to store the current state of your signal so you can resume where you left off.

Here's a quick look at what it does:

*   It sets up the file storage needed to hold the signal data.
*   It lets you retrieve the previously saved signal data.
*   It allows you to update or clear the saved signal data.
*   It uses a special technique to ensure the saving process is protected from interruptions.

You'll provide the trading symbol, strategy name, and exchange name when you create an instance of this class, and it will use these to identify where to store the signal data. The `waitForInit` method ensures the underlying storage is ready before you try to read or write anything.

## Class PersistSessionUtils

This utility class helps manage how your trading sessions are saved and loaded, ensuring your progress isn't lost. It’s designed to keep things organized and reliable.

Think of it as a smart helper that creates and manages storage for your trading sessions. It remembers exactly which session belongs to which strategy, exchange, and timeframe.

You can customize how these sessions are stored, choosing between file-based storage or even a dummy adapter for testing purposes.

The class automatically handles the details of saving and retrieving session data, and it does so in a way that prevents data corruption, even if the process crashes. It also provides a way to clear out old session data when needed, like when you switch to a completely different project folder. Finally, you have the ability to completely replace the default storage mechanism with your own custom implementation.

## Class PersistSessionInstance

This class provides a way to persistently store and retrieve data related to a specific trading session. It acts as a bridge, using the strategy and exchange names to organize data within a file-based storage system. Think of it as a container for session information, identifying each piece of data with a unique identifier derived from the frame name.

It automatically manages writing data to files, ensuring consistency. 

The `waitForInit` method prepares the storage for use, while `readSessionData` and `writeSessionData` methods handle loading and saving session information. 

Importantly, `dispose` doesn't actually do anything here because it relies on a separate utility to clean up related resources – it's handled externally to keep things streamlined.

## Class PersistScheduleUtils

This class helps manage how scheduled signals are saved and retrieved, especially for strategies that need to remember their plans. It creates a special storage system for each strategy, symbol, and exchange combination, ensuring each one has its own dedicated space.

You can customize how these signals are stored by plugging in your own storage methods, or use the default file-based approach. The system is designed to be reliable; it handles saving and loading signals carefully, even if the program crashes unexpectedly.

It automatically creates the necessary storage when needed and helps avoid conflicts by keeping track of which storage is used for which strategy. There’s also a way to clear the system's memory if you need to start fresh, like when moving to a new working directory. Finally, it includes a "dummy" mode that's great for testing since it pretends to save data without actually doing anything.

## Class PersistScheduleInstance

This class, `PersistScheduleInstance`, helps you reliably store and retrieve schedule data for your trading strategies. It acts as a bridge, using files to save information about scheduled signals. 

Think of it as a safe keeper for your strategy's schedule. It uses the trading symbol, strategy name, and exchange name to identify the specific data it's managing.

The class ensures that updates are saved correctly, even if your program unexpectedly crashes. 

Here's a quick rundown of what it does:

*   It initializes the underlying storage, making sure everything is ready to go.
*   It fetches a specific scheduled signal, using the symbol as its unique identifier.
*   It saves a scheduled signal (or clears it if needed), again using the symbol as a key.



It's designed to work seamlessly with other parts of your backtesting framework.

## Class PersistRiskUtils

This class helps manage and save the details of your active trading positions, ensuring they are preserved even if there are interruptions. It keeps track of these positions separately for each risk profile you define. 

It uses a clever system to create these storage instances, allowing you to easily swap out the method used to persist data, such as using a file, a custom adapter, or even a dummy instance for testing. 

The `readPositionData` method retrieves existing position data, while `writePositionData` saves changes. These operations are designed to be reliable, even in unexpected situations.

You can customize how positions are saved by registering a custom constructor with `usePersistRiskAdapter`, or revert to the default file-based storage using `useJson`.  The `clear` method provides a way to refresh the data, which is useful if your working directory changes during backtesting.

## Class PersistRiskInstance

This class, `PersistRiskInstance`, helps you safely store and retrieve position data for your trading strategies. It's designed to be reliable, even if your system crashes.

It handles the underlying storage for you, ensuring that updates to your position data are written in a way that prevents data corruption.

The class uses a specific identifier, "positions", to organize the stored data.

Here's a breakdown of what it does:

*   **Initialization:** `waitForInit` sets up the storage area before you start using it.
*   **Reading Data:** `readPositionData` retrieves all the stored position information.
*   **Writing Data:** `writePositionData` saves new or updated position data. 

Essentially, this provides a dependable way to keep track of your positions and recover data if something unexpected happens.

## Class PersistRecentUtils

This class provides a way to reliably save and load recent trading signals, ensuring your backtesting and live trading systems don't lose information even if something goes wrong. It cleverly manages storage instances based on the specific symbol, strategy, exchange, and timeframe you're using, preventing conflicts and keeping things organized.

You can customize how these signals are stored by providing your own storage adapter. The system automatically handles reading and writing the data, making sure it's done safely and efficiently. It also supports a "dummy" adapter for testing purposes where no actual data persistence is needed.

If your working directory changes, you'll need to clear the cache to ensure the correct storage instance is used. Essentially, this class handles the behind-the-scenes work of preserving your recent signal data, so you can focus on building your trading strategies.

## Class PersistRecentInstance

This class helps you save and retrieve the most recent trading signal data to a file. It’s designed to work within a specific testing or live trading context, keeping track of things like the symbol you're trading, the strategy used, the exchange involved, and the timeframe (frameName). 

The class automatically handles writing data to a JSON file, ensuring the write operation is complete. It uses a unique identifier for each trading context – combining the symbol, strategy name, exchange, frame name, and whether it's a backtest or live environment.

You can use `waitForInit` to make sure the underlying storage is ready before trying to read or write data. `readRecentData` retrieves the latest signal data saved for a particular symbol.  And `writeRecentData` stores a new signal so you can keep track of recent activity. Essentially, it provides a simple way to persist the most recent signal data for your trading simulations and live trading sessions.

## Class PersistPartialUtils

This class, `PersistPartialUtils`, helps manage how profit and loss information is saved and retrieved for trading strategies. It's designed to safely handle partial data – those intermediate results you get before a trade is fully closed.

It uses a clever system to create and manage these storage areas, ensuring each trading strategy and symbol has its own dedicated space.  The way it saves this data can be customized, giving you flexibility in how you persist the information (like using files or a different method).

If something unexpected happens during trading, like a crash, this system helps protect your progress by ensuring data is handled reliably. 

You can easily switch between different storage methods, including a default file-based option and a dummy option that doesn't actually save anything – useful for testing. It's also possible to swap in your own custom storage solutions. The system automatically caches these storage areas to improve performance. Finally, it provides methods to clear this cache when needed, for instance, when the working directory changes.

## Class PersistPartialInstance

This class, `PersistPartialInstance`, provides a way to save and retrieve small pieces of data related to your trading strategies, ensuring that even if things go wrong, your progress isn't lost. It's like a safety net for important, but not critical, information.

It handles the actual saving and loading to a file, so you don't have to worry about the technical details. Each strategy and exchange gets its own dedicated storage space.

The class identifies each piece of data with a unique ID (`signalId`). You can think of it as assigning a specific label to each saved piece of information. It uses a special technique to make sure writes are completed safely, even if the process is interrupted.

Here’s a breakdown of what you can do with it:

*   **Initialization:** It makes sure the storage is ready to go before you start saving anything.
*   **Reading Data:** It retrieves previously saved, partial data using a unique identifier.
*   **Saving Data:** It stores pieces of data, again using a unique identifier, allowing you to save only what’s necessary.

## Class PersistNotificationUtils

This class provides tools for reliably saving and loading notification data, ensuring that your trading strategies don't lose important information. It's used behind the scenes by other utilities for both backtesting and live trading.

It manages storage in a clever way, remembering which storage method you're using so you don't have to recreate it repeatedly. You can even plug in your own custom storage methods if you need something different. 

The class ensures that each notification is stored individually as a file, and it does so safely, even if your program unexpectedly crashes. 

You have control over how notifications are stored; you can choose between a standard file-based approach, a default JSON format, or a dummy option that pretends to store data without actually doing anything. If your working directory changes, you can clear the stored settings to refresh the data.

## Class PersistNotificationInstance

This component handles saving and retrieving notifications, acting as a persistent storage layer. It uses individual JSON files to store each notification, making organization and retrieval straightforward. The system is designed to be resilient, using atomic writes to protect against data loss even if interruptions occur. 

You can control whether this storage is used in a backtesting environment through its constructor.

Internally, it uses a file-based storage system.

To use it, you’ll need to initialize the storage with `waitForInit`, then load notifications with `readNotificationData` and save them with `writeNotificationData`. `readNotificationData` automatically handles finding all available notifications by scanning through the available keys.


## Class PersistMemoryUtils

This class, `PersistMemoryUtils`, helps manage how data is saved and loaded for persistent memory within the backtest-kit framework. It’s designed to ensure data is stored reliably, even if the application crashes.

Think of it as a smart helper that keeps track of where your data lives on disk, organizing it by signal and bucket name. It uses a memoization technique, meaning it creates and reuses storage instances efficiently for each combination of signal and bucket.

You can customize how this persistence works by providing your own data storage adapters. If you want to test without actually saving anything, there’s even a “dummy” adapter that makes all operations do nothing.

The class includes functions to read, write, and delete memory entries, and to check if data exists. It also offers a way to clear the internal cache and clean up storage associated with specific signals. A key function, `listMemoryData`, helps rebuild indexes for efficient data retrieval. Essentially, it provides a robust and adaptable system for managing persistent memory in your trading strategies.

## Class PersistMemoryInstance

This class provides a way to persistently store and retrieve data related to signals, using files on your system. It's designed to work with the backtest-kit framework, ensuring that your data survives restarts or interruptions.

Essentially, it wraps a basic file storage system to make sure changes are saved reliably.  Data can be removed (soft-deleted) by flagging them as such, and the list of available data excludes these "removed" entries.

You initialize it with a unique signal identifier and a bucket name, which helps organize your data.  The `waitForInit` method ensures the storage is ready before you start using it. You can then read, write, and remove memory data using the provided methods.  The `listMemoryData` method lets you iterate through all the active (non-deleted) data entries. Finally, the `dispose` method doesn’t actually do anything itself – it relies on another utility function to properly clean up any related caches.

## Class PersistMeasureUtils

This class helps manage how your backtesting framework stores and retrieves data from external sources, like APIs. It's designed to handle situations where you need to persistently cache responses to avoid repeatedly hitting those APIs.

Think of it as a way to keep track of API results and reuse them later, ensuring your backtests run smoothly and efficiently.

Here's a breakdown of what it does:

*   It creates special storage containers for your data, organizing them based on the symbol and a timestamp.
*   You can customize how these containers work, providing your own methods for storing and retrieving data.
*   The system automatically handles writing and reading data in a safe, reliable way, even if there are unexpected interruptions.
*   It provides functions to read, write, and delete data, and a way to list all stored entries within a container.
*   If you want to experiment or simply avoid any actual persistence, you can switch to a "dummy" mode where all operations are ignored. 
*   You can also clear the system's internal memory when your backtesting environment changes, such as when the working directory shifts.

## Class PersistMeasureInstance

This class provides a way to persistently store and retrieve measure data, essentially acting as a bridge between your trading logic and a file-based storage system. It handles the low-level details of saving and loading data, making it easier for you to focus on your trading strategies.

It utilizes a "bucket" to organize your data, acting as a folder for related measure instances. 

The class incorporates safeguards like soft deletion, marking entries as removed instead of physically deleting them, and providing a mechanism to filter out these deleted entries when listing data.  

Key functions include reading, writing, and removing measure data by their unique keys. The `listMeasureData` function is especially useful for retrieving a comprehensive view of all active entries in a bucket.

You can initiate the storage with `waitForInit`, which prepares the underlying storage for use.

## Class PersistLogUtils

This class, PersistLogUtils, helps manage how log data is saved and retrieved. It acts as a central point for dealing with log entries, using a cached instance of a log manager.

You can customize how logs are stored by providing your own log instance constructor.

The class ensures that reading and writing log data happens safely and reliably.  Each log entry is stored as a separate file, identified by a unique ID, and the system is designed to handle crashes gracefully.

The `readLogData` method fetches all saved log entries, while `writeLogData` adds new ones – it essentially works as an append-only system, ignoring any duplicates.

You have flexibility to change the logging mechanism; `usePersistLogAdapter` allows you to plug in different log storage adapters, `useJson` reverts to the default file-based storage, and `useDummy` provides a test mode where nothing is actually saved.  The `clear` function is used to reset the cached log instance, particularly useful when the working directory changes.

## Class PersistLogInstance

This component provides a way to save your trading backtest logs to disk, ensuring that they're safe even if your program crashes. It works by creating individual JSON files for each log entry, using a unique ID to identify them.  The process of reading logs involves looking at all these individual files.

Importantly, this storage is designed to be append-only; existing log entries can't be modified or deleted. The system ensures data integrity by using atomic writes, meaning each file write is completed entirely or not at all.

You can initialize the storage when needed, and the `readLogData` method retrieves all the saved log entries. The `writeLogData` method is for adding new log entries to the persistent storage, making sure not to overwrite anything already saved. The storage itself is managed by a file system.

## Class PersistIntervalUtils

This framework component handles tracking when specific intervals have already occurred. It essentially remembers which intervals have "fired" for a given data bucket and key, storing this information in files under a `dump/data/interval/` directory.

Think of it as a signal that gets triggered at specific times; this utility keeps track of when that signal has been sent.

You can customize how this tracking is done using different "adapters" – like using a regular file system, a JSON file, or even a "dummy" adapter that doesn't actually do anything (useful for testing).

It has several helpful functions: one to read the status of an interval, one to write it, one to mark something as deleted (though not actually deleting it), and a way to list all intervals for a specific bucket. There's also a method to clear the internal cache when needed, and a way to switch between different tracking methods.

## Class PersistIntervalInstance

This component handles storing and retrieving data related to time intervals, acting as a persistent layer. It's designed to manage interval data on disk, using JSON files to store information.

The system uses a "bucket" – essentially a folder – to organize these files. 
When a marker is removed, instead of deleting the file entirely, it simply marks the data as deleted; this allows the system to recover or re-use that data later if necessary.

The `readIntervalData` method fetches a specific interval marker; if the marker is missing or marked as deleted, it returns nothing. `writeIntervalData` stores a new interval marker. The `removeIntervalData` method allows "soft-deleting" a marker; this means the data remains but is treated as no longer active.

Finally, `listIntervalData` provides a way to view all existing interval markers while excluding the soft-deleted ones, ensuring that only active markers are considered. The `waitForInit` method ensures that the storage is initialized before any operations are performed.

## Class PersistCandleUtils

This class helps manage how candle data (like price movements) is stored and retrieved from disk, making sure the backtesting process is efficient. It essentially creates a cache of candle data, saving each candle as a separate file organized by exchange, symbol, time interval, and timestamp.

The system checks if the cached data is still valid based on the expected number of files, and automatically updates the cache if it detects any missing information. It's designed to work smoothly with the ClientExchange, providing a reliable way to access historical data.

You can customize how the data is stored by providing your own "candle instance" constructor, essentially swapping in a different storage method. If you need to completely reset the cached data, a `clear` method is available. There are also options to easily switch back to the default file-based storage or use a dummy adapter for testing purposes. The `readCandlesData` and `writeCandlesData` methods handle the actual reading and writing of candle data to the cache.

## Class PersistCandleInstance

This component helps you save and retrieve candle data—those records of price changes over time—to a file. It’s designed to be persistent, meaning the data sticks around even when your application restarts.

Each candle's information is stored as a separate JSON file, making it easy to locate and manage individual data points. If a candle's timestamp isn’t found, the system assumes a cache miss and prompts for a fresh retrieval.

When saving candles, it's careful: it won't save data for candles that are still in progress (where the closing time is in the future) and it avoids overwriting existing data. Any candles that are found to be corrupted will trigger a warning and be treated as if they weren't there, prompting a re-fetch. The storage is tied specifically to the symbol, interval, and exchange the data relates to.

Initialization is handled by a `waitForInit` function, ensuring everything is set up correctly.  Reading data uses `readCandlesData`, retrieving a specified number of candles within a time window, and will return `null` if any timestamps are missing.  Finally, `writeCandlesData` handles the storage process.


## Class PersistBreakevenUtils

This utility class helps manage and save the breakeven state of your trading strategies, making sure your progress isn't lost. It essentially acts as a memory for your strategies, storing information about specific trade signals and their breakeven points.

It handles automatically saving and loading this data from files, so you don't have to write that code yourself.  The data is organized in a specific folder structure, making it easy to find and understand where it's stored.

You can also customize how this storage works – for example, using a completely different storage mechanism instead of files, or even pretending the data doesn’t exist for testing purposes. It keeps things efficient by only creating storage instances when they’re actually needed. If you need to switch where the data is stored or need to refresh the cache, there are methods to do so.

## Class PersistBreakevenInstance

This class provides a reliable way to store and retrieve breakeven data, which is essential for tracking progress and making informed decisions during backtesting. It’s designed to be crash-safe by ensuring that data writes are handled securely.

It keeps track of the symbol, strategy name, and exchange name associated with the data.

Essentially, it manages a file on your computer to hold this breakeven information.

To get started, you provide the symbol, strategy name, and exchange name when creating the object.

The `waitForInit` method sets up the initial storage.

The `readBreakevenData` method lets you retrieve the data associated with a specific signal ID.

And the `writeBreakevenData` method allows you to save updated breakeven data for a given signal ID.

## Class PersistBase

`PersistBase` provides a foundation for storing and retrieving data to files, ensuring the process is reliable and safe. It handles writing data in a way that prevents corruption and automatically checks for and cleans up any damaged files.

You can think of it as a central place to manage persistent data for your application, allowing it to remember information between sessions.

The class uses the `entityName` to organize your data and the `baseDir` to specify where these files will be stored.  It computes the actual file paths for each piece of data using the `_getFilePath` method.

`waitForInit` sets up the storage directory and verifies existing data upon initialization, only happening once.  It offers ways to read existing data (`readValue`), check if data exists (`hasValue`), and write new data (`writeValue`) in a secure manner.

Finally, it has the capability to list all the stored IDs using an asynchronous generator (`keys`), which is helpful for understanding what data is present.

## Class PerformanceReportService

This service helps you keep an eye on how long different parts of your trading strategy take to run. It's designed to catch timing information during the backtesting process, which is super useful for figuring out where slowdowns or bottlenecks might be happening.

Think of it as a detective for your code, quietly recording how long each step takes.

You can use the `subscribe` function to tell the service to start watching for these timing events.  It’s built to prevent accidental double-subscription which could lead to unwanted behavior. To stop the monitoring, the `unsubscribe` function can be used, which is returned when you initially subscribe.

The `track` property handles the actual recording and storage of the timing data, and the `loggerService` allows you to get some debugging output to help understand what's going on.  Essentially, this service provides a structured way to gather and store performance data so you can optimize your trading strategy.

## Class PerformanceMarkdownService

This service is designed to monitor and analyze how your trading strategies are performing. It keeps track of various performance metrics and organizes them by strategy and the specific trading conditions they were used in. 

You can think of it as a data collector that listens for performance events and then creates detailed reports. These reports, generated as markdown files, provide insights into your strategy’s strengths and weaknesses, highlighting potential bottlenecks.

The service allows you to retrieve aggregated performance data for specific strategies, generate reports on demand, and even save those reports directly to your disk. It also includes a way to completely clear out all accumulated data when needed, allowing for a fresh start. Subscribing and unsubscribing to performance events are managed to prevent issues with multiple subscriptions.

## Class Performance

The Performance class offers tools to analyze how your trading strategies are performing. It lets you gather comprehensive statistics for specific symbols and strategies, breaking down metrics like execution time, volatility, and percentiles to pinpoint potential bottlenecks.

You can request these statistics using the `getData` method which returns a detailed summary of performance metrics.

For a more visual overview, use `getReport` to automatically generate a markdown report that shows time distribution, detailed statistics tables, and percentile analysis for deeper insights.

Finally, `dump` allows you to easily save these reports to a file on your system, creating directories as needed to keep your reports organized.

## Class PartialUtils

This class helps you analyze and understand your partial profit and loss data, which is crucial for backtesting and evaluating your trading strategies. Think of it as a tool to summarize and export information about how your strategies are performing in terms of smaller, incremental gains and losses.

It gathers data from events related to partial profits and losses, storing up to 250 of these events for each symbol and strategy combination.

You can use it to:

*   Get summarized statistics about your partial profit/loss events, like total profit/loss counts.
*   Generate clear, readable reports in Markdown format, showing details like the type of event (profit or loss), the symbol traded, strategy used, price, and timestamp.
*   Save these Markdown reports directly to files on your computer for easy sharing and review. The files will be named systematically based on the symbol and strategy.


## Class PartialReportService

The PartialReportService helps you keep track of when your trading positions are partially closed, whether that’s due to profit or loss. It listens for these partial exit events and records them in a database. 

Think of it as a detailed log of how your positions are being reduced.

You can tell it to start listening for these events using the `subscribe` method, and it prevents you from accidentally subscribing multiple times.  When you're finished, you can use `unsubscribe` to stop the service from recording further events. The service also uses a logger to help debug issues.

## Class PartialMarkdownService

The PartialMarkdownService helps you track and report on small gains and losses ("partial profits and losses") that happen during trading. It listens for these events, keeps track of them separately for each symbol (like AAPL or BTC) and strategy you're using. 

It then creates nicely formatted markdown tables that show details about each partial profit or loss. You can also get overall statistics about the number of these events. 

The service automatically saves these reports as files on your computer, making it easy to review your trading activity. You can also customize which information is included in the reports and clear out the accumulated data when needed. It's designed so that each trading setup (symbol, strategy, exchange, timeframe, and backtest status) gets its own, independent record keeping.

## Class PartialGlobalService

This service acts as a central point for managing and tracking partial profit and loss calculations within the trading framework. It’s designed to be injected into the core trading strategy, simplifying how strategies interact with the underlying connection layer. Think of it as a middleman that ensures all partial profit/loss events are logged and handled consistently.

It relies on other services, like a logger and a connection service, which are provided through dependency injection. The service also includes validation tools for the strategy itself and associated risks, exchanges, and frames used in the backtest.

The `profit`, `loss`, and `clear` functions are key; they represent the core actions of recording and clearing partial profit/loss states, with each step first logged at a global level before being passed on for further processing. The `validate` function caches strategy validation results to improve performance.

## Class PartialConnectionService

The PartialConnectionService manages how profit and loss information is tracked for individual trading signals. Think of it as a central hub that makes sure each signal has its own dedicated record-keeping system.

It cleverly avoids creating duplicate records – it remembers previously created records and reuses them, a process called memoization. This system is configured with logging and event reporting capabilities, ensuring activity is tracked.

When a signal achieves profit or experiences a loss, this service handles the necessary calculations and triggers notifications.  It also cleans up old records when a signal is closed out, preventing unnecessary clutter.

The service is integrated into the overall trading strategy, providing a reliable and efficient way to monitor the performance of each signal without creating unnecessary overhead. It’s a behind-the-scenes component that ensures accurate and well-managed profit and loss reporting.


## Class NotificationLiveAdapter

This component provides a flexible way to send notifications about your trading strategy's progress and events. Think of it as a central hub that can connect to different notification systems – whether you want to log them in memory, store them persistently, or simply ignore them entirely.

It uses an adapter pattern, meaning you can easily swap out the notification backend without changing your core strategy code.  You can quickly switch between storing notifications in memory (the default), saving them to disk, or disabling notifications completely for testing purposes.

The `handleSignal`, `handlePartialProfit`, `handlePartialLoss`, and similar methods are the main points where notifications are sent. These methods forward the information to the currently selected notification adapter.  You can also retrieve all stored notifications using `getData` or clear them with `dispose`.

If you want to change how notifications are handled, the `useNotificationAdapter` method lets you specify a custom adapter.  For quick changes, `useDummy`, `useMemory`, and `usePersist` provide convenient shortcuts to switch between common notification methods. If you are iterating over strategies and changing directories, make sure to `clear` to reset to the default in-memory adapter.

## Class NotificationHelperService

This service helps manage and send out notifications about important signals during the backtesting process. It’s designed to ensure that everything is validated before sending out those notifications, making sure the data is correct and consistent.

The service relies on several other components to do its work, including services that handle strategy, risk, exchange, and action validations, as well as a core strategy service and a time metadata service.

The `validate` function is smart—it checks for valid schemas but only does so once per context (a combination of strategy, exchange, and frame names). This saves time and resources because it remembers what it's already validated.

The `commitSignalNotify` function is what actually sends the notifications. It validates the data, finds the relevant signal, and then packages it up to be sent out to anyone who's listening and also saves it for record-keeping. This function is what you'll use within your custom callbacks to send signal information.


## Class NotificationBacktestAdapter

The NotificationBacktestAdapter helps manage and send notifications during backtesting, providing flexibility in where those notifications are stored or sent. It’s designed to be adaptable, letting you easily switch between different notification methods without changing your core backtest logic.

By default, it stores notifications in memory, but you can easily swap it out to save notifications persistently to disk or to completely ignore them using a dummy adapter. 

The adapter provides methods for handling various events like signals, partial profits/losses, breakeven points, strategy commits, synchronization events, and errors, all by forwarding these to the currently selected notification backend. You can get all stored notifications or clear them out as needed.

To change how notifications are handled, you can choose from preset adapters like the in-memory, persistent, or dummy options, or even provide your own custom adapter implementation. The `clear` method is particularly useful when running multiple backtests that might rely on different working directories, ensuring a fresh start for each test.

## Class NotificationAdapter

This component handles all your notifications, whether you're running a backtest or a live trading strategy. It keeps track of notifications and makes sure you don't get duplicates.

You can easily subscribe to different types of notifications, like signals, profits, losses, or errors. The adapter automatically updates as new signals come in.

To get all your notifications, you can request them specifically for either the backtest or the live environment.

When you're finished, you can clear all the stored notifications, and it will safely unsubscribe from anything it's tracking. You can even call the disable function multiple times without issue.

## Class MemoryLiveAdapter

This component provides a flexible way to manage memory for live trading strategies. Think of it as a central hub for storing and retrieving data related to your trades, offering different ways to handle that data – whether it's kept only in memory, saved to files, or just discarded.

You can easily switch between storage options:
*   Use a local, in-memory store for quick access.
*   Use a persistent store to keep data even after your application restarts.
*   Or even use a dummy adapter for testing.

The `disposeSignal` method is important for cleaning up data when a trading signal is finished or cancelled, ensuring you don't accumulate unnecessary memory. You have functions to write, search, list, remove, and read data, with the option to search with a full-text scoring system. It also has a `clear` function that can be useful when your working directory changes during strategy iterations.

## Class MemoryBacktestAdapter

The `MemoryBacktestAdapter` provides a way to manage data storage during backtesting, offering flexibility in how that data is handled. It’s designed to be adaptable, allowing you to swap out different storage methods as needed. By default, it uses an in-memory system that’s quick but doesn't save data between sessions.

You can easily change how data is stored by using convenient methods like `useLocal`, `usePersist` (which saves data to files), `useDummy` (for testing with no actual storage), and `useMemoryAdapter` (to bring in your own custom storage solution).  The adapter keeps track of data using memoization, storing data based on signal and bucket names and clearing it when signals are closed. 

There are several core functions for interacting with the memory: `writeMemory` to store data, `searchMemory` to find data using BM25 scoring, `listMemory` to see all entries, `removeMemory` to delete data, and `readMemory` to retrieve a single data point.  The `disposeSignal` method is used to clear out old, cached data.  `clear` forces the adapter to rebuild its internal data structures, which can be useful when the working directory changes.

## Class MemoryAdapter

The `MemoryAdapter` acts as a central hub for managing memory storage, whether you're running a backtest or a live trading environment. It automatically handles cleaning up old data to prevent issues, ensuring only current information is used.

To start using memory storage, you'll use `enable`, which subscribes to signal events to keep things running smoothly.  `disable` simply stops this process; it’s perfectly fine to call it multiple times if needed.

You interact with the memory itself using functions like `writeMemory` (to save data), `searchMemory` (to find data using a search query), `listMemory` (to view all stored items), `removeMemory` (to delete an item), and `readMemory` (to retrieve a specific item). These functions intelligently direct your request to either the backtest memory or the live memory, depending on your needs.


## Class MaxDrawdownUtils

This class offers tools to analyze and report on maximum drawdown events, which help you understand the risk profile of your trading strategies. It's like a central hub for accessing and presenting drawdown data collected during backtesting or live trading.

You can think of it as a way to get a summary of the worst losses experienced by a strategy, along with details about when and why those losses occurred. 

Specifically, it allows you to:

*   Fetch detailed statistical information about the maximum drawdown for a particular trading symbol and strategy.
*   Generate a readable markdown report showcasing all drawdown events for a symbol and strategy combination.
*   Save those markdown reports directly to a file.

The class operates on data collected from maxDrawdownSubject events, providing insights into the overall risk exposure of your trading system.

## Class MaxDrawdownReportService

This service is responsible for tracking and recording maximum drawdown events, which are crucial for understanding risk in trading strategies. It keeps an eye on drawdown data and writes each new record to a database, allowing for later analysis and reporting.

The service receives drawdown information, capturing details like the timestamp, trading symbol, strategy name, exchange, timeframe, signal ID, position, current price, and order parameters. This comprehensive snapshot provides a clear picture of what happened at the moment the drawdown occurred.

To begin recording drawdown events, you need to subscribe to the data stream. This initial subscription ensures that the service only registers once. If you later want to stop the recording, you can unsubscribe, which will disconnect the service and prevent any further writes to the database.

## Class MaxDrawdownMarkdownService

This service helps create and store reports about maximum drawdown, which is a measure of how much a trading strategy loses before recovering. It listens for drawdown events and keeps track of them for different trading setups – a specific symbol, strategy, exchange, and timeframe. 

You can subscribe to start receiving these drawdown events, and unsubscribe to stop them and clear out any stored data. 

The service lets you retrieve the accumulated drawdown data, generate a formatted markdown report, or directly save that report to a file. 

To completely reset everything, you can clear all stored data. Alternatively, you can clear the data for a specific trading setup (symbol, strategy, exchange, timeframe, and whether it's a backtest) by providing details when clearing.

## Class MarkdownWriterAdapter

The MarkdownWriterAdapter helps you manage how your backtest results are saved, offering flexibility in where and how the data is stored. It's designed to be easily swapped between different storage methods like writing to individual files, combining everything into a single JSONL file, or even silencing the output entirely.

You can think of it as a central point for controlling your markdown output. The system automatically remembers which storage method is active, ensuring you don't create multiple copies of the same data.

The default setup writes each report to its own .md file. However, you can easily change this using functions like `useMd()`, `useJsonl()`, or `useDummy()`.

If you need to change the underlying storage method, you can use `useMarkdownAdapter()` to specify a new adapter. The `clear()` function is helpful if your working directory changes, ensuring the system refreshes the storage locations. Finally, the `writeData()` function handles the actual writing of the markdown content to the chosen storage.

## Class MarkdownUtils

This class provides tools for controlling how your trading framework generates Markdown reports. It lets you turn on and off report generation for different parts of the system, such as backtesting, live trading, and performance analysis.

You can selectively enable Markdown reporting for specific areas. When you enable a service, it starts collecting data and will create Markdown files when you need them; be sure to unsubscribe when you're done to avoid memory issues.

Alternatively, you can disable specific Markdown report services without affecting others. This is useful if you only need reports for certain scenarios. 

Finally, there's a method to clear the data that’s been collected for Markdown reports, essentially resetting the reports without stopping the report generation process altogether.

## Class MarkdownFolderBase

This adapter provides a straightforward way to generate backtest reports, creating each report as its own individual markdown file. It’s ideal for situations where you want easily accessible, human-readable reports organized into directories. 

Think of it as the standard approach for report generation within the framework, focusing on simplicity and direct file writing.

The adapter doesn't require any setup or initialization, making it very easy to use.

To create a report, you simply provide the content and a set of options that define the file path – the adapter handles everything else, including creating the necessary directories.


## Class MarkdownFileBase

This component manages writing markdown reports to JSONL files, acting like a central hub for your trading data. It's designed to make it easy to log and analyze your results later using standard JSONL processing tools.

Each report type (like trade details or account history) gets its own file, which grows incrementally as new data is added. The writing process is carefully controlled to avoid errors and delays, with automatic directory creation and a timeout to prevent hangs.

You don't need to worry about low-level file handling; the component handles creating the files, writing the data in a consistent format, and managing potential bottlenecks. You just provide the markdown content and some metadata like the symbol, strategy, and exchange involved. The component then takes care of placing that information into a JSONL file.

The `waitForInit` method sets up everything needed for writing, and you can call it as needed without worry – it only runs the initialization once. The `dump` method is your main tool for adding new markdown reports, combining content with essential information for later filtering and analysis.


## Class MarkdownAdapter

The MarkdownAdapter helps manage how your markdown data is stored, offering flexibility through different storage methods. You can easily switch between storing markdown as individual files or appending them to a single JSONL file. It remembers which storage method you're using, so you don’t have to keep re-specifying it. 

For convenience, you have shortcuts for using the default folder-based storage (`useMd`) or the JSONL-based storage (`useJsonl`). 

If you just want to test something without actually writing any data, you can use the `useDummy` adapter, which ignores all write operations. Finally, you can customize the adapter completely by providing your own storage constructor using `useMarkdownAdapter`.

## Class LoggerService

The LoggerService helps standardize logging across the backtest-kit framework, ensuring your messages always include useful context. It's designed to work with a logger you provide, automatically adding information like the strategy name, exchange, and the specific part of the code being executed.

If you don't configure a logger, it falls back to a "no-op" logger, which essentially does nothing – so it won’t interfere if you don't need it.

You can customize the logging behavior by setting your own logger implementation. The service handles appending relevant context automatically, letting you focus on the content of your log messages. It provides different logging levels like `log`, `debug`, `info`, and `warn` for varying degrees of importance.

## Class LogAdapter

The `LogAdapter` helps you manage and store log messages within your backtesting framework. Think of it as a flexible system where you can easily switch between different ways of handling logs, like keeping them in memory, writing them to a file, or even discarding them entirely. 

It starts with an in-memory log, but you can change this using methods like `usePersist` to write logs to disk or `useDummy` to silence logging completely.  The `useLogger` method allows advanced customization by letting you specify your own logging implementation.

You can retrieve all your logs with `getList` and use `log`, `debug`, `info`, `warn` to record messages at different levels of importance. `clear` is useful for resetting the log adapter when the working directory changes during backtesting.

## Class LiveUtils

The `LiveUtils` class provides tools for managing live trading sessions. It’s designed to simplify interacting with the live trading system, offering features like automatic crash recovery and real-time progress tracking.

You can start a live trading session for a symbol and strategy using `run` or `background`, with `run` providing a stream of trade results and `background` silently running the process. `getPendingSignal`, `getTotalPercentClosed`, and other methods let you check the status of a live position, like its current open percentage or cost basis.

The class handles things like updating stop-loss orders (`commitTrailingStop`, `commitTrailingTake`), adding to DCA positions (`commitAverageBuy`), and even generating reports (`getReport`, `dump`).  It also includes utilities for managing scheduled signals and canceling or closing positions. Essentially, `LiveUtils` gives you control and insight into ongoing live trading.

## Class LiveReportService

LiveReportService helps you keep a detailed record of your trading activity as it happens. It captures every stage of a trade – from initial signals to being closed – and saves this information to a database. 

Think of it as a live logbook for your trading strategy.

It listens for trading events and diligently records all the important details.
It makes sure that data is securely saved in the database.

You can easily set it up to receive these events, and it prevents accidental double-logging.
You also have the ability to stop this logging process when you no longer need it. 


## Class LiveMarkdownService

This service helps you automatically create reports as your trading strategies are running. It listens for events – like when a strategy is idle, opens a position, is active, or closes a trade – and keeps track of all of them. 

It then compiles this information into nicely formatted Markdown tables that include details about each event. You'll also get key trading statistics like your win rate and average profit. 

These reports are saved to disk, allowing you to review your strategy's performance over time. The service organizes reports into folders named after your strategies, making it easy to find them.

You can subscribe to receive updates as events occur, and unsubscribe when you no longer need them. There are also functions to retrieve accumulated data, generate reports, and clear the stored data, either for specific strategies or everything at once. The service uses a logger to help you debug any issues.

## Class LiveLogicPublicService

This service helps manage and run live trading operations, making it easier to work with different strategies and exchanges. It automatically handles important information like the strategy and exchange names, so you don't have to pass them with every function call.

The service continuously runs and generates trading updates (opened, closed, cancelled signals) as an ongoing stream of data.  It’s designed to be robust, persisting data so that trading can resume even if the system crashes.

Here's a breakdown of the key aspects:

*   **Automatic Context:** You don’t need to manually specify the strategy or exchange name when calling functions.
*   **Continuous Operation:** It operates as a never-ending stream, constantly monitoring and updating trading status.
*   **Crash Recovery:** If a crash occurs, the system automatically recovers from saved data, minimizing disruptions.



The `run` function is the main entry point, and you provide it with the trading symbol and context to get the live trading data stream.

## Class LiveLogicPrivateService

This service handles the continuous orchestration of live trading operations. It functions as an ongoing process, constantly monitoring for trading opportunities.

The core of its operation involves a perpetual loop where it checks for new signals and generates results – specifically, it only outputs when trades are opened or closed, skipping those that are active or idle. This allows for efficient streaming of information.

The system is designed to be resilient; if it crashes, it will automatically recover and resume trading from where it left off, ensuring no data is lost. 

You can initiate the trading process for a specific symbol, and it will continuously provide updates as trades are opened and closed, making it ideal for real-time monitoring and analysis. The service relies on several dependencies, including a logger, strategy core, and method context services.

## Class LiveCommandService

The LiveCommandService acts as a central point for accessing live trading features within the backtest-kit framework. Think of it as a helper that makes it easy to inject dependencies needed for live trading.

It provides a `run` function, which is the core of live trading execution. This function takes a symbol (like a stock ticker) and some contextual information—specifically, the names of the strategy and exchange being used. 

The `run` function is designed to continuously execute trading logic, automatically handling and recovering from potential errors to keep the process running smoothly. It returns a stream of results, detailing the outcome of each trading decision (whether it's opening, closing, or cancelling a position).

## Class IntervalUtils

The `IntervalUtils` class helps you control how often certain functions are executed, ensuring they only run once per defined time interval. It's like a gatekeeper for your functions, preventing them from being called too frequently.

There are two main ways to use it: in-memory, where the state is held in the program's memory, and file-based, where the state is persisted to disk, so it survives restarts. Think of it like this: in-memory is quick and easy but loses information if the program stops, while file-based is more reliable.

You get a single, handy object called `Interval` to work with, so you don’t have to manage multiple instances. The class keeps track of each function individually, so different functions have their own independent interval timers.

You can clean up old, unused function instances with `dispose` or completely reset the system with `clear`. If your working directory changes, `clear` and `resetCounter` help ensure new timers are created correctly and avoid conflicts.

## Class HighestProfitUtils

This class helps you analyze and report on the highest profits achieved during trading simulations or live trading. Think of it as a tool to understand which strategies performed best for specific assets.

It provides a few key functions:

*   `getData`:  You can use this to get a summary of the highest profit statistics – things like the maximum profit, average profit, and other key performance indicators - for a particular trading symbol and strategy.  You can also specify whether the data comes from a backtest or live trading.

*   `getReport`:  This method creates a detailed markdown report listing all of the highest profit events related to a strategy and asset.  You can customize the report by choosing which data columns to include.

*   `dump`:  Similar to `getReport`, this function generates a markdown report but instead of returning it, it saves the report directly to a file. You can specify the file path.

Essentially, it lets you easily access and visualize the results of your most profitable trades.

## Class HighestProfitReportService

This service diligently tracks and records the highest profit achieved during backtesting. It's designed to keep a record of significant profit events for later analysis.

The service listens for notifications of new highest profit records. When a new record is received, it writes detailed information about it – including timestamps, symbols, strategy names, and crucial price details – to a special report database. This helps you understand what contributed to those successful trades.

To get this tracking started, you need to subscribe to the service. Once subscribed, it automatically begins recording those high-profit moments. To stop the recording, simply unsubscribe. The subscription process is also smart; you only subscribe once, even if you try to subscribe multiple times.

## Class HighestProfitMarkdownService

This service is designed to automatically generate and save reports detailing the highest profits achieved by your trading strategies. It listens for incoming data about profitable trades and organizes this information based on symbol, strategy, exchange, and timeframe.

You can subscribe to receive these data points, and the service will prevent multiple subscriptions to avoid unnecessary overhead. When you're finished, you can unsubscribe to stop listening and clear all accumulated data.

The `tick` function handles each incoming data point, routing it to the correct storage location. You can retrieve specific data using `getData`, generate a formatted report with `getReport`, or write the report directly to a file with `dump`.

The service also provides a `clear` function to reset the data, either for a specific combination of parameters or for all data. This is helpful for starting fresh or releasing memory.

## Class HeatUtils

HeatUtils helps you easily create and save visual reports showing how your trading strategies performed. It gathers data across all your symbols and strategies, making it simple to see overall portfolio performance and detailed breakdowns.

You can use `getData` to retrieve the underlying statistics, which will show you key metrics like profit, Sharpe ratio, and maximum drawdown for each symbol and the portfolio as a whole.

The `getReport` function turns this data into a readable markdown table, sorted by profit.

Finally, `dump` allows you to save these reports directly to a file, so you can share them or keep a record of your progress – it will even create the necessary folders for you. This is a single, readily available tool for all your portfolio heatmap needs.

## Class HeatReportService

The HeatReportService helps you track and analyze your trading performance by recording when signals close and generating a heatmap of those events. It focuses specifically on closed signals that have profit and loss (PNL) data, allowing for a portfolio-wide view of your trading activity.

This service listens for signal events and stores the details of closed trades in a database, ready for heatmap generation.

To start using it, you subscribe to receive these signal events, and to stop, you need to unsubscribe. The subscription process is designed to prevent accidentally subscribing multiple times. The service also provides a logger for debugging purposes.


## Class HeatMarkdownService

This service helps you visualize and analyze your trading performance with a heatmap. It listens for trading signals and compiles data, giving you both overall portfolio insights and detailed breakdowns for each individual asset.

It tracks key metrics like profit/loss, Sharpe ratio, and maximum drawdown for each strategy and asset. The service automatically organizes this data and can generate a nicely formatted Markdown report you can easily read or share.

You can subscribe to receive real-time updates and unsubscribe when you no longer need them. The `clear` function lets you reset the data for a specific trading setup or completely wipe all accumulated information. The `dump` function lets you save the report directly to a file. The `getData` function allows you to retrieve the aggregated data to use in other components.

## Class FrameValidationService

This service helps you keep track of and verify the different timeframes your trading system uses. Think of it as a central place to register each timeframe and make sure it's properly defined before you try to use it. It remembers which timeframes are valid to avoid repeated checks, making your system run faster. 

You can use it to add new timeframes, quickly confirm a timeframe exists, or get a complete list of all the timeframes your system supports. It uses a `loggerService` for output and an internal `_frameMap` to store the timeframe information. 

Adding a timeframe involves providing its name and a description of its structure. Validation confirms that the timeframe is registered, and listing shows you everything that's been registered.

## Class FrameSchemaService

The FrameSchemaService helps keep track of different schema designs for your trading frames. It’s like a central library where you store and manage these designs, ensuring consistency and preventing errors. 

It uses a specialized registry to hold the schemas, making sure the data types are correct and consistent.

You can add new schema designs using the `register` method, essentially adding them to this central library. If a design already exists, `override` lets you update parts of it without replacing the whole thing.  Need to look up a schema design?  Just use `get` and provide the name. This service also makes sure basic validation checks happen when you add or update designs, ensuring they have the necessary properties.

## Class FrameCoreService

FrameCoreService acts as the central hub for managing timeframes within the backtesting process. It works closely with the FrameConnectionService to fetch and prepare the necessary timeframe data. Think of it as the engine that provides the sequence of dates used to run your trading simulations. 

It’s a core component, primarily used behind the scenes by the BacktestLogicPrivateService, ensuring consistent and reliable timeframe generation. 

The `getTimeframe` function is its key offering, allowing you to request a specific array of dates for a given trading symbol and timeframe name. This is how you get the chronological data that drives your backtest.


## Class FrameConnectionService

The FrameConnectionService acts as a central hub for managing and accessing different trading frames, like minute, hour, or day frames. It intelligently routes requests to the correct frame implementation based on the active context.

To improve performance, it remembers (caches) the frame instances it creates, so it doesn't have to recreate them every time you need them.

This service also handles backtesting timeframes, allowing you to specify a start and end date for your tests, ensuring they operate within a defined date range.  When operating in live mode, no frame is active, represented by an empty frame name.

It's designed to make working with frames seamless and efficient.

Here's what the core components do:

*   **`getFrame`**:  This function gets a frame—either by creating it if it’s the first time you’ve asked for it, or by returning one it already created and cached. The name of the frame determines which implementation is used.
*   **`getTimeframe`**: It figures out the start and end dates for a specific symbol within the backtest timeframe configuration, ensuring your backtest data is properly bounded.

## Class ExchangeValidationService

The ExchangeValidationService helps keep track of your configured exchanges and makes sure they're actually set up correctly before you start trading. Think of it as a central manager for your exchanges.

You can use it to register new exchanges, so the service knows about them. 

It also offers a validation function to double-check that an exchange exists before any trading actions are performed. This helps prevent errors.

To improve speed, the service remembers the results of past validations, so it doesn’t have to repeat those checks. 

Finally, a listing function allows you to see a complete overview of all the exchanges registered with the service.


## Class ExchangeUtils

The ExchangeUtils class simplifies working with different cryptocurrency exchanges within the backtest-kit framework. It acts as a central point to access exchange-related data and operations, ensuring consistency and validation.

It's designed as a single, shared instance for easy access throughout your testing or trading logic.

This utility provides convenient methods for retrieving various data points like historical candles, average prices, and order books. You can easily fetch candles for a specific trading pair and timeframe, and it handles the calculations for the candle start time automatically.

It also helps in formatting trade quantities and prices according to the specific rules of each exchange, making sure your orders are valid.

Retrieving aggregated trades and order books is also simplified, and it provides a flexible way to fetch raw candle data, offering controls over the date range and data limits for thorough analysis.


## Class ExchangeSchemaService

This service helps you organize and manage the blueprints (schemas) for different cryptocurrency exchanges. It keeps track of these schemas in a secure and type-safe way.

You can add new exchange schemas using the `addExchange()` function (or `register` method here). To find a specific exchange's schema, use the `get()` method to retrieve it by name.

Before adding a new schema, `validateShallow()` checks that it has all the necessary information and that the data types are correct.

If you need to update an existing schema, `override()` allows you to make changes while keeping the rest of the schema intact. 

The service also relies on other internal tools to keep things organized and make sure everything works together smoothly.

## Class ExchangeCoreService

The ExchangeCoreService acts as a central hub for interacting with exchanges, providing a consistent way to retrieve data and format information. It combines the capabilities of connection services with the ability to inject specific details about the trading context, such as the symbol being traded, the trading time, and whether it's a backtest scenario. 

This service is designed to handle tasks like fetching historical and future candles, calculating average prices, and retrieving order books. It also offers utilities for formatting prices and quantities to align with the exchange's specific requirements.

The validation process for exchange configurations is handled efficiently, avoiding unnecessary checks. It provides a suite of functions that retrieve data, always incorporating execution context information and optimizing for both backtesting and live trading environments. The service ensures that exchange operations are properly validated and executed within the appropriate time frame and context.

## Class ExchangeConnectionService

The `ExchangeConnectionService` acts as a central hub for interacting with different cryptocurrency exchanges. It intelligently routes your requests – like fetching candles or order books – to the correct exchange based on the currently configured exchange name. To speed things up, it remembers (caches) the connections to those exchanges, so you don't have to repeatedly establish them.

Think of it as a smart director, ensuring your commands go to the right place and doing so efficiently.

Here's a breakdown of what it does:

*   **Automatic Exchange Handling:** It figures out which exchange to use automatically, based on settings.
*   **Caching for Speed:** It stores exchange connections to avoid delays.
*   **Full Exchange Functionality:** It provides all the common actions you'd need for interacting with an exchange.
*   **Provides Methods for Data Retrieval:**
    *   `getCandles`: Gets historical price data.
    *   `getNextCandles`:  Gets the next set of candles, useful for advancing a backtest or updating live trading.
    *   `getAveragePrice`:  Calculates the current average price, either from live data or historical candles.
    *   `getClosePrice`: Retrieves the last closing price.
    *   `formatPrice` and `formatQuantity`: Adjust price and quantity values to match the exchange’s specific formatting rules.
    *   `getOrderBook`: Fetches the current order book.
    *   `getAggregatedTrades`: Retrieves aggregated trade data.
    *   `getRawCandles`: Retrieves raw candles with date filtering capabilities.

It utilizes several internal services (`loggerService`, `executionContextService`, `exchangeSchemaService`, and `methodContextService`) to function correctly, and the `getExchange` property provides access to the memoized exchange instance.

## Class DumpAdapter

The `DumpAdapter` helps manage how data is saved during backtesting, acting as a central point for different storage methods. It intelligently creates temporary storage areas for each signal and bucket, making sure data is organized and accessible.

You can easily change where the data is saved using functions like `useMarkdown`, `useMemory`, or `useDummy`, which select between writing to markdown files, storing in memory, or discarding data respectively. The default method writes to markdown files.

To get the adapter working, you'll need to `enable` it to listen for signal events and `disable` it when you’re done.  There are several methods for saving different types of data, including agent messages (`dumpAgentAnswer`), records (`dumpRecord`), tables (`dumpTable`), raw text (`dumpText`), error descriptions (`dumpError`), and JSON objects (`dumpJson`). If you need a completely different way to handle the data, you can inject your own custom storage implementation with `useDumpAdapter`. It's also important to `clear` the adapter’s internal cache if the base directory changes during the backtest.

## Class ConstantUtils

The ConstantUtils class provides a set of predefined percentages used for setting take-profit and stop-loss levels in your trading strategies. These values are based on the Kelly Criterion and incorporate an exponential risk decay, designed to optimize profit and manage risk. Think of these constants as predetermined checkpoints along the path to your final profit or loss targets.

For instance, TP_LEVEL1 is set at 30%, so it triggers when the price reaches 30% of the total distance to your profit target.  This allows you to secure a portion of your profits early. TP_LEVEL2 and TP_LEVEL3 offer further checkpoints to lock in more profit along the way, while SL_LEVEL1 and SL_LEVEL2 are designed to mitigate potential losses by setting earlier warnings and a final exit point. These values are pre-calculated to help you automatically adjust your take-profit and stop-loss levels during the backtest process.

## Class ConfigValidationService

The ConfigValidationService helps ensure your trading strategies are set up correctly and have the potential to be profitable. It acts as a safeguard, double-checking your global configuration settings.

It verifies that percentages like slippage and fees are non-negative, and that your take-profit distance is large enough to cover those costs, guaranteeing a profit when it's reached.

Beyond that, it makes sure that numerical values, like timeouts and retry attempts, are sensible positive integers. It also validates relationships between minimum and maximum values for things like stop-loss distances.

Essentially, this service is there to catch potential errors in your configuration before they lead to losses.

## Class ColumnValidationService

The ColumnValidationService helps make sure your column configurations are set up correctly. It acts like a safety check, ensuring that each column definition follows the rules defined by the ColumnModel interface. 

It verifies a few essential things: that every column has the necessary properties like 'key', 'label', 'format', and 'isVisible'; that 'key' and 'label' are strings and aren't empty; and that 'format' and 'isVisible' are actually functions. 

Crucially, it also guarantees that all the 'key' values are unique within each group of columns.  Essentially, it's designed to catch errors in your column definitions before they cause problems.




The `validate` method is how you trigger this check, and it’s directly tied to the globally defined `COLUMN_CONFIG`.


## Class ClientSizing

ClientSizing helps determine how much of an asset to trade based on various strategies. It’s a flexible system for calculating position sizes, allowing you to use methods like fixed percentages, Kelly criterion, or Average True Range (ATR). You can also set limits on minimum and maximum positions, and a cap on the percentage of your capital used for each trade.

It also supports custom validation and logging, letting you fine-tune the sizing process.

This component is essential for strategy execution, as it dictates the size of each position taken.

The `calculate` method performs the core position sizing calculation based on the parameters you provide. You can adjust the sizing method, and set constraints to manage risk and optimize returns.

## Class ClientRisk

ClientRisk is a system designed to manage risk across multiple trading strategies, ensuring they don't exceed pre-defined limits. It acts as a central authority, checking signals before they're executed to prevent actions that could violate these limits.

It handles maximum concurrent positions and allows for custom risk validations, providing a comprehensive view of active positions across all strategies. Think of it as a safety net preventing strategies from stepping on each other's toes.

The system maintains a record of active positions, updating them and optionally persisting them to disk (except in backtest mode). It uses a careful initialization process to guarantee this record is accurate.

The core function, `checkSignal`, determines if a proposed trade is permissible based on configured rules.  `checkSignalAndReserve` is a specialized, safer version that simultaneously checks a signal and temporarily claims a position slot to avoid race conditions when multiple strategies are trying to execute simultaneously.

Finally, the `addSignal` and `removeSignal` methods are used to register and clear signals, respectively, as trades are opened and closed. These actions are crucial for maintaining accurate tracking of positions.


## Class ClientFrame

The ClientFrame is responsible for creating the sequences of timestamps that your backtesting process uses to step through historical data. It’s designed to be efficient, so it remembers previously calculated timeframes and doesn’t regenerate them unnecessarily.

You can customize how far apart these timestamps are—ranging from one-minute intervals to daily ones.

It also allows you to add extra steps to the process, such as verifying the data or recording what’s happening.

Essentially, it provides the chronological backbone for your backtest.

The `getTimeframe` property is the core function here – when you call it for a particular asset, it produces the list of timestamps you need for that asset's backtest, and it caches the result for future use.

## Class ClientExchange

This component, `ClientExchange`, is designed to be a flexible interface for accessing and manipulating exchange data within a backtesting framework. It handles fetching historical and future candle data, calculating VWAP prices, and formatting quantities and prices based on exchange-specific rules.

To get historical candle data, you can use `getCandles`, which retrieves data going backwards from a specific point in time.  `getNextCandles` works similarly, but fetches future data, crucial for simulating trading signals.

Need to know the average price? `getAveragePrice` computes a volume-weighted average price based on recent 1-minute candles.  There are also utilities for grabbing the last close price (`getClosePrice`) and properly formatting trade quantities and prices (`formatQuantity`, `formatPrice`) so they conform to exchange standards.

For maximum flexibility, `getRawCandles` allows you to specify start and end dates and limits for retrieving candle data, offering fine-grained control.  It ensures that the data retrieval respects the execution context to avoid looking into the future.  Finally, `getOrderBook` and `getAggregatedTrades` can retrieve order book and trade data, respectively, following similar alignment and time-based principles.

## Class ClientAction

The `ClientAction` component acts as a central hub for managing and executing action handlers within your trading strategy. It handles the lifecycle of these handlers, ensuring they're properly initialized, events are routed to them, and resources are cleaned up when they're no longer needed. Think of it as a mediator between the core strategy execution and the custom logic you write to manage things like state, logging, notifications, and analytics.

It uses a "singleshot" approach for initialization and disposal, guaranteeing these actions happen only once, preventing unexpected behavior. The `signal` methods provide a way to send different types of events to these handlers, categorized by whether they come from live trading, backtesting, or specific conditions like breakeven, partial profit/loss, or ping events.  Crucially, the `signalSync` method offers a way to control position opening and closing, but it’s designed to directly pass any errors it encounters to a separate error handling mechanism.

## Class CacheUtils

CacheUtils helps manage and speed up your trading strategies by automatically caching function results. It’s designed to avoid recalculating the same things over and over, especially when dealing with data that changes on a timeframe like every minute or hour.

You can think of it like this: it wraps your functions so they remember previous answers based on the timeframe you specify. 

Here's a breakdown:

*   **`fn`**: This is the main tool – it wraps regular functions so they’re cached based on a timeframe. This is really helpful for computations that are tied to market conditions that change regularly.
*   **`file`**: This is like `fn`, but it stores the cached results in files on your computer. This is useful for larger or more complex calculations that take a long time to compute. The files are stored in a specific folder for organization.
*   **`dispose`**: If you need to force a function to recalculate, you can "dispose" its cache. This clears out the old cached results, and the next time the function is called, it'll run from scratch.
*   **`clear`**: Sometimes, you need to completely wipe the slate clean—this clears *all* caches.
*   **`resetCounter`**: This ensures new file-based caches start with index zero, preventing potential conflicts when the directory structure changes.

CacheUtils is a single, shared helper to simplify this caching process across your strategy.

## Class BrokerBase

The `BrokerBase` class is the foundation for connecting your trading strategies to real-world exchanges. Think of it as a customizable bridge that allows your strategies to interact with brokers like placing orders, updating stop-loss levels, and recording trades. It provides a built-in structure and default actions for common broker tasks, saving you a lot of initial setup.

You can extend this class to create adapters for specific exchanges, essentially telling your strategies how to talk to them.

Here's a breakdown of how it works:

1.  **Initialization:** The `waitForInit()` method allows you to perform any necessary setup when the broker starts, such as logging into an exchange or loading configuration data.

2.  **Event Handling:** As your strategy executes, the `onSignalOpenCommit`, `onSignalCloseCommit`, `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit`, and `onAverageBuyCommit` methods are triggered. These events tell the broker what actions to take, like placing orders or updating existing orders. Each of these methods contains default logging behavior, but you'll override these functions to actually interact with your chosen exchange.

3. **Lifecycle:** There's no explicit cleanup, so anything you need to do when the broker shuts down should be handled during initialization's teardown or externally.

This base class provides a solid starting point for building robust and flexible trading systems.


## Class BrokerAdapter

The `BrokerAdapter` acts as a middleman between your trading strategy and the actual broker, providing a crucial safety net and control point. Think of it as a gatekeeper for any actions your strategy wants to take – like opening or closing positions, setting stop-losses, or averaging into a trade. It ensures these actions are processed correctly and prevents accidental data corruption.

When testing your strategy (backtesting), these actions are skipped silently, so they don't affect the simulated results. However, when you’re live trading, the `BrokerAdapter` forwards these actions to the registered broker.

Before any critical changes happen within your strategy's core data, the `BrokerAdapter` intercepts certain operations and gives you a chance to review or modify them. If anything goes wrong during this process, the change is rolled back, keeping your data consistent.

To use the `BrokerAdapter`, you first need to provide it with a connection to your broker – either by passing in a broker instance directly or a blueprint to create one. Then, you activate the adapter to start routing signal events and you can deactivate it to stop. Don't forget that the `clear` function is important if your environment changes and the adapter needs to recreate a broker instance.

## Class BreakevenUtils

This class helps you analyze and report on breakeven events, providing insights into your trading strategy’s performance. It acts as a central place to gather and present information about when your positions reached breakeven.

You can use it to pull out key statistics like the total number of breakeven events that have occurred. It can also generate detailed markdown reports that list each breakeven event with crucial details such as the symbol traded, the strategy used, the position taken (long or short), the entry and breakeven prices, and the time it happened.

Finally, it can automatically save these reports to files, organizing them by symbol and strategy for easy access and review. The reports are created in markdown format, making them easy to read and share.

## Class BreakevenReportService

The BreakevenReportService helps you keep track of when your trading signals reach a breakeven point. It acts like a recorder, listening for these events and saving all the details – like what signal triggered it – to a database. 

You can easily tell it to start listening for these events, and it will automatically log them. Once you're done, there’s a simple way to tell it to stop listening. The service ensures it doesn't accidentally start listening multiple times, preventing confusion and errors. 

It uses a logger to help with debugging and relies on a system for writing data persistently. This makes it a valuable tool for analyzing trading performance and identifying trends.


## Class BreakevenMarkdownService

The BreakevenMarkdownService helps you automatically create and save reports detailing breakeven events for your trading strategies. It listens for these events and organizes them, creating easy-to-read markdown tables summarizing the data. 

You can request overall statistics like the total number of breakeven events, and the service automatically saves these reports to your computer in a structured directory. 

The service manages its data using isolated storage containers, ensuring events for different symbols, strategies, exchanges, timeframes, and backtests are kept separate. You have control over clearing this data when needed, either for a specific combination or all of them at once. The service provides methods for retrieving statistics, generating markdown reports, and saving those reports to disk, making it a comprehensive solution for tracking and documenting breakeven behavior.

## Class BreakevenGlobalService

This service, BreakevenGlobalService, acts as a central point for managing breakeven tracking within the system. It's designed to be injected into strategies, simplifying how they interact with breakeven functionality.

Think of it as a traffic controller: it receives requests related to breakeven calculations and ensures they're handled correctly.

It relies on other services—like a logger, connection service, and validation services—to perform the actual work. Before anything happens, it logs the activity to provide a clear record of what's going on. 

This helps in monitoring breakeven operations, allowing for easier debugging and understanding of how the system is behaving.

The `validate` method ensures that the strategy, risk, exchange, and frame are all properly configured. 

The `check` method determines if a breakeven should occur and signals if needed, while the `clear` method resets the breakeven state when a signal closes.

## Class BreakevenConnectionService

The BreakevenConnectionService manages and tracks breakeven points for trading signals. It's designed to create and manage individual breakeven calculations for each signal, preventing redundant computations.

Think of it as a central hub that creates and holds onto information about each signal's breakeven – it caches these calculations to be fast and efficient. It gets information from other parts of the system through injected services.

When you need to know if a breakeven condition has been met or needs to be cleared, the service handles that, working with the specific breakeven calculation for that signal. This service ensures breakeven calculations are properly cleaned up and resources are managed.


## Class BacktestUtils

This class provides tools and shortcuts for running and analyzing backtests within the trading framework. Think of it as a central hub for common backtesting tasks.

It offers a straightforward way to execute backtests using `run` or `background`, which handle the complexities of running the tests and managing their results. The `background` option is perfect for tests that you just want to run and forget, like generating logs or callbacks.

You can retrieve pending or scheduled signals using `getPendingSignal` and `getScheduledSignal` respectively. These are helpful when you want to inspect the state of a trading strategy.

Several methods give insights into the performance of a position, such as `getTotalPercentClosed`, `getTotalCostClosed`, `getPositionPnlPercent`, and `getBreakeven`.  They allow you to examine things like how much of a position is still open and the potential profit or loss.

`getPosition*` methods provide detailed information about a position's history, including entry prices (`getPositionLevels`), partial closes (`getPositionPartials`), and the estimated time until expiration (`getPositionEstimateMinutes`).

The utility also helps with managing the backtest process. You can halt ongoing tests with `stop` or manually trigger actions like activating a scheduled signal (`commitActivateScheduled`).  Methods like `commitPartialProfit` and `commitTrailingStop` allow for simulated adjustments to stop-loss and take-profit levels.

Finally, `list` displays a rundown of all active backtest instances and their status, offering a quick overview of what's currently running.  `getReport` and `dump` help you create and save formatted reports of your backtesting results. This helps you easily analyze and share findings.


## Class BacktestReportService

This service helps you keep a detailed record of what's happening during your backtests. It essentially acts as a listener, capturing every important change in your trading signals – when they're idle, opened, active, or closed.

The service meticulously logs these events along with all the relevant details for each tick. This information is then saved to a database, allowing you to later analyze and debug your backtesting strategies.

To make sure you don't accidentally log the same events multiple times, the service uses a special mechanism to prevent duplicate subscriptions. 

You can easily start collecting data by subscribing to the backtest signal emitter; the service provides a way to unsubscribe later when you're done.

## Class BacktestMarkdownService

The BacktestMarkdownService helps you create and save detailed reports about your trading strategies during backtesting. It listens for market data updates (ticks) and keeps track of when signals close.

The service organizes closed signal information, creating separate storage areas for each symbol, strategy, exchange, timeframe, and backtest configuration. This ensures that data from different tests remains isolated.

You can request summary statistics, generate formatted markdown reports showing signal details, and automatically save these reports as files on your disk. The service creates the necessary directories to store the reports.

It's designed to be used within the backtesting process, and you can subscribe to receive tick events and unsubscribe when you're finished. The service also includes a way to clear out all accumulated data, or just data for a specific backtest configuration.

## Class BacktestLogicPublicService

This service helps manage and run your backtests, making them easier to execute and understand. It handles the complexities of keeping track of important information like the strategy name, exchange, and timeframe during the backtest process.

Essentially, it simplifies how you access data and signals needed for your strategy – you don't have to manually pass those details around.

The `run` function is the core of this service; it's what actually executes the backtest. It takes a symbol as input and streams back the results of your strategy's actions (like opening, closing, or canceling trades). The context information is automatically passed to all the underlying functions, ensuring everything works together smoothly. You'll get results from the backtest as an asynchronous generator.

## Class BacktestLogicPrivateService

The BacktestLogicPrivateService manages the entire backtesting process, handling data flow and signal processing efficiently. It starts by retrieving the necessary timeframes and then systematically processes each one.

When a trading signal appears, the service fetches the required historical data and executes the backtest logic. It intelligently skips ahead to the timeframe when the signal closes, ensuring accurate and timely results.

Instead of storing all the backtest results in memory, it streams them as they become available, which is incredibly helpful for large datasets and prevents performance bottlenecks. You can even stop the backtest early if needed.

The service relies on several core services to function, including those for handling strategy logic, exchange data, timeframes, method context, and actions. The `run` method kicks off the backtest for a specific symbol, producing a stream of results representing the ticks, signals, and ultimately, the final results.

## Class BacktestCommandService

This service acts as a central point for accessing backtesting capabilities within the framework. It's designed to be easily used within your application’s dependency injection system.

Think of it as a convenient bridge to the core backtesting logic.

Several essential services are involved internally, including those for logging, validating strategy and risk aspects, and checking the validity of exchanges and frames. 

You can use the `run` method to start a backtest for a specific trading symbol, providing details about the strategy, exchange, and frame involved. The `run` method provides scheduled, opened, closed, and cancelled strategy tick results as it processes the backtest.


## Class ActionValidationService

The ActionValidationService helps you keep track of your action handlers and makes sure they're available when you need them. It's like a librarian for your actions, ensuring everything is properly registered and organized. 

You can use `addAction` to register new action schemas, essentially adding them to the librarian’s catalog.  When you're ready to use an action, `validate` checks if it exists within the catalog, preventing errors. 

To see a complete list of all the registered action schemas, `list` provides a handy overview. The service even uses a smart caching system to speed things up, remembering previous validation results so it doesn't have to repeat checks unnecessarily.


## Class ActionSchemaService

This service acts as a central hub for managing how actions are defined and used within the system. It keeps track of action schemas, ensuring they are structured correctly and contain only the methods that are allowed.

It uses a type-safe registry to store these schemas, and it checks that the action handlers you provide follow the expected format.

You can register new action schemas, which involves validating their structure and the methods they use. If a schema already exists with that name, the registration will fail.

The service also provides a way to update existing schemas with only the changes you need, instead of redefining the entire thing.

Finally, you can retrieve a schema by its name to get all its details, like the handler and any callback functions it uses. This is an important step in using the actions within the system.


## Class ActionProxy

The `ActionProxy` acts like a safety net around your custom trading logic, ensuring that any errors in your code don't bring the entire system down. It essentially wraps all of your action handlers (like those for signals, breakeven, partial profits, etc.) in a `try...catch` block. If an error occurs within one of those handlers, it's logged, reported, and the system continues running—preventing crashes.

Think of it as a universal error handler for your actions.

It’s designed to work with partial implementations; if a particular action method isn't provided, it handles that gracefully by returning `null`.  You create an `ActionProxy` using the `fromInstance` method, which takes your action handler and some parameters. 

Here's a breakdown of the methods it manages:

*   `init`: Called during initialization.
*   `signal`: Handles regular signals.
*   `signalLive`: Handles live trading signals.
*   `signalBacktest`: Handles backtesting signals.
*   `breakevenAvailable`:  Handles breakeven events.
*   `partialProfitAvailable`: Manages partial profit level events.
*   `partialLossAvailable`: Handles partial loss level events.
*   `pingScheduled`:  Handles scheduled signal pings.
*   `pingActive`:  Manages active position pings.
*   `pingIdle`:  Handles periods of inactivity.
*   `riskRejection`:  Handles signals that are rejected by risk management.
*   `signalSync`: A critical gate for order placement - errors here are intentionally passed through.
*   `dispose`:  Cleans up resources at the end.

The `signalSync` method is the only exception - errors are allowed to propagate from it, to ensure issues with order placement are not masked.  This component makes your trading strategies more robust and stable by isolating potential errors.

## Class ActionCoreService

The ActionCoreService acts as a central hub for managing actions within a trading strategy. It's responsible for coordinating how actions are triggered and executed based on the strategy's configuration.

Essentially, it takes a strategy's definition, extracts the list of actions it needs to perform, and then systematically invokes those actions when specific events occur (like receiving market data or reaching certain conditions).

Here's a breakdown of its key functions:

*   **Initialization:** It prepares individual actions by retrieving their settings from the strategy's schema and loading any persistent state.
*   **Event Handling:** It routes different types of events – like new market data (signal), breakeven points, partial profit/loss targets, scheduled pings, and risk rejections – to the appropriate actions.
*   **Validation:**  It rigorously checks the strategy's setup, including names, exchange configurations, and risk profiles, to ensure everything is valid before execution. This validation is cached to improve performance.
*   **Synchronization:** It provides a way to coordinate actions to ensure they all behave in a synchronized manner, especially when managing positions.
*   **Cleanup:**  It gracefully shuts down actions and releases resources when a strategy finishes running.
*   **Data Clearing:** It has a function to clear action data, either for a specific action or across all strategies.

The service uses several other services internally for tasks like logging, action connection, validation, and strategy schema management. This makes it a core component for the framework's overall functionality.

## Class ActionConnectionService

This service acts as a central hub for directing different actions within your trading strategies. It essentially routes specific events – like signals, breakeven updates, or scheduled pings – to the correct action handler. To optimize performance, it remembers previously created action handlers, avoiding repetitive creation.

Think of it like a traffic controller, making sure each event reaches the right place.

The service relies on other components like a logger and schema service, and the actual action handlers are created dynamically based on their name and the context of the strategy and frame.

It provides a set of methods for handling various events, each corresponding to a specific action type. For example, `signalLive` handles real-time data, while `signalBacktest` deals with historical data simulations.  The `dispose` and `clear` methods are used to clean up resources and invalidate cached action handlers when they are no longer needed. The `getAction` property is key, as it's responsible for retrieving or creating these action handlers using caching techniques.

## Class ActionBase

This class, `ActionBase`, is designed to simplify creating custom action handlers for your trading strategies. Think of it as a starting point for handling events like signals, breakeven adjustments, and profit/loss milestones. It handles the repetitive tasks like logging events and provides access to key information about your strategy.

You can extend this base class to add custom logic for things like sending notifications via Telegram or Discord, managing your state with Redux, collecting analytics, or even triggering business rules.

The class lifecycle involves initialization (`init`), receiving various event notifications (`signal`, `signalLive`, `signalBacktest`, `breakevenAvailable`, etc.), and finally cleanup (`dispose`).

Here's a quick overview of those event notifications:

*   `signal`:  A general signal event, triggered on every tick in all modes (live and backtest).
*   `signalLive`:  Specifically for live trading, use this for actions that shouldn't run during backtests.
*   `signalBacktest`: For actions only relevant to backtesting, like data collection.
*   `breakevenAvailable`: Notified when your stop-loss is moved to the entry price.
*   `partialProfitAvailable`:  Triggers when a signal reaches predefined profit levels (10%, 20%, etc.).
*   `partialLossAvailable`:  Triggers when a signal reaches predefined loss levels.
*   `pingScheduled`: Notifies you every minute a signal is waiting to be activated.
*   `pingActive`:  Notifies you every minute a pending signal is active.
*   `riskRejection`: Tells you when a signal has been rejected due to risk management.
*   `pingIdle`:  Alerts you every tick when there are no pending or active signals.

The `dispose` method is crucial for cleaning up any resources your custom actions use when the strategy is finished, ensuring no lingering connections or tasks. This framework manages event emissions and logging for you, allowing you to focus on your strategy’s specific logic.
