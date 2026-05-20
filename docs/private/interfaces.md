---
title: private/interfaces
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


# backtest-kit interfaces

## Interface WalkerStopContract

This interface defines the information shared when a walker needs to be stopped. Think of it as a notification system for pausing or interrupting trading processes.

It tells you exactly *what* is being stopped – the trading symbol involved, the name of the strategy being used, and the specific walker instance that needs to be halted.

This is particularly useful when you have multiple automated trading systems running at the same time; it allows you to pinpoint which one should be stopped. The walkerName property makes it possible to target a specific instance of a walker, even if several walkers are running under the same strategy and symbol.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of your backtesting experiments. It's a collection of data representing how different trading strategies performed.

Specifically, it includes a list of `strategyResults`, which are essentially detailed reports for each strategy you tested, outlining their performance metrics. This allows for a clear comparison of how various approaches stack up against each other.


## Interface WalkerContract

The WalkerContract represents the progress updates you receive while backtest-kit compares different trading strategies. It essentially tells you what's happening behind the scenes as the framework evaluates each strategy.

Each time a strategy finishes testing, you'll get a new WalkerContract event. This event contains details like the strategy's name, the exchange and symbol being tested, and performance statistics.

You'll also see information about the optimization process, including the metric being optimized, the best metric value found so far, and the name of the best-performing strategy. Finally, the contract keeps track of how many strategies have been tested and the total number of strategies in the comparison. This lets you monitor the overall progress of the backtesting process.

## Interface WalkerCompleteContract

This interface represents the final notification you receive after a full comparison of trading strategies using the backtest-kit. It signals that all tests are complete and the results are ready.

The notification includes key details like the name of the walker (the testing process), the trading symbol being evaluated, the exchange and timeframe used.

You'll also find information about the optimization metric used, the total number of strategies tested, and crucially, the name of the best-performing strategy.

Furthermore, it provides the metric value achieved by the best strategy and a detailed breakdown of its performance statistics. Essentially, it's a comprehensive report on the entire backtest process and its outcome.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your backtesting or trading simulation. 

It provides details about the error, including a unique identifier, a human-readable message explaining what went wrong, and a serialized error object containing technical information like a stack trace. 

The `backtest` property is always false, indicating that the error originated from a live environment, not the backtest itself. This notification helps you understand and address issues related to your risk management rules and constraints.

## Interface ValidateArgs

This interface, ValidateArgs, provides a way to ensure the names of different components within your backtesting system are valid. Think of it as a safety net for your configurations. 

It defines properties like `ExchangeName`, `FrameName`, `StrategyName`, and others, each representing a specific part of your trading setup. 

For each property, you’ll supply a type (often an enum) which the system will then check against a list of registered names. This helps prevent typos or incorrect references that could lead to errors during backtesting. Essentially, it enforces consistency and helps catch issues early on.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take-profit order has been executed, essentially confirming your trailing stop-loss strategy has triggered a profit-taking action. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred in a backtest or live trading environment.

You'll find details about the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange involved. It also breaks down key pricing information like the entry price, take-profit price (adjusted by trailing), and original prices, helping you understand how the trailing mechanism affected the trade.

Beyond the basic trade details, the notification includes comprehensive performance metrics. You’ll find the position’s total profit and loss (PnL), peak profit and drawdown figures, and metrics like pnlPercentage that gives you a clear picture of the trade’s profitability. It also records details about the number of entries and partial closes if you're using averaging or partial exits.  Finally, it includes optional notes and timestamps related to signal scheduling and when the position became active.

## Interface TrailingTakeCommit

This interface describes a trailing take profit event that occurs during trading. It provides detailed information about the adjustment to the take profit price based on market movement.

The event includes the current market price and the percentage shift used to calculate the new take profit level. 

You'll find data related to the position’s performance, like profit and loss (pnl), peak profit achieved, and maximum drawdown experienced. It also specifies the trade direction (long or short), the original entry price, and the original and adjusted take profit and stop loss prices. 

Finally, timestamps are provided to track when the signal was generated and when the position was activated. This allows for a complete record of how the position was managed and the reasons behind the trailing take adjustment.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed, providing a wealth of details about the trade. It's like a detailed report card for when your trailing stop actually did something.

You'll find key information like a unique ID for the notification, the exact time it happened, and whether it occurred during a backtest or a live trading scenario. It specifies the trading pair, the strategy that initiated the signal, and the exchange involved.

The report breaks down the specifics of the trade, including the initial percentage shift of the stop loss, the current market price at execution, the trade direction (long or short), and the entry and stop-loss prices – both original and adjusted for trailing.

Beyond that, you get a full picture of the trade’s performance: total profit and loss (PNL), peak profit achieved, maximum drawdown, and various price points related to these metrics. It also includes details about the number of entries and partial closes, and even the total capital invested. Finally, there's a field for optional notes offering a human-readable explanation for the signal.

## Interface TrailingStopCommit

This describes what happens when a trailing stop order is triggered. It's a notification that the system has automatically adjusted a stop-loss price based on the trailing stop logic.

The `action` property simply confirms that this is a trailing stop event. The `percentShift` tells you the percentage used to calculate the stop-loss adjustment.

You’ll also find details about the trade itself, including the current market price (`currentPrice`), the position's profit and loss (`pnl`), and its peak profit and drawdown.

The `position` property indicates whether it's a long (buy) or short (sell) trade. Key price points like the entry price (`priceOpen`), take profit (`priceTakeProfit` and `originalPriceTakeProfit`), and stop-loss (`priceStopLoss` and `originalPriceStopLoss`) are provided.  

Finally, timestamps (`scheduledAt` and `pendingAt`) provide information about when the signal was generated and when the position was activated.

## Interface TickEvent

This describes the `TickEvent` object, which is designed to hold all the information about a trading event, regardless of what happened. It's like a single container for all the details of a trade, making it easier to analyze and generate reports.

The object contains properties such as the event's timestamp, the type of action that occurred (like "closed," "opened," or "scheduled"), and details about the trade itself like the symbol, signal ID, position type, and prices involved (open, take profit, stop loss). You'll also find information about DCA averaging like the total entries and partial executions.

Financial performance metrics like profit and loss (both in USD and as a percentage), progress toward take profit and stop loss, and durations are also included. Finally, it records reasons for actions like closing or cancellation, along with peak and fall performance indicators for closed positions. Certain properties are only relevant depending on the specific action taken.

## Interface SyncStatisticsModel

This model helps you understand how your trading signals are syncing up. It provides a collection of events that occurred during the sync process, allowing you to see exactly what happened. You can also get the total number of sync events, and easily check how many signals were opened and closed through the sync. This gives you a clear picture of the signal lifecycle activity.

## Interface SyncEvent

This data structure holds all the important information about what happened during a trading signal's lifecycle, designed to be easily displayed in reports. Each time something significant occurs – like a signal being created, a trade being opened, or a position being closed – a `SyncEvent` is generated.

It records details like the exact time of the event, the trading pair involved, the strategy used, and the exchange.  You’ll find information about the signal itself – its unique ID, whether it was part of a backtest, and its creation date.

Crucially, it includes specifics about the trade: the direction (long or short), entry and exit prices (take profit and stop loss), and any adjustments made to those prices. If the trade involves averaging (DCA), you'll see the total number of entries.

The `SyncEvent` also tracks financial performance, including the position’s P&L, peak profit, and maximum drawdown, along with the reason for closing the position. This comprehensive record allows for a detailed understanding of each signal's performance.

## Interface StrategyStatisticsModel

This model holds a collection of statistics about your trading strategy's actions during a backtest. It’s essentially a record of what your strategy did and how often.

You'll find a detailed list of every event the strategy generated, along with the overall number of events recorded. 

The model also breaks down the counts of specific types of actions, such as canceling scheduled orders, closing pending orders, taking partial profits or losses, adjusting trailing stops, setting breakeven points, activating scheduled orders, and performing average-buy (dollar-cost averaging) actions. This allows you to analyze the behavior of your strategy in great detail.

## Interface StrategyEvent

The `StrategyEvent` object holds all the details about actions your trading strategy takes, whether it's a backtest or a live trade. Think of it as a comprehensive record of every move your strategy makes. It includes things like the exact time of the action, the trading pair involved, the strategy's name, and the exchange it's operating on.

You'll also find information like the signal ID, the type of action taken (buy, sell, close, etc.), the current market price at the time, and any percentages used for profit/loss targets or trailing stops. For actions like scheduled or pending orders, unique IDs are provided to track them. 

Crucially, the event specifies whether it occurred during a backtest or a live trading session, the trade direction (long or short), and key price points like the entry price, take profit, and stop loss, along with their original values before any trailing adjustments.

If your strategy uses averaging techniques (like DCA), you'll see details about the total entries and the effective averaged entry price. The Profit and Loss (PNL) at the time of the event is also captured, along with the cost of an entry, and an optional note can be included for additional context. It essentially provides a full story of each event, allowing for detailed analysis and reporting.

## Interface SignalSyncOpenNotification

This notification signals that a pre-planned trading order (a limit order) has been triggered and a position has been opened. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or in live trading. You'll find details like the trading pair (e.g., BTCUSDT), the strategy that initiated the trade, and the exchange used.

The notification also includes extensive performance data related to this trade, such as the total profit/loss (PNL), the highest profit achieved, the maximum drawdown (peak loss), and corresponding prices.  It breaks down the cost of entry, the position direction (long or short), and the initial entry, take profit, and stop-loss prices. Furthermore, it tracks details about any averaging (DCA) or partial closings that may have occurred during the trade’s life.  Finally, the notification includes timestamps for signal creation, activation, and its own creation time, along with an optional explanation for the signal's generation.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was due to a profit target, a stop-loss, time expiration, or a manual closure. It provides a wealth of information about the closed trade, including when it happened, the trading pair involved, and which strategy generated the signal. You'll find details on the trade's performance, like its profit and loss (both absolute and as a percentage), peak profit achieved, and maximum drawdown experienced.

The notification breaks down the complete history of the position, from the initial entry price to the final exit price, along with the number of entries and partial closures that occurred.  You can also see when the signal was initially scheduled, when the position was activated, and a description of why the trade was closed. Finally, it provides a timestamp for when the notification itself was created.

## Interface SignalSyncBase

This interface defines the basic information common to all signal synchronization events within the backtest-kit framework.  Each event, whether generated during a backtest or in live trading, carries details about the trading pair involved, like "BTCUSDT." It also identifies the strategy responsible for the signal, the exchange it was executed on, and the timeframe used for analysis, which is only relevant during backtesting. 

You'll find a unique ID for each signal, a timestamp reflecting when it occurred (linked to either a tick or a candle), and the full signal data itself – providing a complete record of the signal at that specific moment. Essentially, it provides a foundational structure for understanding the context of a signal’s creation and execution.


## Interface SignalScheduledNotification

This notification type lets you know when a trading signal has been set to execute in the future. It essentially confirms that a trade is planned, rather than happening immediately. The notification includes a unique ID, the time it was scheduled, and whether it's part of a backtest or a live trading scenario. 

You'll find details about the trade itself: the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange it will use.  It also specifies the trade direction (long or short), the intended entry price, and stop-loss/take-profit levels.

Beyond the basic trade details, the notification provides a wealth of performance information about the potential trade, including calculated profit/loss (pnl), peak profit achieved, and maximum drawdown – helping you understand the risk/reward profile. There's also information on how the signal was constructed and potentially modified, like DCA entries, trailing stops, and the reasoning behind the signal (the 'note' field). Finally, it tells you when the signal was created and the market price at the time of scheduling.

## Interface SignalOpenedNotification

This notification tells you when a new trade has been opened. It’s essentially a signal that a position is now active, whether it's a long (buy) or short (sell) trade.

You'll get detailed information about the trade, including a unique ID, when it happened, and whether it was part of a backtest or a live trade.  The notification specifies the trading pair (like BTCUSDT), the strategy that triggered the trade, and the exchange where it was executed.

It provides a wealth of data about the trade itself: the entry price, take profit and stop-loss levels, and how many entries (if any) were used for averaging. You'll also see the total cost of entering the position and performance metrics, like profit/loss (both in USD and percentage), peak profit, and maximum drawdown.  There's even information about the entry and exit prices used for P&L calculations, along with details on how many entries were involved at those points. Finally, a note field allows for a human-readable explanation of why the signal was generated.

## Interface SignalOpenContract

This event, `SignalOpenContract`, is triggered when a trading signal is successfully activated, meaning your order has been filled by the exchange. Think of it as confirmation that your limit order to buy or sell has gone through.

It's particularly useful for keeping external systems in sync with what's happening in your trading framework.  For instance, if you're using an external order management system or need to keep detailed audit logs, this event provides the data you need.

The event provides a wealth of information about the trade, including the price at which it was opened, the total profit and loss (both current and peak), and the original take profit and stop loss levels.  You’ll also find details about the number of entries and partial closes, giving you a complete picture of how the position was built and managed. This is helpful for tracking how your strategy performs and auditing your trading activities. The `scheduledAt` and `pendingAt` timestamps tell you when the signal was initially planned and when it actually became active.

## Interface SignalInfoNotification

This notification type provides information about positions managed by a trading strategy. It’s used when a strategy wants to share extra details about an open trade, like a helpful note or important performance metrics.

Each notification contains details such as the strategy’s name, the exchange used, a unique ID for the signal, and the current market price. You'll find specifics about the trade itself, including the direction (long or short), entry price, take profit, and stop-loss levels, as well as the original values before any trailing adjustments.

The notification also includes extensive performance data, such as profit and loss (both in USD and as a percentage), peak profit, maximum drawdown, and related prices and entry counts. A descriptive note allows strategies to communicate custom information, and optional IDs can help link notifications to external systems. Timestamps provide a detailed history of the signal’s lifecycle, from scheduling and pending to creation.


## Interface SignalInfoContract

This structure provides a way for trading strategies to send out custom informational messages related to their actions, particularly regarding open positions. Think of it as a way for your strategy to "shout out" what it's doing, like "I'm opening a position in BTCUSDT!"

Each message, or "signal info," includes details such as the trading symbol (e.g., BTCUSDT), the name of the strategy generating it, the exchange being used, and the frame (testing environment). 

You'll also find the complete data associated with the signal, the current price at the time, a custom note you can provide, and a unique identifier for tracking. Importantly, there’s a flag indicating whether the event occurred during a backtest (using historical data) or live trading. Finally, a timestamp records when the event happened. These notifications can be used for debugging, custom displays, or sending information to external systems.

## Interface SignalData$1

This data structure holds the details of a completed trading signal, perfect for analyzing performance. It tells you which strategy created the signal, assigns a unique ID to it, and specifies the symbol being traded. You'll also find the position taken (long or short), the percentage profit or loss (PNL), and the reason the signal was closed. Finally, it tracks the exact times the signal was opened and closed, allowing for precise analysis of its lifespan and behavior.

## Interface SignalCommitBase

This defines the fundamental information shared by all signal commitment events within the backtest-kit framework. Each signal commit contains details about the trading pair, the name of the strategy that generated it, and the exchange where it's being executed. You'll also find information about the timeframe being used (relevant for backtesting) and whether the event originated from a backtest or live trading session.

A unique identifier is assigned to each signal, along with the timestamp of its execution. The number of entries and partial closes provides insight into the order fill status. It also keeps track of the original entry price, the signal data itself, and an optional note to explain why the signal was triggered.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was triggered by a take profit or stop loss, or by other means. It provides a wealth of information about the trade, including a unique identifier, when it occurred, and whether it was part of a backtest or a live trade. You’ll find details like the symbol traded, the strategy used, and the entry and exit prices.

The notification also dives into the specifics of the position's performance: you can see the profit/loss percentage, total profit/loss in USD, peak profit details, maximum drawdown information, and even the number of entries made.  There's also data concerning partial closes, trailing stop adjustments, and a human-readable note that explains the reason for closure. Finally, it includes timestamps for signal creation, pending, and closure, as well as the creation timestamp of the tick result.

## Interface SignalCloseContract

This event, called `SignalCloseContract`, lets you know when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiry, or a manual closure. It's designed to help systems outside of the core trading engine stay in sync, like managing orders or keeping track of profits and losses.

The event includes key details about the closed position: the current market price, the total profit and loss (PNL), the highest profit reached, the largest drawdown experienced, the trade direction (long or short), and the entry and exit prices. You’ll also find the original take profit and stop loss prices, the timestamps for signal creation and position activation, and crucially, *why* the signal was closed. The event also provides information on the number of initial entries and any partial closures that occurred during the trade, which is particularly helpful for strategies using averaging techniques.

## Interface SignalCancelledNotification

This notification is sent when a signal that was planned to be executed is cancelled before it actually happens. It provides detailed information about the cancelled signal, acting like a record of what *would have* happened. 

You'll find details like the unique identifier of the signal, the trading pair involved (e.g., BTCUSDT), and the name of the strategy that generated it. It also includes data about the intended trade – whether it was a long (buy) or short (sell) position, and the planned take profit and stop-loss prices.

The notification also gives insight into *why* the signal was cancelled, which could be due to a timeout, price rejection, or a manual cancellation by a user. You can find information about the timing of the signal's lifecycle, from when it was initially created to when it was cancelled, and even the entry price the signal was using. This is particularly helpful for debugging and understanding why trades weren’t executed as planned.

## Interface Signal

The `Signal` object holds all the key information about a specific trading signal generated by your strategies. It essentially tracks the lifecycle of a trade, from its beginning to its potential exits.

It contains the `priceOpen`, which tells you the initial price at which the position was opened.

The `_entry` property is an array that stores details about each entry made into the position – the price at entry, the total cost, and the timestamp of that entry. 

Furthermore, `_partial` is an array that holds data about any partial exits taken during the position’s life, noting the type of exit (profit or loss), the percentage of the position exited, the price at the time of exit, the cost basis, and the number of shares/contracts at the time of exit, along with its timestamp.

## Interface Signal$2

This `Signal` object tracks details about a trading position.

It keeps track of the initial entry price using the `priceOpen` property, which represents the price at which you first got into the trade.

You'll also find a record of all entry events – including the price, total cost, and timestamp – stored in the `_entry` array.

Similarly, the `_partial` array contains a history of any partial exits from the position, noting whether they were for profit or loss, the percentage taken, the price at the time, the cost basis, the entry count, and the timestamp of the partial exit.

## Interface Signal$1

The `Signal$1` object holds key information about a trading signal. It tracks the initial entry price using the `priceOpen` property, giving you a quick reference to where the trade began. 

You'll also find details about each individual entry made, stored in the `_entry` array, including the price, total cost, and the exact time of the entry.

Finally, `_partial` stores records of any partial adjustments to the position, such as taking profits or cutting losses, noting the type of adjustment, percentage, current price, cost basis at the time, number of entries at close, and the timestamp. This allows for a complete view of position management.

## Interface ScheduledEvent

This data structure bundles all the important details about trading events – whether they were scheduled, opened, or canceled – to help you analyze and understand how your strategies performed. Each event record includes the exact time it occurred, what type of action took place, and key information about the trade itself like the symbol, signal ID, position type, and any notes associated with the signal.

You'll find pricing details such as the current market price, the intended entry price, take profit, and stop loss levels, along with their original values before any adjustments were made. If you used a DCA (dollar-cost averaging) strategy, it includes information on the total number of entries and partial closes.

For canceled events, you'll see the reason for the cancellation and a unique ID if it was a user-initiated action, along with how long the event lasted.  The data also tracks the unrealized profit and loss (PNL) at the time of the event and the time when the position became active.  Finally, it captures the original scheduling timestamp, which is relevant for all event types.

## Interface ScheduleStatisticsModel

This model holds key statistics about signals that are scheduled for future execution. It lets you monitor how many signals you're scheduling, and how many of those actually become active or are cancelled.

You'll find details about each scheduled event within the `eventList` property, providing a comprehensive record.

The model also calculates important metrics such as the total number of events, scheduled signals, opened signals, and cancelled signals.

It provides insights into signal behavior through rates: the `cancellationRate` (how often scheduled signals are cancelled – aiming for a low number is good) and the `activationRate` (how often scheduled signals become active – aiming for a high number is good).

Finally, it calculates average waiting times for cancelled and opened signals, allowing you to analyze delays in those processes.

## Interface SchedulePingContract

This contract, `SchedulePingContract`, helps you keep tabs on signals that are actively being monitored on a schedule. Think of it as a heartbeat – it's sent every minute while a signal is running, letting you know it’s still active and being watched.

It's incredibly useful for building custom monitoring and cancellation logic because it provides detailed information about the signal.

Here's what you get in each ping:

*   **symbol:** The market being traded (like BTCUSDT).
*   **strategyName:** Which strategy is in charge of this signal.
*   **exchangeName:** The exchange where the signal is active.
*   **data:** A complete set of details about the signal itself, including prices and positions.
*   **currentPrice:** The current market price at the time of the ping—this is a key piece of information for custom monitoring.
*   **backtest:**  A flag indicating if this is a simulation (backtest) or live trading data.
*   **timestamp:** When exactly the ping happened, which is either the live time or the candle timestamp during backtesting.

You can use functions like `listenSchedulePing` and `listenSchedulePingOnce` to receive these pings and react to them.

## Interface RiskStatisticsModel

This model holds information about risk events, specifically focusing on rejections. It’s designed to help you understand how often risks are being triggered and where they're occurring.

You'll find a complete list of individual risk events, each containing detailed information.

The model also gives you the total count of all risk rejections. 

To break down the data further, it provides counts of rejections grouped by the trading symbol and also by the strategy employed. This lets you identify potential problem areas in your system.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked because of your risk management rules. It's a way of knowing why a potential trade didn’t happen.

Each notification has a unique ID and timestamp, indicating when the rejection took place. You'll also see if it’s from a backtest or live trading environment, and which trading pair and strategy were involved.

The `rejectionNote` property provides a clear explanation of *why* the signal was rejected, making it easy to understand and adjust your risk settings. You'll find details about the trade, like the intended direction (long or short), target prices for take profit and stop loss, and the number of active positions you had open at that time.  The signal's ID and a description are also available, if provided, for more context.

## Interface RiskEvent

This data structure helps you understand why a trading signal was blocked due to risk management rules. It provides a snapshot of what happened when a signal was rejected.

You'll find details like the exact time of the rejection, the trading pair involved, and the specifics of the signal that was being considered.

It also includes information about the strategy and exchange used, along with the current market price and the number of positions already open.

A unique ID and a note explaining the reason for rejection are also included, along with whether the event occurred during a backtest or live trading.

## Interface RiskContract

The RiskContract provides information about when a trading signal was blocked because it violated risk rules. Think of it as a notification when something would have been traded, but the system prevented it due to a safety check.

Each RiskContract tells you exactly what went wrong – which trading pair was involved (symbol), the details of the proposed trade (currentSignal), which strategy wanted to make the trade (strategyName), the timeframe used (frameName), and the exchange being used.

You’ll also find the current market price (currentPrice) at the time of the rejection, how many other positions were already open (activePositionCount), and a unique ID (rejectionId) to help track down the issue.

A helpful explanation (rejectionNote) describes why the signal was rejected, and a timestamp (timestamp) marks when it happened. Finally, it indicates whether the event occurred during a backtest simulation (backtest) or live trading. This lets you differentiate between testing scenarios and actual trading activity.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive while a background process is running within the backtest-kit framework. Think of it as a progress report. 

It provides details about what's happening – which walker, exchange, and frame are involved, and what symbol is being traded. 

Crucially, you'll see the total number of trading strategies the process needs to handle, how many have been processed already, and a percentage representing the overall completion. This allows you to monitor long-running tasks and get a sense of how much longer they have to go.

## Interface ProgressBacktestContract

This contract provides updates on the progress of a backtest as it runs. It's used when you're running a backtest in the background and want to know how far along it is. You'll see information like the exchange being used, the name of the strategy, and the trading symbol (like BTCUSDT).

Each update includes the total number of historical data points (frames) the backtest will analyze, the number it has already processed, and a percentage showing how complete the backtest is. This lets you monitor the backtest's status without blocking your main application.


## Interface PerformanceStatisticsModel

This model holds a collection of performance data, organized by the strategy that generated it. 

It tracks key details like the strategy's name, the total number of performance events recorded, and the total time spent calculating these metrics.

The `metricStats` property allows you to drill down and see statistics broken out by different metric types. 

Finally, you have access to all the individual raw performance events through the `events` property, giving you a full picture of what happened during the backtest.


## Interface PerformanceContract

The `PerformanceContract` helps you understand how quickly different parts of your trading system are running. Think of it as a detailed log of operations, recording when they start and stop, and how long they take. It provides information like timestamps, the type of action being performed (e.g., data fetching, order execution), the name of the trading strategy and the exchange involved. You'll also see the symbol being traded and whether the operation happened during a backtest or in live trading. This data is invaluable for spotting slow areas in your code and optimizing your trading setup.

## Interface PartialStatisticsModel

This data structure helps you understand how your trading strategy performs when it involves taking partial profits or losses. It collects information about each profit/loss milestone reached.

You'll find a detailed list of every event that triggered a partial profit or loss, along with the overall count of all events, the number of times your strategy generated a profit, and the number of times it resulted in a loss. This breakdown lets you analyze the effectiveness of your strategy’s partial exit points.


## Interface PartialProfitContract

The `PartialProfitContract` represents a milestone reached during a trading strategy's execution, specifically when it hits a profit level like 10%, 20%, or 30%. It’s like a notification that your strategy is performing well, and a portion of its profit target has been achieved.

These notifications, or events, are generated by the system and are designed to help you monitor how your strategy is doing and to track when partial take-profit orders are triggered. You’ll see one event per level per trade, although multiple events can arrive at once if the price moves quickly.

The information provided within each `PartialProfitContract` includes details about the trading symbol (e.g., BTCUSDT), the name of the strategy executing the trade, the exchange being used, and the frame it's running within. You also get the original signal data, the current market price, the specific profit level reached (like 20%), and whether the event is from a backtest or live trading.  It also gives the time this event happened. This data is useful for creating reports and setting up custom notifications.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit has been taken on a trade. It provides a wealth of information about the trade, including when it happened, whether it was part of a backtest or a live trade, and the specific details of the strategy that triggered it. You'll find details like the trading pair (e.g., BTCUSDT), the strategy name, and the exchange used.

The notification breaks down the trade specifics, like the percentage of the position closed, the current price at the time of the partial close, and the original entry and stop-loss/take-profit prices. It also gives you a clear picture of how the position performed, showing profit/loss figures, peak profit achieved, and the maximum drawdown experienced.

You can see the exact prices used for profit/loss calculations (accounting for fees and slippage) and get an overview of how many entries were made, particularly helpful when dealing with dollar-cost averaging. Finally, there’s a field for a note providing a human-readable explanation of why the partial profit was taken, and timestamps detailing when the signal was created, scheduled, and became pending.

## Interface PartialProfitCommit

This event signals a partial profit taking action within a trading strategy. It details the specifics of what happened, including how much of the position was closed (specified as a percentage). 

You’ll find the current market price at the time of the action, along with the profit and loss (PNL) realized from that partial closing.  The data also includes information about the position’s performance—its peak profit, maximum drawdown, and entry price.

Furthermore, the event provides the original and adjusted take profit and stop-loss prices, along with timestamps indicating when the signal was created and when the position initially became active. All of this helps to understand the context and performance of the trade.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has hit a predefined profit milestone, like reaching 10%, 20%, or 30% profit. It's a way to track progress and understand how your strategy is performing. 

Each notification includes a unique ID and timestamp, along with details about whether it's from a backtest or live trade. You'll also see information about the trading pair, the strategy used, the exchange involved, and a unique signal identifier.

The notification specifies the exact profit level reached and provides key pricing data including the entry price, current price, take profit, and stop loss levels – both the initial values and any adjusted values due to trailing. 

It also summarizes the trade's history, including the number of entries and partial closes, total profit and loss (both in USD and as a percentage), and details about the peak profit and maximum drawdown experienced. A note field allows for optional human-readable explanations about the signal's reason. Finally, you'll find timestamps related to signal creation and activity.

## Interface PartialLossContract

The PartialLossContract provides information when a trading strategy experiences a loss at predefined levels, such as -10%, -20%, or -30% drawdown. It's used to keep track of how a strategy is performing and when it might be triggered to reduce potential losses.

Each event represents a single occurrence of a loss level being reached for a specific trading pair, strategy, exchange, and frame. You’ll find details about the symbol being traded (like BTCUSDT), the name of the strategy, and the exchange and frame where the trade is happening.

The contract also contains the original signal data, the current price at the time of the loss, the specific loss level (e.g., 20 represents a -20% loss), and whether it’s coming from a backtest or live trading environment. A timestamp indicates when the loss level was detected, reflecting either the real-time moment in live trading or the candle’s timestamp during a backtest. Services like PartialMarkdownService use this data to create reports, and you can use it to monitor your strategy’s drawdown. Events are designed to be unique, so you won't receive duplicates even if prices move rapidly.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You’ll find details like the trading pair, the strategy used, and the exchange involved.

The notification breaks down the specifics of the partial close, like the percentage of the position closed, the current market price, and the entry price. It also includes all the relevant pricing information such as original take profit and stop loss prices, along with DCA details if averaging was used.

Crucially, it provides a comprehensive view of the position’s performance – total profit and loss (PNL), peak profit, and maximum drawdown – all with associated prices, costs, and percentages. This data gives you a clear picture of the position's risk profile. Finally, there’s a space for a descriptive note explaining the reason for the signal and timestamps for when the signal was scheduled, pending and created.

## Interface PartialLossCommit

This object represents a partial loss event within the backtest kit framework. It signifies a situation where a portion of a trading position is being closed. 

The `action` property simply confirms this is a partial-loss event. The `percentToClose` tells you what percentage of the position is being reduced.

You’ll also find important pricing information like the `currentPrice` at the time of the action, the `priceOpen` when the position was initially entered, and the `priceTakeProfit` and `priceStopLoss` prices.

The record includes performance metrics for the position, like `pnl` (profit and loss), `peakProfit`, and `maxDrawdown` – all calculated up to the time the signal was created.  It also preserves the original take profit and stop loss prices before any trailing adjustments were made. 

Finally, timestamps indicate when the signal to close the partial position was generated (`scheduledAt`) and when the position initially started (`pendingAt`).

## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss milestone, like a 10% or 20% drawdown. It's a way to track how a strategy performs and potentially adjust its behavior.

The notification includes details like a unique identifier, the exact time it was triggered, and whether it's part of a backtest or live trading scenario. You’ll also find key information about the trade itself: the trading pair, the strategy and exchange used, the entry and stop-loss/take-profit prices, and the overall trade direction (long or short).

It provides extensive data for analyzing the trade's performance, like the total profit/loss, peak profit, maximum drawdown, and even price points associated with these milestones, as well as information on the number of entries and partials involved. Additional details such as the reason for the signal and timing information are also included.

## Interface PartialEvent

This data structure, called `PartialEvent`, acts as a single record capturing key details about a profit or loss milestone during a trade. It consolidates information like when the event occurred (`timestamp`), whether it's a profit or loss (`action`), and the specific trading pair involved (`symbol`). 

You'll find details about the strategy used (`strategyName`), the signal that triggered the trade (`signalId`), and whether you're in a backtest or live trading scenario (`backtest`).

It also holds crucial pricing information, including the entry price (`priceOpen`), take profit target (`priceTakeProfit`), and stop-loss levels (`priceStopLoss`), along with the original prices set when the signal was first created. If you use dollar-cost averaging (DCA), it tracks the total number of entries (`totalEntries`) and the original entry price before averaging (`originalPriceOpen`). 

Furthermore, it provides details on partial closes (`totalPartials`, `partialExecuted`), unrealized profit and loss (`pnl`), and a human-readable explanation for the signal (`note`), and timestamps for when the position became active (`pendingAt`) and the signal was created (`scheduledAt`).

## Interface MetricStats

This object helps you understand how a specific performance metric is behaving over time. It bundles together several key statistics related to that metric, giving you a comprehensive view. 

You'll find information like the total number of times the metric was recorded, how long it took on average, and the range of durations – from the shortest to the longest. 

It also includes details on variability, like the standard deviation and percentiles (95th and 99th), which can highlight outliers. For metrics that involve waiting periods, you’ll also see data on minimum, maximum, and average wait times.

## Interface MessageModel

This describes a single message within a chat history, like you'd see in an LLM conversation. Each message has a `role` that tells you who sent it – whether it's an instruction from the system, something the user typed, a response from the assistant, or the result of a tool being used.

The core of the message is the `content`, which is the text itself. Sometimes, assistant messages might not have content but still be important because they involve using tools – those tools are listed under `tool_calls`.

For some LLMs, you might see `reasoning_content`, which provides insight into how the assistant arrived at its answer.  Messages can also include images – presented as blobs, raw bytes, or base64 encoded strings. Finally, if a message is a response to a specific tool call, it's linked with a `tool_call_id`.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events during a trading backtest. It essentially tracks how much your investment lost from its peak.

You'll find a detailed list of individual drawdown events within the `eventList` property; this is an ordered record of each time a significant loss occurred.

The `totalEvents` property simply tells you the total number of drawdown events that were recorded.

## Interface MaxDrawdownEvent

This describes a single instance of a maximum drawdown event that occurred during trading. Each event contains details like the exact time it happened, the trading symbol involved, the name of the strategy used, and a unique ID for the signal that triggered the trade.

You'll also find information about the position taken (long or short), the total profit and loss generated by the position, the highest profit achieved, and the maximum drawdown experienced.

The record includes the price at which the drawdown occurred, the initial entry price, and the set take profit and stop-loss prices. Lastly, it indicates whether the event occurred during a backtesting simulation.

## Interface MaxDrawdownContract

This defines the data you'll receive when a maximum drawdown occurs for a trading position. 

It tells you the trading symbol, the current price, and the exact time of the drawdown event. You’ll also get information about which strategy, exchange, and timeframe were involved.

The signal data provides details about the trade itself, and a flag indicates whether this is a backtest simulation or a real-time update.

Think of it as an alert system, letting you know the biggest loss your position has experienced so far, allowing you to adjust your trading plan if needed.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a comprehensive snapshot of your live trading performance. It tracks a wide range of metrics, from the raw number of trades and wins/losses to more sophisticated measures like Sharpe Ratio and Sortino Ratio. You'll find detailed information about each trade in the event list, allowing you to drill down and understand specific trading decisions.

Key data points include the total number of trades, the number of winning and losing trades, and the overall cumulative profit or loss. Risk-adjusted performance is assessed through metrics like Sharpe and Sortino ratios, and volatility is measured using standard deviation. You can also analyze the average peak and fall in PNL during trades to further refine your strategy. Certainty and recovery factors offer additional insights into your trading robustness. All numerical values are carefully checked to ensure they're reliable, and any unsafe calculations (like division by zero) will result in a null value.

## Interface InfoErrorNotification

This notification type signals that something went wrong during a background process, but it's not a critical failure that stops everything. 

It’s a way for the system to let you know about issues it encountered while running, helping you troubleshoot and improve your setup.

Each notification has a unique identifier (`id`) so you can track it specifically. 

You’ll also get a clear error message (`message`) to understand what happened, along with details about the error itself (`error`), including a stack trace and any relevant extra information.

The `backtest` flag is always false because these notifications arise from operations happening within the live environment, not a simulated backtest.

## Interface IdlePingContract

This interface describes events that happen when a trading strategy isn’t actively making decisions – essentially, when it’s in an idle state. 

It's a way to keep track of how long your strategies are inactive, which can be helpful for monitoring their lifecycle.

The events include details about the trading pair (symbol), the strategy's name, where it's running (exchange), and whether it’s a backtest or live trade.

You can listen for these events to receive information like the current price and a timestamp indicating when the idle state began. 

The timestamp's meaning depends on whether you are running a backtest (historical data) or live trading.

## Interface IWalkerStrategyResult

This interface represents the result you get after running a single trading strategy within a backtest. It contains the name of the strategy that was tested.

You’ll also find detailed statistics about the strategy’s performance, like its Sharpe ratio or maximum drawdown, all packaged within the `stats` property.

A key value called `metric` is present, which is the number used to actually compare the strategy against others – if a calculation couldn't be done for some reason, this will be null. Finally, the `rank` property shows you where this strategy stands compared to all the others you tested, with the highest-performing strategy being ranked as 1.

## Interface IWalkerSchema

The IWalkerSchema helps you set up and manage A/B tests for different trading strategies. Think of it as a blueprint that defines how you want to compare strategies against each other.

It requires a unique identifier for the test (walkerName) and a list of the strategy names you’re planning to compare—those strategies need to be registered separately. You’ll also specify which exchange and timeframe you'll use for all the strategies in the test.

You can add a note to help others understand the test’s purpose, and you can choose which metric (like Sharpe Ratio) to optimize. Optionally, you can also provide callbacks to hook into different stages of the backtesting process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a full run of the strategy comparison process, often called a "walker." It tells you precisely what asset (symbol) was being tested, which exchange was used to get the data, the specific name of the walker that ran the tests, and which frame (time period for data) was utilized. Think of it as a complete report card for a single walker execution.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into key moments during the backtesting process when comparing different strategies. Think of it as a way to observe and react to what’s happening behind the scenes.

You can get notified when a particular strategy begins its analysis (`onStrategyStart`), be alerted when a strategy’s backtest finishes and get its performance statistics (`onStrategyComplete`), and also be informed if a strategy encounters an error and fails to complete (`onStrategyError`). Finally, `onComplete` is called when all strategies have been run, giving you a chance to see the overall results. These callbacks provide a way to monitor, log, or even modify the backtesting process as it unfolds.

## Interface ITrailingTakeCommitRow

This interface represents a single action related to trailing take commit orders within the backtest-kit framework. Think of it as a record of a specific instruction to adjust a trailing take order.

It tells the system that the action being performed is a “trailing-take” action. 

The `percentShift` property defines how much the price should be adjusted as a percentage. 

Finally, `currentPrice` stores the price level at which the trailing was initially established, providing context for the shift calculation.

## Interface ITrailingStopCommitRow

This interface represents a single, queued action related to a trailing stop order. It's essentially a record of a change or adjustment that needs to happen to a trailing stop.

The `action` property clearly identifies this as a trailing stop action.

The `percentShift` specifies the amount the trailing stop needs to be adjusted by, expressed as a percentage. This tells you how much the stop price should move.

Finally, `currentPrice` remembers the price at which the trailing stop was initially established, which can be useful for context or calculations.

## Interface IStrategyTickResultWaiting

This data structure describes a situation when a trading signal is set up, but is currently paused, awaiting the price to reach a specific level to activate it. It's used to provide ongoing updates while the system is watching for the right conditions to execute the signal.

The data includes details about the signal itself, the current price being monitored, and which strategy, exchange, timeframe, and symbol are involved. You'll also find information about progress towards take profit and stop loss levels (though these will always be zero at this “waiting” stage), unrealized profit and loss, whether the operation is a backtest, and the creation timestamp. It's designed to give you a full picture of what's happening behind the scenes while a signal is patiently waiting for its moment.


## Interface IStrategyTickResultScheduled

This data structure represents a specific event in a trading strategy - when a signal is generated and scheduled, meaning it's waiting for the price to reach a certain point before an order is placed. 

It gives you information about that signal, including its details and the conditions under which it was scheduled.

You’ll see the strategy's name, the exchange, the timeframe used, and the symbol being traded. 

It also includes the current price at the time the signal was scheduled and whether this event occurred during a backtest or live trading. This allows you to precisely track the sequence of events leading to a trade.


## Interface IStrategyTickResultOpened

This interface describes what happens when a new trading signal is generated. It's a notification that a signal has been created, validated, and saved, essentially marking the beginning of a trade.

You'll see this event triggered after a strategy calculates a signal and the system has confirmed it’s valid.

The notification includes key details like the name of the strategy that created the signal, the exchange and timeframe it applies to, the symbol being traded (like BTCUSDT), the current price at the time of the signal, and whether the signal originated from a backtest or a live trading environment. There's also a unique ID for the newly generated signal, and a timestamp indicating when the event occurred. These pieces of information are crucial for monitoring and analyzing your trading activity.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in an "idle" state – meaning no active trading signal is present. It essentially provides information about the market conditions and environment when the strategy isn't actively placing orders. 

You'll find details like the strategy's name, the exchange it's connected to, the timeframe being used (like 1-minute or 5-minute candles), and the trading symbol (e.g., BTCUSDT). There's also the current price at that moment.

Crucially, it indicates whether this idle state occurred during a backtest (simulated trading) or in a live trading environment.  A timestamp records exactly when this idle state was observed. It's designed to help you understand periods where your strategy isn't trading and analyze the factors contributing to that behavior.

## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing a comprehensive snapshot of the event. 

It gives you all the information needed to understand why the signal closed, including the reason (like reaching a take-profit, stop-loss, or simply expiring) and the time it happened. 

You'll also find the final price used for the trade, along with detailed profit and loss calculations that factor in fees and potential slippage. 

It tracks important details such as the strategy name, exchange, time frame, and the trading pair involved, allowing for easy tracking and analysis. The data also indicates whether the event occurred during a backtest or in live trading, and includes a unique close ID when a user manually closes a position. Finally, a creation timestamp clarifies when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled – essentially, it didn’t lead to a trade being opened. This could be because the signal wasn't triggered, or because a stop-loss was hit before the signal could activate.

It provides detailed information about the cancellation, including the signal that was cancelled, the final price at the time of cancellation, when it happened, and the name of the strategy and exchange involved. You'll also find details like whether it's a backtest or live trade, why the signal was cancelled, and an optional ID if the cancellation was initiated by a user. The timestamp of creation provides insight into when the result was recorded.


## Interface IStrategyTickResultActive

This interface describes a tick result when a trading strategy is actively monitoring a signal, awaiting either a take profit (TP), stop loss (SL) trigger, or a time expiration. 

It contains information about the signal being tracked, the current price used for monitoring, and details about the strategy and exchange involved – including names, the trading symbol, and the timeframe. 

You'll also find data about the progress toward the TP and SL, unrealized profit and loss (pnl) calculations, whether it's a backtest or live trade, and timestamps for tracking the event’s creation and the last processed candle. This data is crucial for detailed analysis and performance tracking of active trading positions.

## Interface IStrategySchema

The `IStrategySchema` defines how a trading strategy behaves and integrates within the backtest-kit framework. It's essentially a blueprint for your strategy, specifying its name, a helpful note for developers, and how frequently it should generate trading signals.

The most important part is the `getSignal` function – this is where your strategy's logic lives, deciding when and how to trade based on the current market price. You can even schedule a signal to trigger when a specific price is reached.

You can also customize a strategy by adding lifecycle callbacks, associating it with risk profiles, or linking it to specific actions. Think of these as extra tools to refine and control your strategy's operation.

## Interface IStrategyResult

The `IStrategyResult` represents a single result from running a trading strategy backtest. Think of it as a row in a table comparing different strategies. It holds the strategy's name so you know which one you're looking at, along with a comprehensive set of statistics detailing how it performed. 

You'll also find a value for the metric you're using to optimize your strategies, which helps rank them against each other.  Finally, it tracks the timing of the strategy’s activity - the earliest and latest signal events – giving you insight into the strategy’s responsiveness over time. If a strategy didn't generate any signals, these timestamps will be null.

## Interface IStrategyPnL

This interface represents the result of a profit and loss calculation for a strategy. It gives you detailed information about how your trades performed.

The `pnlPercentage` tells you the profit or loss as a percentage – a positive number means you made money, a negative number means you lost.

You’ll also find the `priceOpen`, which is the original price you bought at, adjusted to account for small costs like fees and slippage (the difference between the expected price and the actual price you get). Similarly, `priceClose` shows the adjusted exit price.

`pnlCost` represents the actual monetary profit or loss in USD, calculated based on the total amount you invested. Finally, `pnlEntries` shows the total amount of capital you put into the strategy.

## Interface IStrategyCallbacks

This interface, `IStrategyCallbacks`, provides a way for your trading strategies to react to different stages of a signal's lifecycle. Think of it as a set of optional event listeners that your strategy can subscribe to. You can use these callbacks to log information, trigger custom actions, or perform any other logic you need at specific moments in a trade’s journey.

For example, `onTick` is called every time a new price tick arrives, giving you a constant stream of market data. `onOpen` lets you know exactly when a signal has been validated and a position is being taken, while `onClose` signals the end of the trade. There are also callbacks for signals that are actively monitored (`onActive`), temporarily paused (`onSchedule`), or cancelled (`onCancel`).

Several callbacks handle profit/loss conditions. `onPartialProfit` alerts you when a trade moves favorably, `onPartialLoss` when it moves against you, and `onBreakeven` when the trade recovers to your initial entry price. 

Finally, `onSchedulePing` and `onActivePing` are for more advanced monitoring of scheduled and active signals—they fire regularly even outside of the main strategy interval, letting you react to changing conditions in real time. The `onWrite` callback is specifically for persistence testing.

## Interface IStrategy

The `IStrategy` interface outlines the core methods a trading strategy needs to have. It's essentially a contract that defines how the strategy interacts with the backtesting framework.

The `tick` method is called on each price update, and is responsible for checking for signals, trailing price points, and managing potential profit targets and stop losses.

You can use `getPendingSignal` and `getScheduledSignal` to see what signal is currently active, if any.  They return `null` if no signal is present.

Methods like `getBreakeven`, `getTotalPercentClosed`, and `getTotalCostClosed` give you insight into the state of a position -  how close it is to breaking even, how much has already been closed, and the overall cost basis.

`getPositionEffectivePrice`, `getPositionInvestedCount`, and `getPositionInvestedCost` help you understand the details of a position's entry prices and investment.

`getPositionPnlPercent` and `getPositionPnlCost` calculate the unrealized profit or loss of a position.

`getPositionEntries` provides a history of how a position was built up through multiple entries.

`getPositionPartials` shows you the history of partial closes that have occurred.

The `backtest` method allows you to run the strategy against historical data.

`stopStrategy` allows you to pause the strategy from generating new signals without closing existing positions.

`cancelScheduled` and `activateScheduled` methods allow for modification of scheduled signals.

The `closePending` method allows you to close an active position manually.

`partialProfit` and `partialLoss` let you manually close portions of your position.

`trailingStop` and `trailingTake` automatically adjust stop-loss and take-profit levels as the price moves.

`breakeven` automatically moves the stop loss to break even if certain profit thresholds are reached.

`averageBuy` allows for dollar-cost averaging by adding new entries to a position.

Finally, there are several `get...` methods that allow you to inspect various aspects of the strategy’s state and position performance, such as maximum profit, maximum drawdown, and durations. The `dispose` method is for cleanup.

## Interface IStorageUtils

This interface defines the core functions that any storage adapter used by the backtest-kit framework must provide. Think of it as the blueprint for how your storage system interacts with the backtesting process.

It outlines methods for responding to signal events: when a signal is opened, closed, scheduled, or cancelled. 

You'll also find functions to retrieve data—specifically, a single signal by its ID or a complete list of all stored signals.

Finally, it includes ping handling, ensuring that the `updatedAt` timestamp is kept current for signals that are actively opened or scheduled, helping maintain accurate historical data.


## Interface IStorageSignalRowScheduled

This interface defines a signal's status when it's scheduled. It simply indicates that the signal is currently in a 'scheduled' state. This is useful for tracking the lifecycle of signals within the backtest-kit trading framework. It’s a straightforward way to confirm a signal has been designated for future execution.

## Interface IStorageSignalRowOpened

This interface describes a signal row that represents an opened trade. It's quite simple, really - it just confirms that a signal has been activated and a trade is now open. The key piece of information is the `status` property, which is always set to "opened" for these types of signal rows. It's a straightforward way to track when a position is active.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed, meaning a trade has been executed and the position settled. 

It contains information specifically about closed signals, which is where you'll find profit and loss data.

The `status` property confirms that the signal is indeed in a closed state. 

The `pnl` property holds the detailed profit and loss calculations for that closed trade, giving you insight into its financial performance.

## Interface IStorageSignalRowCancelled

This interface defines how to represent a signal row that has been cancelled. It's a simple way to track when a signal's status changes to "cancelled".  The `status` property directly indicates the signal's current state is cancelled, providing clear information about its current condition.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored, regardless of its specific status. It ensures that every signal record includes the time it was created and last updated, represented as timestamps.  A priority field is also included, which dictates the order in which signals are processed – essentially, it helps manage the sequence of operations. This allows for consistent data handling whether you're testing past strategies or running live trades.

## Interface IStateParams

The `IStateParams` interface helps define how state is managed within your trading signals. Think of it as setting up the initial conditions for a signal.

You specify a `bucketName`, which acts like a folder to organize related state data – for instance, “trade” for trading-specific state or “metrics” for performance data.

Then, `initialValue` lets you provide a starting point – a default value – that the signal will use if no previous state data is available. This ensures your signal has a defined state from the beginning.


## Interface IStateInstance

The `IStateInstance` interface provides a way to manage and track data specific to each trading signal. It’s designed for advanced strategies, particularly those using LLMs, that need to monitor things like unrealized profit and loss, how long a trade has been open, and trigger exits based on predefined thresholds. Think of it as a place to store key metrics that evolve over a trade's lifespan.

The `waitForInit` method is used to get the state instance ready to begin.

`getState` lets you retrieve the current data associated with a particular time. If you try to look at data from the future, you'll receive a default value to prevent unintended manipulation.

`setState` is how you update that data, and it's designed to be safe even if a backtest restarts—older data simply won't be overwritten.  The update function can access the existing data, protected from future data leakage.

Finally, `dispose` cleans up any resources used by the state instance when it’s no longer needed.

## Interface ISizingSchemaKelly

This defines how much of your capital to risk on each trade using the Kelly Criterion. It's a method focused on maximizing long-term growth by calculating an optimal bet size. The `kellyMultiplier` property lets you adjust how aggressively the Kelly Criterion is applied; a value of 0.25 means you'll risk about a quarter of your potential gain, while a higher value means you're risking more per trade. This provides flexibility in balancing risk and reward.


## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward approach to sizing trades: you risk a fixed percentage of your capital on each trade. 

It's incredibly simple to implement – you specify a `riskPercentage`, which represents the portion of your trading capital you're willing to lose on a single trade. This value is expressed as a number between 0 and 100. 

The sizing method is always "fixed-percentage" when using this schema.


## Interface ISizingSchemaBase

This interface defines the basic structure for sizing strategies within the backtest-kit framework. Every sizing schema will have a unique name to identify it. 

You can also add a note to explain the sizing strategy – helpful for documentation and understanding.

To manage risk, each sizing schema specifies limits: a maximum percentage of your account that can be used for a position, a minimum absolute size, and a maximum absolute size.

Finally, you can include optional callbacks to trigger specific actions at different points in the sizing process.

## Interface ISizingSchemaATR

This schema defines a way to determine your trade size based on the Average True Range (ATR), a measure of volatility. 

It's designed for strategies where you want your stop-loss distance to be linked to market volatility.

To use it, you'll specify that the sizing method is "atr-based" and then provide a risk percentage – this dictates how much of your capital you're willing to risk on each trade. 

Finally, you set an ATR multiplier, which controls how far your stop-loss is placed away from the entry price, relative to the ATR value.  A higher multiplier means a wider stop-loss.


## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines the parameters needed for using the Kelly Criterion to determine trade sizes within the backtest-kit framework. 

It's mainly concerned with providing a way to log information during the sizing process, specifically through the `logger` property. 

This `logger` property accepts an `ILogger` service, allowing you to see debugging output related to how the Kelly Criterion is calculating your position sizes. It's helpful for understanding and validating the sizing behavior.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage of your capital.  Essentially, it’s a simple way to determine how much to risk on each trade – a consistent percentage, every time.  It requires a logger to help with debugging and understanding what's happening behind the scenes. You'll use this logger to track information and errors during your backtesting or live trading.

## Interface ISizingParamsATR

This interface defines how your trading strategy determines the size of each trade when using an ATR (Average True Range) based sizing method.

It primarily includes a `logger` property, which allows your code to output debugging information, helping you understand how the sizing is calculated and troubleshoot any issues. Think of it as a way to keep track of what's happening behind the scenes as your strategy decides how much to trade.


## Interface ISizingCallbacks

This section details callbacks related to determining how much to trade in each position. Specifically, `onCalculate` is triggered immediately after the framework figures out the size of your trade.  You can use this to check if the size makes sense, record the trade size and related parameters, or perform any post-calculation validation steps. It accepts the calculated quantity and a set of parameters providing additional context for the sizing decision.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your bet size using the Kelly Criterion. 

It includes your win rate, expressed as a number between 0 and 1, and your average win/loss ratio. These two values are essential for determining how much of your capital to allocate to each trade based on the Kelly Criterion formula. Providing these parameters allows for a mathematically informed approach to sizing your positions.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the information needed to calculate trade sizes using a fixed percentage of your account balance. 

Essentially, it tells the backtest kit how much of your capital you want to risk on each trade.

You'll specify that you want to use the "fixed-percentage" sizing method.

To complete the sizing calculation, you also need to provide a `priceStopLoss` value, representing the price at which you'll place your stop-loss order.

## Interface ISizingCalculateParamsBase

This interface provides the foundational information needed when determining how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," so you know exactly what you’re dealing with. It also provides your current account balance, which is essential for calculating position sizes. Finally, the planned entry price is included, allowing sizing calculations to factor in potential slippage or order fill prices.

## Interface ISizingCalculateParamsATR

This interface defines the settings needed for determining how much of your capital to allocate to a trade, using the Average True Range (ATR) as a guide. Essentially, it lets you specify that you want your sizing to be influenced by ATR, and you'll provide the current ATR value.  The `method` property always indicates that you're using an ATR-based sizing approach. The `atr` property holds the actual ATR value, which will be used in the sizing calculation.

## Interface ISizing

The `ISizing` interface is all about determining how much of an asset to trade – it's the core of managing position sizes. It’s a key piece behind the scenes of how a strategy actually executes trades.

The `calculate` property is the most important part; it takes some parameters describing the situation (like risk tolerance and potential reward) and figures out the optimal quantity to trade, returning a promise that resolves to the size. It’s your way of telling the backtest kit *how* to determine position sizes based on the circumstances.

## Interface ISignalRow

This `ISignalRow` interface defines the structure of a signal used within the backtesting framework. Think of it as a complete record of a trading opportunity, containing all the information needed to execute and track it. Each signal gets a unique identifier (`id`) and represents a trade opportunity with details like its cost (`cost`), entry price (`priceOpen`), and expected duration (`minuteEstimatedTime`).

It includes important context like the exchange (`exchangeName`), the strategy used (`strategyName`), and the timeframe (`frameName`) relevant to the trade.  You’ll also find details about when the signal was created (`scheduledAt`) and when the position became active (`pendingAt`).

Crucially, the signal holds data for partial profit and loss calculations (`_partial`), allowing for complex PNL tracking. It also supports trailing stop-loss (`_trailingPriceStopLoss`) and trailing take-profit (`_trailingPriceTakeProfit`) mechanisms for dynamic risk management.  The `_entry` field tracks DCA entries for cost averaging, while `_peak` and `_fall` records the highest and lowest prices seen during the trade’s lifespan. Finally, `timestamp` records the time of signal creation for tracking purposes.


## Interface ISignalIntervalDto

This data transfer object, `ISignalIntervalDto`, is designed to help manage signals, particularly when you need to retrieve them in batches. Think of it as a way to group signals together so they're delivered as a single unit. Each signal within this grouping has a unique identifier, a string, allowing you to track them individually. The system will wait for a specified interval to pass before releasing the next set of signals.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, acting as a standard way to pass signal information around. Each signal includes details like its direction (long or short), a description of why the signal was generated, and the entry price.  You also define target prices for taking profits and setting stop-loss orders – these need to align with your trade direction. Signals can have a time limit set in minutes, indicating how long you expect the position to remain open.  Finally, each signal has an associated cost, representing the financial commitment to enter the trade.  If you don't provide an ID for the signal, one will be automatically created.

## Interface ISessionInstance

The `ISessionInstance` interface helps manage temporary data specific to a particular trading setup – think of it as a shared workspace for a strategy's calculations during a single backtest run. It's designed to hold things that need to be quickly accessed and updated, such as the results of AI models or intermediate calculations for indicators, all linked to a specific time.

You use this interface to initialize the session, then easily store and retrieve data tied to particular timestamps. This ensures you're always working with the correct information and prevents looking ahead into the future during your backtest. When the session is done, you can release any resources it was using.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a trading signal that's set to activate when a specific price level is reached. Think of it as a signal waiting for a particular price to be hit before it actually triggers a trade.

It builds upon the more general `ISignalRow` concept, and importantly, it includes a scheduled price, `priceOpen`.

Once the market price hits `priceOpen`, this scheduled signal transforms into a standard pending signal, ready to execute.

The `priceOpen` property simply defines that target price the signal is waiting for.

## Interface IScheduledSignalCancelRow

This interface, `IScheduledSignalCancelRow`, represents a signal that has been scheduled and might need to be canceled. It builds upon the existing `IScheduledSignalRow` and adds information specifically for when a user cancels a scheduled signal. If a user cancels a signal, this interface includes a `cancelId` to identify that specific cancellation, and a `cancelNote` which allows users to add a brief explanation for why they are canceling the signal. These fields are only populated when a signal is canceled by a user, not by the system.

## Interface IRunContext

The `IRunContext` object is your all-access pass when running code within the backtest-kit framework. Think of it as a central hub holding all the information your functions need to operate correctly. It merges details about where the trade is happening – like the exchange and strategy being used – with real-time data like the symbol being traded and the current timestamp. The framework automatically separates this comprehensive context into specialized services to manage the different pieces of information.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess the risk associated with a trading signal. It builds upon the information provided in `IRiskCheckArgs` and adds details about your portfolio's current state.

You'll find the `currentSignal` here, which represents the trading signal that's being examined – it contains pre-calculated data, including the price at which the signal was generated.  The `activePositionCount` tells you how many positions your strategies currently hold. Finally, `activePositions` gives you a complete list of those active positions, each described with its own details.

## Interface IRiskValidationFn

This defines a function that checks if a trading decision is safe to make. Think of it as a gatekeeper for your trades. If everything looks good, it lets the trade proceed – it does this by simply returning nothing. But if something seems risky, it either provides a detailed reason for rejection or throws an error, both of which are handled to provide clear feedback on why the trade was blocked.

## Interface IRiskValidation

This interface, `IRiskValidation`, helps you define rules to check if your trading decisions are safe and reasonable. Think of it as setting up guardrails for your backtesting process.

You specify these rules using a `validate` function, which takes your risk parameters as input and determines if they pass your criteria.  You can also add a `note` to explain what the validation is meant to do – a little like adding a comment to make things clearer for yourself or others who might be using the system. It's a great way to document why you’re setting up a particular risk check.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading. It builds upon existing signal data by adding important pricing details. Specifically, it includes the entry price (`priceOpen`) and the initially set stop-loss (`originalPriceStopLoss`) and take-profit (`originalPriceTakeProfit`) levels when the signal was created. This extra information is crucial for validating trades and ensuring sound risk management practices.

## Interface IRiskSchema

This section defines how you can create custom risk controls for your trading portfolio. Think of it as a way to set up specific rules and checks to manage your risk at a portfolio level. 

You'll give each risk control a unique identifier – the `riskName` – to easily track and manage it. 

You can also add a helpful note (`note`) for yourself or other developers documenting the purpose of the risk control.

Optionally, you can configure callbacks (`callbacks`) to be triggered at different points in the risk evaluation process, such as when a trade is rejected or when it's allowed.

The core of the risk control is the `validations` array. This is where you define the actual rules and logic that determine whether a trade is permissible or not.  You can specify a series of validations that must be met.

## Interface IRiskRejectionResult

When a risk validation check fails, this result object provides details about why it was rejected. Each rejection has a unique ID, which helps in tracking and debugging specific issues. The `note` property contains a plain-English explanation of the reason for the rejection, making it easier to understand what went wrong and how to fix it.

## Interface IRiskParams

The `IRiskParams` object defines the settings passed when setting up a risk management system. It lets you specify the exchange you're working with, like "binance," and provides a way to log important information for debugging. 

A crucial element is the `TimeMetaService`, which prevents issues caused by using future data when simulating past trades. 

The `backtest` property clarifies whether the system is running in a testing environment or live trading.

Finally, `onRejected` is a callback function that gets triggered when a trading signal is blocked by risk controls; it's a place to handle that rejection, potentially emitting notifications about it.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple operations are happening at the same time. Specifically, the `reserve` property, when set to true, ensures that when the system checks a risk condition and prepares to make a change, other parts of the system see that change happening immediately. This prevents conflicts and unexpected behavior when multiple actions are trying to adjust the same position concurrently. Think of it as a way to temporarily "hold" a position during a check to avoid race conditions.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information needed to decide if a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually executed. It bundles together essential data points like the trading pair's symbol, the pending signal itself, the name of the strategy making the request, and details about the exchange and risk settings being used. You'll also find the current price and timestamp, allowing for time-sensitive risk evaluations. This data is all passed directly from the client strategy, giving it the context to make informed decisions about trade validation.

## Interface IRiskCallbacks

This interface defines optional functions you can use to react to risk assessments during trading. Think of them as notification points – they let you know when a trading signal is either blocked because of risk limits or approved to proceed. The `onRejected` function is triggered when a trading signal fails a risk check, letting you know a trade won't be executed. Conversely, `onAllowed` gets called when a signal passes all risk checks, indicating that a trade is approved. You can use these callbacks to log events, adjust strategies, or implement custom actions based on the risk assessment results.

## Interface IRiskActivePosition

This interface represents an active trading position that a strategy is holding. It bundles together all the important details about a single position, making it easy to keep track of what’s happening across different strategies and exchanges. You'll find things like the strategy's name, the exchange it's on, the symbol being traded (like BTCUSDT), and whether it's a long or short position.

It also includes key pricing information, like the entry price, stop-loss, and take-profit levels, along with estimates about how long the position is expected to last and the exact timestamp of when it was initiated. This comprehensive view is crucial for analyzing risk and performance across your entire trading setup.

## Interface IRisk

The `IRisk` interface is all about keeping your trading secure and controlled. It acts as a gatekeeper, making sure your trading signals don't exceed pre-defined risk limits and diligently tracks your open positions.

You'll find methods for verifying if a signal is permissible (`checkSignal`) and a special version that not only checks but immediately sets aside a spot for it (`checkSignalAndReserve`).  `checkSignalAndReserve` is vital when multiple strategies are racing to trade the same asset – it prevents any strategy from exceeding the limits because it does the check and reserves a place atomically.  Remember to follow up with `addSignal` (to finalize the position) or `removeSignal` (if things go wrong) after a successful `checkSignalAndReserve` to keep everything tidy and accurate.

Finally, `addSignal` is how you officially log a new, active trade, and `removeSignal` cleans up when a trade closes, keeping your position records current.

## Interface IReportTarget

This interface lets you fine-tune what kind of data gets recorded during your trading simulations. It's all about controlling which events are logged as JSONL files.

Each property – like `strategy`, `risk`, `breakeven` – represents a specific type of event. Setting a property to `true` means that those events will be logged, while `false` means they won't be.

You can pick and choose exactly what you want to track, such as strategy commits, risk rejections, breakeven points, or performance metrics. This allows for detailed analysis and insights into your trading performance. It's particularly useful when you need to troubleshoot issues or evaluate different strategies.


## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, lets you fine-tune how backtest results are saved and analyzed. Think of it as a set of labels you attach to your data to easily sort and find specific tests later. Each property represents a key detail about the backtest run - like the trading pair (symbol), the name of the strategy used, the exchange it ran on, the timeframe, the signal identifier, and even the walker used for optimization. By providing these details when writing report data, you can ensure your backtest results are clearly organized and searchable.

## Interface IRecentUtils

This interface defines how different systems can manage and access recent trading signals. It provides methods for reacting to incoming signal updates and retrieving the most recent signal based on specific parameters like symbol, strategy, and timeframe. A key feature is the ability to prevent look-ahead bias by ensuring that signals retrieved are only those that existed before a given time. You can also calculate how long ago a signal was generated, useful for evaluating signal freshness and timing.

## Interface IPublicSignalRow

The `IPublicSignalRow` interface provides a way to share details about a trading signal publicly, ensuring users see the initial stop-loss and take-profit prices even if those values have been adjusted through trailing mechanisms. It builds upon the base `ISignalRow` by adding `originalPriceStopLoss` and `originalPriceTakeProfit`, which always reflect the original values set when the signal was created. This transparency helps users understand the original parameters behind the trades.

Here's a breakdown of what this interface tells you about a signal:

*   **cost:** The initial cost to enter the position.
*   **originalPriceStopLoss:** The initial stop-loss price set when the trade began.
*   **originalPriceTakeProfit:** The initial take-profit price set when the trade began.
*   **partialExecuted:**  The total percentage of the position that has been closed through partial exits.
*   **totalEntries:** The number of times the position has been averaged down/up.
*   **totalPartials:** The number of times the position has been partially closed.
*   **originalPriceOpen:** The original entry price of the position.
*   **pnl:** The current unrealized profit or loss on the position.
*   **peakProfit:** The highest profit ever achieved by this position.
*   **maxDrawdown:** The largest loss ever experienced by this position.

## Interface IPublicCandleData

This interface defines the structure of a single candle representing price data over a specific time interval. Each candle contains key information about the trading activity during that period.

You'll find the precise moment the candle began with the timestamp, measured in milliseconds since the Unix epoch. The opening price marks the initial value when the candle started, while the high and low represent the peak and trough prices during that time. The closing price shows the final value at the candle's end, and volume indicates the total trading activity.


## Interface IPositionSizeKellyParams

When determining how much capital to risk on each trade using the Kelly Criterion, you'll often need to specify some key performance metrics.  `IPositionSizeKellyParams` provides a simple way to bundle these together.  Specifically, you'll tell the system your `winRate`, which is the proportion of winning trades you typically see (expressed as a number between 0 and 1). You’ll also need to provide the `winLossRatio`, representing the average amount you win compared to the amount you lose on each individual trade. These parameters work together to help calculate a suggested position size.

## Interface IPositionSizeFixedPercentageParams

This interface defines the parameters needed for a trading strategy that uses a fixed percentage of your capital to determine position size. It’s primarily focused on setting a stop-loss price.

The `priceStopLoss` property specifies the price at which you want to place a stop-loss order to limit potential losses. This is a crucial setting for risk management when using percentage-based sizing.


## Interface IPositionSizeATRParams

This section defines the parameters used when determining position size based on the Average True Range (ATR). 

The `atr` property represents the current ATR value, which is a measure of market volatility. It’s a crucial input for calculating how much of your capital to allocate to a trade, as it helps adjust position size based on how much the price is likely to move.


## Interface IPositionOverlapLadder

This defines how to check for overlapping positions when using dollar-cost averaging (DCA). Think of it as setting a safety zone around each DCA price point. 

The `upperPercent` property sets how much higher than each DCA level you want to consider an overlap – for example, if set to 5%, any price 5% above a DCA level would be flagged. 

Similarly, `lowerPercent` determines how much lower than each DCA level is also considered an overlap. 

These percentages help you fine-tune how aggressively your backtest identifies potential position conflicts.

## Interface IPersistStorageInstance

This interface defines how backtest-kit handles storing and retrieving signal data. Think of it as a way to customize how your trading strategies remember past signals—instead of using the default file storage, you can build your own system. 

There's a separate instance of this storage for backtesting and live trading.

The `waitForInit` method lets you set up your storage when needed.

`readStorageData` pulls all the saved signals, organizing them based on their unique signal IDs.

And `writeStorageData` is how you save new signals or update existing ones, again using the signal ID as the key for each signal.

## Interface IPersistStateInstance

This interface defines how to manage persistent state for your trading strategies, ensuring your progress isn't lost even if things go wrong. It's specifically designed to work with a particular combination of a signal and a bucket, keeping your data neatly organized.

If you’re building a custom way to save and load your strategy’s data – perhaps using a database instead of a file – you’ll implement this interface.

Here’s what you’ll need to do:

*   **waitForInit:** This lets you set up the storage when everything is ready.
*   **readStateData:** This retrieves the saved data for your strategy's current situation.
*   **writeStateData:** This saves the current state of your strategy, including when the save occurred.
*   **dispose:** This allows you to clean up any resources your storage solution might be using. It's okay to ignore this if you don't need to do anything special.

## Interface IPersistSignalInstance

This interface helps manage how signal data is saved and retrieved for a specific trading setup – think of it as a way to customize where and how your signals are stored. It's tied to a unique combination of symbol, strategy, and exchange, ensuring data is kept separate for different setups. 

If you want to move away from the default file-based storage, you can build your own adapter that implements this interface.

The `waitForInit` method lets you prepare the storage space for a context, essentially setting things up. `readSignalData` retrieves the saved signal information, and `writeSignalData` lets you store updated or new signal data – providing an option to clear the data entirely by setting the value to null.

## Interface IPersistSessionInstance

This interface helps manage how session data is saved and loaded for specific trading strategies, exchanges, and frames. Think of it as a way to customize where and how your trading information is stored, making sure it’s safe even if things go wrong.

If you want to change the default way data is stored – perhaps using a database instead of a file – you can build your own adapter that implements this interface.

Here's a breakdown of what the methods do:

*   `waitForInit`: Sets up the storage area for your session data.
*   `readSessionData`: Retrieves any previously saved data related to this particular trading setup.
*   `writeSessionData`: Saves the current state of your session data.
*   `dispose`: Cleans up any resources used by the storage, though this might not always do anything special.

## Interface IPersistScheduleInstance

This interface helps you manage how trading signals are saved and loaded for specific combinations of assets, strategies, and exchanges. Think of it as a way to customize where and how the backtest-kit remembers what signals it generated.

If you want to replace the default file-based storage, you can create your own system that implements this interface.

Here’s what the methods do:

*   `waitForInit`:  Lets you set up your storage when the backtest starts. You can tell it whether the storage should start empty or with existing data.
*   `readScheduleData`: Retrieves the previously saved trading signal for this particular asset, strategy, and exchange combination.
*   `writeScheduleData`: Saves a new trading signal for later use, or clears the signal if you pass a null value.

## Interface IPersistRiskInstance

This interface lets you customize how active risk positions are saved and loaded for a specific trading context, defined by a risk name and exchange name. Think of it as a way to control where and how your trading data is stored, instead of relying on the default file-based system.

If you need to store your data in a database or a different format, you can create a custom adapter that implements this interface.

The `waitForInit` method allows you to set up any necessary storage initialization when the system starts up.

The `readPositionData` method is used to retrieve previously saved risk positions at a particular point in time.

Finally, the `writePositionData` method lets you save the current risk positions for later retrieval.

## Interface IPersistRecentInstance

This interface defines how to store and retrieve the most recent signal for a specific trading setup. Think of it as a way to remember what signal was active last time you ran a backtest or were live trading. 

It's designed to work within a particular context – a unique combination of the symbol being traded, the strategy name, the exchange, and the timeframe.

If you want to customize how this information is saved, such as using a database instead of a file, you can create a class that implements this interface.

The `waitForInit` method sets up the storage area for a specific context.
`readRecentData` fetches the previously saved signal.
`writeRecentData` saves the current signal, so it can be loaded later.


## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss information is saved and loaded, specifically for a particular trading setup – a combination of a financial instrument (symbol), a trading strategy (strategyName), and an exchange (exchangeName). Think of it as a way to customize where and how your progress is stored during backtesting.

Each signal, representing a unique trading action, has its own space for storing data, organized by a unique identifier.

If you want to replace the standard file-based storage with something else, like a database or an in-memory solution, you can create a custom adapter that follows this interface.

To start, you need to initialize the storage area for your partial data.
Then, you can retrieve previously saved partial data using the signal ID and the time it was recorded.
Finally, you can store new partial data for a signal, again using its ID and the relevant timestamp.

## Interface IPersistNotificationInstance

This interface lets you customize how your trading system remembers notifications – things like order confirmations or trade executions – when you’re running a backtest or live trading. It’s designed so you can swap out the default file storage with your own method if needed.

Think of it as a way to manage a record of important events.

The `waitForInit` method sets things up when the system is starting, letting you prepare your storage. `readNotificationData` retrieves all the previously saved notifications, while `writeNotificationData` stores new notifications, ensuring they're linked to a unique identifier. This allows you to maintain a history of events throughout your trading process.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context, like a particular conversation or task within your application. It’s primarily used for storing information related to Large Language Models (LLMs) where you need to remember things between interactions.

You can think of it as a way to manage a chunk of memory tied to a unique identifier and a bucket name. 

The interface provides methods to:

*   **Initialize** the storage area for this memory.
*   **Read** a single memory entry by its ID.
*   **Check** if a memory entry exists.
*   **Write** new memory entries, including when they were created.
*   **Soft-delete** entries by marking them as removed; the data remains on disk but isn't shown in regular searches.
*   **List** all available memory entries for this context.
*   **Release** any resources being used.

If you’re building a custom memory solution, you can implement this interface to tailor how data is saved and loaded, instead of relying on the default file-based approach.

## Interface IPersistMeasureInstance

This interface defines how to manage cached data for a specific trading strategy bucket. Think of it as a way to store and retrieve information, like historical performance data, that your backtesting system needs.

It allows for a clever trick: "soft deletes." When you remove data, it doesn't actually disappear from the storage; instead, it's marked as removed. This keeps the data around in case you need it later, while still making it invisible during normal operations.

If you want to use a different storage method (like a database instead of a file), you can create a custom adapter that implements this interface to handle the data persistence.

Here's what the methods do:

*   `waitForInit`: Makes sure the storage area for this bucket is ready to use.
*   `readMeasureData`: Retrieves a cached data entry by its unique key.
*   `writeMeasureData`: Saves a new data entry to the cache, including a timestamp.
*   `removeMeasureData`:  Marks a data entry as removed (a "soft delete").
*   `listMeasureData`: Provides a way to go through all the keys of data entries that haven't been marked as removed.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its log data. Instead of using the default file storage, you can build your own system to handle logs, like sending them to a database or a remote service.

The `waitForInit` method allows you to kick off the log storage initialization process. Think of it as ensuring your custom storage is ready before any logs start accumulating.

`readLogData` retrieves all the stored log entries, allowing you to access the complete history.

Finally, `writeLogData` handles the writing of new log entries.  It's crucial to ensure your implementation avoids overwriting existing entries, maintaining a chronological, append-only log.

## Interface IPersistIntervalInstance

This interface helps manage whether a trading strategy has already run for a specific time period and trading condition within a backtest. Think of it as a way to make sure a particular strategy doesn’t run multiple times for the same situation.

It lets you customize how the backtest kit remembers which intervals have been processed. Instead of relying on a standard file-based system, you can build your own method for keeping track.

The `waitForInit` method prepares the storage for a new time period. `readIntervalData` retrieves information about a previously processed interval. `writeIntervalData` records that an interval has been executed. `removeIntervalData` essentially resets the marker, allowing the interval to run again. Finally, `listIntervalData` provides a way to see all the intervals that have been marked as processed.


## Interface IPersistCandleInstance

This interface defines how to manage a store of historical candle data, specifically for a particular trading symbol, timeframe, and exchange. It allows you to customize where and how this data is stored, stepping away from the default file-based system. 

The `waitForInit` method allows you to prepare the storage space for the candle data when needed.

The `readCandlesData` method fetches a range of candles from storage, but crucially, if even one candle in that range is missing, it will return `null` to signal that the data needs to be retrieved again from the original source. 

Finally, `writeCandlesData` provides a way to save a set of candles to the cache; keep in mind that it's designed to handle situations where candles might be incomplete or where you want to avoid overwriting existing, complete candle records.

## Interface IPersistBreakevenInstance

This interface provides a way to manage and store breakeven data, which is essential for tracking and optimizing trading strategies. Think of it as a dedicated space for holding information about when a trade might become profitable, tailored to a specific combination of asset, strategy, and exchange. 

Each trading strategy running on a particular exchange and dealing with a specific asset has its own area for storing this data.

You can use this interface to customize how this data is saved—perhaps you want to store it in a database instead of a file.

The `waitForInit` method sets up the storage for a particular context.

The `readBreakevenData` method lets you retrieve existing breakeven data for a trade.

Finally, the `writeBreakevenData` method allows you to save new or updated breakeven data for a specific trade.

## Interface IPersistBase

This interface provides a basic set of functions for saving and retrieving data, designed to be used by custom storage solutions within the backtest-kit framework. It outlines the essential actions like initializing storage, reading a specific item, checking for its existence, writing a new item, and listing all available items. Think of it as a blueprint for building your own way to store and access data for backtesting, ensuring that different storage methods can be used consistently. 

The `waitForInit` method helps prepare the storage area, and `readValue` gets a specific data item. `hasValue` is a quick way to confirm if data exists, while `writeValue` handles saving or updating data. Finally, `keys` allows you to go through a list of all data items.


## Interface IPartialProfitCommitRow

This interface describes a record representing a partial profit taking action that has been queued up. It's essentially a single instruction to close a portion of your trading position.

The `action` property always confirms that this is a partial profit commitment. 

`percentToClose` tells you what percentage of the position should be closed, and `currentPrice` indicates the price at which that partial profit was actually executed.

## Interface IPartialLossCommitRow

This represents a request to partially close a position, essentially a piece of an order to reduce your exposure. 

The `action` property confirms that this is a partial loss instruction.

`percentToClose` tells you exactly what portion of the position is being closed, expressed as a percentage. 

Finally, `currentPrice` records the price at which the partial loss transaction actually took place, which is crucial for accurate record-keeping and performance analysis.

## Interface IPartialData

IPartialData is designed to hold a snapshot of trading data, specifically for saving and loading purposes. Think of it as a way to save key pieces of information about a signal's progress, like the profit and loss levels it has encountered. 

It transforms sets of levels into arrays, making them compatible with common data formats like JSON for easy storage.

This data is structured to be saved against a specific signal ID and eventually reassembled into a complete trading state when needed. It contains two main properties:

*   **profitLevels:** An array holding the profit levels achieved.
*   **lossLevels:** An array holding the loss levels reached.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how a trading signal is performing, specifically focusing on milestones like reaching 10%, 20%, or 30% profit or loss.

It’s a core component used by both `ClientPartial` and `PartialConnectionService`.

The `profit` method handles situations where a signal is making money, calculating the progress and notifying anyone who needs to know when new profit levels are achieved.

Similarly, the `loss` method manages signals that are losing money, highlighting significant loss percentages. It makes sure you only get notified about these milestones once.

Finally, the `clear` method is called when a trading signal is finished – whether it hit a target, stopped out, or simply ran out of time. This method removes the record of the signal’s progress and cleans up related resources.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments, essentially combining the original input parameters with flags that dictate the trading environment. It tells you whether you're running a backtest using historical data, a paper trading simulation that mimics live conditions, or actual live trading with real funds. The `backtest`, `paper`, and `live` properties are boolean values that clearly indicate which trading mode is active.

## Interface IParseArgsParams

This interface describes the standard input needed to run a trading strategy. It's essentially a way to define what information the system needs to know to start a backtest. You'll provide values for things like which cryptocurrency pair to trade (like BTCUSDT), the name of the specific trading strategy you want to use, the exchange you're connecting to (like Binance or Bybit), and the timeframe for analyzing price data (such as 15-minute candles). Think of it as providing the basic instructions for launching a backtest.

## Interface IOrderBookData

The `IOrderBookData` interface represents the information you get from an order book, which tracks buy and sell orders for a specific trading pair. It contains the `symbol` – the ticker symbol for the trading pair – along with arrays of `bids` and `asks`.  The `bids` array lists the buy orders, and the `asks` array lists the sell orders, providing a snapshot of the current market interest. Each bid and ask will be described by the `IBidData` interface.

## Interface INotificationUtils

This interface defines the core functions for components that want to send out notifications about what's happening during a backtest or live trading. Think of it as a contract that ensures any notification system—whether it’s sending emails, pushing to a messaging app, or logging to a file—works consistently with the backtest-kit framework.

The `handleSignal` method is used for general signal events such as trade openings, closures, and scheduled actions.  There's also `handleSignalNotify` for specific signal information.

Several specialized methods exist to manage profit and loss events: `handlePartialProfit`, `handlePartialLoss`, and `handleBreakeven` deal with situations where partial profits, losses or the break even point are reached.

`handleStrategyCommit`  deals with other important strategy-related actions, while `handleSync` is for signal synchronization.  The `handleRisk` function is specifically for managing rejection events.

For issues, `handleError` and `handleCriticalError` are used to report problems, while `handleValidationError` takes care of validation errors.

Finally, `getData` allows you to retrieve a list of all previously recorded notifications, and `dispose` gives you a way to clear those stored notifications.

## Interface INotificationTarget

This interface lets you fine-tune which notifications your backtest or live trading system receives. Instead of getting bombarded with every possible alert, you can specifically subscribe to just the ones you need. Think of it as creating a custom notification filter.

If you don't specify anything, you'll get notified about everything, but using this interface is a great way to focus on the events most important to you.

Here's a breakdown of what you can choose to listen for:

*   **Signal events:** Notifications about when signals are opened, scheduled, closed, or cancelled.
*   **Profit/Loss updates:** Alerts when partial profit or loss levels are hit, offering an early view before the final decision.
*   **Breakeven alerts:** Notifications when the price reaches your breakeven point.
*   **Strategy Commit confirmations:** Confirmation that actions like partial profits, loss stops, or scheduled orders have been executed.
*   **Signal synchronization:**  Information about orders being filled or positions being exited via the exchange connection.
*   **Risk management rejections:**  Notifications when the risk manager prevents a trade due to rules.
*   **Informational messages:**  Manual or automated notes attached to signals.
*   **Error reports:** Both general errors that can be recovered from, and critical errors that stop the process.
*   **Validation errors:** Alerts when the configuration or data used has problems.

## Interface IMethodContext

The `IMethodContext` object acts as a little guide for your backtesting process. It holds the names of the specific strategy, exchange, and frame you’re working with. Think of it as a way to keep track of exactly which components are being used during a backtest, ensuring everything lines up correctly. This context is automatically passed around during the backtest, so you don't have to worry about manually managing it. The frame name is blank when running in live (non-backtest) mode. 


## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage solutions – whether they're local, persistent, or dummy – should behave. It provides a standardized way to interact with memory, ensuring consistency across various backtest kit implementations.

You can initialize the memory using `waitForInit`.

To save data, use `writeMemory`, specifying the data's identifier, the value to store, a descriptive label, and the timestamp. Retrieving data involves `searchMemory` for full-text searches, `listMemory` for a simple listing, or `readMemory` for fetching a specific item by its ID.  `searchMemory` uses a sophisticated scoring system to find the most relevant results.

`removeMemory` lets you delete entries, and `dispose` cleans up any resources the memory instance uses when it's no longer needed. Each read and search operation respects a specified `when` timestamp, ensuring that only relevant data is returned.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see generated during your backtesting process. Each property represents a different type of analysis, such as tracking strategy events like entries and exits, monitoring risk rejections, or analyzing portfolio performance. You can turn on or off these reports individually to focus on the areas you're most interested in understanding. For example, you could enable reports for strategy events and performance metrics while keeping other reports disabled.

## Interface IMarkdownDumpOptions

This interface defines the options used when generating markdown documentation for backtest-kit components. Think of it as a way to specify exactly which parts of your backtest results you want to document. It includes information like the directory path, the specific file name, the trading pair (like BTCUSDT), the name of the strategy being used, the exchange it's running on, the timeframe (like 1m or 1h), and a unique identifier for the signal. These properties together allow for highly targeted documentation generation, focusing on particular aspects of a backtest run.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. It’s a way to keep track of important events, from starting up components to handling errors.

The framework uses logging to help understand how things are working, to find problems, and to keep a record of what happened.

There are several ways to log messages:

*   `log`: This is for recording general, significant events.
*   `debug`:  Use this for very detailed information, like what’s happening step-by-step. This is especially useful when you're trying to figure something out.
*   `info`: This is for recording successful operations and routine updates.
*   `warn`: This is for things that might be a problem later, but aren't stopping the system from working right now.

## Interface ILogEntry

This interface describes a single entry in your backtest's log history. Each log entry has a unique identifier and a level indicating its severity - whether it's a general log, a debug message, an informational note, or a warning.  The entry also includes timestamps, useful for sorting and potentially rotating logs. 

To give you more context, it can also include information about the method being executed, or the broader execution environment.  Finally, you can attach additional arguments to the log entry, allowing you to capture extra details alongside the message.

## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtesting or trading simulations. It extends the basic logging functionality, allowing you to access a complete history of all the log messages that have been recorded. Specifically, the `getList` method gives you a list of all the log entries, so you can examine them later for debugging or analysis. This is useful when you want to review the sequence of events that led to a particular trading decision.

## Interface IHeatmapRow

This interface represents a row of data for a heatmap displaying portfolio performance. Each row focuses on a single trading symbol, like BTCUSDT, and summarizes key statistics across all strategies used for that symbol. You'll find metrics like total profit/loss percentage, the Sharpe Ratio (a measure of risk-adjusted return), and the maximum drawdown—the biggest percentage decline experienced.

It also provides detailed insights into trade performance, including the total number of trades, how many were wins versus losses, the win rate, and average profit/loss per trade. Further breakdowns reveal average winning and losing trade sizes, the longest winning and losing streaks, and other important ratios like expectancy, Sortino Ratio, and Calmar Ratio, all designed to paint a comprehensive picture of that symbol's trading history. This allows for easy comparison and identification of high- and low-performing assets.

## Interface IFrameSchema

The `IFrameSchema` defines the structure of a frame used within the backtest-kit framework. Think of a frame as a specific window of time for your backtest, specifying both the time interval (like daily, weekly, or hourly) and the overall start and end dates. 

Each frame has a unique name to identify it, and you can optionally add a note for your own documentation or to explain its purpose. The `startDate` and `endDate` properties dictate the time period that the frame covers.  You can also configure callbacks to hook into different stages of the frame's lifecycle, allowing you to customize its behavior.


## Interface IFrameParams

The `IFramesParams` object holds the setup information needed to create a ClientFrame. Think of it as the configuration settings for your trading environment within the backtest. It includes a `logger` which is crucial for tracking what's happening behind the scenes and troubleshooting any issues – basically a record of what the system is doing. This logger allows you to see detailed information and debug your backtest effectively.

## Interface IFrameCallbacks

This function gets triggered whenever a set of timeframes is created, like when preparing data for a backtest. You can use it to keep track of the time periods being used or to double-check that the timeframe generation is working correctly. It receives the timeframes themselves, the start and end dates for the timeframe set, and the interval (e.g., daily, weekly) used to create them. You can execute a function or a promise here.

## Interface IFrame

The `IFrames` interface helps manage the timeframes used during backtesting. It's a core component that orchestrates the backtesting process.

Specifically, the `getTimeframe` function allows you to generate a list of timestamps. These timestamps are used to step through the historical data during your backtest, ensuring that the tests are spaced out appropriately based on your chosen timeframe interval. It will generate these timestamps for a given symbol and frame name.

## Interface IExecutionContext

The IExecutionContext object provides essential information to your trading strategies and exchange interactions. Think of it as a package of runtime details that gets passed around to give your code the context it needs. 

It includes the trading symbol, like "BTCUSDT," so your code knows which asset it's working with.  It also holds the current timestamp, which is crucial for accurate timing. Finally, it indicates whether the code is running in a backtesting environment (testing against historical data) or live trading.

## Interface IExchangeSchema

This schema describes how backtest-kit interacts with a specific cryptocurrency exchange. It essentially defines where the trading data comes from and how that data is shaped to be compatible with the framework.

You'll use it to tell backtest-kit where to find historical candle data, order books, and aggregated trades for a particular exchange.

Each exchange you want to use needs an `IExchangeSchema` that specifies:

*   A unique `exchangeName` so backtest-kit can identify it.
*   An optional `note` for your own reference.
*   A `getCandles` function which is crucial to fetch the candlestick data.
*   `formatQuantity` and `formatPrice` functions, that handle the exchange’s specific rules for dealing with quantities and prices (like the number of decimal places). If these aren't provided, a default precision will be used.
*   Optional functions to retrieve order books (`getOrderBook`) and aggregated trades (`getAggregatedTrades`).  These are not essential and will result in an error if called without implementation.
*   Optional `callbacks` that allow you to react to events like new candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. Think of it as a blueprint for how your trading system understands and communicates with a specific exchange.

It gathers all the necessary tools and information, including a logger for debugging and an execution context to track things like the trading symbol and time.

Crucially, it requires you to provide functions for fetching historical data (candles, aggregated trades, order books) and for correctly formatting trade quantities and prices to adhere to the exchange’s specific rules.  Each function is a vital link in the data pipeline. Default implementations exist, but you’ll need to provide your own for real-world integrations.

## Interface IExchangeCallbacks

This allows you to react to new candle data arriving from the exchange. You’ll receive the symbol, the timeframe (like 1m, 1h, or 1d), a timestamp indicating when the data starts, how much data was requested, and an array of candle objects containing the open, high, low, close prices, and volume. You can use this to update your UI, trigger alerts, or perform other actions based on the incoming candle information. It's optional – if you don't need this information, you don't need to provide a callback function.

Get notified when order book data changes.

You’ll get the symbol and a data structure representing the current state of the order book, including bids and asks. This is useful for visualizing the order book, calculating depth, or implementing order book-aware strategies. As with `onCandleData`, this is an optional callback.

Receive real-time trade data as it becomes available.

This callback provides a stream of individual trade events, each containing information like the price, quantity, and timestamp. It’s ideal for tracking market activity and incorporating trade data into your backtesting or analysis. It’s also an optional callback.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with an exchange, giving you access to essential market data. It allows you to retrieve historical and future candle data, which are blocks of price information over a specific time period. You can also use it to format trade quantities and prices to match the exchange’s requirements.

The framework also provides a handy way to calculate the VWAP (Volume Weighted Average Price), a useful indicator for assessing price trends. It gives you the last completed candle’s close price for a given interval, too.

Beyond basic candle data, you can fetch order books, showing the depth of buy and sell orders, and aggregated trades, summarizing trading activity. The `getRawCandles` function offers maximum flexibility to pull candles using explicit start and end dates, or rely on the execution context to define the timeframe. This ensures accurate backtesting by avoiding any look-ahead bias – meaning you’re only using data available at the time of a simulated trade.

## Interface IEntity

This interface, `IEntity`, serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common blueprint, ensuring that every persistent entity—like trades, orders, or account snapshots—has a consistent structure. It primarily provides a basic contract for defining entities that will be saved and retrieved from storage. It's a building block for more specialized entity types.


## Interface IDumpInstance

The `IDumpInstance` interface defines how you can save data during a backtesting run. Think of it as a way to create permanent records of different pieces of information, such as agent conversations, key data points, tables, text descriptions, errors, and even complex JSON objects. Each record is linked to a unique identifier (`dumpId`) and a brief explanation (`description`) for clarity.  When you’re finished with an instance, `dispose` lets you clean up any resources it might be using.  The instance keeps track of where the data should be stored based on how it's created.

## Interface IDumpContext

The `IDumpContext` helps keep track of where your data is coming from. Think of it as a little label attached to each piece of information you're saving. It tells you which trade the data relates to (using `signalId`), which strategy or agent generated it (`bucketName`), and whether it's from a backtest simulation or live trading (`backtest`). You'll also find a descriptive label (`description`) for easy identification and searching, and a unique ID (`dumpId`) for each dump entry.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, forms the foundation for handling committed data changes in the backtest-kit framework. Think of it as a blueprint for how data is staged and prepared for processing, especially when the system needs to wait until it’s in the right situation to actually apply those changes. It ensures that changes are handled correctly, even if they occur in a sequence that requires some delay.

Each `ICommitRowBase` object contains two core pieces of information:

*   **symbol**:  Identifies the trading pair involved, like "BTCUSDT". This clearly labels which asset the changes relate to.
*   **backtest**: A simple flag indicating whether the operation is happening during a backtest simulation or in live trading conditions. This helps differentiate testing environments from real-time execution.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your trading data is available. It’s used to quickly verify if the backtest-kit has the candles it expects for a specific trading pair, exchange, and timeframe without having to load all the data. You'll specify the symbol (like BTCUSDT), the exchange, the time interval (like 1 hour), and the start and end dates you want to check. This helps ensure your backtesting process has all the data it requires and prevents unexpected errors caused by missing candles.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard way to package price data over a specific time interval. Each candle contains information about when it started (`timestamp`), the opening price (`open`), the highest price (`high`), the lowest price (`low`), the closing price (`close`), and the trading volume (`volume`) that occurred during that period. This data structure is essential for calculating things like moving averages and for simulating trading strategies in a backtesting environment. You'll find it used frequently when working with historical price data.

## Interface ICacheCandlesParams

This interface defines the information needed to pre-load historical candle data for your backtests. Think of it as a blueprint for telling the system exactly which cryptocurrency pair, exchange, timeframe, and date range you want to grab.  You'll use these parameters to fetch the data beforehand, which can significantly speed up your backtesting process.  It includes the trading symbol, the exchange where the data lives, the candle interval (like 1 minute or 4 hours), and the start and end dates for the historical data you want to download.

## Interface IBroker

The `IBroker` interface defines how backtest-kit connects to a real brokerage or exchange. Think of it as a bridge between the trading simulation and the actual market.

It's designed to be reliable: if any action fails during the trading process, the framework will roll back any changes to maintain a consistent state.

The framework calls specific methods on your broker adapter for various actions like opening new positions, closing existing ones, setting take-profit or stop-loss orders, and managing trailing stops and average-buy orders. 

Importantly, during backtesting, these calls are ignored – the adapter doesn’t receive any data, ensuring the backtest runs purely on historical data.

Here’s a quick rundown of those methods:

*   `waitForInit`: This is a one-time setup step to establish the connection to the brokerage, load credentials, and prepare for trading.
*   `onSignalCloseCommit`:  Called when a trade is closed – whether by a take-profit, stop-loss, or manual closure.
*   `onSignalOpenCommit`: Notifies the broker when a new position has been successfully entered.
*   `onPartialProfitCommit`: Handles partial profit-taking operations.
*   `onPartialLossCommit`:  Deals with partial loss-taking operations.
*   `onTrailingStopCommit`: Updates and executes trailing stop orders.
*   `onTrailingTakeCommit`: Updates and executes trailing take-profit orders.
*   `onBreakevenCommit`: Sets or adjusts breakeven stop-loss orders.
*   `onAverageBuyCommit`:  Manages the execution of average-buy (dollar-cost averaging) entries.

## Interface IBreakevenData

This interface defines the data needed to save and load information about whether a breakeven point has been achieved for a particular trading signal. It's a simplified version of the more detailed breakeven state, primarily used for storing this information persistently. Think of it as a flag indicating "yes, breakeven was hit" or "no, it hasn't been hit yet."

The `reached` property is a simple boolean value. 

This data is stored by signal ID to easily track the breakeven status of each signal. When the data is loaded, this information is then used to rebuild the full breakeven state.

## Interface IBreakevenCommitRow

This object represents a record of a breakeven action that's been queued for processing. 

It tells you the type of action taken – in this case, it's a "breakeven" action. It also includes the current price at the time the breakeven was calculated, which is useful for understanding the context of the decision. Think of it as a log entry indicating a breakeven point was determined and its associated price.

## Interface IBreakeven

The IBreakeven interface helps manage a strategy's breakeven point – essentially, the price at which a trade becomes profitable. 

It tracks when a trade’s stop-loss can be moved to the original entry price, marking it as breakeven. 

This process is triggered when the price moves sufficiently to offset any transaction costs associated with the trade.

The `check` method determines if the breakeven condition is met, making sure it hasn’t already occurred, the price has moved favorably, and the stop-loss can safely be adjusted.

When the `clear` method is called, typically when a trade closes, it removes the breakeven tracking data and resets the system.


## Interface IBidData

The `IBidData` interface represents a single bid or ask price point found within an order book. It contains two key pieces of information: the `price` at which the bid or ask is offered, and the `quantity` of the asset available at that price. Both the price and quantity are stored as strings. Essentially, it's a snapshot of one specific level within the order book.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as Dollar-Cost Averaging or DCA) process. It describes one commitment to buy assets at a specific price. 

Each `IAverageBuyCommitRow` tells you the price at which the buy occurred (`currentPrice`), how much that buy cost in USD (`cost`), and how many averaging entries are now part of the overall strategy (`totalEntries`).  The `action` property simply confirms that this is related to an average-buy operation.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that happened, useful for examining past performance and backtesting strategies.  Each trade is identified by a unique ID and recorded with its price, the amount traded (quantity), and the precise time it took place.  A key detail is whether the buyer was the market maker, giving you insight into the direction of the trade.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commit. Think of it as a signal telling the system to proceed with an action that was planned for later. It includes the unique identifier of the signal involved in the activation.  There's also an optional identifier to specify that this activation was triggered directly by a user.

## Interface IActionStrategy

The `IActionStrategy` interface gives your trading strategies a way to peek at the current state of signals. It lets you quickly check if a signal is waiting to be triggered or if one is already scheduled. This is useful for making decisions within your trading logic, like deciding when to adjust stop-loss orders or take profits. Essentially, it’s a safety net, preventing actions from happening without a relevant signal to back them up.

You can use it to determine if there's an active position needing attention, or if a signal is waiting in the wings to be executed. The checks consider whether it's a backtest situation and provide context like the strategy and exchange names involved.

## Interface IActionSchema

The `IActionSchema` lets you extend a trading strategy with your own custom logic. Think of it as a way to hook into the strategy's execution and do things like manage state (using tools like Redux), track what's happening, or send notifications.

Each action you define is linked to a unique identifier. You can also add a note to document what the action does.

The core of the action is its handler – a piece of code that runs for each strategy and timeframe combination. Finally, you can define optional callbacks that trigger at specific points in the strategy's lifecycle, like when it starts or ends, or when an event happens. This provides flexible control and integration possibilities.

## Interface IActionParams

This interface, `IActionParams`, defines the information passed to actions within the backtest-kit framework. Think of it as a container holding everything an action needs to operate effectively.

It builds upon a schema definition and includes crucial elements like a `logger` for tracking and troubleshooting, allowing you to monitor how actions are performing.

You’ll also find details about the specific strategy and timeframe the action belongs to - `strategyName`, `frameName`, and the `exchangeName` it's interacting with. 

A `backtest` flag indicates whether the action is running in a simulated environment, and a `strategy` object provides access to relevant data like current signals and current positions. Essentially, it provides context and tools for the action to make informed decisions.


## Interface IActionCallbacks

This interface lets you hook into key moments in your trading action handlers, providing ways to customize behavior at different points in the process. Think of it as a set of event listeners you can use to manage resources, log events, or influence the system's behavior.

You can use `onInit` to set up resources like database connections when your action handler starts. Conversely, `onDispose` allows you to clean up those resources when the handler is done, like closing connections or saving data.

Several `onSignal...` callbacks let you react to signal events, with separate methods for live trading (`onSignalLive`), backtesting (`onSignalBacktest`), and combined (`onSignal`).  These callbacks are triggered frequently, giving you a chance to track and respond to market changes.

Specific events like breakeven triggers (`onBreakevenAvailable`), partial profit/loss hits (`onPartialProfitAvailable`, `onPartialLossAvailable`), and ping monitoring updates (`onPingScheduled`, `onPingActive`, `onPingIdle`) provide even more granular control.

`onRiskRejection` alerts you when a signal is blocked by risk management, and `onSignalSync` gives you a crucial opportunity to intercept and potentially reject limit order operations—returning false or throwing an error will cause the framework to retry the operation on the next tick. This is an exceptional case, as errors here *aren’t* automatically handled and will propagate.

## Interface IAction

The `IAction` interface is your central hub for managing how your trading framework interacts with external systems. Think of it as a set of hooks that let you react to different events happening during a backtest or live trade.

You can use these hooks to do things like:

*   Log trading signals and key data points.
*   Update dashboards to show real-time status.
*   Send signals to other systems like risk management or analytics platforms.
*   Integrate with state management libraries like Redux or Zustand.

The interface provides several methods, each triggered by a specific event.  `signal` catches signals from both backtesting and live trading, while `signalLive` and `signalBacktest` let you handle them separately.  There are also methods for reacting to events like breakeven adjustments, partial profit/loss levels, scheduled pings, risk rejections, and synchronization attempts. Crucially, `dispose` is a cleanup method that allows you to release any resources or subscriptions when the action handler is no longer required.

## Interface HighestProfitStatisticsModel

This model holds information about the events with the highest profit. It keeps a complete, ordered list of these events, with the most recent ones appearing first. You'll also find the total number of such high-profit events recorded. Think of it as a log of your best-performing trades, letting you easily analyze what contributed to those successes.

## Interface HighestProfitEvent

This describes a single moment in time when a trading position achieved its highest profit. It captures key details like when it happened, which trading pair was involved, and the name of the strategy that generated the trade. You'll find information about the signal that triggered the trade, whether it was a long or short position, and the overall profit and loss (PNL) of that position.

It also highlights the peak profit and maximum drawdown experienced by the position, as well as the prices at which the position was opened, and any take profit or stop loss levels.  Finally, it indicates whether this record occurred during a backtesting simulation or in live trading.

## Interface HighestProfitContract

This interface describes the data provided when a trading strategy reaches a new peak profit level. It gives you information about the trade itself, including the symbol being traded (like "BTC/USDT"), the current price, and the exact time the profit was achieved. You'll also find details about the strategy, exchange, and timeframe involved, along with the specific signal that triggered the trade. A key piece of information is a flag to tell you if this profit update comes from a historical backtest or a live trading scenario.

This allows you to build custom actions in response to significant profit milestones – for example, automatically adjusting your stop-loss orders or taking partial profits.


## Interface HeatmapStatisticsModel

This structure holds the overall performance statistics for your entire portfolio, giving you a high-level view of how things are doing. It breaks down the aggregated data for each symbol you're tracking into a clear picture. 

You’ll find a list of individual symbol statistics within the `symbols` array. The `totalSymbols` property simply tells you how many symbols are included in this analysis. 

The structure also provides key portfolio-level metrics like total profit and loss (`portfolioTotalPnl`), Sharpe Ratio (`portfolioSharpeRatio`), and the total number of trades (`portfolioTotalTrades`). 

To understand performance trends, you can look at `portfolioAvgPeakPnl`, which shows the average highest profit achieved by each symbol, and `portfolioAvgFallPnl`, which represents the average maximum loss.

## Interface DoneContract

This interface represents the information you receive when a background task, either in a backtest or live trading environment, finishes running. It provides details about the completed process, including the exchange used, the name of the strategy, and whether it was a backtest or live execution. You'll find the trading symbol included, like "BTCUSDT," which identifies the specific asset being traded. This helps you track and understand the results of your background processes.

## Interface CriticalErrorNotification

This notification signals a serious, unrecoverable error that requires the application to stop immediately. It's a way for the system to alert you about problems so severe that it can't continue running safely. Each notification has a unique ID, a clear error message for humans, and detailed information about the error itself, including its stack trace. Critically, these errors originate from the live trading environment, not a backtest simulation, so the `backtest` property will always be false.

## Interface ColumnModel

This describes how to set up columns for creating tables, like the ones you might see summarizing trading data. Each column needs a unique identifier, a friendly name for the header, and a way to convert the actual data into a readable string. You can also control whether a column should even be displayed at all using a function that determines its visibility. The formatting function gives you the flexibility to tailor how each data point appears in the table.

## Interface ClosePendingCommitNotification

This notification signifies that a pending trade signal was closed before it had a chance to fully activate. It's a way for the system to inform you when a signal is canceled before a position is opened. The notification includes details like a unique ID, the timestamp of the closure, and whether it happened during a backtest or live trading.

You’ll find information about the trade itself, such as the symbol involved, the strategy that generated the signal, and the exchange where it was executed.  It also provides a wealth of performance data for the closed position, including total profit and loss (pnl), peak profit, and maximum drawdown – all broken down into numerical values and percentages.  A user-provided note can offer additional context. The notification also shows when the notification was created.

## Interface ClosePendingCommit

This signal lets your backtesting system know that a pending order has been closed. It provides details about the closed trade, including a unique identifier for the reason behind the closure. 

You'll also get key performance metrics like the total profit and loss (PNL) of the trade, the highest profit reached during its lifetime, and the largest drawdown experienced. These values are all calculated up to the point when the closing signal was generated, giving you a full picture of the trade's journey.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been canceled before it could be executed. It provides a wealth of information about the signal and its potential performance. You'll find details like a unique identifier for the cancellation, when it occurred, and whether it happened during backtesting or live trading. 

The notification also gives a comprehensive snapshot of the signal’s parameters, including the trading pair, strategy name, exchange, and signal ID. Crucially, it includes data on the intended trade's size, original entry price, and projected profit/loss, including peak profit, maximum drawdown, and their corresponding prices and percentages. This allows for a detailed understanding of what *would have* happened had the signal been activated. 

Furthermore, you can see details on how many entries and partials were planned for this trade, and a human-readable note offering additional context. Finally, creation timestamp indicates when the cancellation was recorded.


## Interface CancelScheduledCommit

This interface represents a signal event used to cancel a previously scheduled action, likely related to a trading strategy. It allows you to provide a reason for the cancellation using the `cancelId` – think of it as a note to yourself or the system about why you're cancelling. Along with the cancellation details, the signal also includes performance information about the related position, specifically its total profit/loss (`pnl`), the highest profit it reached (`peakProfit`), and the largest loss it experienced (`maxDrawdown`). This information helps to understand the context of the cancellation and assess the impact of the decision.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events that occurred during a trading simulation. It's designed to give you a clear picture of how often your strategy reached a breakeven point.

You'll find a complete list of individual breakeven events, each with detailed data, stored in the `eventList` property.  The `totalEvents` property simply tells you how many breakeven events were recorded.

## Interface BreakevenEvent

This data structure holds all the key details about when a trading signal reaches its breakeven point. It's designed to make creating reports and analyzing performance much easier.

You'll find information like the exact time of the event, the trading symbol involved, and the name of the strategy that generated the signal. It also includes crucial pricing data such as the entry price, take profit target, stop loss, and original pricing information.

For signals that use dollar-cost averaging (DCA), it provides details on the number of entries and partial closes. You'll also find the current profit and loss (PNL) at the time of breakeven, a description of why the signal was triggered, and timestamps marking when the position was activated and scheduled. Finally, it tells you whether the trade happened in a backtest or in live trading conditions.

## Interface BreakevenContract

This interface represents a breakeven event, a key milestone in a trading strategy. It’s triggered when a signal's stop-loss is moved back to the original entry price, signifying the initial risk has been recovered.

Think of it as a notification that a trade has become risk-free, at least in terms of covering the initial investment.

The event contains important details: the trading symbol, the name of the strategy that generated the signal, the exchange and frame used for the trade, along with the complete signal data. You’ll also find the current price at which breakeven was hit, whether the event came from a backtest or live trading, and a timestamp for when it happened. 

These events are useful for tracking a strategy's performance and how it manages risk, allowing for reporting and custom user notifications.

## Interface BreakevenCommitNotification

This notification gets sent when a breakeven action happens, marking a significant event in your trading. It’s like a detailed report card for that trade, packed with information.

It includes a unique ID and timestamp, along with whether it happened during a backtest or live trading. You’ll see the trading pair (like BTCUSDT), the strategy that triggered the action, and the exchange involved.

The notification breaks down all the important details of the trade: the entry price, take profit, stop loss, original prices before any trailing adjustments, and how many entries were used for averaging. 

It also provides key performance metrics such as total profit and loss (both in USD and percentage), peak profit details, maximum drawdown information, and even the prices at which these extremes were reached. Finally, there's a field for a human-readable note explaining the reasoning behind the signal, along with timestamps for when the signal was scheduled, became pending, and when this notification was created.

## Interface BreakevenCommit

This event signifies a breakeven adjustment has occurred within a trading strategy. It provides detailed information about the position that reached a breakeven point, including the current market price and the overall profit and loss (pnl) accumulated throughout the position's life. You'll also find data regarding the highest profit achieved and the largest drawdown experienced by the position.

The event outlines the trade's direction (long or short), the original entry price, and the effective take profit and stop-loss prices, as well as their initial, unaltered values. Timestamps are included to show when the signal was generated and when the position was initially activated. Essentially, this event gives a complete snapshot of a position's health and performance at the time a breakeven adjustment was triggered.

## Interface BreakevenAvailableNotification

This notification signals that your trading position now has the potential to break even – meaning the stop-loss order can be adjusted to match your original entry price. It's a positive event, potentially reducing risk while keeping the possibility of further profit.

The notification provides a lot of detail about the position, including a unique ID, the exact timestamp of the event, whether it's from a backtest or live trading, the trading pair involved, the strategy used, and the exchange where the trade happened. It gives you the current market price, your entry price, and the levels of your take-profit and stop-loss orders, both the current adjusted levels and the original ones.

You'll also find data related to the position's history, such as the number of entries (if using dollar-cost averaging), any partial closes, and comprehensive performance metrics like total profit/loss, peak profit, maximum drawdown, and their respective prices and percentages. These metrics offer a complete picture of the position’s health up to this point. There's also a field for an optional, human-readable note explaining the reason behind the signal. Finally, you'll see timestamps related to when the signal was created and when the position became active.

## Interface BacktestStatisticsModel

This model holds a wealth of information about how a trading strategy performed during a backtest. It breaks down the results into key statistical measures, allowing you to understand not just whether a strategy made money, but *how* it made money and what risks were involved.

You'll find a detailed list of every trade (`signalList`) along with overall counts of winning and losing trades. It also provides metrics like win rate, average profit or loss per trade, and total profit or loss.

Several risk-adjusted return ratios are included such as Sharpe Ratio, Sortino Ratio and Calmar Ratio to compare the strategy's performance against its risk profile. You'll also see volatility measures like standard deviation, and metrics evaluating drawdown behavior.

Keep in mind that many of these values might be null if the backtest results were unreliable due to factors like extreme market conditions.

## Interface AverageBuyCommitNotification

This notification signals that a new averaging (DCA) order has been executed within an existing position. It provides detailed information about this latest averaging step, helping you understand how the position is being built over time. 

You'll find key details like the exact price and cost of this particular averaging order, as well as the updated effective (averaged) entry price and the total number of averaging entries now in the position. It also includes crucial metrics like peak profit, maximum drawdown, and overall position performance data, all calculated up to this point. 

The notification also indicates whether the trade occurred in backtest mode or live trading, along with specifics like the trading pair, strategy, and exchange involved. You can also see when the original order was placed and when the position became active, providing a full timeline of events. Finally, there’s an optional note field which might explain the reasoning behind the signal.

## Interface AverageBuyCommit

This event signals a new averaging buy has occurred within a trading position. It provides a snapshot of the position’s state following this averaging action.

You'll see details like the price at which the averaging buy was executed, the cost of that specific buy, and the overall effective entry price that results from averaging.

The event also includes key performance indicators of the position up to this point, such as realized and unrealized profit and loss (PNL), peak profit achieved, and maximum drawdown.

The direction of the trade (long or short) is specified, along with the original entry price and any adjusted take profit and stop loss levels. 

Finally, timestamps are provided to show when the signal was generated and when the position was activated.

## Interface ActivePingContract

This describes a way to keep track of ongoing signals that are waiting to be triggered. Think of it as a heartbeat signal confirming a pending order is still active. 

Every minute, when a signal is pending, this event is sent out, giving you information like the trading pair, the strategy involved, and where it's being monitored.

You'll receive details about the signal itself, including all the data associated with it – things like open price, take profit, and stop loss levels. A current price is also provided, giving you the market price at the moment the signal was pinged. 

A flag indicates whether this ping is happening during a backtest (historical data) or live trading. A timestamp tells you exactly when the ping occurred. 

You can listen for these ping events and create your own custom logic based on them, perhaps to adjust or manage the pending signals dynamically.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, letting you know it's time to act. It contains a wealth of information about the trade, including a unique identifier, the exact time of activation, and whether it's happening in a backtest or live environment.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange it's executing on. The notification also outlines key trade parameters: the position direction (long or short), entry price, take profit, and stop loss levels, including their original values before any adjustments.

For more in-depth analysis, it provides a comprehensive view of the trade’s performance, including the total profit and loss, peak profit, maximum drawdown, and related price points.  You’ll also see data on DCA entries, partial closes, and the signal’s creation and pending times. A note field is available to add context and reasoning behind the signal for clarity.

## Interface ActivateScheduledCommit

This interface describes a signal event that signifies the activation of a previously scheduled trade. It carries detailed information about the trade, including its direction (long or short), entry and exit prices (original and adjusted), and the position’s performance metrics like peak profit, maximum drawdown, and total profit and loss. The signal also records when the signal was initially created and when the trade actually started executing.  You can optionally provide a reason identifier to track why the activation happened, and the current price at the moment of activation is also included for context. This allows you to understand the full context of a trade's activation and its financial history.
