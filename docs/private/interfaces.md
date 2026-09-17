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

This defines a notification that a walker has been stopped. 

Imagine you're running multiple automated trading systems (walkers) at the same time – this notification lets you know when one of them is being interrupted. 

It tells you *which* symbol the trading is happening on, *which* specific trading strategy is being halted, and *which* walker instance is being stopped. 

The `when` property provides a timestamp representing the last moment the strategy was active, useful for tracking down the precise state when the stop was triggered – it’s not a real-world clock time, but rather the timestamp of the last processed data.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to organize and understand the results of backtesting trading strategies. Think of it as a container holding all the information you need to compare different strategies. 

It builds upon the basic WalkerResults, but adds extra data specifically for comparing how different strategies performed.

The most important piece of information it holds is an array called `strategyResults`. This array lists the results for each individual strategy that was tested, allowing you to easily see how they stack up against each other.

## Interface WalkerContract

The WalkerContract represents progress updates as your strategies are being compared during a backtest. It’s like a notification that pops up each time a strategy finishes running and its results are available. 

Each update contains details like the name of the strategy that just completed, the exchange and frame it’s associated with, the symbol being tested, and the backtest statistics gathered. You’ll also see the strategy’s metric value, the metric being optimized, and how it stacks up against the best-performing strategy so far. 

The information also includes a running tally of how many strategies have been tested and how many are left. Crucially, the "when" field tells you the virtual time in the backtest—it represents the time of the last candle processed and never reflects actual calendar time.

## Interface WalkerCompleteContract

The WalkerCompleteContract represents the conclusion of a backtesting run, signaling that all strategies have been evaluated. It packages up all the key information from the completed backtest.

You'll find details like the name of the walker that ran the test, the trading symbol being analyzed, and the exchange and timeframe used.

Crucially, it includes the optimization metric that guided the testing, the total number of strategies that were compared, and which strategy emerged as the best performer.

The contract also provides the metric value achieved by the best strategy, along with its detailed statistics. Finally, it records the virtual execution time, representing the last candle processed, which isn't tied to actual calendar time.

## Interface ValidationErrorNotification

This notification signals that a risk validation check failed during a trading simulation. 

It’s essentially a heads-up that something went wrong with your trading rules – perhaps a condition wasn’t met or a limitation was exceeded.

Each notification has a unique identifier, a detailed error message you can understand, and a snapshot of the error including where it originated. 

You'll also find technical details like a stack trace to help pinpoint the exact location of the problem. 

Importantly, this kind of notification always indicates a problem related to the current, simulated trading environment – it's not tied to any past or future events.

## Interface ValidateArgs

This interface helps ensure that the names you're using for things like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweep configurations are all valid within your backtest setup. 

Think of it as a way to double-check that you haven’t misspelled anything or are trying to use a name that doesn’t exist.

Each property in this interface represents a different category of name and expects an enum object – effectively a set of predefined, accepted names – to be used for validation. This helps maintain consistency and prevents errors during backtesting.

## Interface TrailingTakeCommitNotification

This notification signals that a trailing take-profit order has been executed. It provides a comprehensive record of the trade, including details like the unique identifier, timestamp, and whether it occurred in backtest or live mode.

You'll find information about the trading pair, the strategy and exchange involved, and a unique signal ID. The notification breaks down the specifics of the trailing take action, like the percentage shift from the original take-profit level.

It also gives you a wealth of data on the trade itself: current price, trade direction (long or short), entry and exit prices, and original order levels. Furthermore, it includes financial details such as cost, leverage, and margin mode.

Finally, the notification summarizes the position's performance, detailing peak profit, maximum drawdown, overall PNL, and other key metrics related to the trade’s lifecycle. A note field may offer additional context about the trade.

## Interface TrailingTakeCommit

This describes a trailing take profit event, which is a signal generated when a trading strategy adjusts its take profit price based on market movement. It contains details about the action taken, which is specifically a trailing take.

You’ll find the percentage shift used to adjust the take profit, the current price at the time of the adjustment, and the profit and loss (pnl) associated with the trade.

The record also includes information about the peak profit and maximum drawdown experienced by the position, along with whether the trade is a long or short position. 

Further details cover the original entry price, the current take profit and stop loss prices, and their original values before any adjustments were made. 

Finally, it provides timestamps indicating when the signal was created and when the position was initially activated.

## Interface TrailingStopCommitNotification

This notification provides detailed information when a trailing stop order is executed. It confirms when a trailing stop has triggered and moved the stop-loss price, essentially closing a trade.

The notification includes a unique identifier, timestamp, and indicates whether it originated from a backtest or a live trading environment. You'll find details about the trading pair, the strategy involved, and the exchange where the trade occurred.

It provides a comprehensive breakdown of the trade's lifecycle, including the original and adjusted stop-loss and take-profit prices, the entry and exit prices, and the total cost of the position. The notification also contains performance metrics like peak profit, maximum drawdown, and percentage profit/loss, offering a clear view of the trade's profitability and risk profile.

Furthermore, it reveals details about partial closing of the position, the number of entries made, and any notes associated with the trade, ensuring full transparency and traceability. You'll also see information about when the signal was scheduled and when the position became active.

## Interface TrailingStopCommit

This data describes a trailing stop event, which happens when a trading strategy automatically adjusts a stop-loss order based on price movements. The `action` property confirms this is a trailing-stop event.

The `percentShift` tells you the percentage used to calculate the stop-loss adjustment.

You'll also find key details about the trade itself, including the current market price (`currentPrice`), the trade's direction (`position` – long or short), and the original entry price (`priceOpen`).

The event provides information about the position's performance, such as the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the maximum loss experienced (`maxDrawdown`).

Important price points are also included, showing both the original take-profit and stop-loss levels (`originalPriceTakeProfit`, `originalPriceStopLoss`), and how they've changed (`priceTakeProfit`, `priceStopLoss`).

Finally, timestamps (`scheduledAt`, `pendingAt`) indicate when the signal was created and when the position was activated.

## Interface TickEvent

This interface, `TickEvent`, provides a standardized way to represent all the data related to events happening within your trading system. Think of it as a single container holding all the key information about a trade, whether it's being scheduled, canceled, opened, or closed. It includes details like the exact time of the event, the type of action that occurred (like 'scheduled' or 'closed'), and crucial price points like entry, take profit, and stop loss. You'll find data about DCA averaging, partial closing executions, profit and loss calculations, and reasons behind cancellations or closures. It's designed to make report generation and analysis much simpler, as you don't need to worry about different data structures for each type of event.

## Interface SyncStatisticsModel

This model helps you understand how often your trading signals are being synchronized. It keeps track of all the synchronization events, letting you see the total number of syncs that have happened. You can also use it to see how many times signals have been opened and closed, giving you insight into the lifecycle of your signals. The `eventList` property provides a detailed record of each individual synchronization event.

## Interface SyncEvent

This data structure helps to keep track of what's happening with your trading signals during backtesting or live trading. It combines a lot of important details into one place, making it easier to generate reports and understand the lifecycle of each trade.

Each event includes a timestamp and identifies the trading symbol, the strategy used, and the exchange involved. You’ll also find specific details about the signal itself, like its unique identifier and the action taken (like opening or closing a position).

The structure also provides information on key pricing elements like entry price, take profit, and stop loss levels, as well as how they might have changed from their original values. It stores information about when the signal was created and when the position became active, which is useful for analyzing timing.

You’ll also see data related to the performance of the trade, including the total profit and loss, the highest profit achieved, the largest drawdown, and the reason for closing the position. There's even a flag indicating whether the event originates from a backtest. Finally, it includes a timestamp showing when the event was actually recorded.

## Interface StrategyStatisticsModel

This model holds the statistical information gathered during a backtest, giving you insights into how your trading strategy behaved. It contains a detailed list of every event that occurred during the backtest, along with a count of different types of actions like cancels, closes, partial profits, and trailing stops. You'll find the total number of events, as well as counts for specific actions such as activating scheduled orders or executing average-buy (dollar-cost averaging) strategies. Essentially, it's a breakdown of your strategy's actions, helping you analyze its performance.

## Interface StrategyPauseNotification

This notification tells you when a trading strategy has been paused or resumed. It’s a signal that the strategy is temporarily halting new trades – it won't generate new trade signals and won’t start any new positions. However, any existing trades that were already in progress will continue to be managed and can close normally.

The notification provides detailed information about the change, including a unique ID, the exact time of the change, whether it occurred during a backtest or live trading, the trading pair involved, the name of the strategy, and the exchange and frame being used. Most importantly, the `paused` property tells you the new state – whether the strategy is now paused (true) or has resumed (false).

## Interface StrategyEvent

This data structure holds all the key details about events happening within your trading strategy, making it easier to understand what's going on and generate clear reports. It records things like when an event occurred (timestamp), which trading pair was involved (symbol), and the name of the strategy.

You'll find information about the exchange and timeframe, as well as a unique identifier for the signal that triggered the action (signalId).  It specifies the type of action taken (like buying, selling, or closing a position), the current market price at the time, and details about profit/loss targets and trailing stops.

If a scheduled or pending action is involved, there are IDs to track it.  The structure also clearly identifies whether it’s a backtest or live trade, and the direction of the trade (long or short).

Detailed price information is provided, including the original entry price and any adjusted take profit and stop loss levels. For strategies using dollar-cost averaging, you’ll see data about entries, partial closes, and the cost of the entry. Finally, a note field allows for adding custom context to specific events.

## Interface SignalScheduledNotification

This notification type tells you when a trading signal is going to be executed in the future. It’s like a heads-up that a trade is about to happen.

Each notification contains a lot of details about the upcoming trade, including a unique ID, the exact time it's scheduled, and whether it’s happening in a backtest or live trading environment.

You'll find information on the trading pair (like BTCUSDT), the strategy that generated the signal, and the exchange it'll be executed on. The notification also breaks down the specifics of the trade: the entry price, take profit levels, stop loss, and even how much capital will be used, along with any DCA (Dollar Cost Averaging) details.

Beyond the basic trade parameters, it also provides key performance indicators (KPIs) calculated so far, such as peak profit, maximum drawdown, and percentage profit/loss, giving you insight into how the position has performed up to this scheduled point. Finally, it holds extra notes that explain the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of information about the trade, including a unique identifier and timestamp. You'll find details about whether it was a backtest or live trade, which symbol was involved, and the strategy and exchange responsible.

The notification includes specifics about the trade itself, like its direction (long or short), entry and exit prices, and details related to take profit and stop-loss orders. You can see how much was invested and the leverage applied.

Beyond the basics, it dives into performance metrics. The notification tracks total profit and loss, peak profit, and maximum drawdown, along with key prices and costs associated with these events.  There's even information about any averaging (DCA) or partial closes that occurred. Finally, it contains a human-readable note, and timestamps relating to when the signal was created, scheduled and when the position became active.

## Interface SignalInfoNotification

This framework provides a way for trading strategies to send informational notifications about open positions. These notifications, labeled as "signal.info," offer a detailed snapshot of a position's status, including the strategy responsible, the exchange involved, and key pricing information.

The notification includes identifying details like a unique ID, timestamp, and whether it originates from a backtest or live environment. You’ll find specifics like the trade direction (long or short), entry and take profit/stop loss prices, as well as original prices before any adjustments.

It also provides financial metrics like the cost of the initial position, leverage applied (multiplier), and details about averaging (total entries) and partial closes (total partials). A comprehensive look at the position's performance is given through data about peak profit, maximum drawdown, and percentage profit/loss alongside related price points and investment values.

Strategies can include custom notes to provide additional context and information. Finally, timestamps track signal creation, pending status, and when the notification was generated, offering a complete timeline of the position’s events.

## Interface SignalInfoContract

This interface describes the information shared when a trading strategy wants to broadcast a custom message about an open position. Think of it as a way for strategies to send out notifications – maybe for debugging, providing extra details about a trade, or connecting to external systems.

The message includes specifics like the trading pair (e.g., BTCUSDT), the name of the strategy that triggered it, and the exchange being used. You'll also find details about the data associated with the signal itself, the current market price at the time, and any custom notes or identifiers provided by the strategy.

It also tells you if the event happened during a backtest (using historical data) or in live trading, and provides timestamps and dates for precise timing. This allows you to track when these informational events occurred, whether it's based on a virtual candle in a backtest or real-time market data.

## Interface SignalEventContract

This interface defines the information you receive when a trading signal transitions between a pending state and an active or closed state. It allows you to monitor the lifecycle of signals without needing to constantly track every single signal update.

Signals are marked as either "opened" when a pending position begins and "closed" when the position is resolved. Each event provides details such as the trading symbol, the name of the strategy generating the signal, the exchange involved, and the timeframe being used.

The signal data itself, including key details like entry price, take profit and stop-loss levels, is included, along with the specific reason for closure when applicable – whether it’s a take profit, stop loss, time expiration, user action, or broker fill. The event also provides the current price at the time of the action and flags whether it's part of a backtest or live trading execution, alongside a timestamp and a date representation of that timing. This comprehensive information gives you a clear picture of what’s happening with your trading signals and positions.

## Interface SignalData$1

This interface describes a single, completed trading signal used for calculating performance metrics. Think of it as a record of one trade that's finished.

It holds key details about the trade, including the strategy that created it, a unique identifier for the signal, and the symbol being traded (like BTC/USD). 

You'll also find information about whether the trade was a long or short position, its profit and loss (expressed as a percentage), and why the trade was closed. Finally, timestamps record when the signal was initially opened and when it was closed.

## Interface SignalCommitBase

This defines the fundamental information shared by all signal commit events within the backtest-kit framework. Each signal commit will include details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated it, and the exchange used.

It also specifies whether the signal came from a backtest or a live trading environment, along with a unique identifier for the signal itself.  You'll find the exact time of the signal, which differs depending on whether it's a backtest (candle timestamp) or a live trade (tick time).

The record also tracks how many entries and partial closes have been executed, along with the initial entry price, which remains unchanged even with averaging. The full signal data and an optional note for explanation are also included.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was a take profit, a stop loss, or something else. It provides a ton of detail about the trade, including when it started and ended, the prices involved, and how much profit or loss was made.

You'll find information like the strategy name, the exchange used, and whether the trade was part of a backtest or a live trade. The notification breaks down the costs, leverage used, and even details about any DCA (Dollar Cost Averaging) strategies.

It goes beyond just the final numbers, offering insights into peak profit and maximum drawdown throughout the position's life, as well as the duration it was open. You'll also see information like the reason for the closure and any notes added to explain the situation. This notification gives you a complete picture of a closed trading position, from beginning to end.

## Interface SignalCancelledNotification

This notification appears when a trading signal that was scheduled to execute gets cancelled before it actually happens. It provides detailed information about the cancelled signal, like its unique ID, the time it was cancelled, and the reason for the cancellation. You'll see details about the intended trade, such as the direction (long or short), the target take-profit and stop-loss prices, and the entry price. 

The notification also includes financial information like the planned cost of the trade, leverage multiplier, and potential profit/loss calculations, although these are based on projections since the trade never occurred. It also provides details on the signal's origin - the strategy, exchange, and whether it was part of a backtest or live trading.  Crucially, it includes a `cancelReason` explaining *why* the signal was cancelled, like a timeout or manual user intervention.  Finally, it includes timestamps of when the signal was initially created and when it was scheduled to execute, helping you understand the signal's lifecycle.

## Interface Signal

The `Signal` object holds all the information about a single trading signal generated by your backtest strategy. It essentially represents one instance where your strategy told you to buy or sell.

The `priceOpen` property simply tells you the price at which the position was initiated.

The `_entry` array keeps track of details about each entry into the position.  Each element in this array is a record of a single buying or selling action, noting the price, total cost, and when that action took place.

The `_partial` array is similar to `_entry`, but it records details about any partial exits or adjustments to the position, specifying whether it was taken for profit or loss, the percentage of the position it represents, the price at the time, the cost basis, and the number of units remaining.

## Interface Signal$3

This section describes the `Signal$3` object, which holds information about a trading signal. It tracks the initial entry price for a position, allowing you to see how much you paid to get into the trade.

It also maintains a record of all entry events, detailing the price, total cost, and precise time of each entry.

Finally, it keeps a log of any partial exits from the position, noting whether it was a profit or loss, the percentage gain/loss, the price at which the partial exit occurred, the cost basis at the time of the close, the number of shares/contracts exited, and the timestamp of the action.

## Interface Signal$2

This `Signal` object holds information about a trading position. It tracks the initial entry price of the trade, represented by `priceOpen`. 

You'll also find a record of all entry points, including the price, cost, and timestamp for each. 

Finally, it stores details about any partial exits taken during the trade, noting whether they were for profit or loss, the percentage of the position closed, the price at the time of the exit, and associated costs and timestamps.

## Interface Signal$1

This `Signal` object represents a trading signal and holds important information about a position. It includes the `priceOpen`, which is the price at which you initially entered the trade. 

You can also find a record of the original entry details, including the price, cost, and timestamp.

Finally, it tracks any partial exits from the position, noting whether they were for profit or loss, the percentage of the position closed, the price at which it was closed, the cost basis at the time of closing, the number of shares/contracts closed, and the associated timestamp.

## Interface ScheduledEvent

This data structure neatly bundles together all the important details about trading events – whether they were scheduled, opened, or cancelled. Think of it as a single record containing everything you'd need to analyze what happened during a trade.

Each event includes a timestamp, the type of action that occurred (scheduled, cancelled, or opened), and the specific trading pair involved. It also holds key price points like the entry price, take profit, and stop loss, and tracks any modifications to those prices. 

If a trade involved dollar-cost averaging (DCA) or partial closes, details like the number of entries, partial closes, and executed percentages are also recorded. Furthermore, you’ll find information about unrealized profit and loss (pnl), the duration of the trade, and reasons for cancellation. Essentially, it gives a complete picture of a trade’s lifecycle, from scheduling to potential cancellation or opening, making it perfect for generating insightful reports and understanding trading performance.

## Interface ScheduleStatisticsModel

This model holds statistics about signals that were scheduled, opened, or cancelled.

It allows you to understand how often signals are scheduled, and how frequently they are activated or cancelled.

The `eventList` property contains a complete record of every scheduled event, providing detailed information.

You’ll find overall counts for all events, scheduled signals, signals that were activated, and those that were cancelled.

Important performance indicators like cancellation rate (how often signals are cancelled) and activation rate (how often they’re opened) are also included.

Finally, the model gives you average waiting times for signals that were cancelled or activated, helping you pinpoint potential bottlenecks.

## Interface SchedulePingContract

The SchedulePingContract provides a way to keep track of what's happening with your scheduled signals while they’re actively being monitored. Think of it as a regular heartbeat signal emitted every minute.

This heartbeat contains a lot of useful information like the trading symbol ("BTCUSDT"), the name of the strategy using it, and the exchange it's on. You'll also get the timeframe being used, and all the detailed data about the signal itself, including things like the open price and stop-loss levels.

Importantly, it also includes the current market price at the time of the ping and whether it's a backtest (historical data) or live execution. 

You can use this information to create custom logic; for example, you could automatically cancel a signal if the price moves too far from its original entry point. It's a powerful tool for closely managing and monitoring your automated trading strategies.

## Interface ScheduleEventContract

This framework provides a way to track scheduled trading signals – those that are planned but haven't yet been activated – without needing to monitor the entire signal stream. It's like getting updates just about the scheduled signals themselves.

You'll receive notifications when a new signal is scheduled, meaning it's waiting for the right price to activate, or when a scheduled signal is cancelled, perhaps because a condition wasn't met or it was manually removed. This allows your applications to react to these events specifically.

The information included with each event tells you exactly what happened: which symbol the signal relates to, which strategy created it, the timeframe it’s associated with, and the full details of the signal itself. You'll also know *why* a signal was cancelled, such as a timeout, price rejection, or user intervention.  A current price and a timestamp are also provided for context. Finally, a flag indicates whether the event occurred during a backtest or live trading.

## Interface RiskStatisticsModel

This model holds the results of risk rejection analysis, giving you a clear picture of how often your risk controls are being triggered. 

It contains a list of individual risk events, providing detailed information about each rejection. 

You'll also find the total count of rejections, as well as breakdowns organized by the symbols involved and the strategies that triggered them. This allows you to pinpoint areas needing attention in your risk management setup.

## Interface RiskRejectionNotification

This notification lets you know when a trading signal was blocked by your risk management rules. It’s like a heads-up that something prevented a trade from happening.

The notification includes details about why the signal was rejected, such as a human-readable explanation of the issue. You’ll see information about the strategy involved, the exchange being used, and the symbol being traded.

It provides key information like the current price, trade direction (long or short), and any take profit or stop loss levels that were in place. You can also find out about the number of open positions, any leverage used (the multiplier), and whether it was a backtest or a live trading scenario. A unique ID helps track these rejections if needed.

## Interface RiskEvent

The RiskEvent data structure holds information about situations where trading signals were blocked due to risk management rules. Each event represents a rejected signal and includes details like when it happened (timestamp), which trading pair was involved (symbol), and the specifics of the signal itself (currentSignal). You'll also find information about the strategy that generated the signal, the exchange used, the timeframe considered, and the current market price at the time of rejection. 

It also stores the number of positions that were open when the signal was rejected, a unique identifier for the rejection, a note explaining why the signal was rejected, and whether the event occurred during a backtest or live trading. This comprehensive data helps in understanding and debugging risk-related issues in your trading system.

## Interface RiskContract

The RiskContract represents a signal that was blocked due to risk validation. Think of it as a notification when the system prevents a trade from happening because it violates pre-defined risk limits.

It contains details about the rejected trade, including which market it was for (symbol), the specifics of the trade itself (currentSignal), and which strategy tried to make it. You'll also find information about the timeframe used, the exchange involved, and the current market price at the time of the rejection.

The contract also includes portfolio-level information, such as the number of currently active positions, and a unique ID to help with tracking and debugging. A human-readable explanation of why the trade was rejected (rejectionNote) is also included. Finally, it provides timestamps and a flag indicating whether the event occurred during a backtest or in live trading. This information is valuable for monitoring risk management and generating reports.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive as a background process, like analyzing trading strategies, runs. It tells you which strategies are being evaluated, how many are left to go, and what percentage of the work is complete. Each update includes the name of the process, the exchange and frame being used, the trading symbol involved, the total number of strategies, how many have already been checked, and a progress percentage. Importantly, it also provides a timestamp reflecting when the last strategy's backtest finished – this isn't a real-time clock, but a marker representing the time within the backtest itself.


## Interface ProgressBacktestContract

This contract provides updates on the progress of a backtest. You'll see these events as a backtest runs, giving you a sense of how far along it is.

Each update includes the exchange and strategy names, the trading symbol being tested, the total number of historical data points being used, and how many have been processed so far.

Most importantly, you’ll get a percentage indicating completion. A `when` property shows the virtual time of the data point being processed at the time of the update; this isn't real-time, but corresponds to the end of the timeframe being analyzed.


## Interface PerformanceStatisticsModel

This model holds the results of a backtest’s performance analysis, organized by the strategy used. It provides a way to understand how a trading strategy performed over time.

You'll find the strategy's name listed, alongside the total number of performance events that were tracked and the overall time it took to calculate these statistics.

The `metricStats` property breaks down the performance further, grouping statistics by the type of metric being measured.  Finally, the `events` property contains a complete list of all individual performance events recorded during the backtest, allowing for a more detailed look at what happened.


## Interface PerformanceContract

The PerformanceContract is designed to help you understand how your trading strategies are performing. It records key events during the execution process, allowing you to pinpoint areas where things might be slow or inefficient. 

Each PerformanceContract contains information like when the event occurred (recorded both as a precise timestamp and as a human-readable date), what type of operation was happening, how long it took, and which strategy, exchange, and symbol were involved. 

It also distinguishes between backtest mode (simulated trading) and live mode (actual trading), providing different perspectives on performance. The 'previousTimestamp' property lets you see the sequence of events.

## Interface PauseContract

This interface represents updates about when a trading strategy is paused or resumed. 

When a strategy is paused, it stops generating new trading signals – although any existing signals are still managed and closed as usual.

This event provides details about the change, including the trading symbol involved, whether the strategy is now paused or active, and the exact time the change happened.

You'll also find the strategy and exchange names, the timeframe used (like "1m" for one-minute candles), and a flag to tell if the update is from a backtest simulation or live trading. 

This information is useful for notifying users about these state changes, perhaps through a messaging system.

## Interface PartialStatisticsModel

This data structure holds key statistics gathered during a backtest, specifically focusing on events where partial profits or losses occurred. It's like a report card showing how your trading strategy performed in terms of gains and losses at those milestones.

You’ll find a detailed list of each of these partial profit/loss events in the `eventList` property.
`totalEvents` simply tells you the overall number of these events that happened during the backtest.
`totalProfit` counts the number of times your strategy triggered a partial profit, and `totalLoss` tracks the number of times it triggered a partial loss.

## Interface PartialProfitContract

The `PartialProfitContract` represents a signal reaching a profit milestone during trading, like hitting 10%, 20%, or 30% profit. This helps you track how your trading strategy performs as it moves towards a take-profit target.

These events are generated whenever a signal reaches one of these pre-defined profit levels.  You'll see multiple events if the price moves quickly.

Each event includes important details like the trading symbol, the name of the strategy used, the exchange where the trade is happening, and the current price at which the profit level was reached. The `data` property gives you access to the original signal data, including the original stop-loss and take-profit prices. The `level` property tells you the exact percentage of profit reached.

You can use this information to build reports, monitor strategy performance, or trigger custom actions when certain profit milestones are hit.  The `backtest` flag indicates whether the event came from a historical simulation or a live trade, and the `timestamp` and `when` properties provide precise timing information – the actual time in live mode or the candle timestamp in backtest mode.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed, whether it's during a backtest or live trading. It provides a wealth of detail about the trade, including a unique ID, the exact time it happened, and whether it occurred in backtest or live mode.

You'll find important information like the trading pair, the strategy that generated the signal, and the exchange where it was executed. It also includes details about the position itself – the entry and take profit/stop loss prices, along with their original values before any trailing adjustments.

The notification includes comprehensive profitability data: total profit/loss, peak profit, maximum drawdown, and associated prices and costs.  You’ll also find the number of entries and partial closes, and details on how leverage and margin isolation were applied.

Finally, the notification provides additional context with a human-readable note, as well as timestamps related to the signal's scheduling and activation.

## Interface PartialProfitCommit

This object represents a partial profit taking action within a trading strategy backtest. It details how much of a position is being closed, typically expressed as a percentage. The event includes important information about the trade's performance up to this point, such as the total profit and loss (pnl), the highest profit reached (peakProfit), and the largest drawdown experienced. 

You'll find the entry price (priceOpen), the final take profit and stop loss prices (priceTakeProfit, priceStopLoss, along with their original, untrailed values), and timestamps marking when the signal was created (scheduledAt) and the position was activated (pendingAt). This information is crucial for analyzing the strategy’s behavior and understanding why partial profits were taken. The `action` property specifically identifies this event as a partial profit commitment.

## Interface PartialProfitAvailableNotification

This notification lets you know when a trading strategy has reached a specific profit milestone, like 10%, 20%, or 30% of its potential. It provides a detailed snapshot of the trade's performance at that moment.

You’ll find key information like the unique identifier of the signal, when the milestone was hit, and whether it's a backtest or live trade. It also includes details about the trading pair, the strategy used, the exchange, and the entry price.

The notification breaks down the position's specifics: trade direction (long or short), take profit and stop-loss prices (both original and adjusted), and the cost of the trade. You can also see how much leverage was used and how many entries and partial closes have occurred.

It goes further by providing performance metrics like total profit/loss (both in USD and as a percentage), peak profit, and maximum drawdown – helping you understand the risk and reward profile of the trade.  Finally, you’ll find timestamps indicating when the signal was created, became pending, and when this specific notification was generated. A note field allows for adding extra explanation to a signal.

## Interface PartialLossContract

The `PartialLossContract` helps you track and understand when a trading strategy hits predefined loss levels, like -10%, -20%, or -30% drawdown. It's like a notification system that alerts you whenever a strategy's loss reaches a significant milestone.

These events are generated by the system and provide valuable insight into a strategy’s performance, particularly its risk management. You'll receive these notifications only once for each level per trading signal.

The data included with each notification provides a wealth of information: the trading symbol, the name of the strategy, the exchange and frame used, and detailed signal data. It also includes the current market price when the loss level was triggered, the specific loss level reached (like -20%), and whether the event occurred during a backtest or live trading. Finally, a timestamp and Date object tell you precisely when the event occurred. It's a powerful tool for monitoring strategy risk, analyzing performance in historical data, and building sophisticated trading reports.

## Interface PartialLossCommitNotification

This notification signals that a partial closing of a trading position has occurred, whether in a backtest or live environment. It provides a wealth of information about the trade, including the unique identifiers for the notification, signal, and position. You'll find details about the timing of the action, the trading symbol involved, and the strategy that initiated it. 

The notification breaks down the specifics of the partial close, like the percentage of the position closed and the current market price at the time. It also includes essential data points about the original position, like the entry price, stop-loss levels, and initial cost. 

Furthermore, it offers a comprehensive view of the position's performance, outlining peak profit, maximum drawdown, and related pricing information. This data allows for a thorough post-trade analysis, providing insights into performance metrics and potential areas for improvement. Lastly, you can find details like the reason for the trade and timestamps for when various events occurred, from signal scheduling to the creation of the notification itself.

## Interface PartialLossCommit

This data represents a partial loss event within a trading strategy. It details a situation where a portion of an existing position is being closed.

The `action` property confirms this is a "partial-loss" event. 

The `percentToClose` specifies what percentage of the position is being closed, ranging from 0 to 100. You'll also find the `currentPrice` at the time of the action, as well as the `pnl` (profit and loss) accumulated from the entire position history.

Importantly, the `peakProfit` and `maxDrawdown` values provide insight into the position's performance—the highest profit achieved and the largest loss experienced before this partial closure.

Other critical details include the `position` direction (long or short), `priceOpen` (entry price), and both the current `priceTakeProfit` and `priceStopLoss`, along with their original values before any trailing adjustments. The `scheduledAt` and `pendingAt` timestamps help pinpoint when the signal to close this partial loss was created and when the position initially activated.


## Interface PartialLossAvailableNotification

This notification alerts you when a trading position hits a pre-defined loss level milestone, like -10%, -20%, or -30% of your initial investment. It’s a way to track how your positions are performing and understand potential risks.

Each notification contains details about the trade, including a unique ID, when the loss level was reached, and whether it's a backtest or live trade. You'll find information about the trading pair, the strategy used, the exchange where the trade occurred, and the specific loss level reached. 

It also provides key pricing data like the entry price, current market price, and take/stop-loss prices, along with original values and any trailing adjustments. You’ll also get details about the position size, cost, and any leverage applied.

The notification includes performance metrics like P&L, peak profit, maximum drawdown, and the number of entries/partials executed. Finally, you’ll find notes or a reason for the signal, along with timestamps reflecting the signal's creation and activation. This data helps with performance analysis and understanding the signal's behavior over time.

## Interface PartialEvent

This data structure holds all the information needed to understand key milestones in a trading position’s performance, specifically when it hits profit or loss levels. Each `PartialEvent` represents a moment – like reaching 10% profit or 20% loss – and includes details such as the exact time, the trading pair involved, which strategy was used, and the signal's ID.

You'll find the entry price, take profit, and stop-loss levels, along with the original values set when the trade was initially triggered. If a DCA (Dollar Cost Averaging) strategy was used, you'll also see information about the total entries and the original entry price before any averaging took place.

Furthermore, it provides insights into partial closes with details on executed percentages, unrealized profit and loss, and a human-readable note describing the reason behind the signal. It also tracks when the position became active and when the signal was initially scheduled, along with an indicator for whether the trade is part of a backtest or a live, active trade.

## Interface OrderSyncOpenNotification

This notification tells you when a trading position has been opened, either immediately or after a scheduled signal. It provides a wealth of detail about the trade, including when it happened, where it happened (exchange and strategy), and crucial information about its performance. You’ll find details like the current price, profit and loss figures, peak profit, maximum drawdown, entry and exit prices, and even the original order prices before any adjustments. 

The notification also specifies whether it originated from a backtest or live trading environment, and lets you know the trade direction (long or short).  A unique identifier and timestamp are included for tracking and referencing the signal. 

Several properties detail key performance metrics like total entries, partial closes, and the signal's creation and pending timestamps. A note field offers any extra context or reasoning behind the signal. This comprehensive data allows for in-depth analysis and understanding of the trade's characteristics.

## Interface OrderSyncCloseNotification

This notification lets you know when a trading signal has been closed, whether it's because a target profit was hit, a stop-loss triggered, or it expired. It provides comprehensive details about the closed position, including when it happened and why, distinguishing between backtesting and live trading scenarios. You'll find a wealth of information here, such as the trading pair involved, the strategy that generated the signal, and key performance metrics like profit/loss, peak profit, and maximum drawdown – all presented with relevant entry and exit prices. The notification also breaks down details about the order itself and provides important context like the original prices and cost of the trade, leveraging factors, and information about any averaging or partial closures. It's essentially a complete report on the lifecycle of a closed signal.

## Interface OrderSyncCheckNotification

This notification provides a snapshot of a live or backtested trading signal's order status and performance. It's a "ping" to your external order management system, confirming the order backing a signal is still active. These pings happen on every price tick while the signal is being monitored.

The system prevents being overwhelmed by throttling these notifications – you’ll only receive one ping per signal every 15 minutes unless the signal is closed or cancelled.

The notification contains a wealth of details: the trading symbol, strategy, exchange, signal ID, order type (active or scheduled), current market price, and trade direction. You'll also find information on pricing, profit and loss metrics (including peak profit and maximum drawdown), and details related to DCA averaging and partial closes. It also includes information about the initial investment, leverage, and margin type along with timestamps related to when the signal was created and became active. Lastly, a note field allows for a brief explanation of the signal.

## Interface OrderSyncBase

This defines a common base for events related to order synchronization within the trading framework. It provides essential information about each order, such as the type of order involved ("active" for opening or closing, "schedule" for resting orders), the trading symbol, the strategy that generated the signal, and the exchange used. You'll also find details on whether the event originates from a backtest or live trading environment, a unique identifier for the signal, the precise timestamp, and the complete signal data.  Crucially, the `attempt` field tracks the number of unsuccessful attempts to execute an order, allowing the system to handle temporary failures and retry as needed, up to defined limits. Error types associated with order sync are defined to provide specific feedback and influence retry behavior.

## Interface OrderStopContract

This event signals that a trading order, previously being monitored, has reached a terminal state. Think of it as a confirmation that the framework has determined an order is no longer active on the exchange. This could be because the order was deleted externally, or because the system experienced too many failures trying to confirm its status. The `type` property tells you whether it was an "active" order (a regular trade) or a "schedule" order (a pending entry).

The `reason` property explains exactly *why* the order terminated – either because it was unexpectedly deleted ("deleted") or because the system repeatedly failed to confirm its existence ("exhausted").

The event provides a wealth of information about the order and its performance up to this point.  You’ll find details like the trading pair, strategy name, exchange, timeframe, signal ID, and timestamp.  It also gives you a snapshot of the position's performance, including P&L, peak profit, drawdown, and the original and effective entry and exit prices.

Importantly, this event only occurs in live (real-time) trading environments; backtesting doesn't involve these order checks. It's designed as a notification-only channel—any errors that occur while handling this event won't disrupt the overall trading process.


## Interface OrderStopCheckNotification

This notification signals that a check on an order has reached a terminal state, meaning it’s definitively done processing. It’s a rare event that happens only once per monitored signal when the check fails – either because the order can't be found ("deleted") or because the system has tried too many times ("exhausted").

Think of it as a final report on how a check concluded.  It provides extensive details about the order, including the trading pair, strategy name, signal information, and the current market conditions. You'll see details like the original and effective prices, cost, leverage applied, and profit/loss metrics, all the way down to the specific entry and partial close counts.

Crucially, this notification helps pinpoint why the check failed, offering insights into potential issues with the order or the system itself.  The `reason` property tells you whether the order was deleted (order not found) or if the check simply ran out of retries.  The details provided allow for a deep dive into the position’s performance, including peak profit, maximum drawdown, and the number of entries and partial closes. The timestamps provided pinpoint the exact moments of creation, pending, and execution.

## Interface OrderRejectOpenNotification

This notification signals that a trading order was definitively rejected by the exchange—it's a terminal event, meaning retrying isn't worthwhile. It's only triggered when an order fails permanently, not for temporary hiccups. It provides a wealth of information about the rejected order, including the reason for rejection from the exchange, the strategy that generated the signal, and the current market conditions.

You'll find details like the signal ID (which matches the broker's client order ID), the type of order (immediate or scheduled), and how many times the attempt failed before the rejection. The notification also includes key performance indicators like P&L, peak profit, and maximum drawdown, giving context to the position's performance up to the point of rejection. 

Essentially, this alert gives you a comprehensive snapshot of why a trade didn't go through and details about the potential position's hypothetical performance. Remember, these notifications only appear in live environments; they won't fire during backtesting.

## Interface OrderRejectOpenContract

When an order can’t be filled and your trading system needs to know definitively, this `OrderRejectOpenContract` event tells you exactly that. It means either an order to open a position or a scheduled entry wasn't accepted. The system won't try the trade again and the signal that triggered it is considered used up.

The `action` property tells you *which* type of open or placement was rejected – whether it was an active order or a scheduled one. You'll also see the `cost` associated with the rejected order, representing the total cost to enter that position.

## Interface OrderRejectCloseNotification

This notification signals that a closing order was rejected by the broker – essentially, a forced close didn't happen as expected. It only happens when a closing attempt fails, usually because the broker couldn’t fulfill the order, and it’s exclusive to live trading environments. This event provides a detailed snapshot of the position's performance up until the rejection, including metrics like profit/loss, peak profit, and maximum drawdown.

You’ll find key information such as the reason for the rejection, the price at the time, and identifying details like the strategy and exchange involved. It includes a unique ID, a timestamp, and a human-readable explanation of why the closing order was refused, helping you understand and troubleshoot potential issues with your trading strategy or broker connection.

The notification also gives you comprehensive performance metrics on the position, like peak profit, maximum drawdown, and entry/exit prices, providing a full picture of the trade's lifecycle. Several values related to position size and costs are included for more detailed analysis. Critically, the `closeReason` field tells you why the closing order couldn't be executed.

## Interface OrderRejectCloseContract

This describes what happens when a closing order is completely rejected—it's a definitive refusal. The system then forcefully closes the position, using the original reason why the close was initially attempted. 

Importantly, the `action` property *always* indicates "signal-close" in these situations.

The `closeReason` property tells you exactly why the closing order failed and triggered this forced closure.

## Interface OrderRejectBase

This event signifies a definitive rejection of an order by the exchange, and it’s a critical signal within the trading system. It occurs only when the system encounters a problem so severe that retrying the order is deemed pointless, like the exchange outright refusing the trade. You'll only see this in live trading environments, not during backtesting.

The event comes in two main types: "active" for orders directly related to open, close, or activation trades, and "schedule" for orders placed during the initial setup of a signal.

Each `OrderRejectBase` event delivers detailed information about the rejection, including the trading symbol, strategy name, exchange, timeframe, a unique signal ID (which prevents re-sending the same order), the precise timestamp, the original signal data, the number of consecutive failed attempts leading to the rejection, and crucial position metrics like current price, profit and loss, peak profit, and drawdown. It also includes details regarding prices (entry, take profit, stop loss, and their original values before trailing adjustments).

Finally, a human-readable explanation for the rejection is provided in the `message` field, directly from the error reported by the broker adapter.  It is intended to help understand why the order was rejected and what caused the issue.

## Interface OrderOpenContract

This event, `OrderOpenContract`, tells you when a limit order you placed has actually been filled, essentially letting you know a new position has been opened. It's used to keep external systems like order management tools and audit logs in sync with what's happening in the trading framework. 

During backtesting, this event is triggered based on candle data – a long position opens when the candle's low is less than or equal to your intended entry price, and a short position opens when the candle's high is greater than or equal to that price. In live trading, it's triggered when the exchange confirms the order fill.

The event provides lots of details about the trade, including the current market price, your profit and loss (both total and peak), drawdown, costs, trade direction (long or short), the entry and take profit/stop loss prices (both original and adjusted), when the order was initially scheduled, and information about any DCA averaging or partial exits that might have occurred. The `totalEntries` and `totalPartials` properties indicate whether you used DCA averaging or partial exits.

## Interface OrderFillOpenNotification

This notification signals that a trade has been successfully opened or placed by the exchange – it's confirmation that your order actually went through. It only happens *after* the exchange has confirmed the order, so it represents the final, definitive state. You won't receive this notification for rejected or failed attempts. It's exclusively for live trading environments.

The notification contains a wealth of information about the trade, including:

*   A unique identifier for the notification and the signal that triggered it.
*   The exact time the order was confirmed.
*   Details about the trading symbol, strategy, and exchange involved.
*   The order type - whether it was a filled position order or a resting order being placed.
*   Key performance indicators (KPIs) like P&L, peak profit, and maximum drawdown, providing insights into the trade's performance so far.
*   Entry and exit prices, cost of the position, and other financial details for a complete picture of the trade's financial metrics.
*   Trade specifics such as the take profit and stop loss levels, along with their original values before any adjustments.
*   Information about the number of entries and partial closures for trades that utilize DCA (Dollar-Cost Averaging).
*   Timestamps for signal creation and position activation.
*   An optional note field for providing a description of the signal's reason.



Essentially, this notification provides a comprehensive snapshot of a trade’s lifecycle, from its inception to its current state, helping you analyze performance and understand trading behavior.

## Interface OrderFillOpenContract

This describes an event that happens when an order to open a position is filled, or a resting order is placed. It's essentially a confirmation from your broker that something happened with your order. 

The `action` property tells you exactly what happened: either a new position was opened ("signal-open"), or an order to open a position was placed on the exchange ("schedule"). 

The `cost` property tells you the total cost associated with this action – think of it as the total amount spent to get into this position.

## Interface OrderFillCloseNotification

This notification lets you know when a trading position has definitively closed on the exchange, confirming the order execution. Think of it as the final confirmation that your strategy's exit order actually went through.

It’s a live-only event, meaning you won’t see it in backtest mode. The notification includes a lot of detailed information about the trade:

*   **Key identifiers:** You'll see a unique ID for the notification, the timestamp of confirmation, and the trading symbol.
*   **Strategy details:** It identifies the strategy and signal that triggered the trade.
*   **Order specifics:** You'll learn which type of order was used and the number of previous attempts to close the position.
*   **Performance metrics:** The notification provides a comprehensive snapshot of the trade's performance, including profit/loss (PNL), peak profit, maximum drawdown, and related price points.
*   **Position details:** You'll find the trade direction (long or short) and details about the entry and exit prices.
*   **Cost and leverage information:** The notification also includes the initial cost of the position, any leverage applied, and details about DCA entries and partial closes.
*   **Reason for closure:** It tells you why the position was closed (take profit, stop loss, or time expiration), along with any notes.
*   **Timing details:** It includes the signal's creation timestamp and the time the position was activated.



Essentially, it's a complete post-trade report, giving you a full picture of what happened and how the trade performed.

## Interface OrderFillCloseContract

This describes when a trading strategy has completely closed a contract, and the broker has confirmed it. It's essentially a record of an exit order being filled – whether that was triggered by a take-profit, stop-loss, a timer, or a manual action.

The `action` field simply identifies this as a "signal-close" event.

The `closeReason` tells you *why* the position was closed, giving you insight into the strategy's behavior and the factors influencing the trade.

## Interface OrderFillBase

This describes the `OrderFillBase` event, which represents a confirmed order execution—a crucial notification in the trading system. It's important to understand that this event isn't triggered for every order attempt; it only fires *after* the broker has actually confirmed the order’s execution on the exchange. This makes it a reliable source for audit trails and notifications, ensuring you only receive updates about successfully placed orders.

Because this event represents a real transaction, it’s not generated during backtesting or when orders are rejected or transiently fail. Similarly, forced closures, which occur when the system abruptly shuts down without broker confirmation, also don't produce these events.

The event provides extensive details about the trade, including the order type ("active" for position orders, "schedule" for scheduled entries), trading pair, strategy involved, exchange, timeframe, signal identifier, and precise timestamps. You'll also find information regarding any previous failed attempts, current market price, profit and loss data (including peak profit and drawdown), trade direction, and prices for entry, take profit, and stop loss—both original and trailing-adjusted values. Crucially, it includes details about any averaging applied to the initial entry price (DCA), and timestamps related to signal creation and position activation.

## Interface OrderContinueContract

This event tells you that the framework is still actively monitoring an order after an initial check. Think of it as a reassurance that the system still believes the order is valid on the exchange, even if there were some minor hiccups. The `type` indicates whether the order is backing an open position (`active`) or is a resting order waiting to be triggered (`schedule`).

The `attempt` value is important – it tracks how many times the check has briefly failed but the order hasn't been closed. A value of 0 means the check was successful, resetting any concerns. A value greater than 0 means it’s tolerated failures, but too many will eventually lead to the order being closed.

You'll receive this notification frequently while the signal is still active, giving you a real-time snapshot of the order's status, including the current price, PnL, and entry/stop-loss prices. This event only happens in live trading – backtesting doesn’t perform these checks. Importantly, any errors within this notification process won't impact the framework's decision about the order itself.  The data provided includes details like the strategy name, exchange, and the signal identifier, which helps you correlate the event to its origin. You can see details about the original and adjusted take-profit and stop-loss prices, as well as entry information and a count of any partial closes.

## Interface OrderContinueCheckNotification

This notification lets you know about the ongoing monitoring of an order, specifically when a check hasn't resulted in a definitive outcome (like canceling the order). It's a signal that the system is still keeping an eye on things, especially after a temporary hiccup.

Essentially, it provides a snapshot of the order's status, including details like the trading pair, strategy used, signal information, order type (active or scheduled), and key pricing metrics like entry and exit prices. 

You'll find information about the position itself – its direction (long or short), how much capital is involved, and current profit and loss data, including peak profits and maximum drawdowns.

The `attempt` field is important – a value greater than zero indicates that a previous check failed but was tolerated, and monitoring continues. It's all designed to ensure your orders are handled appropriately, even when things don’t go perfectly smoothly. The notification is throttled to prevent overwhelming the system.


## Interface OrderCloseContract

This event lets you know when a trading signal has been closed, whether it was due to hitting a profit target, a stop-loss, time expiry, or manual closure. It provides a wealth of information about the closed position, allowing external systems to keep track of orders and record financial results.

You’ll find details like the current market price at the time of closure, the total profit and loss (including all entries and partials), the highest profit achieved during the trade, and the largest drawdown. It also includes information on the original entry and exit prices, when the signal was created and activated, and the reason for the closure.

Furthermore, the event outlines the trade direction (long or short), how many times the position was averaged (DCA), and how many partial closes were executed. This comprehensive data enables synchronization of external order management systems, logging of performance metrics, and accurate financial reporting.

## Interface OrderCheckContract

This event, called "signal-ping," is a way for the trading framework to check if an order placed based on a signal is still active on the exchange. It’s particularly important for automated systems where you need to confirm orders are still valid, especially in live trading.

Think of it as a periodic health check for your orders. The framework sends out these checks before finalizing any actions based on a signal.

There are two main types of checks: one for orders that are currently open ("active") and another for orders that are scheduled to activate later ("schedule").

The system asks your order management system if the order is still live. If the system confirms the order is good, monitoring continues. If the system finds the order is gone (filled, canceled, or liquidated), the framework takes immediate action—closing the position or canceling the scheduled order. If there's a temporary issue, like a network blip, the framework will retry a few times before considering the order truly gone. 

This ping event never happens during backtests since it only interacts with a live exchange.

Here's a breakdown of the information provided with each signal-ping:

*   **Details of the signal:** Including strategy name, timeframe, and the specific signal itself.
*   **Order information:** Original and adjusted entry, take profit, and stop-loss prices, as well as the number of entries and partials.
*   **Performance metrics:** Profit/loss (PNL), peak profit, and maximum drawdown for the position.
*   **Retry counter:** This shows how many times a check has failed recently.



The event is used by broker adapters and actions to keep track of and manage open orders.

## Interface MetricStats

This interface represents a collection of statistical data for a particular performance metric. It provides a summary of how often a metric was recorded (count) and details about its duration, including average, minimum, maximum, and standard deviation. You'll also find information about the median and specific percentile values like the 95th and 99th. 

Furthermore, it offers insights into the timing of events, specifically the average, minimum, and maximum wait times between them. This allows for a comprehensive understanding of the metric’s behavior and performance characteristics. 


## Interface MessageModel

This describes what a single message looks like within a conversation handled by a large language model. Think of it as representing a turn in the chat – it could be an initial instruction, a user's question, the model’s response, or the result of a tool the model used.

Each message has a `role` which clarifies who sent it: the system, the user, the assistant, or a tool. The `content` is the actual text of the message, and there's also a `reasoning_content` field for some models that display their thought process.

If the assistant used a tool, the `tool_calls` property lists the details of those calls. Messages can also include images; these can be provided as base64 strings, raw bytes, or standard image files.  Finally, if a message is a response *to* a tool call, the `tool_call_id` identifies which tool call it’s related to.


## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred. It essentially tracks how much a portfolio lost from its peak value.

The `eventList` property contains a detailed record of each drawdown event, presented in the order they happened, with the most recent one appearing first. Think of it like a timeline of the worst losses.

Alongside the list of events, `totalEvents` provides a simple count of how many maximum drawdown events were observed.

## Interface MaxDrawdownEvent

This object represents a single instance of a maximum drawdown experienced during a trading position. It holds detailed information about when the drawdown occurred, which trading pair was involved, the name of the strategy used, and a unique identifier for the signal that triggered the trade. You'll find details about the position itself – whether it was a long or short trade – and the overall profit and loss (PNL) for that position.

It also records the highest profit achieved before the drawdown, the size of the maximum drawdown itself, and the price at which the drawdown was reached.  For completeness, it includes the entry price, take profit price, and stop loss price set for the position, along with a flag indicating whether the event occurred during a backtest.


## Interface MaxDrawdownContract

This contract provides details when a maximum drawdown is reached on a trading position. It's essentially a notification that a position has experienced a significant drop in value from its peak.

The notification includes important information like the trading symbol, the current price, the time the drawdown occurred, and the strategy, exchange, and timeframe involved. It also contains the signal data that triggered the position.

Crucially, a flag indicates whether the event happened during a backtest or in live trading. This allows you to handle backtest events differently.

This information helps you monitor risk and potentially adjust your trading strategies, such as setting dynamic stop-loss orders or managing overall position size, as a response to changes in market conditions or position performance.

## Interface LiveStatisticsModel

This model provides a detailed snapshot of your live trading performance, calculated from all events like trades and idle periods. It presents a wide range of metrics, all designed to help you understand how your strategy is performing and identify areas for improvement.

You’ll find everything from basic counts like the total number of trades and wins/losses to more sophisticated calculations like the Sharpe Ratio and Sortino Ratio, which assess risk-adjusted returns. Several metrics, such as win rate, average PNL, and Sharpe Ratio, are expressed as percentages and are null if the calculation would be unreliable.

The model also delves into trade duration, volatility (standard deviation), and market pressure (buyerPressure, sellerPressure, buyerStrength, sellerStrength).  It even provides a simple trend analysis, categorizing the market as bullish, bearish, sideways, or neutral, along with metrics to gauge the strength and confidence of that trend.  Finally, it offers insights into consecutive winning and losing streaks and the movement between close prices. Ultimately, this comprehensive data allows for a deeper, more informed understanding of your trading strategy's behavior.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes. These aren't critical failures that stop everything, but they do need attention. 

Each notification has a unique identifier (`id`) to help track it. 

There's a clear, understandable error message (`message`) to explain what went wrong.

You’ll also find details about the error itself (`error`), including a stack trace and any extra information. 

Importantly, these notifications always come from the live trading context, so the `backtest` flag is always false. The `type` property is set to "error.info" to uniquely identify this kind of notification.

## Interface IdlePingContract

The IdlePingContract describes events that occur when a trading strategy isn’t actively responding to signals. These events are essentially markers, letting you know a strategy is in a "waiting" or idle state.

Each idle ping provides key details about the situation: the trading symbol involved (like BTCUSDT), the name of the strategy that’s idle, and the exchange where it’s running.  You’ll also find the frame name if the strategy is being backtested, the current market price at the time of the ping, and whether the event originated from a backtest or a live trade.

The event also records a timestamp and a corresponding date object representing when the ping occurred. The meaning of "when" differs depending on the mode: in backtesting, it relates to the candle being processed, while in live trading, it's the actual wall-clock time. You can reliably recreate the date from the timestamp. These signals enable external systems to track the lifecycle of strategies and understand periods of inactivity.

## Interface IWarmCandlesParams

This interface defines the information needed to fetch and store historical candlestick data. Think of it as a blueprint for requesting a chunk of historical price data. You'll use this when you want to load past market data before starting a backtest, ensuring the backtest has the data it needs.

It specifies things like which cryptocurrency pair (symbol) you're interested in, the exchange providing the data, the timeframe for the candles (like 1-minute or 4-hour), and the start and end dates for the data you want to download. Basically, it's a comprehensive request for a specific set of historical candles.


## Interface IWalkerStrategyResult

This interface represents the outcome of running a single trading strategy within a backtest comparison. It packages together essential information about that strategy’s performance.

You'll find the strategy’s name recorded here.

It also includes a set of statistics summarizing the backtest results, providing details on performance metrics.

A key value, likely a profitability or risk-adjusted return, is stored as the 'metric' and is used to compare strategies against each other.

Finally, the 'rank' indicates the strategy’s position relative to the other strategies being evaluated, with a lower number signifying better performance.


## Interface IWalkerSchema

The `IWalkerSchema` defines how to set up A/B tests for different trading strategies within the backtest-kit framework. Think of it as a blueprint for running experiments to see which strategy performs best.

You’ll give it a unique name (`walkerName`) and can add a note (`note`) for your own documentation. 

It specifies which exchange (`exchangeName`) and timeframe (`frameName`) will be used for testing all strategies involved, making sure everything's on the same playing field.  The `strategies` property lists the names of the strategies you want to compare, and these strategies must have been registered earlier.

You can choose which metric (`metric`), like Sharpe Ratio, to optimize for when comparing the strategies.  Finally, optional `callbacks` let you hook into different stages of the testing process for more control.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtest run, essentially summarizing the results of comparing different trading strategies. It tells you which asset (symbol) was being tested, which exchange was used for the data, and the name of the specific backtesting process (walker) and the timeframe (frame) employed. Think of it as a single package containing everything needed to understand the context of the backtest results.

## Interface IWalkerCallbacks

This interface lets you hook into key events during the backtesting process when comparing different strategies. Think of it as a way to get notified at various stages of the test run, allowing you to monitor progress or perform custom actions. 

You can be alerted when a strategy begins, when it finishes successfully, or when an error occurs during its backtest. 

Finally, a completion callback is triggered once all strategies have been evaluated, providing you with the overall results. These callbacks can be helpful for logging, visualization, or integrating with other systems.

## Interface ITrailingTakeCommitRow

This interface represents a queued action related to a trailing take commit strategy in your trading system. It essentially describes a specific instruction to either adjust a trailing stop or trigger a take profit order.

The `action` property simply identifies this as a "trailing-take" action.

The `percentShift` specifies the percentage change from the current price that will influence the placement of the trailing stop or take profit.

Finally, `currentPrice` stores the price level when this particular shift was initially calculated, providing valuable context for the trade.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. It's used internally to manage the adjustments needed when a trailing stop is triggered or modified.

Each instance details a specific trailing stop commitment, including the type of action being performed ("trailing-stop").  It also contains the percentage shift that's being applied, and the price at which the trailing stop was initially established. Think of it as a record of a planned adjustment to a trailing stop, storing key details for execution.

## Interface ISweepTrade

The `ISweepTrade` interface describes a single trade executed within the backtest kit. Each trade record includes details like the originating idea's identifier, the trading symbol involved, and the author responsible for the idea. 

It also captures crucial timing information, specifying when the trade was initiated (`entryTimestamp`) and closed (`exitTimestamp`), along with the reason for the exit (`exitReason`). 

Performance metrics like the actual holding time (`holdMinutesActual`) and profit/loss percentage (`pnlPercent`) are also recorded. Finally, the trade tracks any other ideas that were prevented from entering due to this trade's position (`absorbedIdeas`), listing their idea IDs and authors. This granular data enables detailed analysis of trade behavior, author performance, and the impact of specific ideas.

## Interface ISweepTrack

This interface, `ISweepTrack`, represents a single author’s performance based on a specific set of trading rules. Think of it as a detailed report card for an author's strategies. It’s designed to provide a continuous view of their performance, unlike a simple pass/fail system.

Each `ISweepTrack` captures how an author performed within a defined window (holdMinutes), using a particular lock, stop, and trailing strategy.  Each property contributes to the complete definition of a rule.

The information included is raw and granular: the number of ideas generated, the number of successful trades (hits), and a calculated hit rate.  It’s structured to be easily searched and analyzed, allowing users to determine which authors and strategies to trust, rather than having a pre-defined trust level built into the system. The author's login identifies the author's work.


## Interface ISweepSchema

This schema defines how to register and configure a sweep, which is a way to test and optimize a trading strategy. Each sweep needs a unique name and specifies which exchange to pull historical data from.

You can customize the grid axes, which control aspects like profit lock and stop loss, by overriding default settings – only specify the axes you want to change.

Callbacks allow you to add optional functions that execute at different points during the sweep process. One of these callbacks, `onAuthorsTrained`, is triggered once for each unique combination of rule, lock, stop, and trailing settings.

The `reportOrder` property determines how the sweep results are sorted, with "sharpe" being the default. This order influences how the results are presented but doesn’t impact the overall testing process itself.


## Interface ISweepResult

The `ISweepResult` represents the culmination of a trading simulation run, providing a detailed overview of its performance. It bundles together a single report bucket, which focuses on profit before stop-outs, along with its associated reports. These reports rank the best performing trades and track contributions from different authors.

The result also includes key statistics about the simulation itself, such as the total number of ideas processed, the number of directional ideas tested, and the count of profiles created. You’ll find information on how long trades were held, including average holding time and the 95th and 99th percentile holding times – particularly useful for identifying any unusually long positions.

Finally, the `reports` property contains the graded results for each grid point, the ranking of top performers, and the author-specific tracking data.

## Interface ISweepPointReport

This interface, `ISweepPointReport`, gives you a detailed breakdown of performance for a specific grid point in your backtest. It bundles together a lot of information, allowing you to understand how trades performed at that particular price level.

You’ll find key metrics like total and average profit percentages, win rate, and profit factor, which indicates how much you’re making compared to your losses.  It also includes drawdown information—how much your equity dipped during the test—along with useful ratios like the Calmar and Recovery Factor, which assess risk-adjusted returns.

Beyond the raw profit/loss numbers, it provides insights into trade duration with averages and percentiles (p95 and p99) for holding times. The Sharpe and Sortino ratios are included to evaluate the efficiency of your trades, penalizing periods where capital was tied up without generating profit.  The `exitReasons` property tells you how many trades ended due to different exit conditions. Finally, it provides access to the complete list of trades that occurred at that grid point, enabling you to dive deep into individual trade details and pinpoint the reasons behind the reported performance. This `tradesList` is invaluable for debugging and understanding the “why” behind the numbers.

## Interface ISweepParams

The `ISweepParams` object holds all the configuration needed to run a sweep, combining settings with the underlying tools for logging and reporting. It includes a `logger` which allows you to see debugging information during the sweep process.  You’ll also find `gridAxes`, which defines the dimensions and steps for exploring different parameter combinations, and `reportOrder`, which dictates how the results will be ranked and presented. These parameters are critical for controlling and understanding the sweep's execution and outcomes.

## Interface ISweepMetricReport

This interface describes a single report generated during a backtesting sweep. Think of it as a container holding all the information for a particular run.

It includes a list of reports, each representing a single grid point evaluated based on a key metric – profit before stop. These reports are ranked, with the best performing ones appearing first.

The report also identifies the top performers based on four different ranking criteria. Finally, it provides a compact summary of the "tracks" or the specific rules (like holding, locking, stop loss, and trailing) applied by different authors, giving insight into the underlying strategies used. This track data is raw and allows for detailed analysis without needing to combine data from multiple sources.

## Interface ISweepIdeaProfile

This `ISweepIdeaProfile` represents a single trading idea's performance over time. Think of it as a detailed history of how a trade unfolded, from its entry point to its conclusion. It contains the raw price data (candles) used to evaluate the idea, along with several key metrics summarizing its success or failure.

These metrics, like whether the idea was ultimately correct (hit), the maximum price movement in a favorable direction (maxMfePercent), and the timing of those peaks and valleys (minutesToMfe, minutesToMae), provide a comprehensive picture of the trade's journey. It also indicates if the data was incomplete (truncated) and how much the price moved on average (medianMovePercent).

Crucially, this profile is used to assess the idea’s quality; the grading process only examines the raw candle data within a limited window, not the overall diagnostic metrics. The data helps understand how an idea performs, and provides insights for potential improvements.

## Interface ISweepIdea

This interface represents a single trading idea, essentially a public forecast made by someone. Think of it as a prediction about a specific trading pair, like BTCUSD. 

Each idea has a unique identifier, a timestamp indicating when it was published, and the symbol it relates to. 

It also specifies the direction the author believes the price will move – whether they're forecasting a rise or a fall. Finally, it includes the author's unique identifier. 

Importantly, backtest-kit simulates trading based on these ideas, not on individual price points.

## Interface ISweepGridPoint

This interface defines a single point on a grid of trading levels. Each grid point specifies how long a trade should be held, when to stop losses, and whether to lock in profits. 

Specifically, `hardStopPercent` dictates the percentage from the entry price where a trade will be stopped. `trailingTakePercent` controls how the take profit level adjusts as the price moves favorably. `holdMinutes` sets the maximum time a position can be held. Finally, `profitLockPercent` determines if and how a profit lock mechanism will be applied, which automatically exits the trade when the price retraces to a predetermined level. A value of zero for `profitLockPercent` disables this feature.

## Interface ISweepGridAxes

The `ISweepGridAxes` interface defines the ranges of values explored for key trading parameters – hard stop levels, trailing take levels, hold durations, and profit lock levels. Think of it as specifying the different scenarios your trading strategy will test.

Each property within `ISweepGridAxes` dictates how aggressively or conservatively a parameter will be explored. For example, `hardStopPercent` defines a series of loss limits, and the system rigorously evaluates each one in every trade. Similarly, `trailingTakePercent` determines how much a trade can pullback before the trailing take is triggered.

`holdMinutes` controls how long a position can be held open, impacting how frequently a strategy can be deployed. The system uses this setting to limit the duration of trades and to measure the performance within that timeframe.

Finally, `profitLockPercent` establishes levels where a profit is secured, allowing a trade to potentially run further than a standard fixed take profit while guarding against early losses. These values are crucial for assessing the strategy's robustness and performance under various market conditions.

## Interface ISweepCallbacks

The `ISweepCallbacks` interface lets you listen in on what's happening during a backtest simulation. Think of it as a way to get detailed updates instead of just seeing the final result. You'll be notified about key stages like when the simulation starts processing data, when idea profiles are built, and when author tracks are trained.

For example, `onProgress` tells you how far along a specific process is, like analyzing profiles or grid points, providing a running update.  `onIdeas` lets you know how many ideas were found and how many were directional.

`onAuthorsTrained` gives you insights into the performance of individual authors based on different grading rules, which helps understand how well they're performing. `onGridPoint` is triggered for each grid point evaluated, letting you examine the results for that specific point.

`onRanking` provides information when a ranking is complete, showing the sorted reports and identifying the best performing one. Finally, `onDone` signals the successful completion of the entire simulation, giving you access to the overall results. By hooking into these callbacks, you can track the backtest’s progress and potentially react to intermediate outcomes.

## Interface ISweepBest

This interface represents the best result within a sweep, focusing solely on the winning criterion and a reference to its report. Think of it as identifying *what* was the best, not *why* or *how* – those details are held within the associated report. The trades and tracking information aren't included here to avoid redundancy, as they are already detailed in the report and the bucket's tracks. It's a lightweight way to pinpoint the top performer based on a specific ranking criterion.


## Interface ISweepAbsorbedIdea

This interface represents an idea that couldn't be acted upon because another trade was already active for the same trader. Think of it as a signal that was "absorbed" by a previous action. It includes the unique identifier of the idea and the trader who created it, allowing for easy analysis of an individual trader's activity without needing to combine data from multiple sources. It's a record of a missed opportunity due to existing positions.

## Interface ISweep

The `ISweep` interface lets you execute complete trading simulations. You provide a stock symbol and a list of trading ideas, and it will run through a sequence of steps: first it evaluates the ideas based on predefined profiles, then filters them, assesses their performance using a grid, and finally ranks them. This method returns a result containing all the data and insights gathered during the sweep process, giving you a holistic view of how your trading ideas perform.

## Interface IStrategyTickResultWaiting

This represents a tick result when a signal you've scheduled is patiently awaiting the price to hit its entry point. It's a recurring signal – unlike the initial "scheduled" signal, this one pops up repeatedly as the system monitors the price.

Here’s what you’ll find in this result:

*   The signal that's waiting to be triggered.
*   The current price being used to monitor.
*   Details about the strategy, exchange, and timeframe involved, for easy tracking.
*   The symbol being traded, like BTCUSDT.
*   Progress indicators, although these will always show as 0 for signals still waiting to activate.
*   An estimate of the potential profit and loss (PNL) if the signal were active – it's theoretical at this stage.
*   Whether the process is a backtest or happening live.
*   A timestamp marking exactly when this result was generated.

## Interface IStrategyTickResultScheduled

This data structure represents a specific kind of event within the trading framework, signifying that a signal has been generated and is awaiting the price to reach a predetermined entry point. It’s like a signal that's on hold, waiting for the right moment to execute.

Each time this event occurs, it includes detailed information for tracking and analysis. You'll find the name of the strategy and the exchange involved, along with the timeframe being used, the trading pair's symbol, and the price at which the signal was initially generated. 

The `backtest` flag indicates whether this is a simulated historical test or a live trading execution. The `createdAt` timestamp provides a reference point for precisely when the signal was scheduled. Essentially, it’s a record of a signal waiting to be activated.


## Interface IStrategyTickResultOpened

This result indicates a new trading signal has been generated and is now active. 

It provides key details about the signal, including its ID and the strategy, exchange, time frame, and symbol involved. 

You'll also find the current price at the time the signal opened, as well as whether this is a backtest or live execution. 

The `createdAt` property gives you a timestamp indicating when the signal was actually created, aligning with the candle timestamp during backtests or the real-time execution context in live trading. This information helps with tracking and understanding the signal's lifecycle within your trading system.


## Interface IStrategyTickResultIdle

This interface represents a tick result that occurs when your trading strategy is in an idle state, meaning no active trading signal is present. It provides key information about the market conditions and the strategy's context at the time of this idle state.

You'll find details like the strategy’s name, the exchange it’s operating on, the timeframe being used, and the symbol being traded. 

The current price, which is the VWAP (volume-weighted average price), is also included, alongside a flag to indicate whether this event originates from a backtest or a live trading environment. A timestamp marks precisely when this idle state tick result was generated. The `action` property confirms the "idle" state, and importantly, the `signal` is `null` to signify the absence of an active signal.

## Interface IStrategyTickResultClosed

This interface describes the result when a trading signal is closed, providing a comprehensive view of what happened. It includes details like the reason for the closure – whether it was due to a time limit, reaching a profit or loss target, or a direct closing action.

You’ll find information about the completed signal itself, along with the final price at the time of closing.  Crucially, it reports the profit/loss achieved, taking into account any fees and slippage.

Additional properties provide context, such as the name of the strategy used, the exchange and timeframe involved, whether it's a backtest or live trade, and a unique ID if the closing was user-initiated.  Finally, a timestamp indicates when the result was generated, linked to either the candle timestamp during backtesting or the execution context during live trading.

## Interface IStrategyTickResultCancelled

This interface, `IStrategyTickResultCancelled`, describes what happens when a planned trade signal doesn't actually go through – it gets cancelled. This cancellation could be because the signal wasn't triggered or because it hit a stop-loss before a trade could be placed.

The `action` property clearly indicates that this is a cancellation event.

You'll find details about the cancelled signal itself within the `signal` property. 

Other important information included is the `currentPrice` at the time of cancellation, along with timestamps (`closeTimestamp` and `createdAt`) for precise tracking. 

The `strategyName`, `exchangeName`, `frameName`, and `symbol` provide context for identifying the trade.

A flag, `backtest`, distinguishes between backtest simulations and actual live trading.

The `reason` property explains *why* the signal was cancelled.

If the cancellation was initiated by a user request using a cancellation ID, it's available in the `cancelId` property.


## Interface IStrategyTickResultActive

This interface describes the result when a trading strategy is actively monitoring a signal, waiting for a trigger like a take profit, stop loss, or time expiration. It provides detailed information about the current state of the trade, including the signal being monitored, the current price used for calculations, and the names of the strategy, exchange, and time frame involved. 

You'll also find the symbol being traded, the progress towards take profit and stop loss, and the current unrealized profit and loss (PNL), factoring in fees and slippage. 

The data indicates whether the trade occurred in backtest or live mode, when the tick result was created, and timestamps for internal backtest processing.

## Interface IStrategySchema

This schema defines the structure for registering a trading strategy within the backtest-kit framework. Each strategy needs a unique identifier, and you can add a note for documentation purposes.

You can also specify the minimum time interval between signals to control how frequently the strategy generates trading suggestions.

The core of the strategy is the `getSignal` function, which takes a symbol, timestamp, and current price as input and returns a trading signal or null if no action is needed. Providing a specific entry price will schedule a signal to be triggered when that price is reached.

Optional callbacks, like `onOpen` and `onClose`, allow you to execute custom logic at the start and end of a strategy's execution. You can also associate risk profiles and action identifiers with the strategy for managing risk and tracking performance. Finally, you can include runtime data to monitor custom metrics or integrate external processes.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single row in a comparison table when evaluating trading strategies. It bundles together key information about a strategy's performance.

Each result includes the `strategyName`, so you know which strategy it refers to. 

You'll also find `stats`, a comprehensive set of backtesting statistics providing a detailed breakdown of the strategy's behavior.  

To easily rank and compare strategies, it also stores a `metricValue`, which is the result of the optimization metric used (and can be null if the data isn't usable).

Finally, `firstEventTime` and `lastEventTime` track when the first and last signals occurred, helping you understand the strategy's activity timeline. These timestamps are null if the strategy didn't generate any signals.

## Interface IStrategyPnL

This interface represents the profit and loss results for a trading strategy, providing a clear picture of performance. 

It shows how much your strategy gained or lost, expressed both as a percentage and in raw dollar amounts. The prices used in these calculations have been adjusted to account for realistic trading conditions, including fees (0.1%) and slippage (0.1%).

Here's what each piece tells you:

*   `pnlPercentage`:  Your profit or loss, displayed as a percentage. Positive numbers indicate gains, and negative numbers show losses.
*   `priceOpen`: The price you initially paid for an asset, taking into account fees and slippage.
*   `priceClose`: The price at which you sold or exited an asset, also adjusted for fees and slippage.
*   `pnlCost`: The actual dollar amount of profit or loss generated.
*   `pnlEntries`: The total amount of money you invested to initiate those trades.


## Interface IStrategyCallbacks

This interface provides a way to hook into different stages of a trading strategy's lifecycle. You can define functions to be executed when specific events happen, like a new signal being opened, becoming active, or being closed.

The `onTick` function is triggered for every price update, giving you a constant stream of information. 

The `onOpen`, `onActive`, `onClose`, `onSchedule`, and `onCancel` callbacks notify you when a signal enters a particular state: opening, actively monitored, closed out, scheduled for later entry, or cancelled before opening.

The `onIdle` callback signals when the strategy is in a period of inactivity with no active signals.

For more granular monitoring, there are callbacks like `onPartialProfit` and `onPartialLoss` which are triggered when a signal is approaching its target profit or stop-loss limits. `onBreakeven` is called when a signal's stop-loss is adjusted to protect the initial investment.

The `onWrite` function is used during backtesting to save signal data for analysis.

Finally, `onSchedulePing` and `onActivePing` provide opportunities for minute-by-minute checks on scheduled and active signals respectively, allowing for custom monitoring or adjustments.

## Interface IStrategy

The `IStrategy` interface defines the core methods for how strategies execute during backtesting or live trading.

The `tick` method is the heart of the strategy – it processes each price update, checks for signals, and handles take profit/stop loss conditions. `getPendingSignal` and `getScheduledSignal` fetch details about any active signals.  `getBreakeven` determines if a signal has moved enough to cover costs. `getStopped` and `getPaused` check the strategy's operational status.  `setPaused` provides control to temporarily halt new position openings.

For tracking progress, you can use methods like `getTotalPercentHeld` (the percentage of the initial investment still in the position), `getRemainingCostBasis` (the amount left to recover), and `getPositionPnlPercent` (the unrealized profit or loss percentage).

The framework provides ways to analyze position history with functions like `getPositionEntries` (a record of all entry prices) and `getPositionPartials` (a log of partial close transactions).

`backtest` allows you to run simulations using historical price data. `stopStrategy`, `cancelScheduled`, `activateScheduled`, and `closePending` provide mechanisms to control the strategy's behavior.

You can also inject signals using `createSignal` or quickly fill or cancel orders using `createTakeProfit`, `createStopLoss`, and related methods. The `validate...` methods allow you to check if an action would be possible before executing it. Finally, the `dispose` method is used to release resources.

## Interface IStorageUtils

This interface defines the basic functionality that any storage adapter used by the backtest-kit trading framework must provide. Think of it as the common ground for how your storage system interacts with the backtesting process. 

It outlines methods for reacting to different signal events – when a position is opened, closed, scheduled, or cancelled.

The adapter also needs to be able to retrieve a specific signal by its unique ID, and list all stored signals. 

Finally, it includes event handlers for active and schedule pings, allowing the system to keep track of when signals are actively open or scheduled, and update their timestamp accordingly. These are crucial for maintaining accurate data and enabling features dependent on signal status.

## Interface IStorageSignalRowScheduled

This interface describes a signal's data when it's scheduled for later execution. 

It holds two key pieces of information. First, the `status` is explicitly marked as "scheduled," confirming its planned execution time.  Secondly, the `currentPrice` represents the price used at the time the signal was scheduled – effectively a snapshot of the market conditions then. This price is linked to the `IStrategyTickResultScheduled.currentPrice` value, providing a consistent reference point for later actions.

## Interface IStorageSignalRowOpened

This interface describes a single row of data representing a trading signal when a position is opened. It holds the essential information about that specific event. 

You'll find the signal's current status, which is always "opened" in this context.  It also includes the current price at the time the position was opened, reflecting the VWAP (volume-weighted average price) at that moment. This price is directly linked to the `IStrategyTickResultOpened` data.

## Interface IStorageSignalRowClosed

This interface represents a signal that has been closed and finalized. It contains all the data related to that closed signal, specifically focusing on financial performance.

You'll find details here about the signal's final profit and loss (PNL), the price at which it closed, and the reason for its closure.

The `status` clearly indicates this is a closed signal.

The `closeReason` and timestamps will match information found elsewhere in the system, ensuring consistency.

## Interface IStorageSignalRowCancelled

This interface describes a signal that has been cancelled. 
It essentially tells you that the signal's status is "cancelled." 
Think of it as a way to mark a signal as no longer valid or actionable.
The `status` property directly indicates this cancellation.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signals are stored, ensuring they're consistently saved with key information. Every signal, regardless of its specific status, will have a `createdAt` timestamp indicating when it was initially created, and an `updatedAt` timestamp marking the last time it was modified.  A `priority` field is also included, used to manage the order in which signals are processed, and it's based on the current time. This standardized format makes managing and retrieving signals much simpler and more reliable.


## Interface IStateParams

IStateParams helps you organize and manage the initial state of your trading signals. Think of it as a way to define where your signal's data lives – the `bucketName` specifies a logical folder or category for the data, like "trade" or "metrics."  You also set the `initialValue`, which is what the signal will start with if no prior data is available. This gives you a clean starting point and consistent structure for your signals.

## Interface IStateInstance

The `IStateInstance` interface is designed to help you manage and track data specific to each trading signal, particularly useful for strategies that use LLMs. Think of it as a place to store and update information like the highest unrealized profit, how long a trade has been open, and when to exit based on certain conditions.

This interface allows for different types of storage – local, persistent, or even dummy for testing – while ensuring a consistent way to handle the data.

Here's what you can do with it:

*   **`waitForInit`:**  Starts the state tracking for a new signal.
*   **`getState`:** Retrieves the current state data at a specific point in time. It's designed to prevent looking into the future by returning initial values if the requested time is later than the data available.
*   **`setState`:** Updates the state data.  This is important because you can reset the state if a backtest restarts, preventing issues with live trading. The update function also receives the current state, enabling calculations or adjustments during the update.
*   **`dispose`:** Cleans up any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

This defines a way to size your trades using the Kelly Criterion, a popular method for optimizing bet sizes. 

The `method` is always set to "kelly-criterion" to indicate you're using this specific sizing approach.

The `kellyMultiplier` is the key setting here; it determines how aggressively you apply the Kelly Criterion. A value of 0.25 (the default) means you're using a "quarter Kelly" approach, which is a more conservative strategy. Higher values increase potential returns but also increase risk.


## Interface ISizingSchemaFixedPercentage

This schema defines a simple trading sizing strategy where the size of each trade is determined by a fixed percentage of your available capital. You specify that percentage – it’s called `riskPercentage` – and it represents the maximum amount of your capital you're willing to risk on a single trade.  The `method` property confirms that this sizing approach uses a fixed percentage. This is a straightforward way to consistently manage risk across different trades.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing strategies within the backtest-kit framework. It ensures each sizing configuration has a unique identifier, a place for developer notes, and constraints on position size. 

You'll find properties to set limits on the maximum percentage of your account used for a position, as well as minimum and maximum absolute position sizes. 

Finally, it allows for optional callbacks which can be used to extend the sizing logic's behavior at specific lifecycle points.

## Interface ISizingSchemaATR

This schema defines how to size your trades based on the Average True Range (ATR). 

It essentially tells the backtest-kit framework to use ATR to determine how much of your capital to risk on each trade.

You’ll specify a `riskPercentage` to control what portion of your capital is risked, usually a small percentage like 1 or 2.  

The `atrMultiplier` then dictates how far your stop-loss will be placed based on the current ATR value, allowing for volatility-adjusted sizing. Think of it as scaling your stop-loss distance to match the market's typical fluctuations.


## Interface ISizingParamsKelly

This interface defines the parameters needed to apply the Kelly Criterion for sizing trades. It focuses on providing a way to log information related to the sizing process.

Specifically, it requires a logger service to help you track what's happening during trade sizing, making debugging and analysis easier. This logger will be used to output debug information about the sizing decisions.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters used to determine how much of your capital to allocate to each trade when using a fixed percentage sizing strategy. It's primarily used within the ClientSizing constructor.  The most important part of this is the `logger` property, which allows you to connect a logging service for debugging purposes and monitoring your sizing behavior. This helps you understand exactly how much capital is being committed to trades.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining position sizes based on the Average True Range (ATR). 

It allows you to inject a logger, which is useful for debugging and understanding how your sizing calculations are working. The logger helps you see what's happening behind the scenes.

## Interface ISizingCallbacks

When your backtest kit strategy determines how much to trade, this onCalculate callback lets you react to that calculation. You can use it to keep a record of the size your strategy decided on, or double-check the size makes sense. It receives the calculated quantity and extra parameters related to the sizing process.

This onBeforeSubmit callback gives you a chance to peek at the order before it's actually submitted to the broker. It’s a handy place to make any last-minute adjustments or checks to the order details. You’ll get the order object itself and additional parameters that provide context for the sizing process.

## Interface ISizingCalculateParamsKelly

When using the Kelly Criterion to determine position sizing, this structure defines the necessary inputs. It requires you to specify the sizing method as "kelly-criterion". You'll also need to provide the win rate, a value between 0 and 1 representing the frequency of winning trades, and the average win/loss ratio, which reflects the typical profit compared to the loss on a winning versus a losing trade. These values are essential for calculating an appropriate bet size based on the Kelly Criterion formula.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed for calculating trade size using a fixed percentage approach. It requires you to specify the method, which must be "fixed-percentage," and a stop-loss price. The stop-loss price indicates at what price you'll exit the trade to limit potential losses. Essentially, this setup lets you size your trades based on a percentage of your capital, while setting a stop-loss to manage risk.


## Interface ISizingCalculateParamsBase

This interface defines the basic information needed to calculate how much of an asset to trade. It includes the symbol of the trading pair, like "BTCUSDT," the current balance of your trading account, and the price at which you intend to enter the trade. Think of it as the foundational data any sizing calculation will rely on to determine the right trade size.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining the size of trades based on the Average True Range (ATR). 

It's primarily used to specify that the sizing calculation should be performed using an ATR-based approach. 

The `atr` property holds the actual ATR value that will be factored into the sizing logic – think of it as the measure of volatility you're using to scale your position.

## Interface ISizing

The `ISizing` interface is the heart of how backtest-kit determines how much to trade in each scenario. Think of it as a set of rules that tell the system what size of position to take, considering factors like risk tolerance and account balance.

The `calculate` property is the key method here; it's a function that receives data about the current trade opportunity (like the price, stop-loss, and risk percentage) and returns the amount of the asset to buy or sell. This is where you’d define your custom sizing logic, whether it’s fixed fractional, Kelly Criterion, or something else entirely. It uses a promise to handle asynchronous operations if necessary.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal ready for execution. Think of it as a finalized order instruction after all the initial checks and calculations. Each signal has a unique ID, cost in USD, and the entry price at which the trade will be opened.

It also includes crucial details like the estimated time the trade will be active, leverage multiplier, and whether it uses isolated margin.  You'll find information about the exchange, strategy, and frame used for the trade, as well as timestamps for when the signal was initially created and when the position became active.

Beyond the basics, the signal keeps a detailed history. It records partial profit/loss closures for accurate PNL calculation, any trailing stop-loss or take-profit adjustments, and a history of DCA entries if applicable.  Furthermore, it tracks the highest profit and lowest loss points seen during the trade’s life, along with their timestamps. Finally, there's a creation timestamp, marking when this signal first appeared.


## Interface ISignalIntervalDto

This data transfer object, `ISignalIntervalDto`, helps manage signals within the backtest-kit framework, particularly when using the `IntervalUtils`. It's designed to allow you to retrieve several signals at once, pausing the next signal request until a specific time interval has passed. Each signal within this object has a unique identifier, a UUID, making it easy to track and manage them. Think of it as a way to bundle signals together and control their timing.

## Interface ISignalDto

The `ISignalDto` represents the data for a trading signal. When you request a signal, this object contains all the information needed to execute a trade. It includes a unique identifier, the ticker symbol being traded, whether you're going long (buying) or short (selling), and a note explaining the reasoning behind the signal.

You'll also find details about the trade entry price, target take profit price, stop-loss price, and an estimated duration for the trade. There’s even a field to specify the cost of the trade and a multiplier that affects how profits and losses are calculated. Finally, `isolated` lets you choose between isolated margin (where the trade's margin is separate) or cross margin (where it shares margin with other positions).

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the standard `ISignalRow` and provides additional details specifically for situations where a signal involves a user-initiated closure of a position. It introduces two new properties: `closeId`, which uniquely identifies the closure action, and `closeNote`, which allows users to add a descriptive note about why the closure happened. These fields are only relevant when a closure is triggered directly by the user, not by an automated system.

## Interface ISessionInstance

The `ISessionInstance` interface provides a way to store and access temporary data related to a specific trading simulation. Think of it as a container for information that's relevant to a particular symbol, trading strategy, exchange, and time frame during a backtest run.

This container is designed to hold things like cached results from AI models, the state of technical indicators, or other calculations that need to be remembered between different moments in the simulation. It helps keep your backtesting process efficient.

You can use `waitForInit` to set things up at the beginning of a session. `setData` lets you write new information to the container, associated with a particular timestamp.  `getData` retrieves that data, ensuring you aren’t looking into the future. Finally, `dispose` cleans up any resources the container uses when it’s no longer needed.

## Interface IScheduledSignalRow

This interface describes a signal that's scheduled to activate when a specific price is reached. Think of it as a signal that’s waiting for the market to move to a certain level before it actually triggers an order. It builds upon a regular signal but has a delayed execution—it doesn't act until the price hits a predefined level.

Essentially, it’s a way to manage signals that require waiting for a price target. Once that target price is hit, the signal transforms into a standard pending signal, ready to be executed. A key detail is the timing – the signal’s “pending” time starts at the scheduled time and is only updated when the price target is finally met.

The `priceOpen` property specifies exactly what that target price is, representing the price level at which the position will be opened.

## Interface IScheduledSignalCancelRow

This interface describes a scheduled signal, but with the addition of information related to cancellations. Think of it as a record of a signal that was originally planned but then canceled by a user. 

It includes a `cancelId` which is a unique identifier specifically for these user-canceled signals, allowing you to track them. You’ll also find a `cancelNote` – a free-text field for users to explain why they canceled the signal. These properties only appear when a signal has been canceled through a user action.

## Interface IScheduledSignalActivateRow

This interface represents a signal that's been scheduled, but also includes extra details relevant when a user manually triggers its activation. Specifically, it builds upon the standard scheduled signal information by adding an `activateId` – a unique identifier for that manual activation – and an `activateNote`, which is a textual explanation or comment provided by the user. This allows for tracking and understanding why a user initiated a specific activation. Think of it like adding a reason or reference point to a signal's activation event.

## Interface IRuntimeRange

The `IRuntimeRange` interface helps define the timeframe for your backtesting. It essentially tells the backtest kit when to start and stop executing your trading strategies. You'll find two key pieces of information here: a `from` date representing the beginning of your test period, and a `to` date marking the end. Think of it as setting the boundaries for your historical data analysis.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides essential details about what's happening during a trading simulation or live execution. It tells you which trading pair is involved, like "BTCUSDT," and defines the time period being analyzed for a backtest.

You can also pass custom information through the `info` property, which is helpful for tracking specific metrics or details relevant to your strategy. The `context` property gives you insight into the running environment, including the exchange, strategy, and frame names. 

Crucially, it provides the current timestamp, the current market price, and confirms whether the strategy is operating in backtest mode. Think of it as a snapshot of the current situation in your trading system.

## Interface IRunContext

This interface, `IRunContext`, is like a complete package of information needed when running functions within the backtest-kit framework. It bundles together two key pieces of data: how your strategy is configured (like which exchange and strategy you're using) and the current runtime conditions (like the symbol being traded and the exact time). Think of it as a single object that holds everything a function needs to know to do its job correctly during a backtest or live execution. It's designed to be easily passed around, and the framework then separates its components to manage them efficiently.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess potential risks when executing a trading signal. It builds upon a base set of arguments and includes details about the signal itself, specifically the `currentSignal` which contains price information. You'll also find the number of open positions (`activePositionCount`) and a list of those active positions (`activePositions`), providing a complete picture of the portfolio’s current state during risk assessment. This allows validation functions to make informed decisions based on the current market context and existing holdings.

## Interface IRiskValidationFn

This defines a function that checks if a trading decision or portfolio configuration is safe and acceptable. It’s used to prevent potentially risky actions. If the check passes, the function doesn't do anything or returns nothing. If it finds a problem, it either provides a detailed explanation of the issue (as an `IRiskRejectionResult`) or throws an error—which will be handled to produce that same explanation.

## Interface IRiskValidation

This interface lets you define how to check if your trading risks are acceptable. Think of it as setting up rules to make sure your trades aren't too dangerous. 

You specify a `validate` function—this is the core logic that actually performs the risk check, taking your risk parameters as input. 

There’s also a `note` property where you can add a description. This note is purely for your own understanding and helps explain *why* you set up the validation in a particular way.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading. Think of it as a way to store key details about a trade, building upon the standard signal information. It specifically keeps track of the entry price, the original stop-loss level, and the original take-profit level – all things crucial for assessing and controlling risk exposure. These values are used when validating trades to ensure they align with the initial trade plan.

## Interface IRiskSchema

The IRiskSchema lets you define and manage risk controls for your trading portfolio, essentially setting up guardrails to prevent unwanted behavior. You identify each set of controls with a unique `riskName`, allowing for easy tracking and management. It's a good idea to add a `note` to document why a particular risk profile exists.

You can also connect specific functions to events within the risk profile using `callbacks`, allowing for more dynamic control. Most importantly, `validations` is where you define the actual rules that the system will use to assess risk and decide whether a trade should be allowed or rejected; these can be either pre-built validation functions or entirely custom ones.

## Interface IRiskRejectionResult

This interface represents the result when a risk validation check fails. It provides details to help understand why the validation didn't pass. Each rejection has a unique identifier (`id`) so you can track it, and a human-readable explanation (`note`) describing the reason for the rejection, making debugging much easier.

## Interface IRiskParams

The `IRiskParams` object sets up the environment for managing risk within your trading system. It's essentially a bundle of information that tells the risk management component how to operate.

You'll need to provide the name of the exchange you're working with, such as "binance". 

A logger helps you keep track of what's happening during the risk assessment process, providing valuable debugging information.

A `TimeMetaService` is crucial to ensure that your risk assessments are accurate by preventing "look-ahead bias" – making decisions based on future data.

The `backtest` flag indicates whether you are simulating trades or operating in a live trading environment.

Finally, the `onRejected` callback is triggered when a trading signal is blocked due to risk limitations. This is your opportunity to log the rejection, potentially emit events, and gather additional data before the risk system takes further action.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave when multiple things are happening at once. Specifically, the `reserve` property is important if you're dealing with situations where multiple signals might try to adjust a position concurrently.

When `reserve` is set to `true`, it temporarily marks the position as being used, ensuring that everyone sees the most up-to-date size *before* the final position adjustment takes place. This helps prevent unexpected behavior and keeps everything synchronized, particularly in high-frequency trading scenarios.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides the information needed to assess whether a new trade should be allowed. Think of it as a safety check performed before a trading signal is actually executed. It bundles together various details about the potential trade, like the symbol being traded (e.g., BTCUSDT), the signal itself, and the specific strategy requesting the trade.

You'll also find details related to the trading environment like the strategy's name, the exchange being used, a risk identifier, and the timeframe being analyzed. Lastly, it includes the current price and a timestamp for accurate context. This data allows you to build logic that prevents unwanted trades based on pre-defined risk parameters.

## Interface IRiskCallbacks

This interface defines optional functions you can use to be notified about the outcome of risk checks within your trading system. Think of them as event listeners for risk-related decisions. Specifically, `onRejected` is called whenever a trading signal is blocked because it exceeds established risk limits. Conversely, `onAllowed` is triggered when a signal successfully passes all the necessary risk checks and is deemed safe to execute. You can use these callbacks to log these events, trigger alerts, or perform other actions based on the risk assessment.

## Interface IRiskActivePosition

This interface defines the information about an active trading position, the kind that's tracked when evaluating risk across different trading strategies. It breaks down the details of each position, including which strategy and exchange it belongs to, the trading symbol (like BTCUSDT), and whether it's a long or short position. You’ll find key price points here too: the entry price, stop-loss, and take-profit levels. Finally, it includes timestamps and time estimates related to the position's lifecycle.

## Interface IRisk

The `IRisk` interface is a critical component for managing risk in your trading strategies. It allows you to ensure that your trades comply with predefined risk limits.

The `checkSignal` method verifies if a trade is permissible based on your risk rules. A more robust, `checkSignalAndReserve` method does this while also temporarily 'reserving' a position, ensuring that parallel strategies don't accidentally exceed limits. Think of it as a quick check and a temporary hold to prevent conflicts.

When a trade is confirmed and about to be executed, `addSignal` registers the new position.  Conversely, `removeSignal` cleans up the record when a trade is closed, which is vital for keeping your risk tracking accurate. 

Proper use of `checkSignalAndReserve` and diligent calls to both `addSignal` and `removeSignal` are essential to avoid accumulating inaccurate reservation data and maintain the integrity of the entire system.

## Interface IReportTarget

This interface lets you choose exactly which aspects of your trading process you want to track with detailed reports. Think of it as a way to filter what information gets logged to help you understand and debug your trading system.

You can selectively enable logging for things like strategy execution, risk management rejections, breakeven points, partial order closures, heatmap data, walker iterations (which refers to signal iteration), performance metrics, scheduled signals, live trading activity, backtest signal closures, synchronization of signals, milestones for highest profit, and maximum drawdown events. By enabling only the services you need, you can keep your reports focused and manageable. Each boolean property corresponds to a different type of event logging, giving you granular control.

## Interface IReportDumpOptions

This interface, IReportDumpOptions, helps you organize and specify details when saving reports about your backtesting results. Think of it as a way to tag your data with key information like the trading symbol (like BTCUSDT), the name of the strategy being used, the exchange where the trades occurred, and the timeframe used for analysis.  You can also specify a unique identifier for the signal generated and a name for the optimization walker used. This allows for easy filtering and searching of your backtest results later on.

## Interface IRecentUtils

This interface defines how different systems can manage and access recently generated trading signals. It provides tools to receive updates about active signals, fetch the most recent signal for a specific trading setup, and determine how long ago a signal was created. Think of it as a common way to keep track of what signals are currently 'live' and when they were generated. It ensures signals aren't used based on future information, preventing inaccurate backtesting.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a clear view of a trading signal's original parameters, even as things like trailing stop-loss and take-profit levels adjust. It builds upon a standard signal row to show the initial stop-loss and take-profit prices that were set when the signal was first generated. This is helpful for users who want to see the original strategy settings alongside the currently active values.

The `cost` property reflects the initial cost of entering the position, and `totalEntries` indicates how many times the position has been adjusted through averaging. You can track partial executions with `partialExecuted` and `totalPartials`, which reveal how much of the position has been closed off through smaller, incremental exits.

Crucially, `originalPriceStopLoss` and `originalPriceTakeProfit` always hold the values set at the signal’s creation, ensuring transparency.  Other key properties include `originalPriceOpen` representing the initial entry price, `pnl` for unrealized profit and loss, `peakProfit` to track the highest profit achieved, and `maxDrawdown` to monitor potential losses. This interface allows for a comprehensive view of the signal's performance and original setup.

## Interface IPublicCandleData

This interface, IPublicCandleData, defines the structure of a single candlestick, a common way to represent price data over time. Each candlestick has a timestamp indicating when the data was recorded, along with the opening price, the highest price, the lowest price, and the closing price.  You'll also find the volume of trades that occurred during that time frame. Essentially, it’s a complete snapshot of price action and trading activity for a specific interval.

## Interface IPositionSizeKellyParams

When calculating your position size using the Kelly Criterion, this interface helps define the key inputs. You’ll need to specify your win rate, which represents the proportion of winning trades.  You also need to provide the win/loss ratio, reflecting the average amount you win compared to what you lose on each trade. These two values together determine the optimal fraction of your capital to risk.

## Interface IPositionSizeFixedPercentageParams

This describes the parameters needed when you're using a fixed percentage sizing strategy for your trades. Specifically, it tells you how to define the stop-loss price – a crucial element for managing risk. You’ll need to provide a numerical value for `priceStopLoss` which represents the price at which you want to automatically exit a trade to limit potential losses.

## Interface IPositionSizeATRParams

This section details the parameters used when calculating position sizes based on the Average True Range (ATR). Specifically, you’ll find the `atr` property, which represents the current ATR value you're using in your calculations. Think of this as the volatility measure influencing how much capital you allocate to a trade.

## Interface IPositionOverlapLadder

This interface, `IPositionOverlapLadder`, helps you fine-tune how backtest-kit identifies overlapping positions during a dollar-cost averaging (DCA) strategy. Think of it as defining a "comfort zone" around each of your DCA purchase prices.

The `upperPercent` property lets you specify a percentage above each DCA level—anything beyond this is considered an overlap. The `lowerPercent` property does the same, but defines a percentage below each DCA level that triggers an overlap flag. These percentages, ranging from 0 to 100, allow you to control the sensitivity of the overlap detection, helping you to avoid false positives or potentially missing legitimate overlaps. By adjusting these values, you can tailor the overlap detection to your specific trading strategy and data.

## Interface IPersistStrategyInstance

This interface lets you customize how your trading strategy's data is saved and loaded. Think of it as a way to manage the "memory" of your strategy for a specific trading setup – a particular asset, strategy name, and exchange.

If you want to store strategy data in a database instead of a file, or need a different storage mechanism, you can build a custom adapter that implements this interface.

The `waitForInit` method prepares the storage space. `readStrategyData` retrieves any previously saved data. `writeStrategyData` saves the current state of the strategy, and setting it to null will clear it.

## Interface IPersistStorageInstance

This interface defines how your custom storage solutions can interact with the backtest-kit framework. Think of it as a way to replace the default file-based storage with something else, like a database or in-memory store.

It handles keeping track of signals, essentially the data points used during backtesting or live trading.

The `waitForInit` method lets you set up your storage when the backtest or live mode starts.

`readStorageData` fetches all the previously saved signals, organizing them based on their unique identifiers.

`writeStorageData` is used to save signals, associating them with their identifiers so they can be easily retrieved later.


## Interface IPersistStateInstance

This interface defines how to manage persistent state for a specific trading strategy, focusing on storing and retrieving data reliably. Think of it as a way to save and load the "memory" of your strategy, ensuring it doesn't lose progress if something goes wrong. 

It's primarily used to keep your strategy's data safe, especially when dealing with unexpected interruptions.

If you're building a custom solution for managing this data – perhaps storing it in a database instead of a file – you'll implement this interface.

Here’s what the methods do:

*   `waitForInit`: Sets up the storage mechanism when the strategy starts.
*   `readStateData`: Retrieves any previously saved data.
*   `writeStateData`: Saves the current state of your strategy.
*   `dispose`: Cleans up any resources used by the storage.

## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a specific combination of symbol, strategy, and exchange. Think of it as a way to plug in your own storage solution instead of relying on the default file storage.

If you need to persist signals to a database, or another custom location, you’ll implement this interface.

The `waitForInit` method handles the initial setup of the storage.
`readSignalData` retrieves the previously saved signal data.
Finally, `writeSignalData` saves the current signal data, and you can clear the data by passing `null`.


## Interface IPersistSessionInstance

This interface lets you manage how session data is stored and retrieved for a specific trading setup – think of it as a way to keep track of things like order history or internal calculations related to a particular strategy, exchange, and frame. It's especially useful if you want to make sure that even if something goes wrong, your session data isn’t lost.

If you’re building your own system for handling session data – perhaps something that uses a database instead of files – you’ll need to implement this interface.

Here’s what you’ll need to provide:

*   **waitForInit:**  A way to prepare the storage for your session data when it's first needed.
*   **readSessionData:** A function to load previously saved session data.
*   **writeSessionData:** A function to save the current session data, along with a timestamp.
*   **dispose:**  A way to clean up any resources you’re using to store the session data. This might not be necessary if you're using a simple approach.

## Interface IPersistScheduleInstance

This interface helps you manage how trading signals are saved and loaded for specific combinations of assets, strategies, and exchanges. Think of it as a way to customize where and how your signals are stored. 

If you want to replace the default file-based storage with your own solution – perhaps a database or a cloud service – you'll need to implement this interface. 

The `waitForInit` method is used to prepare the storage when things start up. `readScheduleData` retrieves a saved signal, while `writeScheduleData` lets you save a new signal or clear the existing one. It’s all about controlling the lifecycle of your saved trading signals for each unique trading setup.

## Interface IPersistRiskInstance

This interface helps backtest-kit manage and store your trading positions, specifically focusing on the risk associated with them. It allows you to customize how this information is saved and loaded.

Think of it as a way to control where and how backtest-kit keeps track of your active positions for a particular risk profile and exchange.

If you want to use a database instead of files, or have a different storage solution, you can create a custom adapter that implements this interface.

The `waitForInit` method prepares the storage for a specific risk context, ensuring everything is ready to go.

`readPositionData` retrieves the saved position data for a given time.

And `writePositionData` saves the current state of your positions, so you can review them later.

## Interface IPersistRecentInstance

This interface defines how to manage and store the most recent trading signal for a specific setup. Think of it as a way to remember the last signal generated for a particular combination of symbol, strategy, exchange, and timeframe. 

It allows you to customize how these recent signals are saved, potentially moving away from the default file storage.

The `waitForInit` method sets up the storage space. 

`readRecentData` retrieves the last saved signal for that particular context.

Finally, `writeRecentData` saves the current signal, along with a timestamp, so it's readily available later.

## Interface IPersistPartialInstance

This interface lets you manage how partial profit and loss data is saved and loaded. Think of it as a way to customize where and how your trading strategy’s temporary results are stored.

The data is organized based on the asset being traded (symbol), the strategy used, and the exchange involved, so you can keep things specific to each setup.

You can access and save data related to individual signals – these are essentially key points in your trading logic – by giving each signal a unique identifier.

If you want to go beyond the default file storage, you can build your own adapter that implements this interface. This lets you, for example, store partial data in a database or some other custom location.

The `waitForInit` method handles setting up the storage area when needed.

The `readPartialData` method retrieves previously saved data for a given signal.

The `writePartialData` method saves new data for a given signal.

## Interface IPersistNotificationInstance

This interface lets you customize how notification data is stored when running backtests or live trading. Think of notifications as important events or messages that your trading system needs to remember.

It provides a way to manage these notifications, either by loading them from a file or from somewhere else entirely.

The `waitForInit` method sets up the storage area when the system starts. The `readNotificationData` method retrieves all previously stored notifications, and `writeNotificationData` saves new or updated notifications to the storage. This lets you hook into the notification persistence process to control where and how those notifications are held.


## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific area of your application. Think of it as a way to customize how information is saved and loaded, particularly for things like large language model (LLM) memory.

It allows you to control the lifecycle of memory entries, including how they're read, written, and even "soft deleted"—meaning the data remains on disk but is excluded from normal operations. 

You can use this if you want to store memory data in a way that’s different from the default file-based approach. 

Here's a breakdown of what you can do with it:

*   **Initialization:** `waitForInit` sets up storage when needed.
*   **Reading:** `readMemoryData` retrieves a specific memory entry.
*   **Checking Existence:** `hasMemoryData` verifies if a memory entry exists.
*   **Writing:** `writeMemoryData` creates or updates a memory entry.
*   **Soft Deletion:** `removeMemoryData` marks an entry for removal without actually deleting it from disk.
*   **Listing:** `listMemoryData` retrieves all non-deleted memory entries.
*   **Cleanup:** `dispose` releases any resources held by the storage.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for each trading bucket. Think of it as a way to save results from external APIs so you don't have to repeatedly ask for the same information.

To help with performance, the cache lets you "soft delete" entries—meaning they're marked as removed but remain on disk, allowing for easier cleanup or recovery if needed. 

If you want to customize how the cache works, you can build your own adapter that implements this interface, overriding the default file-based storage.

Here's a breakdown of what the methods do:

*   `waitForInit`: Sets up the storage area for a specific bucket.
*   `readMeasureData`: Gets a cached data entry using its key.
*   `writeMeasureData`: Saves a data entry to the cache, associating it with a key and timestamp.
*   `removeMeasureData`:  Marks an entry as removed; it’s still on disk, but won’t be returned when reading.
*   `listMeasureData`: Provides a way to go through all the keys of data entries that haven’t been marked as removed.

## Interface IPersistLogInstance

This interface defines how log data is stored persistently across your backtest-kit application. Think of it as a way to save your trading logs even after the application closes. 

Instead of being tied to a specific trading context, these logs are stored globally for the entire process.

If you want to use a different method for saving your logs – perhaps to a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method is used to kick off the log storage initialization process. The `readLogData` method retrieves all the previously saved log entries. Finally, `writeLogData` allows you to add new entries, making sure to avoid duplicates and maintain an append-only log.

## Interface IPersistIntervalInstance

This interface helps manage how your backtesting system remembers which time intervals have already been processed for a specific data bucket. Think of it as a way to keep track of what’s been done.

When backtest-kit runs, it uses this to ensure that certain actions only happen once per interval, even if the system restarts or needs to reload data.

If you want to use a different storage method instead of the default file-based system (perhaps a database or in-memory store), you can create your own adapter that implements this interface.

The `waitForInit` method sets up storage for a new bucket.  `readIntervalData` retrieves existing information. `writeIntervalData` creates or updates a record indicating an interval has fired. `removeIntervalData` essentially "unmarks" an interval, allowing it to be processed again. Finally, `listIntervalData` provides a way to see all the intervals currently marked as processed.

## Interface IPersistCandleInstance

This interface defines how your backtest kit stores and retrieves candle data for a specific trading symbol, time frame, and exchange. Think of it as a way to persist your historical data so you don't have to constantly re-download it.

The `waitForInit` method lets you initialize the storage when needed, typically at the start of a backtest. 

`readCandlesData` is how you grab a chunk of historical data – it attempts to load the candles you request from the stored cache.  If even one candle is missing from the range you asked for, it will return `null`, signaling that you need to fetch the data from the live exchange.

Finally, `writeCandlesData` allows you to save new or updated candles to the cache, ensuring your data is updated. You might choose to skip saving incomplete candles to maintain data integrity.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data – that's the point where a trade becomes profitable – is stored and retrieved for individual trading setups. Think of it as a way to save your progress on a particular strategy for a specific asset and exchange.

Each trading setup (defined by a symbol, strategy name, and exchange) gets its own dedicated storage space. Inside that space, data for each individual trading signal, identified by its signal ID, is kept separate.

If you want to use a different method to store this data, perhaps in a database or a custom file format, you can build an adapter that implements this interface.

The `waitForInit` method gets things started, preparing the storage area for a given trading setup.

`readBreakevenData` fetches the saved breakeven information for a specific trading signal at a certain point in time.

`writeBreakevenData` saves the updated breakeven information for a trading signal.


## Interface IPersistBase

This interface helps you build custom ways to save and load your trading data, like using a different file format or database. It focuses on the core actions you’ll need: making sure everything's ready, retrieving data, checking if data exists, saving data securely, and listing all the data you have. Think of it as a standard set of tools for handling your persistent data.

The `waitForInit` method ensures that your data storage area is set up correctly and ready to go, only running the setup once. `readValue` lets you grab a specific piece of data, while `hasValue` lets you quickly check if that data already exists. `writeValue` safely saves a piece of data. Finally, `keys` provides a way to get a list of all the data you’re storing, sorted in a predictable order, useful for verifying or processing everything.

## Interface IPartialProfitCommitRow

This represents a specific instruction to take partial profits in your trading strategy. Think of it as one step in a plan to close off a portion of your open position.

It tells the backtest system to close a certain percentage of the trade. 

The `currentPrice` records the price at which that partial profit-taking action actually happened, which is important for accurate backtesting results.


## Interface IPartialLossCommitRow

This interface represents a request to partially close a position. 

It contains information about the action being taken (specifically, a partial loss), the percentage of the position that should be closed, and the price at which the partial close occurred. Think of it as a record of a partial sell order that's been queued up. It's used to track and process these partial loss events within the backtest.

## Interface IPartialData

This data structure, `IPartialData`, is designed to save and load pieces of information about a trading signal. It's used internally to store things like the profit and loss levels that have been hit.

Think of it as a snapshot of essential data points.

The `profitLevels` property holds an array detailing the levels where profits were realized, while `lossLevels` does the same for losses.  These are saved as arrays because the system needs to convert data into a format that can be easily stored and retrieved, like JSON. It's how the information gets preserved and then brought back to life when needed.

## Interface IPartial

The `IPartial` interface handles tracking profit and loss for trading signals. It's used by components like `ClientPartial` and `PartialConnectionService`.

Whenever a signal generates profit, the `profit` method is called to determine if any profit milestones (10%, 20%, etc.) have been hit, and if so, it sends out notifications for those new milestones. The same applies to losses; the `loss` method detects and reports new loss levels.

When a trading signal is finished – whether by reaching a take profit or stop loss, or simply expiring – the `clear` method is triggered. This cleans up the recorded state, saves the changes, and releases memory resources. Essentially, it makes sure we’re not holding onto information about signals that are no longer active.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the outcome of parsing command-line arguments. It takes the original input parameters and adds flags that determine the trading environment. These flags specify whether the system should operate in backtest mode – simulating trades on historical data – paper trading mode – practicing with live data but virtual funds – or live trading mode – actually trading with real money.

## Interface IParseArgsParams

The `IParseArgsParams` interface helps define the basic information needed to run a trading strategy. Think of it as a template for specifying what your backtest needs to know to get started. It includes things like the trading pair you're interested in, like "BTCUSDT," the name of the strategy you want to test, the exchange you're connecting to, like "binance," and the timeframe for the price data you'll be using, such as "1h" for one-hour candles. Essentially, it bundles all the key identifiers needed to launch a backtest.

## Interface IOrderBookData

The `IOrderBookData` interface represents the data you receive from an order book. It holds information about the bids and asks currently available for a specific trading pair. 

Essentially, it tells you what prices buyers are willing to pay (bids) and what prices sellers are asking (asks) for a particular asset.

The `symbol` property identifies the trading pair, like "BTCUSDT". The `bids` property is a list of all the buy orders, and `asks` holds all the sell orders. Each element in these lists provides details about the price and quantity of each order.

## Interface INotificationUtils

This interface defines the core functionality for systems that want to receive and react to various signals and events generated by the backtest kit. Think of it as a blueprint for notification handlers.

It provides methods to respond to a wide range of events, including when a trade is opened or closed, partial profits or losses are available, a strategy is committed, or an order is filled or rejected. There are also methods for handling sync events, ping requests, and order status updates, along with ways to deal with errors, pauses, and risk management.

The `getData` method lets you retrieve a list of all notifications that have been stored, while `dispose` allows you to clear them out when you're finished. This helps ensure your system stays informed and responsive throughout the entire backtesting process.

## Interface INotificationTarget

This interface lets you precisely control which notifications you receive from the backtest or live trading environment. Think of it as a filter for updates – only subscribe to the types of information you actually need. If you don't specify this interface at all, you'll get *everything*, which can be a lot of noise.

Here's a breakdown of the different notification categories you can enable:

*   **Signal Events:** Keep track of signal lifecycle events like when a signal is opened, scheduled, closed, or canceled.
*   **Partial Profit/Loss/Breakeven:**  Get notifications when prices hit defined profit, loss, or breakeven levels, before the trade is finalized.
*   **Strategy Commitments:** Receive confirmations when actions like closing positions or adjusting stops are completed.
*   **Order Synchronization:** Monitor the status of orders placed with the exchange, including opens, fills, and rejections.
*   **Order Checks:** Verify that orders remain active on the exchange. This is important for live trading.
*   **Order Fills & Rejections:**  Get definitive confirmation of order fills or rejections—meaning, what actually happened with the order after it left your system.
*   **Order Continuations & Stops:**  Track the status of order checks – whether they confirm the order is still open or if they've stopped due to an issue.
*   **Risk Management:** Be alerted if your risk management rules block a trade.
*   **Informational Signals:** Receive manual or strategy-generated notes attached to signals.
*   **Strategy Pause Status:** Get notified when the strategy is paused and resumed.
*   **Runtime Errors:** Receive notifications of non-fatal and critical errors encountered during the process.
*   **Validation Errors:**  Get notified about issues with your strategy configuration or input data.

## Interface IMethodContext

The `IMethodContext` provides essential information to the backtest-kit framework about which specific components – the exchange, strategy, and frame – should be used during a backtest. Think of it as a little packet of data that travels around, telling the system which versions of these pieces it needs to work with. It contains the names of the strategy, exchange, and frame schemas being used; the frame name is blank when operating in live mode. This context is automatically passed around to help ensure everything is working with the correct configurations.

## Interface IMemoryInstance

The `IMemoryInstance` interface sets the rules for how memory is managed within the backtest-kit framework. Think of it as a blueprint for creating different ways to store and retrieve data during a backtest. It outlines essential operations such as initializing the memory, writing new data points, searching for specific information, listing all available data, deleting entries, and retrieving individual records. This interface ensures that all memory implementations, whether they are local storage, persistent databases, or temporary dummy stores, function consistently. The `waitForInit` method prepares the memory for use, while `writeMemory` allows you to record data with a timestamp and description. `searchMemory` helps you find what you’re looking for using full-text search, and `listMemory` lets you see all the stored data up to a certain point in time. `removeMemory` deletes specific data points, `readMemory` retrieves single records, and finally, `dispose` cleans up everything when you're done.

## Interface IMarkdownTarget

The `IMarkdownTarget` interface lets you choose exactly what kinds of detailed reports you want backtest-kit to generate. Think of it like customizing your data output.

Each property, like `strategy` or `risk`, controls a specific type of report. For instance, setting `strategy` to `true` will give you reports showing entry and exit signals.

You can enable or disable these reports individually.

Some reports focus on strategy performance (`strategy`, `performance`), while others analyze risk management (`risk`), or even delve into portfolio dynamics (`heat`).

There are also options for tracking specific events like break-even points (`breakeven`), partial profits (`partial`), and signals waiting to be triggered (`schedule`).

If you’re interested in tracking live trading events (`live`) or a complete backtest history (`backtest`), those options are available too.  Finally, you can monitor milestones like the highest profit achieved (`highest_profit`) and the maximum drawdown (`max_drawdown`).

## Interface IMarkdownDumpOptions

This interface defines settings you can use when exporting information about your backtests into Markdown format. Think of it as a way to specify exactly what part of your backtest data you want to see in a readable document. It lets you pinpoint the location (path and file), the trading pair (symbol), the name of the strategy, the exchange it ran on, the timeframe used, and even a unique ID for the trading signal involved. You can use these properties to organize and filter your backtest reports.

## Interface IMCPTextMessage

This represents a simple text message used within the Model Context Protocol (MCP) system. Each message has a unique identifier, allowing for tracking and preventing duplicates. The `type` field clearly marks it as a text message, and the core of the message is the `text` property, which holds the actual human-readable content. It's a straightforward way to transmit textual information within the MCP framework.


## Interface IMCPSignalNotifyCommand

This command, `IMCPSignalNotifyCommand`, helps alert users about important information related to their open positions. It's used to send a `signal.info` notification about a specific trading pair, like BTCUSDT. The notification links to the signal ID for that trading pair, making it easy to track and understand the details of what's happening.  Essentially, it's a way to keep traders informed about the status of their active positions. The command also identifies the MCP (Model Context Protocol) schema responsible for sending the notification, ensuring clear communication within the system. You can include a short note to give more context to the notification.

## Interface IMCPSchema

This defines a blueprint for how your trading strategies connect to a central control system, known as the Model Context Protocol or MCP. Think of it as a way to manage and monitor multiple strategies at once.

Each MCP registration uses this schema to link a specific name to a strategy. This allows you to send commands and track the status of those strategies.

You can specify which strategy the MCP will work with, although if you have only one strategy registered, that’s the default.  If you have multiple strategies, you *must* clearly define which ones the MCP interacts with to avoid confusion.

Several other important settings can be configured:

*   `positionCost` determines the initial cost of entering a position, and `multiplier` controls the leverage used.  These have default values but can be customized.
*   `permissions` control precisely which actions an external agent can request from the MCP, providing extra security.
*   The `getMessages` function allows you to customize how the portfolio information is delivered to the agent, with a default option that provides text messages for each symbol.
*   Finally, `callbacks` are optional functions that can be triggered at various points in the process.

## Interface IMCPPositionOpenCommand

This interface defines the information needed to open a new trading position within the backtest-kit framework. It's used when a strategy wants to execute a trade, specifically a moonbag position which uses a predefined take-profit and stop-loss strategy.

You'll need to specify the symbol you want to trade, whether you're going long (buying) or short (selling), and the name of the strategy – the MCP – that's initiating the order. Finally, you can add a note to the order to explain why it's being placed, making it easier to understand the trade later on.


## Interface IMCPPositionCloseCommand

This interface defines the data needed to instruct the system to close an existing trading position. 

Essentially, it's a message telling the system which trading pair (like BTCUSDT) you want to close, which strategy is requesting the closure, and a brief explanation for why you’re closing it. 

Think of it as a formal way to say, "Close my BTCUSDT position, this is coming from the strategy named 'MyStrategy', and I’m closing it because of [reason]".


## Interface IMCPImageMessage

This represents an image message used within the Model Context Protocol, often for things like displaying a chart or visualization. Each image message has a unique ID to help keep track of it and ensure it's delivered correctly. It also specifies the image's type, like PNG or JPEG, and contains the actual image data encoded in base64 format – essentially a text string that represents the picture.

## Interface IMCPContext

The `IMCPContext` object holds a snapshot of your portfolio's holdings for each symbol being traded. Think of it as a record of what you own at a specific point in time, provided to your strategy's functions. Each live run of your trading strategy will receive its own unique `IMCPContext` object.

## Interface IMCPCallbacks

This interface defines optional callbacks that you can use to observe what a Model Context Protocol (MCP) is doing during its lifecycle. Think of them as ways to peek behind the scenes of your backtesting process. They're fired *after* a successful action, giving you access to the raw data involved. If you don't need a specific callback, you can simply leave it out; it won't cause any problems.  If a callback throws an error, it’ll be logged, but the backtest won't fail.

Here's a breakdown of each callback:

*   **onStatus**:  Notified when the `getStatus` command is completed, providing the portfolio snapshot and any associated messages.

*   **onPositionOpen**: Triggered when a position is successfully opened, giving you details about the signal and the data transfer object (DTO) used for the opening order.

*   **onPositionClose**:  Called after a position is successfully closed, providing the signal ID associated with the closing action.

*   **onAverageBuy**:  Notified when a DCA (Dollar Cost Averaging) buy entry is accepted, providing the signal ID linked to the entry.

*   **onSignalNotify**: Fired when a signal notification is sent, giving you the signal ID linked to the notification.

## Interface IMCPAverageBuyCommand

This command is used to add a small buy order, often called a "dollar-cost average" (DCA) entry, to a trading position. It's specifically for systems using the Model Context Protocol (MCP).

Essentially, it tells the system to buy a little bit of a particular asset (like BTCUSDT) at the current price and add it to an existing open position.

The command includes the symbol being traded (like "BTCUSDT") and the name of the MCP responsible for generating this order. The amount to buy is determined by settings within the MCP itself.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. Think of it as a central place to record important information for understanding how your trading strategies run.

It provides several ways to record messages, ranging from simple general logs to more detailed debug information.

You can use `log` for general updates, `debug` for very specific diagnostic details (helpful when troubleshooting), `info` for regular status messages, and `warn` to highlight potential issues that need investigating.

These logs track everything from how agents execute to policy checks and data persistence, making it much easier to debug, monitor, and audit your trading system’s behavior.

## Interface ILogEntry

This interface represents a single entry in the backtest log history. Each log entry has a unique identifier, a level (like 'log', 'debug', 'info', 'warn', or 'agent') to indicate its importance, and a timestamp for managing log storage. 

It also includes helpful information like the date and time when the log was created within the backtest run, and the context in which the log entry was generated.

You'll find details about the specific method or topic the log relates to, alongside any extra arguments passed when the log was recorded. This allows for a more detailed understanding of what happened during the backtest.

## Interface ILog

The `ILog` interface gives you a powerful way to track what's happening during your backtesting and trading simulations. It builds on the standard logging features, adding the ability to see a complete history of all your logs. 

Specifically, you can retrieve a list of every log entry that has been recorded, which is incredibly helpful for debugging and analyzing performance. This allows you to examine exactly what occurred in your backtest, step by step.


## Interface IHeatmapRow

This interface, `IHeatmapRow`, represents a single row of data in a portfolio heatmap, giving you a detailed breakdown of performance for a specific trading symbol like BTCUSDT. It bundles a wealth of information, from basic metrics like the total profit or loss percentage (`totalPnl`) and the number of trades (`totalTrades`) to more complex calculations.

You’ll find standard risk-adjusted performance ratios such as the Sharpe Ratio (`sharpeRatio`), which measures return relative to risk, and the maximum drawdown (`maxDrawdown`), indicating the largest peak-to-trough decline.

The interface also provides insights into trade characteristics, including win rates (`winRate`), average win/loss amounts (`avgWin`, `avgLoss`), and streak statistics (`maxWinStreak`, `maxLossStreak`).  Beyond just numbers, it incorporates details about trade durations (`avgDuration`), and even analyzes market pressure with metrics like `buyerPressure` and `sellerPressure`. Finally, it gives you a sense of the overall trend (`trend`) and its reliability (`trendConfidence`).


## Interface IFrameSchema

This schema defines a specific window of time for your backtest, outlining the start and end dates and the frequency of data points. Think of it as setting the stage for your trading simulation. 

Each frame has a unique name to identify it, and you can add a note to help yourself remember what this frame represents. 

You specify the interval – like "1m" for one-minute data – which determines how often timestamps are generated within your defined period. If you don't tell it what interval to use, it defaults to one minute. 

The `startDate` and `endDate` properties define the exact beginning and end of the backtesting period, making sure the simulation runs over the desired timeframe.

Finally, you can provide optional callback functions to execute at specific points during frame processing – useful for custom data handling or analysis.

## Interface IFrameParams

The `IFrameParams` object holds the settings needed to create a frame within the backtest-kit framework. Think of it as a set of instructions for how a particular step in your trading simulation should behave. 

It includes a `logger`, which allows you to keep track of what's happening during the backtest—helpful for debugging and understanding your strategy.  You also define the `interval`, which is a descriptive name for this frame; it’s like giving it a label so you know exactly what it's doing in the bigger picture.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface helps you listen in on what's happening during the creation of your backtest timeframe data. Specifically, it provides a way to react when the list of timeframes is prepared. 

You can use this to check the dates and intervals included, or just to log the data for debugging purposes. The `onTimeframe` property is your gateway to this, and it receives the timeframe array, the start and end dates, and the interval used.

## Interface IFrame

The `IFrame` interface is a core part of backtest-kit, responsible for managing the timeframes used during backtesting. Think of it as the engine that creates the sequence of moments in time your trading strategy will be evaluated against.

Specifically, the `getTimeframe` function is key; it's how you request a list of dates and times for a given trading symbol and a named timeframe (like "1h" for hourly data). This function retrieves an array of timestamps, spaced according to how often data is available for that timeframe, allowing the backtest to progress through time. It’s a behind-the-scenes component handling the timing of your backtesting process.


## Interface IExecutionContext

The `IExecutionContext` interface holds important information needed by your trading strategies and exchange interactions. Think of it as a container for the current state of the trading environment. 

It carries details like the trading symbol – for example, "BTCUSDT" – and the precise timestamp representing the current moment in time. 

Finally, it tells you whether you are running a backtest, which is a simulated run using historical data, or a live trading session. This context is automatically provided to functions like `getCandles`, `tick`, and `backtest` to ensure everything operates with the correct information.


## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint you provide to tell the framework where to get the historical data and how to handle quantities and prices.

You'll need to give it a unique `exchangeName` to identify the exchange.  A `note` is optional, allowing you to add developer documentation.

The most important part is `getCandles`, which tells the framework how to retrieve historical price data—this is how you get the OHLCV data needed for backtesting.

To ensure accurate trade simulations, `formatQuantity` and `formatPrice` let you handle quantity and price formatting according to each exchange's rules. If you don’t provide these, a default (Bitcoin precision on Binance) will be used.

You can also specify `getOrderBook` and `getAggregatedTrades` for more advanced simulations, but if these aren't provided, the system won't be able to fetch order book or aggregated trade data, and will throw an error if you try to use them.

Finally, `callbacks` allows you to hook into certain events during the backtesting process, like receiving candle data.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed to connect to and interact with an exchange within the backtest-kit framework. It acts as a blueprint for setting up the exchange environment, ensuring all necessary components are available.

Essentially, you need to provide functions for retrieving candle data, formatting quantities and prices to match the exchange's rules, fetching order books, and accessing aggregated trade data. These functions are critical for the backtesting process, allowing the framework to simulate trading activity.

The `logger` property provides a way to record debug messages for troubleshooting and analysis. The `execution` property gives access to the runtime context, including information about the symbol being traded, the current time, and whether the process is a backtest. 

All these methods are mandatory, although sensible defaults are applied during initialization to simplify setup.

## Interface IExchangeCallbacks

This interface lets you hook into events happening when the trading system retrieves candlestick data. Specifically, the `onCandleData` callback gets triggered whenever new candle data arrives. You’ll receive information about the symbol (like "BTCUSDT"), the candlestick interval (e.g., 1 minute, 1 hour), the timestamp from when the data started, the number of candles retrieved, and an array containing the actual candle data itself. This allows you to react to new data becoming available, perhaps updating a visualization or triggering further analysis.


## Interface IExchange

The `IExchange` interface defines how your backtesting system interacts with a specific exchange. It provides methods to retrieve historical and future market data, ensuring a fair and unbiased backtest. You can fetch candlestick data for a given symbol and timeframe, allowing you to analyze past price action and build trading strategies.

This interface also handles the complexities of exchange-specific formatting, such as correctly representing trade quantities and prices. It lets you calculate the VWAP (Volume Weighted Average Price) to understand the average price a security has traded at throughout the day, and get the closing price of the most recent candle.

Furthermore, you can access the order book and aggregated trades to gain a deeper understanding of market depth and activity. The `getRawCandles` method offers a highly flexible way to retrieve historical data, letting you specify start and end dates, or a limit, while always referencing the execution context to avoid looking into the future.

## Interface IEntity

This interface serves as the foundation for all data objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point that ensures all your saved entities, like trades or orders, share a consistent structure. It's a blueprint for how persistent data should be organized.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save data during a backtesting process. Think of it as a way to record various pieces of information – like conversation histories, simple data records, tables of data, text notes, error messages, complex JSON objects, and even snapshots of system status – all linked to a specific point in the backtest. Each instance is tied to a particular signal and bucket, ensuring data is organized correctly.  The methods allow you to pass in the data to be saved along with a unique identifier (dumpId) and a brief explanation of what the data represents.  Finally, the `dispose` method ensures that any resources used by the instance are properly cleaned up when it's no longer needed.

## Interface IDumpContext

The `IDumpContext` helps keep track of where data is coming from during the backtesting or live trading process. Think of it as a little package containing important details about a specific piece of information being recorded. It tells you which trade (`signalId`) it relates to, what group or strategy it belongs to (`bucketName`), and a unique ID to identify it (`dumpId`). There's also a description to easily understand what the data represents, which is helpful for searching and understanding the results. Finally, it indicates whether this context is part of a backtest simulation or live trading.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, serves as a foundation for managing events that need to be processed later, specifically when committing data. Think of it as a way to hold onto information temporarily until the system is ready to handle it. It contains essential details like the `symbol` being traded, which identifies the trading pair, and a `backtest` flag indicating whether the action occurred during a simulated backtest rather than live trading.

## Interface ICheckCandlesParams

ICheckCandlesParams defines the information needed to check if candle data exists in a storage system. It’s essentially a request to verify if your trading data – like open, high, low, and close prices – is available for a specific trading pair (symbol), on a particular exchange, and within a defined time period. This request includes the symbol, the exchange name, the candle interval (like 1-minute or 4-hour candles), and the start and end dates to specify the range to check. It's used to quickly verify data availability without needing to scan through all the data files.

## Interface ICandleData

This interface defines the structure for a single candlestick, the basic building block for analyzing price data. Each candlestick represents a specific time interval and holds key information like the opening price, the highest and lowest prices reached, the closing price, and the volume traded. The `timestamp` tells you exactly when this candle began, while `open`, `high`, `low`, `close`, and `volume` provide a snapshot of the price action and trading activity within that time frame. You'll find this structure essential for tasks like calculating VWAP and running backtests to evaluate trading strategies.

## Interface ICacheCandlesParams

This interface helps manage how your backtesting system prepares and uses historical data. It's designed to give you control over the process of checking if data exists and then pre-populating the cache with that data. 

Think of it as a way to hook into different stages of this data preparation. 

You can provide functions that get triggered *before* the validation check begins and *before* the cache warm-up starts. These functions let you log messages, set up monitoring, or perform other tasks related to the data loading process itself.  They give you insight into when and what kind of data is being fetched.

## Interface IBrokerOrderVerdictTransient

This object represents a temporary problem encountered while trying to execute or check an order. It's a way for the system to communicate that something went wrong, but it’s likely a fixable issue.

Think of it like a brief network hiccup or a temporary server problem on the exchange's end.

The system will automatically attempt to retry the operation a limited number of times, giving the underlying problem a chance to resolve itself. If the system encounters this verdict, it won’t immediately give up.

The `reason` will always be "transient" because it signifies a temporary failure. 

The `error` property holds details about the specific failure that caused this verdict. It might contain error messages or other information helpful for debugging, but it is unknown type.


## Interface IBrokerOrderVerdictRejected

When an order can't be fulfilled, this tells you why and gives you details. 

The system doesn’t let adapters create this notification directly; instead, adapters signal issues by returning a value or throwing an error. A "rejected" reason means the order couldn't be processed and shouldn't be retried, typically because something fundamental is missing like a counterparty. Rejected open orders are cancelled immediately and rejected close orders will be force-closed. 

If you see this, the `error` property will contain the specific `OrderRejectedError` that explains the problem.

## Interface IBrokerOrderVerdictDeleted

This notification signals that an order has been definitively deleted by the broker, essentially meaning the order no longer exists. 

It's a framework-generated event, so your adapter or listener doesn't create it directly. Instead, you respond to order synchronization or check requests, and the framework interprets your response to produce this notification.

If an order is deleted – for example, because the user cancelled it on the exchange – this `IBrokerOrderVerdictDeleted` is issued. It represents a permanent deletion, immediately ending any tolerance checks.

The `reason` is always "deleted," and it includes the original error, such as an `OrderDeletedError`, that caused the deletion.


## Interface IBrokerOrderVerdictConfirmed

This object represents a final decision made by the backtest-kit system about an order – whether it should proceed or not. 

It’s a way for the framework to communicate the outcome of a gate or check that you’ve set up. You, as the adapter, don't build this object directly; instead, you signal your decision by returning a value or throwing an error.

A return value of `true` or a normal return indicates the order is approved. Throwing a specific error signals a rejection or deletion. 

When the `reason` is "confirmed", it means the order is valid and can go ahead.

## Interface IBrokerOrderVerdictBase

The `IBrokerOrderVerdictBase` represents a decision made by the system regarding an order, whether it's a synchronization event or a check. It's a foundational structure for different types of order verdicts and doesn’t depend on the specific reason for the decision. The `__type__` property acts as a unique identifier, allowing the framework to determine the exact kind of verdict it's dealing with. Essentially, it's the key to understanding what kind of order action has been decided.

## Interface IBroker

This interface defines how your application connects to a real-world brokerage or exchange. It's the bridge between your backtesting framework and live trading.

The `waitForInit` method is crucial to run once before trading begins – think of it as connecting to the exchange and reconciling any existing orders or positions.

The `onOrderCloseCommit` method handles closing orders (like take-profit or stop-loss), providing a gate for execution – throwing an error here can retry or reject the close.

Similarly, `onOrderOpenCommit` manages opening orders. It's another gate, allowing for error handling and retries if the order fails.

`onOrderActiveCheck` verifies the status of active positions, potentially triggering closures if something goes wrong.  `onOrderScheduleCheck` does the same for scheduled (resting) orders.

`onSignalActivePing` and `onSignalSchedulePing` are information-only hooks that provide real-time updates on active or scheduled signals.

`onSignalScheduleOpen` allows you to place the initial resting order when a new signal is scheduled.

`onSignalScheduleCancelled` handles canceling scheduled orders that have been rejected.

`onSignalPendingOpen` lets you place entry and protective orders after a position is opened.

`onSignalPendingClose` handles closing positions and recording profit/loss.

Finally, the functions `onPartialProfitCommit`, `onPartialLossCommit`, `onTrailingStopCommit`, `onTrailingTakeCommit`, `onBreakevenCommit` and `onAverageBuyCommit` handle commits from different strategy implementations.



These methods are called *before* the backtest framework updates its internal state, allowing for crucial control and error handling during live trading. Remember, these methods are skipped entirely when backtesting.

## Interface IBreakevenData

This interface defines the data needed to store and retrieve breakeven information. Think of it as a simplified version of the full breakeven state, designed to be easily saved and loaded, like when using JSON. 

It tracks whether a breakeven point has been achieved for a specific trading signal. This information is stored as a simple true/false value.

The adapter uses this to manage breakeven data, associating it with each individual signal. When the application starts, this data is loaded and then transformed back into the more detailed breakeven state.


## Interface IBreakevenCommitRow

This object represents a single action queued for processing during a backtest – specifically, a breakeven commitment. It signals that the trading strategy needs to adjust its breakeven price. The `action` property explicitly confirms that this is a breakeven-related action, and `currentPrice` holds the price level at which the breakeven adjustment is being made. Think of it as a record of when and where the strategy decided to modify its breakeven point.

## Interface IBreakeven

The `IBreakeven` interface helps manage breakeven points for trading signals. It essentially tracks when a signal’s stop-loss can be adjusted to the initial entry price, which happens when the price moves favorably enough to cover any transaction fees. 

The `check` method is used to determine if a breakeven event should occur, and it’s triggered by the strategy while it's actively monitoring signals. It verifies that breakeven hasn't already been reached, the price has moved sufficiently, and the stop-loss is eligible for adjustment. If everything lines up, it marks the signal as having reached breakeven, notifies listeners, and saves the status.

When a signal is finished – whether through a take-profit, stop-loss, or time expiration – the `clear` method is called to clean up the breakeven state. This removes the signal data from active memory and saves the changes, effectively resetting the system for the next signal.

## Interface IBidData

This interface represents a single bid or ask price point within an order book. It contains two key pieces of information: the price at which the order is placed and the quantity of the asset available at that price. Both the price and quantity are stored as strings.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. It details one buy order within a larger averaging plan. 

Each instance contains information about the price at which the buy occurred, how much it cost in USD, and the total number of entries (or buy orders) that will be part of the averaging process so far. Think of it as a record of one purchase within a series of purchases aimed at smoothing out the cost basis.

## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade that happened. Think of it as a snapshot of one transaction, providing details like the price, the number of units traded, and the exact time it took place.  A key piece of information is whether the buyer was acting as a market maker, which helps understand the direction of the trade. Each trade has a unique ID to easily reference it later.

## Interface IAgentLogger

This interface, `IAgentLogger`, is specifically for recording what your AI agent is doing. Think of it as a separate channel for tracking the agent's actions like its reasoning process, the tools it uses, and the responses it generates.

It’s distinct from the framework's internal logging, which focuses on the health and operation of the backtest-kit itself. This separation ensures that users who have customized their own logging setup aren’t affected by agent-specific logging.

The `agent` method is how you record those agent-related messages. You provide a topic (a short description of the event) and any additional data you want to include. It's designed to help you understand and analyze your agent's behavior over time.

## Interface IActivityEntry

An `IActivityEntry` represents a single, ongoing trading simulation or live trade. Think of it as a record of what's currently happening—a backtest run or a live execution.

It's automatically created when a process begins, like a backtest or a live trade, and then disappears when it finishes or encounters a problem.

This information is helpful for managing workloads, preventing the system from trying to do too much at once by tracking parallel operations.

Each entry includes the symbol being traded (like "BTCUSDT"), the details of the strategy involved (name, exchange, and frame), and whether it's a backtest or a live trade.

## Interface IActivateScheduledCommitRow

This interface represents a message that signals a scheduled activation process within the backtest-kit system. It’s essentially a notification that a previously planned activation should now occur.

The `action` property always confirms that this is an "activate-scheduled" event.

The `signalId` tells you exactly which signal is being activated – it’s a unique identifier for that particular signal.

Finally, `activateId` is a unique identifier for this specific activation request. It’s useful if users trigger activations manually and need to track them separately.

## Interface IActionStrategy

This interface, `IActionStrategy`, lets your trading actions safely peek at the current state of a trading signal. It’s like a way for your actions to quickly check if a signal is actually waiting to be acted upon, preventing unnecessary or potentially incorrect actions.

Think of it as a safety net for actions like adjusting stop losses or taking profits. 

It provides two methods: `hasPendingSignal` checks if there's an open position and signal waiting; and `hasScheduledSignal` checks if a future signal is waiting. Both methods let you check if the signal exists before executing any actions, using information about the backtest mode, the trading symbol, and the context of the strategy.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategies with custom actions. Think of actions as hooks that allow you to tap into what's happening during a strategy's execution.

You can use them to manage your strategy's state—for instance, if you're using Redux or a similar tool. Actions also facilitate logging events, sending notifications (like to Telegram or Discord), collecting analytics, or triggering any custom business logic you need.

Each action is created uniquely for each strategy run, giving it direct access to all the events being generated. It’s designed to be flexible; you can attach several actions to a single strategy to handle diverse requirements. 

The `IActionSchema` defines key parts of an action, including a unique identifier (`actionName`), a descriptive note, the actual event handler logic (`handler`), and optional callbacks for different lifecycle stages (`callbacks`).


## Interface IActionParams

The `IActionParams` object holds all the information an action needs to run correctly, going beyond just the basic configuration. Think of it as a package containing everything from logging tools to contextual details about the trading strategy.

It includes a `logger` for tracking what's happening and helping diagnose issues.

You'll also find identifiers like the `strategyName`, `exchangeName`, and `frameName` to specify exactly where this action belongs within the trading system.

Knowing if you're in a `backtest` (simulated trading) environment is also crucial, and this property tells you that. Finally, the `strategy` property provides access to important information like the current trading signal and the existing positions.

## Interface IActionCallbacks

This API reference describes a set of callbacks you can use to customize the behavior of your trading actions within a framework. Think of these as hooks into different stages of a trade's lifecycle, allowing you to perform tasks like logging, resource management, or reacting to specific events.

You can initialize and clean up resources, like database connections, when your action handler starts and stops. There are separate callbacks for handling different signal events – some are specific to live trading, others to backtesting.

You’ll find events related to breakeven, partial profit/loss, and scheduled signals, providing opportunities to react to these conditions.  

The `onScheduleEvent` and `onPendingEvent` callbacks provide a way to manually control order placement and cancellation, offering an alternative to using a broker adapter. These are event-driven, allowing you to directly interact with the exchange.

`onPingActive` lets you monitor an open position and take actions if necessary, while `onPingIdle` triggers when there's no active signal.  

`onRiskRejection` informs you when a signal is rejected due to risk management constraints.  Finally, `onOrderSync` and `onOrderCheck` provide ways to manage order confirmations and health checks, with specific rules for handling errors and retries. These last two are for action-side equivalents to Broker calls.

## Interface IAction

This interface, `IAction`, provides a central point for connecting your custom logic to the trading framework's events. Think of it as a way to listen for and react to what's happening during backtests and live trading.

You can use these methods to do things like:

*   **Log events:** Keep a record of signals, profits, losses, and more.
*   **Update dashboards:** Display real-time data to monitor your strategy's performance.
*   **Manage state:** Integrate with frameworks like Redux or Zustand to keep your application synchronized.

The interface has several methods, each triggered by a specific type of event:

*   **`signal`, `signalLive`, `signalBacktest`**:  These handle the core signal events during live trading, backtesting, or both.
*   **`breakevenAvailable`, `partialProfitAvailable`, `partialLossAvailable`**: Deal with events related to profit-taking and stop-loss adjustments.
*   **`pingScheduled`, `scheduleEvent`, `pendingEvent`, `pingActive`, `pingIdle`**: Cover events during scheduling and pending signal phases.
*   **`riskRejection`**: Notifies you when a signal fails risk validation.
*   **`orderSync`**:  Called when the system attempts to place limit orders – you can throw errors here to reject the order.
*   **`orderCheck`**:  Verifies the status of pending orders on the exchange, critical for live trading.
*   **`dispose`**:  A cleanup method to unsubscribe from observables and release resources when the action handler is no longer needed.



By implementing these methods, you'll get a detailed stream of events from the trading platform, allowing for advanced customization and integration.

## Interface HighestProfitStatisticsModel

This model holds information about the times your backtest achieved the highest profits. 

It keeps a detailed list of those profitable events, with the most recent ones appearing first. You can also see the total number of times your strategy achieved a peak profit using the `totalEvents` property. Essentially, it's a record of your strategy's best moments in terms of profit generation.


## Interface HighestProfitEvent

This describes a single instance where a trading position reached its highest profit. It stores key details about that event, like the exact time it happened, which trading pair was involved, the name of the strategy used, and a unique identifier for the signal that triggered it.

You'll find information about whether the position was a long or short trade, along with the total profit and loss (PNL) from the trade, as well as the highest profit and maximum drawdown experienced. The record also includes the price at which the highest profit was achieved, the entry price, and the set take profit and stop loss prices. Finally, it indicates if this event occurred during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` is a data structure that lets you know when a trading strategy hits a new peak in profit. It's like getting a notification every time your strategy performs exceptionally well.

You'll receive this data with details such as the trading symbol involved, the current price at that moment, and the precise time of the update. It also includes information about the strategy, the exchange used, the timeframe, and the signal that triggered the trade.

The `backtest` property tells you whether this update came from a simulated test or actual live trading. This lets you treat backtest milestones differently.

Essentially, this contract helps you monitor your strategy's performance and potentially automate actions based on these profit milestones, like setting trailing stops or taking partial profits.

## Interface HeatmapStatisticsModel

This structure provides a comprehensive summary of your trading portfolio's performance across all the assets it holds. It bundles together key statistics, giving you a high-level view of how your portfolio is doing as a whole.

You'll find data like the total profit and loss, Sharpe and Sortino ratios, and the total number of trades executed. It also includes metrics that highlight risk management, such as the maximum drawdown and average fall in profit.

Beyond simple aggregates, there are trade-count-weighted averages that consider how frequently each asset contributes to these overall figures, allowing a more nuanced understanding. The structure also offers insights into trade durations, win/loss streaks, and more advanced ratios like the Calmar and Recovery Factor. Finally, a calculation for extrapolated yearly returns completes the picture, offering an estimate of potential yearly performance based on observed trading frequency.

## Interface DoneContract

This interface represents an event that signals the end of a background process, whether it's a backtest or a live trading execution. It provides details about what just finished, like the exchange used, the name of the trading strategy, and the frame involved (which will be empty for live executions). You'll also find the trading symbol, and crucially, a timestamp indicating *when* the process concluded. In backtesting, this timestamp reflects the last candle processed, while in live mode, it represents the time of the last tick handled.

## Interface CronHandle

This object lets you cancel a scheduled task you previously set up. Think of it as a "stop button" for a recurring action. It's automatically given to you when you register a cron job, and you can use it to remove that job from the scheduler whenever you need to. It's essentially a shortcut for a more complex unregistration process.


## Interface CronEntry

This defines how tasks are scheduled within the backtest-kit framework. Each task, or "CronEntry," needs a unique name to identify it.

The `interval` property determines how often the task runs – it could be every minute, hour, or day, or it can be configured to run only once.

You can specify a list of symbols (`symbols`) to restrict the task to only operate on certain assets. If no symbols are provided, the task will execute once for all assets. If you provide a list, it will execute once for each asset in the list.

Finally, the `handler` is the actual function that gets executed when the task’s conditions are met.

## Interface CriticalErrorNotification

This notification signals a critical, unrecoverable error that necessitates stopping the current process. It’s specifically designed to alert you to situations that demand immediate attention and can't be handled within the normal flow.

Each notification has a unique identifier (`id`) to help you track and diagnose issues.

You'll also receive a detailed error object (`error`) including a stack trace and any relevant metadata, along with a human-readable message (`message`) to explain what went wrong. Finally, the `backtest` flag will always be false, indicating the error originated outside of a backtesting environment.


## Interface ColumnModel

This defines how your data is presented in a table. Think of it as a blueprint for each column you want to display. 

Each column gets a unique `key` for internal identification, a user-friendly `label` that appears as the column header, and a `format` function to transform your raw data into a readable string. 

You can also use `isVisible` to control whether a column should appear at all, potentially based on some condition. This allows for dynamic table generation where columns are shown or hidden as needed.


## Interface ClosePendingCommitNotification

This notification signals that a pending trade, set up but not yet active, has been closed before it ever became a fully open position. It provides a wealth of information about why and how this happened.

It includes details like a unique ID for the notification, when it occurred, and whether it was during a backtest or live trading. You'll find specific information about the trading pair, the strategy that generated the signal, and the exchange involved.

The notification also dives deep into the specifics of the trade itself: the direction (long or short), the prices at which the signal was initially intended to activate, the actual price at which it was closed, and details about any averaging (DCA) or trailing stop-loss/take-profit adjustments that were in place.

You’ll also receive data on the total entries and partial closes, the cost of the initial position, leverage applied, margin type, and the timing of signal creation and activation. Crucially, it includes comprehensive profit and loss (PNL) data, covering peak profit and maximum drawdown metrics, alongside details such as entry and exit prices, and the number of entries involved. A human-readable note field might contain an explanation for the closure. Lastly, the notification records when it was generated internally.

## Interface ClosePendingCommit

This signal signifies the closure of a previously opened position. 

It provides details about the closing transaction, including a unique identifier (closeId) that you can use to track or label the reason for the closure.

You'll also find comprehensive profit and loss information associated with the closed position, like the total P&L, the highest profit achieved, and the largest drawdown experienced. These metrics give you insight into the performance of the position throughout its lifetime.

## Interface CancelScheduledCommitNotification

This notification signals that a scheduled trading signal was cancelled before it could be activated. It provides detailed information about the signal and the circumstances surrounding its cancellation.

You'll find key details like the unique identifier of the signal, the timestamp of the cancellation, and whether it occurred during backtesting or live trading.  The notification also includes specifics about the trade itself – the trading pair, the intended direction (long or short), the target entry price, and the stop-loss and take-profit levels.

It goes further, offering a comprehensive look at the potential position's performance, including potential profit/loss calculations, peak profit, maximum drawdown, and the original prices set before any adjustments. There’s also information about the strategy that generated the signal and details about any partial executions or averaging that might have occurred. Finally, a note field allows for optional human-readable explanations of the cancellation reason.

## Interface CancelScheduledCommit

This interface represents a request to cancel a previously scheduled signal event. It's used when you need to stop a signal from being sent, perhaps because circumstances have changed. 

The `action` field always indicates that this is a cancellation request.

You can optionally include a `cancelId` to provide a reason or identifier for the cancellation, which helps with tracking.

Along with the cancellation request, you're also providing details about the position being cancelled, including the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). This information gives context to the cancellation and helps in understanding the trading performance.


## Interface BreakevenStatisticsModel

This model holds information about breakeven points reached during a trading backtest. 

It keeps track of individual breakeven events, giving you a list of exactly when those milestones were hit and all the details surrounding them. 

You'll also find a simple count of the total number of breakeven events that occurred. This helps in understanding how frequently breakeven was achieved during the backtest.

## Interface BreakevenEvent

This data structure holds all the important information about when a trading signal reached its breakeven point. It’s used to generate reports and analyze performance.

Each `BreakevenEvent` includes details like the exact time it happened (`timestamp`), the trading pair involved (`symbol`), and the name of the strategy that generated the signal (`strategyName`). You’ll find the signal's unique identifier (`signalId`) as well as whether it was a long or short position (`position`).

Crucially, it logs the current market price at breakeven (`currentPrice`), the entry price (`priceOpen`), and any predefined take profit and stop loss levels (`priceTakeProfit`, `priceStopLoss`, `originalPriceTakeProfit`, `originalPriceStopLoss`).

If the signal used a dollar-cost averaging (DCA) strategy, you’ll see the total number of entries (`totalEntries`), partial executions (`totalPartials`), and the original entry price before averaging (`originalPriceOpen`).  You'll also find information about executed partials (`partialExecuted`), unrealized profit and loss (`pnl`), and any notes explaining why the signal was triggered (`note`). 

Finally, it records when the position became active (`pendingAt`), when the signal was initially created (`scheduledAt`), and whether the event occurred during a backtest or live trading (`backtest`).

## Interface BreakevenContract

The `BreakevenContract` represents a significant milestone in a trading strategy – when a signal's stop-loss is moved back to the original entry price. This signifies that the trade has become risk-neutral, having recovered initial costs.

It's a key event emitted when a signal achieves breakeven, allowing you to monitor your strategy's safety and track risk reduction. The system ensures this event happens only once per signal, preventing duplicates.

Each `BreakevenContract` carries details about the trade, including the trading symbol, the strategy name, the exchange used, and the timeframe involved. You'll also find the full signal data, the price that triggered the breakeven, and whether it happened in a backtest or live environment.

Finally, it includes the exact time the breakeven was reached - either the virtual time of the candle in a backtest or the real-time clock when it occurred during live trading. This information is valuable for analysis and reporting.

## Interface BreakevenCommitNotification

This notification tells you when a breakeven point has been reached for a trading position. It’s triggered when a trading strategy hits a predefined breakeven level, essentially meaning the initial investment has been recovered.

Here's a breakdown of the information provided:

*   **Identification:** A unique ID and timestamp help track when and where this breakeven event happened, including whether it was in a backtest or live trading environment.
*   **Trade Details:** It provides critical information about the trade, like the symbol (e.g., BTCUSDT), the strategy used, the exchange, and the signal identifier.
*   **Price Points:**  You'll find key prices like the entry price, take profit, stop loss, and the current market price at the time of the breakeven.
*   **Position Information:** It clarifies the trade direction ("long" or "short"), along with details on the original entry and stop-loss prices before any adjustments (like trailing stops).
*   **Cost & Leverage:** It details the initial investment amount, any leverage applied, and information about how the position was constructed.
*   **Performance Metrics:** This notification contains a wealth of performance data, including peak profit, maximum drawdown, total profit/loss, and related price points. It's a snapshot of the position’s performance history.
*   **Additional Details**: Information about partial closes, total entries and a description note provide deeper context on trade details.
*   **Timestamps**: The timing of the signal, when it became pending and when this notification was created are also included.

## Interface BreakevenCommit

The `BreakevenCommit` event signals that a trading position is being adjusted to breakeven. It provides a snapshot of the position's performance and key price points at the time of this adjustment.

You'll find details like the current market price, the overall profit and loss (PNL) of the trade, and the highest profit and biggest drawdown experienced.

The event also tells you the direction of the trade (long or short), the initial entry price, and the original take profit and stop loss levels before any modifications.

Crucially, it includes the timestamp when the signal was created and when the position was initially activated. This helps track the sequence of events leading to the breakeven adjustment.

## Interface BreakevenAvailableNotification

This notification signals that your trading position's stop-loss can now be moved to the entry price, essentially breaking even. It provides a wealth of information about the position, including a unique identifier, when it happened, and whether it's from a backtest or live trading.

You'll find details like the strategy name, exchange, and current market price, along with key metrics like peak profit, maximum drawdown, and P&L percentages. It also breaks down the trade specifics, like whether it’s a long or short position, the original and adjusted entry and stop-loss prices, and the number of entries and partial closes. 

Further details include cost, leverage, margin settings, and even optional notes explaining the reasoning behind the signal. You can also see the timestamps related to the signal's creation, pending status, and the notification itself. Essentially, this notification gives you a comprehensive snapshot of the position’s status and performance.

## Interface BeforeStartContract

The `BeforeStartContract` event marks the beginning of a trading strategy run. It's triggered right before the strategy starts processing data for a particular trading symbol, after initial checks but before any actual market data is analyzed. Think of it as a signal that the engine is ready to begin the historical replay or live trading process.

This event is guaranteed to happen only once per run and is always accompanied by an `AfterEndContract` later on, even if something unexpected interrupts the process. Any errors that occur while you're reacting to this event won't halt the run, they'll be handled separately.

You can use this event to perform setup tasks like initializing log files, resetting counters used specifically for this run, or sending a notification that the run has begun.

The information provided includes the trading symbol, the name of the strategy being used, the exchange providing the data, the timeframe of the run, whether it’s a backtest or live run, the current price of the asset, and the precise time of the event. When it's a backtest, the "when" time represents the intended start of the historical data, while in live trading it reflects the current time. The timestamp offers the same information as "when" but in milliseconds for easier use and data transfer.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtesting results, giving you a comprehensive view of your strategy's performance. It contains a list of all individual trades and a wide range of statistical measures, like win rate, average profit/loss, and standard deviation, to assess risk and return. Several key indicators, such as Sharpe Ratio and Calmar Ratio, help evaluate risk-adjusted performance.

You’ll also find insights into trade duration, consecutive win/loss streaks, and market pressure. Trend analysis gives a sense of the overall market direction, while confidence metrics show how reliable that trend assessment is.  The presence of many “null if unsafe” values means caution should be used when interpreting certain metrics where the data might be skewed or insufficient.

## Interface AverageBuyCommitNotification

This notification provides detailed information whenever a new averaging (DCA) entry is added to an existing trade. It's like a log entry letting you know exactly when and how your DCA strategy is adjusting your position. 

Each notification includes a unique ID, a timestamp, and whether it's from a backtest or live trading scenario. You'll find information about the traded symbol, the strategy that generated the signal, and the exchange used.

The notification breaks down the specifics of the averaging entry – the price, cost, and how it impacts the overall average entry price. It also tracks key performance metrics like total profit, peak profit, and maximum drawdown, helping you understand how the DCA strategy impacts your portfolio's risk and reward. You'll find original entry prices, stop-loss and take-profit levels before and after any adjustments, as well as details on slippage and fees. Additional notes and timestamps related to signal scheduling and pending times are also provided for a complete picture of the trade's lifecycle.

## Interface AverageBuyCommit

This event, called AverageBuyCommit, signals that a new averaging buy has been executed within a trading position. It provides detailed information about this averaging action, including the current price at which the buy occurred and the total cost of that specific buy.

You'll also find the effective average entry price, reflecting the position's updated price after incorporating the new buy. The event includes real-time profit and loss (pnl) data, tracking both the current unrealized pnl and the peak profit achieved so far. 

Key historical performance metrics like maximum drawdown are also presented, offering a comprehensive view of the position's performance.  It retains the original entry price as a reference point and provides the current, potentially adjusted, take profit and stop-loss prices, along with their original values before any trailing adjustments. Finally, it documents when the signal was generated and when the position was activated.

## Interface AfterEndContract

This interface signals the completion of a trading strategy execution, whether it's a backtest or a live trade. It's a guaranteed event that fires once per strategy run, letting you handle cleanup tasks like flushing data, closing connections, or sending notifications.

You'll receive details about the trade, including the symbol, strategy name, exchange, and frame used. A key property is `backtest`, indicating whether the run was a simulation or a live trade, allowing you to adjust your cleanup actions accordingly.

The `when` property tells you exactly when the run ended – in backtests, it represents the time of the last candle processed, and in live mode, it’s the current time rounded to the nearest minute. You’ll also get the `currentPrice` at the end for reference and a `timestamp` for easy serialization. This event provides a reliable way to perform any necessary post-run actions and ensures they are executed precisely once.

## Interface ActivePingContract

The ActivePingContract provides a way to track the status of active, pending signals during monitoring. It sends out a ping event roughly every minute while a signal is still active and hasn’t been closed.

These pings contain a wealth of information, including the trading symbol, the strategy name, and the exchange involved. They also provide details about the timeframe (frameName) and the complete data of the pending signal.

You’ll find information about the current market price, whether the execution is a backtest or live, and precise timestamps for when the ping occurred. This data is invaluable for creating custom logic to manage signals based on real-time or historical conditions.

The `when` property is particularly important - it represents the time of the ping, which is the current time in live mode, but the candle timestamp in backtest mode. Essentially, this allows you to react to the signals’ lifecycle and adjust your trading strategy accordingly.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning the trading system has started executing it. It's triggered when a user manually initiates a scheduled signal, bypassing the usual price check.

The notification provides a wealth of details about this activation, including a unique ID, the exact time it happened, and whether it's a backtest or live trade. You'll find information about the trading pair, the strategy used, and the exchange involved.

Crucially, it contains all the key parameters of the trade itself: the position direction (long or short), entry price, take profit, stop loss levels, and details on any averaging or partial closing strategies.

It also includes performance metrics like total profit/loss (PNL), peak profit, and maximum drawdown, along with the prices and costs associated with these events.  Finally, you’ll see the original signal creation time, the pending time, and the current market price at the time of activation – all valuable data points for understanding the trade's context. A human-readable note can provide extra insight into the signal's rationale.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a previously scheduled trading signal is activated. It carries details about the trade being executed, providing a record of its key parameters and performance metrics up to that point.

You’ll find information about the trade’s direction – whether it's a long (buy) or short (sell) position. It also includes the entry price, take profit levels (both the original and any adjusted values due to trailing stops), and stop-loss levels, again with original and adjusted values.

The `pnl`, `peakProfit`, and `maxDrawdown` properties give you insight into the trade's financial performance; `pnl` shows the total profit or loss, `peakProfit` identifies the highest profit achieved, and `maxDrawdown` reveals the largest loss experienced. A unique identifier (`activateId`) is provided for tracking and user context, alongside timestamps reflecting when the signal was initially created (`scheduledAt`) and when the position was activated (`pendingAt`). Finally, the `currentPrice` provides the market price at the time of activation.
