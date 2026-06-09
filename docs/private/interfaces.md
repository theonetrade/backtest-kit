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

This interface defines the information shared when a walker is being stopped. It’s used to signal that a particular trading strategy and walker needs to be halted.

When a walker needs to be interrupted, this structure contains details like the trading symbol involved, the name of the strategy being stopped, and the specific walker that’s being stopped.

This is particularly useful when you have multiple walkers active on the same trading symbol because it lets you precisely target which walker should be stopped.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of your backtesting experiments. It’s essentially a container that holds all the information you need to compare different trading strategies. 

Think of it as a way to clearly present all the results you’ve gathered—it includes the individual performance of each strategy you tested, making it easier to see how they stack up against one another.  It builds upon the basic WalkerResults, adding features to make strategy comparisons more straightforward.


## Interface WalkerContract

The WalkerContract represents progress updates as your trading strategies are being compared against each other. It’s like a report card given out after each strategy finishes a test run.

Each report contains details such as the name of the strategy that just completed, the exchange and symbol being tested, and important performance statistics like profit/loss and drawdown.

You'll also see how well this strategy performed relative to the best one found so far – including its metric value and the name of the leading strategy.

Finally, the contract keeps track of how many strategies have been tested and how many are left to go, giving you a sense of how much longer the comparison will take.

## Interface WalkerCompleteContract

The WalkerCompleteContract signifies the completion of a backtesting process, indicating all strategies have been evaluated and the final results are ready. It bundles together key information about the backtest run, like the name of the walker that performed the test, the trading symbol being analyzed, and the exchange and timeframe used. 

You'll find details on the optimization metric, the total number of strategies tested, and crucially, which strategy emerged as the best performer. This contract also includes the metric value achieved by the best strategy and a comprehensive set of statistics for that top-performing strategy. It's your one-stop shop for understanding the outcome of a full backtest comparison.

## Interface ValidationErrorNotification

This notification lets you know when a validation check fails during your backtesting or live trading. It's a signal that something went wrong with your risk management rules. 

Each notification has a unique ID, a detailed error message you can understand, and information about the specific error that occurred, including a stack trace. The `backtest` property will always be false, indicating that the error happened during a live or simulated live environment, not a true backtest run. You can use this notification to debug and improve your trading strategies.

## Interface ValidateArgs

The `ValidateArgs` interface provides a way to ensure that the names you're using for different components of your backtest – like the exchange, timeframe, strategy, risk profile, action handler, sizing strategy, and parameter sweep – are actually valid. Think of it as a checklist to prevent typos or errors when setting up your backtests. 

Each property within `ValidateArgs` represents one of these components, and expects a type that can be validated against a predefined list of allowed values. This helps to maintain consistency and prevents unexpected behavior due to incorrect names. Essentially, it's a tool to make sure everything is spelled correctly and refers to something that exists within your backtest setup.

## Interface TrailingTakeCommitNotification

This notification tells you when a trailing take profit order has been executed. It's a signal that a trade has closed based on your trailing take profit strategy.

The `type` clearly identifies it as a "trailing_take.commit" notification.  You'll find a unique `id` for tracking purposes, along with the `timestamp` of when this action occurred.

It indicates whether the trade happened in a backtest environment (`backtest: true`) or a live trading scenario (`backtest: false`). The details of the trade are provided: the `symbol` (like BTCUSDT), the `strategyName` that triggered it, and the `exchangeName` where it took place.

You’ll also get key data like the `signalId`,  `percentShift` of the original take profit, the `currentPrice` at execution, the trade `position` (long or short), and important prices like `priceOpen`, `priceTakeProfit`, and `priceStopLoss`, alongside their original values before trailing adjustments.

Detailed performance metrics are included: `totalEntries` and `totalPartials` indicating the complexity of the trade, plus comprehensive Profit & Loss data (`pnl`, `peakProfit`, `maxDrawdown`, percentages, and related prices).  You can see how the position performed, including its peak profit and maximum drawdown.

There’s even a human-readable `note` field for any explanation about the trade’s reasoning, along with timestamps for when the signal was scheduled, became pending, and when the notification itself was created.

## Interface TrailingTakeCommit

This object represents a trailing take profit event within the backtest-kit framework. It details a situation where a take profit level has been adjusted based on a trailing percentage.

The `action` property confirms this is a trailing take event.

You’ll find key information about the trade itself here: the direction (`position`), the initial entry price (`priceOpen`), and the currently adjusted take profit (`priceTakeProfit`) and stop loss (`priceStopLoss`) prices. Crucially, the original, pre-trailing take profit (`originalPriceTakeProfit`) and stop loss (`originalPriceStopLoss`) are also provided.

The data also includes performance metrics for the position, such as the profit and loss (`pnl`), the highest profit reached (`peakProfit`), and the maximum drawdown. 

The `currentPrice` tells you the market price at the time of the trailing adjustment, alongside timestamps indicating when the signal was created (`scheduledAt`) and when the position was activated (`pendingAt`).

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of detail about the trade, including the trading pair, the strategy used, and whether it happened during a backtest or live trading. You'll find information like the original and adjusted stop-loss and take-profit prices, along with key performance indicators (KPIs) such as peak profit, maximum drawdown, and overall profit and loss (P&L) figures. 

It breaks down the trade's history, showing how many entries and partials were involved, and even gives you the entry and exit prices used to calculate the P&L.  You'll also see details around potential slippage or fees. 

Essentially, this notification offers a complete picture of the trailing stop event and its financial impact. It helps you understand how your strategy performed and identify areas for potential optimization. You can see exactly when the signal was created, when it became pending, and when the execution happened.

## Interface TrailingStopCommit

This data structure represents a trailing stop order being triggered. It contains all the relevant information about the trade at the moment the trailing stop was activated, including the direction of the trade (long or short), the original entry price, and the original take profit and stop loss prices.  You'll also find the current price that triggered the stop, as well as the current profit and loss (pnl) and the peak profit and maximum drawdown the position has experienced.  The `percentShift` indicates how much the stop loss was adjusted. Finally, it includes timestamps for when the signal was created and when the position was initially activated.

## Interface TickEvent

This describes the `TickEvent` data structure, a central way to represent all kinds of events happening during a trading process. Think of it as a standardized record for everything from a trade being scheduled to being closed, or even canceled.

Each `TickEvent` has a timestamp marking when it occurred, and an `action` property that clarifies what kind of event it is—whether it's a new trade being opened, a signal being scheduled, or a position being closed.

The event also contains details specific to the situation, such as the trading symbol, a unique signal ID, the position type, and any notes associated with the signal.

You’ll find price-related information like the current price, entry price, take profit levels (both original and modified), and stop-loss levels. Information about DCA averaging, partial closes, and potential profit/loss are also included.

For completed trades, you can find closure reasons, durations, and performance metrics such as peak and fall profit percentages. Lastly, timestamps for when the trade went pending or was initially scheduled are also available.

## Interface SyncStatisticsModel

This model holds information about the synchronization of signals within the backtest. It's designed to help you monitor how effectively signals are being synced and identify potential issues. 

You'll find a complete list of all synchronization events, along with their details, in the `eventList` property. 

The `totalEvents` property simply tells you the overall number of synchronization events that occurred. 

Finally, `openCount` and `closeCount` provide specific numbers for signal-open and signal-close events respectively, allowing you to analyze the frequency of these actions.

## Interface SyncEvent

This data structure holds all the details about what happened during a trading signal's lifecycle, making it easy to generate reports. Each event records key information like when it happened (`timestamp`), which trading pair was involved (`symbol`), and the name of the strategy and exchange that created it.

You'll find specifics about the signal itself, such as its unique identifier (`signalId`) and the action taken (like opening or closing a position – `action`). It also includes the price at the time of the event (`currentPrice`), whether the trade was a long or short (`position`), and all the price levels used for profit taking and loss protection (`priceTakeProfit`, `priceStopLoss`, etc.).

If the signal used a DCA (Dollar-Cost Averaging) strategy, you can see how many entries and partials were involved (`totalEntries`, `totalPartials`). 

The object also provides performance metrics like total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest loss experienced (`maxDrawdown`). If the position was closed, the `closeReason` explains why.  A flag indicates whether the event occurred during a backtest (`backtest`). Finally, there’s a timestamp showing when the event was initially recorded (`createdAt`).

## Interface StrategyStatisticsModel

This model holds the statistical information gathered during a backtest, giving you a breakdown of different strategy actions taken. It includes a detailed list of every event that occurred, allowing for in-depth analysis.

You'll find counts for various event types such as cancels, closes, partial profits and losses, trailing stops, and breakeven triggers. It also tracks events related to scheduled activations and average buy (DCA) orders. The total number of events is also included, offering a simple overview of activity.

## Interface StrategyEvent

This data structure provides a central place to record everything that happens during a trading strategy's execution, whether it's a backtest or a live trade. Each event holds details like the exact timestamp, the trading pair involved, the name of the strategy, and the exchange being used. You'll find information about the signal that triggered the action, the type of action taken (like buying, selling, or setting a stop-loss), and the current market price at that moment.

For actions involving closing positions, it includes information about the percentage to close and any shifts applied through trailing stops. If an action was scheduled or cancelled, identifiers are provided to track its status. The `createdAt` field provides an exact timestamp of when the action was initially created, and a `backtest` flag clarifies whether the event occurred during a simulated or live trading environment. 

The data also details the position's direction (long or short), entry price, take profit and stop-loss levels, and any adjustments made to those levels.  For strategies employing DCA (Dollar-Cost Averaging), extra fields track the total entries and the effective averaged price. Finally, a `note` field allows for adding custom information related to the event, and the P&L (Profit and Loss) is recorded at the time of the action.

## Interface SignalSyncOpenNotification

This notification tells you when a scheduled order (like a limit order) from your trading strategy has been activated and a position has been opened. It provides a wealth of information about the trade, including when it happened, whether it occurred during backtesting or live trading, and the specific symbol and strategy involved. You’ll find details about the trade's performance, such as profit and loss (both absolute and as a percentage), peak profit achieved, and maximum drawdown experienced. It also includes key pricing data, like the entry price, take profit and stop loss levels, and the number of entries and partials executed. Finally, you can see details about when the signal was created and when the position was actually opened, along with any notes that were added to explain the trade.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it’s from a backtest or a live trade. It provides a detailed breakdown of what happened to the trade, including when it was closed and why. You'll find information like the signal's ID, the trading pair involved, and the strategy that generated it. 

The notification also gives you key performance data, like the total profit or loss (both in USD and as a percentage), the peak profit achieved, and the maximum drawdown experienced. It even includes details like the entry and exit prices used for those calculations.

Beyond the core profit/loss figures, you'll also see specifics about original take profit and stop loss levels, the number of entries and partials executed, and the timestamps for when the signal was created, activated, and closed. This allows a comprehensive understanding of the signal's lifecycle and performance.

## Interface SignalSyncBase

This interface defines the common information found in all signal synchronization events within the backtest-kit framework. Each signal event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated it, and the exchange it was executed on. 

You'll also find the timeframe used (relevant for backtesting), a flag to indicate whether the event originated from a backtest or live trading, and a unique identifier for each signal. The timestamp represents when the signal was generated, and the entire public signal data is included for full context. Think of it as a standardized container holding the core data needed to track and understand signal events.

## Interface SignalScheduledNotification

This notification tells you when a trading signal is planned for future execution, kind of like a reminder for an order. It includes a unique ID, the time it's scheduled, and whether it's happening in a simulated backtest or live trading.

You'll find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, and the exchange it's going through.  The notification also specifies the trade direction (long or short), target prices for entry, profit, and stop-loss, and even the original prices before any adjustments.

For more advanced tracking, the notification includes information about DCA averaging (how many entries), partial closes, cost, and profit/loss (PNL) metrics like peak profit and maximum drawdown.  It provides price and cost details related to profit and loss, along with timestamps indicating when things occurred, and even a note to explain the reasoning behind the signal.

## Interface SignalOpenedNotification

This notification signals that a new trade has been opened. It provides a wealth of information about the trade, including a unique identifier, when it happened, and whether it occurred during a backtest or live trading. You'll find details about the trading symbol, the strategy that initiated the trade, and the specific exchange used.

The notification also breaks down the trade itself, specifying the position type (long or short), the entry price, and any take profit or stop-loss levels. It includes information about any dollar-cost averaging (DCA) that occurred, showing the number of entries and partial closes.

Beyond the basic trade parameters, this notification offers key performance metrics. You can track the total profit/loss (PNL), peak profit achieved, maximum drawdown, and related prices and percentages.  Detailed insights into how slippage and fees influenced PNL calculations are also present. Finally, there’s an optional note field for a human-readable explanation of the trading signal’s reasoning, and timestamps representing signal creation, pending status, and data creation.

## Interface SignalOpenContract

This event, `SignalOpenContract`, tells you when a pre-planned trade, a limit order, has actually been executed on the exchange. It's like confirmation that your order to buy or sell at a specific price was filled.

This event is particularly useful for keeping external systems in sync, such as order management tools or logging processes, ensuring everyone's on the same page about what's happening.

The event provides a wealth of information about the trade: the current market price, the total profit and loss (PNL), the highest profit reached, the biggest loss experienced, the overall cost of getting into the position, and the original prices for take profit and stop loss. It also includes details about how the position was built, like whether it was a single entry or involved averaging, and the timestamps for scheduling and activation. Understanding the various price properties helps in evaluating trade performance and adjusting strategies.

## Interface SignalInfoNotification

This notification type helps you receive informational updates from your trading strategies, essentially letting you know what's happening with open positions. It’s designed to provide extra context beyond just trade signals.

Think of it as a way for your strategy to "chat" with you about a position – perhaps explaining a particular decision or highlighting a key metric.

Each notification includes a ton of detail, such as the trade direction (long or short), entry and stop-loss prices, and key performance indicators (KPIs) like peak profit, maximum drawdown, and the total profit/loss. You'll also find information about DCA entries and partial closes, plus details about slippage, fees, and the timing of events.

The `note` property is particularly useful as it allows strategies to pass custom messages, providing a more nuanced understanding of the trade's rationale. Finally, identifiers like `notificationId` allow you to link these notifications to other systems for tracking and analysis.

## Interface SignalInfoContract

This interface defines the structure of information shared when a trading strategy wants to send out custom notifications about its actions. Think of it as a way for strategies to broadcast messages related to their trading decisions, such as order placement or adjustments.

These notifications contain details like the trading symbol (e.g., BTCUSDT), the name of the strategy generating the message, and the exchange and frame used for execution. You'll also find comprehensive data about the signal itself, the current market price at the time of the event, and any custom notes or identifiers attached by the strategy. 

The notification also indicates whether the event came from a backtest (using historical data) or a live trading session. Finally, a timestamp specifies precisely when the event occurred, with the meaning of the timestamp changing slightly depending on whether it's a live or backtest event. This allows for external systems to listen for these notifications and react accordingly, like logging or displaying custom information.

## Interface SignalData$1

This interface defines the structure of a single trading signal's performance data used for generating reports. Think of it as a record of one completed trade. 

Each record includes details like which strategy created the signal, a unique identifier for that signal, and the symbol being traded (like BTC/USD). 

You'll also find information about whether the position was a long or short, the profit and loss (PNL) expressed as a percentage, and the reason the trade was closed.  Finally, the data tracks the exact times the trade was opened and closed, giving a complete timeline of the signal's lifecycle.

## Interface SignalCommitBase

This defines the basic information that will be included in every signal commitment event, whether it's happening during a backtest or a live trade. Each signal has a symbol, like "BTCUSDT," and a name identifying the strategy that created it. You’ll also find the exchange used and the timeframe of the signal.

It tells you whether the signal originated from a backtest or a real-time live trade. Every signal is given a unique ID and a timestamp to precisely track when it happened. 

The number of entries and partial closes is tracked, giving insight into the DCA (Dollar-Cost Averaging) and partial closing strategy. You can see the original entry price, the full signal data, and optionally, a note to explain the reasoning behind the signal.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was because of a take profit, stop loss, or some other reason. It provides a wealth of information about the trade, including a unique identifier, the time it closed, whether it occurred in backtest or live mode, and the specific symbol and strategy involved. You'll find details like the entry and exit prices, original target prices, and how many times the position was averaged or partially closed. 

The notification also includes comprehensive profit and loss (PNL) data, tracking peak profit, maximum drawdown, and all related prices, costs, and entry counts.  It breaks down the position's duration and includes optional notes for added context.  Finally, you can find timestamps for signal creation, pending status, and the creation of the tick result itself, giving a complete timeline of the position's lifecycle.

## Interface SignalCloseContract

This event notifies you whenever a trading signal you're following has been closed, whether that's because a profit target was hit, a stop loss was triggered, time ran out, or you manually closed it. It’s designed to help external systems keep track of trades and record financial results.

The event provides a wealth of information about the closed position, including the current market price, the total profit or loss, the highest profit achieved, and the largest drawdown experienced. You'll also get details about the original and effective entry, take profit, and stop-loss prices, along with timestamps marking when the signal was created and the position activated. 

It also specifies the trade direction (long or short), the reason for closure, and the number of times the position was averaged or partially closed, offering a complete picture of the trade’s lifecycle. This allows for detailed auditing and reconciliation with external order management systems.

## Interface SignalCancelledNotification

This notification tells you when a signal that was planned for execution was cancelled before it actually happened. It provides a wealth of information about the cancelled signal, helping you understand why it was stopped. You’ll find details like the signal’s unique identifier, the strategy that generated it, and the trading pair involved.

It also includes specifics about the intended trade, such as the planned take profit and stop loss prices, along with the original entry price before any averaging.  You can see the reason for cancellation, whether it was due to a timeout, price rejection, or user intervention. Furthermore, it tracks when the signal was scheduled, when it entered a pending state, and the duration it spent waiting before being cancelled, giving valuable context for analysis and debugging.

## Interface Signal

The `Signal` object holds key information about a trading position. It tracks the initial entry price, which is represented by the `priceOpen` property.

You'll also find details about any entries made into the position, stored in the `_entry` array. Each entry record includes the price at which the trade was initiated, the associated cost, and the timestamp of the entry.

Finally, the `_partial` array keeps a record of any partial exits from the position, noting whether the partial exit resulted in a profit or a loss. This record includes the percentage gained or lost, the price at the time of the partial exit, the cost basis at the time of closure, the number of shares/contracts at closure, and the timestamp.

## Interface Signal$2

This section describes the `Signal$2` object, which represents a trading signal within the backtest-kit framework. 

It holds key information about a trade, starting with the `priceOpen`, which tells you the price at which the position was initially entered.

The `_entry` property is an array of objects, each recording details about a specific entry point into the position, including the price, total cost, and the time of the entry. 

Similarly, `_partial` tracks any partial exits from the position, noting whether the exit was for profit or loss, the percentage of the position closed, the price at which it was closed, the cost basis at the time, and the number of units sold. This provides a detailed history of how the position was managed.

## Interface Signal$1

This section describes the `Signal$1` object, which is used within the backtest-kit framework to represent a trading signal.  It holds key information about a position.

The `priceOpen` property tells you the initial price at which the position was opened.

The `_entry` property is an array, documenting each time a position was entered, including the price, the cost associated with entering, and a timestamp for when it occurred.

Finally, `_partial` tracks any partial exits from the position, noting the type of exit (profit or loss), the percentage change at the time of exit, the price at exit, the cost basis at closure, the number of shares/contracts closed, and the timestamp.

## Interface ScheduledEvent

This data structure holds all the details about trading events – when they were scheduled, opened, or cancelled. It's like a comprehensive record for generating reports and understanding your trading history.

Each event includes a timestamp, the type of action taken (opened, scheduled, or cancelled), and information specific to the trade like the symbol, signal ID, and position type. 

You'll also find pricing information like the entry price, take profit, stop loss, and their original values if they were adjusted. It tracks details about partial closes and DCA entries if they were used.

For cancelled events, there's a reason code and a unique ID for user-initiated cancellations.  Events that are opened will have a timestamp marking when the position became active, and all events note when they were initially scheduled. The unrealized profit and loss (PNL) is also included for each event. Finally, for cancelled or opened positions, you can see how long they lasted.

## Interface ScheduleStatisticsModel

This model holds key statistics about your scheduled trading signals. 

It provides a snapshot of how your scheduled signals are performing, tracking things like how many signals you've scheduled, how many have been activated, and how many have been cancelled.

You can see a complete list of all scheduled events with detailed information within the `eventList` property.

Crucially, it also shows you important performance indicators like cancellation and activation rates, which help you understand the efficiency of your scheduling. 

The `avgWaitTime` and `avgActivationTime` properties offer insights into the typical time delays involved in signal cancellation and activation, respectively.

## Interface SchedulePingContract

This defines what happens when a scheduled signal is actively being monitored – that's a signal that isn't canceled or activated yet. Every minute, a "schedule ping" event is sent out, giving you a snapshot of the signal's status and current market conditions.

You can listen for these events to keep track of your scheduled signals or build custom monitoring tools.

Each ping includes details like the trading symbol, the name of the strategy using the signal, the exchange it's on, and the timeframe.

You’ll get the full data for the signal, including open price, take profit, and stop loss levels, as well as the current market price at the time of the ping. 

There's also a flag to tell you whether the ping is happening in a backtest (using historical data) or live trading.  Finally, a timestamp lets you know exactly when that ping occurred.

## Interface RiskStatisticsModel

This model holds key statistics about risk events, allowing you to monitor and understand your risk management processes. It contains a detailed list of all risk rejection events, providing access to the specifics of each one. You'll also find the total count of rejections, a breakdown of rejections categorized by trading symbol, and another breakdown by the strategy employed. These groupings help pinpoint areas needing attention and optimize your risk controls.

## Interface RiskRejectionNotification

This notification tells you when a trading signal was blocked because of risk management rules. Each notification has a unique ID and timestamp, indicating when the rejection happened. You’ll also find details about whether this occurred during a backtest or live trading, the symbol being traded (like BTCUSDT), and the name of the strategy that generated the signal.

The notification includes a description explaining why the signal was rejected. Further, it provides valuable context like the number of active positions, the current market price, and the intended trade direction (long or short). You'll also see information about the proposed entry price, take profit target, and stop-loss levels. If applicable, it will also provide the signal’s estimated duration and a description of why the signal was generated. Finally, a creation timestamp is included for tracking purposes.

## Interface RiskEvent

This data structure holds information about when a trading signal was blocked due to risk management rules. It’s essentially a record of why a trade didn't happen.

Each `RiskEvent` includes details like the exact time of the event, the trading pair involved, the specifics of the signal that was rejected, and the name of the trading strategy and exchange used.

You'll also find data about the current market price at the time, how many positions were already open, and a unique ID for tracking the rejection.  A note explains the reason for the rejection itself.

Finally, it indicates whether the event occurred during a backtest or in a live trading environment.


## Interface RiskContract

This object represents a situation where a trading signal was blocked because it violated risk rules. It's designed to help you keep track of these rejections, specifically focusing on instances where your risk controls actually intervened.

Each `RiskContract` contains key information like the trading symbol (e.g., BTCUSDT), the details of the signal that was rejected, the name of the strategy that generated it, and the timeframe it applied to. You'll also find details such as the current market price, the number of existing positions, and a unique ID for the rejection itself.

A descriptive note explains *why* the signal was rejected, which can be helpful for troubleshooting and understanding risk violations. The object also indicates whether the rejection occurred during a backtest or in live trading, and includes a timestamp to pinpoint when it happened. Services like reporting tools, or user callbacks, use this data to monitor risk management effectiveness.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you keep an eye on how a background task, specifically a walker, is progressing. Think of a walker as a process that goes through a list of trading strategies, evaluating them. 

This contract provides updates during that process.

It tells you the name of the walker, the exchange being used, and the frame involved. 

You'll also get details about the total number of strategies it needs to check and how many it's already finished. Finally, it gives you a percentage completion number (from 0 to 100) so you can easily see how close it is to being done.

## Interface ProgressBacktestContract

The `ProgressBacktestContract` helps you monitor the progress of your backtest runs. It provides key details about what's happening behind the scenes during a backtest, like the exchange and strategy being used, and the specific trading symbol. 

You'll see updates including the total number of historical data points (frames) the backtest will analyze, and how many have already been processed. 

Finally, a percentage completion value lets you easily track how far along the backtest is. This information is especially useful for long backtests to understand the estimated time remaining.


## Interface PerformanceStatisticsModel

This model holds performance statistics gathered from a specific trading strategy. It tells you the strategy's name, the total number of performance events that were recorded, and the overall time it took to calculate those statistics. 

You'll also find a breakdown of the statistics categorized by the type of metric being measured. 

Finally, it provides access to the complete list of raw performance events that contribute to these statistics.

## Interface PerformanceContract

The `PerformanceContract` helps you understand how your trading strategies and system are performing over time. It’s like a detailed logbook that records key events during the trading process.

Each entry in this logbook, called a "performance event," tracks things like how long different parts of your strategy take to execute, and when those events happened. You can use this information to pinpoint areas where your code might be slow or inefficient.

The performance events are tagged with important details such as the specific strategy being used, the exchange and symbol involved, whether it’s a backtest or live run, and even the name of the data frame being processed. By looking at these events, you can easily identify bottlenecks and optimize your overall trading system. The `previousTimestamp` allows for calculating the duration between consecutive events.

## Interface PartialStatisticsModel

This model holds information about partial profit and loss events during a trading simulation. Think of it as a snapshot of how your strategy performed at specific milestones.

It keeps track of every individual event that occurred, providing a detailed list in the `eventList` property. 

You can also see the total number of events, how many resulted in a profit, and how many resulted in a loss using the `totalEvents`, `totalProfit`, and `totalLoss` properties, respectively. This allows you to analyze the frequency of gains and losses within your backtest.


## Interface PartialProfitContract

This describes a `PartialProfitContract`, which represents a signal achieving a profit milestone during trading. Think of it as a notification that a strategy has reached a certain level of profit, like 10%, 20%, or 30% gain.

This contract provides detailed information about the event, including the trading symbol, the name of the strategy being used, and the exchange it's running on.  It also includes the original data related to the trade, the current price when the milestone was hit, and the specific percentage profit level reached. 

The system ensures these notifications are unique, preventing duplicates.  You can use these events to track how your strategies are performing and to create reports about partial profit executions.  The `backtest` flag tells you whether the data comes from a historical simulation or live trading, and the `timestamp` provides a record of exactly when that milestone was achieved, using the tick time in live mode or the candle timestamp during backtests.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit commitment has been executed within your trading strategy. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading.

You’ll find details about the trading pair, the strategy that generated the signal, and the exchange used. Crucially, it outlines the percentage of the position closed, the current price at the time, and the trade direction (long or short).

The notification also includes the original entry price, take profit, and stop-loss levels, along with any adjustments made due to trailing.  You can also see details related to DCA averaging, including the number of entries and partials.

Detailed profit and loss information is available, including total PNL, peak profit, maximum drawdown, and associated prices and costs, along with associated entry counts.  There's also a field for any notes providing context behind the signal, plus timestamps for creation and scheduling. Ultimately, this notification gives you a comprehensive snapshot of a partial profit event and its impact.

## Interface PartialProfitCommit

This describes a partial profit-taking event that occurs during a trading strategy's execution. It provides details about the action taken—specifically, closing a portion of an existing position. You'll find information about the percentage of the position being closed, the current market price when the action was triggered, and key performance metrics like total profit and loss (pnl), peak profit, and maximum drawdown achieved by the position. The data also includes the initial trade direction (long or short), the entry price, and the original and adjusted take profit and stop loss levels. Finally, timestamps indicating when the signal was created and the position activated are also provided for precise timing information.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress and understand how your strategy performs as it moves towards its profit targets. The notification includes a unique ID and timestamp, so you can reference it later.

It also provides detailed information about the trade, including the trading pair, the strategy used, the exchange involved, and the entry price. You'll find specifics about the take profit and stop-loss levels, both original and adjusted for trailing.

Beyond the basics, you get a comprehensive view of the trade’s performance, from total entries and partial closes to profit and loss (both in USD and percentage), maximum drawdown, and key price points. The note field allows for extra details or context related to the signal. It also includes timing information, such as when the signal was scheduled and when the position became active.

## Interface PartialLossContract

The `PartialLossContract` provides information when a trading strategy hits a predefined loss level, like a 10%, 20%, or 30% drawdown. It’s used to keep track of how much a strategy is losing and to potentially trigger stop-loss orders.

These events are triggered only once for each loss level per strategy, even if the price drops rapidly.  You'll find details like the trading symbol, the strategy's name, the exchange being used, and the current price at the moment the loss level was reached.

Crucially, it includes the original signal data, showing original stop-loss and take-profit prices, and whether any parts of the position have already been executed. The `level` property tells you the exact percentage loss that occurred (e.g., a `level` of 20 means a 20% loss).  It also clarifies whether this event came from a backtest (using historical data) or from live trading. Finally, a timestamp indicates precisely when the loss level was detected, differing slightly between live and backtest modes.

## Interface PartialLossCommitNotification

This notification lets you know when a partial position has been closed. It provides a ton of details about the trade, like a unique ID, the exact time it happened, and whether it was a backtest or a live trade. You'll find information about the trading pair, the strategy that triggered the action, and the exchange used.

The notification breaks down exactly what was closed, including the percentage, the current price at the time, and the original entry and stop-loss prices – before any trailing adjustments. It also includes a comprehensive set of performance metrics, like total profit/loss (both in USD and percentage), peak profit, and maximum drawdown, alongside prices and entry counts at those points.  A note field allows for optional explanations of the trading decision, and timestamps track the signal's lifecycle, from creation to execution. Finally, you get details on the number of entries and partial closes performed.

## Interface PartialLossCommit

This data represents a partial loss event that occurred during a trading strategy's execution. It signifies that a portion of an existing position was closed.

The `action` property simply confirms that this is a partial loss event.  The `percentToClose` tells you what percentage of the position was reduced.

You'll also find key price points like the `currentPrice` at the time of the partial loss, the `priceOpen` when the position was initially entered, and the `priceTakeProfit` and `priceStopLoss` levels.  The original values of the take profit and stop loss are also available, separate from any trailing adjustments applied.

The `position` property indicates whether the trade was a long (buy) or short (sell).

Crucially, this data also includes performance metrics for the entire position up to this point –  the `pnl` (profit and loss), `peakProfit` achieved, and `maxDrawdown` experienced.  Finally, `scheduledAt` and `pendingAt` give timestamps related to when the signal was created and when the position was activated.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has hit a predefined loss level, like -10% or -20%. It's a way to track how your strategy is performing and understand when it's experiencing losses.

Each notification has a unique ID and timestamp, and tells you whether it’s from a backtest (simulated trading) or live trading. It includes details like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange involved.

You’ll also find specific details about the trade itself: the entry price, the current price, the position direction (long or short), and the initially set take profit and stop-loss prices. 

Furthermore, the notification provides a wealth of financial information, including the position’s total profit/loss, peak profit achieved, maximum drawdown, and associated pricing details.  It even breaks down the number of entries and partial closes executed. 

Finally, there's an optional note field for providing extra context or explaining the reasoning behind the signal. Timestamps indicate when the signal was created, became pending, and when the notification itself was generated.

## Interface PartialEvent

This data structure represents a significant event in your trading – whether it's a profit or a loss. It bundles together all the key details about that event, allowing you to easily generate reports and analyze your trading performance. 

You'll find information like the exact time the event occurred, the trading pair involved, the strategy used, and the signal that triggered the trade. Crucially, it includes details about the price levels reached, your original entry and exit prices, and even the number of partial closes executed. 

For strategies utilizing dollar-cost averaging (DCA), it tracks information related to those entries. It also provides insights into the unrealized profit and loss (PNL) at the time of the event, along with any helpful notes explaining the signal's rationale. Finally, it notes if the trade happened during a backtest or live trading.

## Interface MetricStats

This object bundles together a set of statistics related to a particular type of performance measurement. Think of it as a report card for how a specific aspect of your trading system is performing. 

You'll find information like the total number of times something happened (the `count`), the total time it took, and various averages and percentiles like the average duration, minimum, maximum, and 95th percentile duration. 

It also includes statistical measures like the standard deviation, giving you a sense of how consistent the performance is. Additionally, it tracks wait times, providing insight into the intervals between events. Each statistic helps you understand the behavior and efficiency of your trading system.

## Interface MessageModel

This describes what a message looks like within a conversation history used by large language models. Each message has a role, indicating whether it's a system instruction, a user's input, the model's response, or a result from a tool.

The core of the message is its content, which is the text itself.  Sometimes, models will provide extra reasoning or a chain of thought to explain their answers, and that can be included as `reasoning_content`.

If the assistant uses tools, you’ll see a list of `tool_calls` attached to the message.  Messages can also include images; these can be provided as raw data, base64 encoded strings, or standard Blob objects. Lastly, if a message is a direct response to a specific tool call, it will have a `tool_call_id` identifying the call it’s related to.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred during a backtest.

It keeps track of all the drawdown events in a list, ordered from the most recent to the oldest, so you can see the sequence of events that led to the maximum drawdown.

You'll also find the total number of drawdown events recorded, providing a simple count of how many times the drawdown reached a significant level.

## Interface MaxDrawdownEvent

This data structure represents a single instance of a maximum drawdown event that occurred during a trading simulation or live trading. It provides detailed information about the event, including the exact time it happened and the specific trading parameters involved.

Each event includes the symbol being traded, the name of the strategy used, and a unique identifier for the signal that triggered the trade. You'll also find the position direction (long or short), along with performance metrics like profit and loss (PNL) details for the entire position, the highest profit achieved, and the magnitude of the maximum drawdown.

The record also stores price-related data, such as the price at which the drawdown occurred, the entry price, the take profit price, and the stop loss price. Finally, a flag indicates whether the event took place during a backtesting period.

## Interface MaxDrawdownContract

This defines how the backtest-kit trading framework communicates when a new maximum drawdown is encountered in a trading position. It provides details about the position's performance, like the trading symbol, current price, and when the update happened. You’ll also get information about the trading strategy, exchange, and timeframe being used.

The data includes the signal that triggered the position, and a flag indicating whether this drawdown event happened during a backtest or in live trading. This information is important for understanding and responding to changes in risk, dynamically adjusting strategies, or managing your capital. The system sends these updates whenever a new drawdown level is achieved so you can react quickly to market changes and optimize your trading.

## Interface LiveStatisticsModel

This `LiveStatisticsModel` provides a detailed breakdown of your trading performance, pulling data from live trading events. It's designed to give you a comprehensive view of how your strategy is performing.

The model tracks everything from the total number of events – including when signals are opened, active, or closed – to key performance indicators like win rate, average profit per trade, and total profit. You’ll find metrics that assess risk, such as standard deviation, Sharpe Ratio, and Sortino Ratio, to help you understand your risk-adjusted returns.

Beyond basic profitability, the model delves into trade duration, consecutive win/loss streaks, and even examines the distribution of profit and loss with metrics like median PNL.  It also analyzes market pressure and trend strength, classifying the overall market direction. This comprehensive set of data allows for a much deeper understanding of your trading strategy's strengths and weaknesses. Note that if calculations are unreliable (like when dealing with zero or negative values), the corresponding values will be null.

## Interface InfoErrorNotification

This component handles notifications about errors that happen during background processes, but aren't critical enough to stop everything. 

Each notification has a specific type, a unique identifier, and a detailed error object including a stack trace and extra information. 

A human-friendly message explains the error, and a flag confirms that the error originated outside of the backtesting environment – it's from a live context.

## Interface IdlePingContract

The `IdlePingContract` represents an event that occurs when a trading strategy isn't actively responding to any signals. Think of it as a heartbeat indicating a period of inactivity.

It's triggered by the `idlePingSubject` periodically when there are no pending or scheduled signals being watched. This allows you to monitor the lifecycle of a strategy – when it’s idle and when it’s not.

You can listen for these events using the `listenIdlePing()` or `listenIdlePingOnce()` functions.

The event includes key details like the trading symbol (e.g., BTCUSDT), the name of the strategy that's idle, the exchange it’s running on, and whether it's a backtest or a live trade. 

You'll also find the current price at the time of the ping, and a timestamp reflecting either the real-time moment of the ping or the candle timestamp during a backtest.

## Interface IWarmCandlesParams

This object defines the information needed to download and store historical candlestick data. Think of it as a recipe for getting the right data before you start a backtest. 

You’ll specify the trading pair you're interested in (like BTCUSDT), which exchange provides the data, the timeframe of the candles (like 1-minute or 4-hour intervals), and the start and end dates you want to cover. This helps ensure your backtest has all the necessary historical information readily available.


## Interface IWalkerStrategyResult

This interface describes the output you get when running a strategy within the backtest framework. Each strategy's performance is represented as an `IWalkerStrategyResult`.

It includes the strategy's name so you know which strategy the results belong to.

You'll also find a set of statistics, giving you a detailed breakdown of how the strategy performed.

A single, important metric value is provided for comparing the strategy's performance against others.

Finally, the `rank` property shows where the strategy stands in the overall comparison – a lower rank means better performance.


## Interface IWalkerSchema

The IWalkerSchema helps organize and configure A/B tests across different trading strategies. Think of it as a blueprint for running experiments where you want to compare the performance of several strategies against each other.

It lets you give each test a unique name (walkerName) and add notes (note) for clarity. You specify the exchange and timeframe (frameName) to use for all the strategies in this particular test.

Crucially, it lists the strategies you're evaluating (strategies), ensuring they’ve been previously registered within the backtest-kit system. You can also choose which metric, like Sharpe Ratio (metric), will be used to determine the "winner" of the test.

Finally, it provides optional callbacks (callbacks) so you can customize what happens at different points during the testing process.

## Interface IWalkerResults

The `IWalkerResults` interface holds all the information gathered after a complete backtesting run that compares different strategies. It essentially summarizes the outcome of a walker process. 

It includes details like the trading symbol that was tested, the name of the exchange used for the backtest, the specific walker that performed the tests, and the timeframe (frame) used for the analysis. This interface allows you to easily access key characteristics of the backtest's overall results.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into different stages of the backtesting process when comparing strategies. Think of it as a way to get notified and potentially react to what's happening behind the scenes.

You can be alerted when a particular strategy begins testing, allowing you to log it or display a status update. 

Similarly, you'll receive a notification when a strategy's backtest finishes, along with performance statistics and a key metric. This allows you to analyze the results as they become available.

If a strategy encounters an error during backtesting, you’ll be informed, giving you a chance to log the error or attempt recovery.

Finally, when all the testing is complete, you’ll receive the final results, providing a summary of the entire comparison process.

## Interface ITrailingTakeCommitRow

This interface represents a queued action related to trailing take profit and commit orders. It essentially describes a specific adjustment to be made as part of a trading strategy.

The `action` property explicitly identifies this as a "trailing-take" action, clarifying its purpose. 

The `percentShift` value tells you how much the price needs to shift, expressed as a percentage, to trigger the order. 

Finally, `currentPrice` records the price at the time the trailing order was initially established, providing important context for calculations.

## Interface ITrailingStopCommitRow

This interface represents a single action queued for a trailing stop order. Think of it as a record of a specific change you want to make to a trailing stop. 

Each record includes the type of action being performed ("trailing-stop"), the percentage shift that needs to be applied, and the price at which the trailing stop was originally established. It’s essentially a snapshot of a trailing stop adjustment waiting to be executed.


## Interface IStrategyTickResultWaiting

This object represents a specific situation in your trading strategy: when a signal is scheduled and waiting for the price to reach a certain point before being activated. You'll receive this data repeatedly as the price fluctuates, indicating the signal is still pending.

It contains key information for tracking what's happening. You’ll find details like the signal itself, the current price being monitored, the strategy and exchange names, the timeframe being used, and the trading symbol.

Importantly, the take profit and stop loss percentages will always be zero at this stage. It also gives you insight into whether the simulation is a backtest or live trade and when this data point was generated. You can use this information to understand the current state of your trading strategy and monitor scheduled signals.

## Interface IStrategyTickResultScheduled

This interface describes a specific type of event that occurs within a trading strategy – when a signal is generated and scheduled, waiting for the price to reach an entry point. Think of it as a notification that a potential trade is set up but not yet active.

It includes important details about that signal, such as the strategy and exchange it originated from, the symbol being traded, the current price at the time of scheduling, and whether the process is happening in backtesting or live trading. The `createdAt` field indicates precisely when the signal was scheduled, which can be helpful for debugging and analyzing performance. The `action` property simply identifies this as a "scheduled" event, helping to differentiate it from other possible actions.


## Interface IStrategyTickResultOpened

This describes what happens when a new trading signal is created within the backtest-kit framework. It's a notification that a signal has been successfully generated, validated, and saved.

You'll receive this notification – the `IStrategyTickResultOpened` – whenever a signal is created. 

The information included tells you specifically which strategy, exchange, timeframe, and symbol the signal relates to. You'll also get the signal's unique ID, the current price at the time it was opened, and whether the signal originated from a backtest or live trading environment. The `createdAt` timestamp provides a record of when the signal was generated, tied to either the backtest candle time or the live execution timestamp.

## Interface IStrategyTickResultIdle

This interface describes what happens when a trading strategy is in a resting or inactive state, essentially doing nothing. It's used to log these "idle" moments. 

Each idle event includes information about the strategy's name, the exchange it’s using, the timeframe being analyzed (like a 1-minute or 5-minute chart), and the symbol being traded (e.g., Bitcoin against US Dollar).  You'll also find the current price at that moment and a flag indicating whether the data comes from a backtest or a live trading environment. Finally, it records the time the idle event occurred. This lets you understand periods where your strategy isn't actively trading.


## Interface IStrategyTickResultClosed

This interface describes what happens when a trading signal is closed, providing a comprehensive record of the event. It includes all the details about the signal itself, such as the original parameters and the final price at which it was closed. 

You'll find information about why the signal closed - whether it was due to a time limit, hitting a take-profit or stop-loss, or a manual close. The interface also tracks important performance metrics, including profit and loss calculations that factor in fees and slippage.

It's designed for tracking purposes, clearly identifying the strategy, exchange, timeframe, and trading pair involved, along with whether the event happened during a backtest or a live trading session. A unique close ID is available if the signal was manually closed. Finally, it logs the creation time of the result, relative to the candle or the execution.

## Interface IStrategyTickResultCancelled

The `IStrategyTickResultCancelled` interface describes what happens when a planned trading signal is cancelled. This can occur if the signal doesn't trigger or if a stop-loss is hit before a trade can be initiated.

It provides details about the cancellation, including which signal was cancelled and why. 

You'll find information like the final price at the time of cancellation, a timestamp, and tracking information about the strategy, exchange, symbol, and timeframe involved. 

It also includes whether the event occurred during a backtest or a live trading session and optionally an ID if the user manually cancelled the signal. Finally, it records when the result was generated, based on the candle timestamp during backtests or the real-time execution context in live trading.

## Interface IStrategyTickResultActive

This interface describes a tick result when a strategy is actively monitoring a signal, waiting for a take profit, stop loss, or time expiration. It provides detailed information about the active trading situation.

You’ll find the `action` property confirms the result is in an "active" state, and the `signal` property gives you access to the specific signal being monitored. 

The `currentPrice` tells you the VWAP price currently used for the monitoring. Other properties like `strategyName`, `exchangeName`, and `symbol` track the specifics of the trade.

Progress indicators `percentTp` and `percentSl` show how close the trade is to its take profit or stop loss targets. The `pnl` property gives you the unrealized profit and loss, including fees and slippage.

The `backtest` flag indicates whether the trade is part of a backtest simulation or a live trade, and `createdAt` and `_backtestLastTimestamp` contain timestamp information useful for sequencing and backtesting processes.


## Interface IStrategySchema

The IStrategySchema defines how a trading strategy works within the backtest-kit framework. Think of it as a blueprint for your strategy, outlining its logic and configuration. 

Each strategy needs a unique name to identify it. You can also add a note for yourself or other developers to explain the strategy's purpose. 

The `interval` property controls how often the strategy is checked for signals, preventing it from overwhelming the system – it defaults to every minute.

The core of the strategy is the `getSignal` function, which generates trading signals. It receives the current price and a timestamp and determines if a trade should be made, returning a signal object if it should, or null if no action is needed. The function can also handle scheduled orders based on a specified entry price.

You can add lifecycle callbacks, like `onOpen` and `onClose`, to execute custom logic when the strategy starts or ends. Risk profiles can also be associated with the strategy for better risk management. You can also tag the strategy with actions or provide custom runtime data for monitoring or external processing.

## Interface IStrategyResult

This interface, `IStrategyResult`, represents a single row in a comparison table when evaluating trading strategies. It holds the name of the strategy being tested, a detailed set of statistics summarizing its performance, and the value of the metric used to rank it.  You'll also find timestamps indicating when the first and last trading signals occurred for each strategy; if a strategy didn't generate any signals, these timestamps will be null. Essentially, it's a bundled package of information to quickly compare the effectiveness and activity of different strategies.


## Interface IStrategyPnL

This interface describes the result of calculating profit and loss for a strategy. It gives you a clear picture of how much money was made or lost during a trading period.

The `pnlPercentage` tells you the profit or loss as a percentage – a positive number means profit, a negative number means loss.

You'll also find the `priceOpen`, which is the original entry price, but adjusted to factor in small fees and slippage that happen during trading.  Similarly, `priceClose` shows the exit price after those adjustments.

The `pnlCost` represents the actual dollar amount of profit or loss. Finally, `pnlEntries` tracks the total amount of money initially invested.

## Interface IStrategyCallbacks

This interface defines optional callbacks that your trading strategy can use to respond to different events during a backtest or live trading session. Think of them as hooks that let your strategy react to what's happening.

You can use `onTick` to handle every price update, receiving the latest information and whether it's a backtest.  `onOpen` triggers when a new trade is started, giving you the signal data, current price, and backtest status.  `onActive` is called when a signal is actively being monitored.

`onIdle` signals a period with no open trades. `onClose` gets called when a trade is finished, providing the closing price and signal data. `onSchedule` and `onCancel` notify you when a delayed trade is created or canceled respectively.

`onWrite` is used for persisting signal information for testing purposes. `onPartialProfit`, `onPartialLoss`, and `onBreakeven` alert you to specific profit/loss milestones within a trade.  Finally, `onSchedulePing` and `onActivePing` provide recurring opportunities to check on scheduled and active signals, allowing for dynamic adjustments and monitoring even between regular strategy intervals.

## Interface IStrategy

This interface, `IStrategy`, defines the core functions a trading strategy needs to execute.  It's the backbone for how a client strategy operates.

Here's a breakdown of what each function does:

*   **`tick(symbol, strategyName)`**: This is the heart of the strategy – what happens on each new price tick. It checks for signals, profit targets (TP), and stop-loss levels (SL).
*   **`getPendingSignal(symbol, currentPrice)`**:  Checks if there's an existing, active trade (pending signal). Returns `null` if none is found.
*   **`getScheduledSignal(symbol, currentPrice)`**: Similar to above, but for signals scheduled to activate later.
*   **`getBreakeven(symbol, currentPrice)`**: Determines if the current price allows a breakeven point to be set (covering transaction costs).
*   **`getStopped(symbol)`**: Checks if the strategy has been manually stopped.
*   **`getTotalPercentClosed(symbol)`**: Calculates how much of the initial investment has already been closed out through partial trades.
*   **`getTotalCostClosed(symbol)`**:  Figures out the total amount (in dollars) of the initial investment that's already been closed out.
*   **`getPositionEffectivePrice(symbol)`**: Calculates the average entry price, considering any DCA (Dollar Cost Averaging) entries.
*   **`getPositionInvestedCount(symbol)`**:  Counts the number of DCA entries.
*   **`getPositionInvestedCost(symbol)`**:  The total amount invested across all entries.
*   **`getPositionPnlPercent(symbol, currentPrice)`**: Calculates the current potential profit/loss percentage.
*   **`getPositionPnlCost(symbol, currentPrice)`**:  Calculates the potential profit/loss in dollars.
*   **`getPositionEntries(symbol, timestamp)`**: Provides a history of all the prices and costs of the position’s entry points, useful for understanding the trade history.
*   **`getPositionPartials(symbol)`**:  Records all previous partial profits or losses taken.
*   **`backtest(symbol, strategyName, candles, frameEndTime)`**:  Simulates the strategy's performance using historical data to see how it would have performed.
*   **`stopStrategy(symbol, backtest)`**:  Pauses the strategy from generating new trades.
*   **`cancelScheduled(symbol, backtest, payload)`**: Cancels a previously scheduled trade without stopping the entire strategy.
*   **`activateScheduled(symbol, backtest, payload)`**: Forces a scheduled trade to execute immediately.
*   **`closePending(symbol, backtest, payload)`**: Closes an existing, active trade without stopping the strategy.
*   **`partialProfit(symbol, percentToClose, currentPrice, backtest, timestamp)`**: Closes a portion of the position at a profit.
*   **`validatePartialProfit(symbol, percentToClose, currentPrice)`**: Checks if a partial profit is valid *before* executing it.
*   **`partialLoss(symbol, percentToClose, currentPrice, backtest, timestamp)`**: Closes a portion of the position as a loss.
*   **`validatePartialLoss(symbol, percentToClose, currentPrice)`**: Checks if a partial loss is valid *before* executing it.
*   **`trailingStop(symbol, percentShift, currentPrice, backtest)`**: Adjusts the stop-loss level based on price movement.
*   **`validateTrailingStop(symbol, percentShift, currentPrice)`**: Checks if a trailing stop adjustment is valid *before* executing it.
*   **`trailingTake(symbol, percentShift, currentPrice, backtest)`**: Adjusts the profit target level based on price movement.
*   **`validateTrailingTake(symbol, percentShift, currentPrice)`**: Checks if a trailing take is valid *before* executing it.
*   **`breakeven(symbol, currentPrice, backtest)`**: Sets the stop-loss to breakeven to protect profits.
*   **`validateBreakeven(symbol, currentPrice)`**: Checks if moving the stop-loss to breakeven is valid *before* executing it.
*   **`averageBuy(symbol, currentPrice, backtest, timestamp, cost)`**:  Adds a new purchase to the position at a lower price (DCA).
*   **`validateAverageBuy(symbol, currentPrice)`**: Checks if a new DCA purchase is valid *before* executing it.
*   **`hasPendingSignal(symbol)`**: Checks for an active position.
*   **`hasScheduledSignal(symbol)`**: Checks for a scheduled position.
*   **`getPositionEstimateMinutes(symbol)`**:  Shows the original time limit for the position.
*   **`getPositionCountdownMinutes(symbol, timestamp)`**: Shows how much time is left on the position's timer.
*   **`getPositionActiveMinutes(symbol, timestamp)`**: Shows how long the position has been open.
*   **`getPositionWaitingMinutes(symbol, timestamp)`**: Shows how long a scheduled signal has been waiting.
*   **`getPositionHighestProfitPrice(symbol)`**: Records the highest price reached during the life of the position.
*   **`getPositionHighestPnlPercentage(symbol)`**:  Records the profit percentage at the highest profit price.
*   **`getPositionHighestPnlCost(symbol)`**: Records the profit in dollars at the highest profit price.
*   **`getPositionHighestProfitTimestamp(symbol)`**: Records the timestamp of the highest profit price.
*   **`getPositionHighestProfitBreakeven(symbol)`**:  Checks if the position could have achieved breakeven at its highest profit point.
*   **`getPositionDrawdownMinutes(symbol, timestamp)`**: Tracks how long the position has been in a loss since its peak.
*   **`getPositionHighestProfitMinutes(symbol, timestamp)`**:  Alias for drawdown minutes.
*   **`getPositionMaxDrawdownMinutes(symbol, timestamp)`**:  Tracks the time since the position's worst loss.
*   **`getPositionMaxDrawdownPrice(symbol)`**: Records the worst price reached during the position’s life.
*   **`getPositionMaxDrawdownTimestamp(symbol)`**: Records the timestamp of the worst loss price.
*   **`getPositionMaxDrawdownPnlPercentage(symbol)`**:  Records the loss percentage at the worst loss price.
*   **`getPositionMaxDrawdownPnlCost(symbol)`**: Records the loss in dollars at the worst loss price.
*   **`getMaxDrawdownDistancePnlPercentage(symbol, currentPrice)`**:  Calculates the total potential loss from the highest profit point.
*   **`getMaxDrawdownDistancePnlCost(symbol, currentPrice)`**: Calculates the total potential loss in dollars from the highest profit point.
*   **`dispose()`**: Cleans up resources when the strategy is no longer needed.

## Interface IStorageUtils

This interface defines the core functionality needed for any storage system used within the backtest-kit framework. Think of it as a contract – any storage adapter you build needs to provide ways to react to different signal events like when a trade is opened, closed, scheduled, or cancelled. 

It also provides methods for looking up specific trades by their unique ID, listing all stored trades, and responding to ping events that help keep track of active or scheduled trades. The ping events specifically update the "last updated" timestamp for trades that are currently open or scheduled.

## Interface IStorageSignalRowScheduled

This interface defines a record representing a signal that is scheduled for future execution. It's a simple way to track signals that aren't immediately actionable. 

The key piece of information it holds is the `status` property, which is always set to "scheduled," confirming that the signal is waiting to be triggered at a later time. Think of it as a marker indicating that an action is planned but not yet happening.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, likely indicating a trade has been initiated. It's a simple structure with a single property, `status`, which is always set to "opened". Think of it as a confirmation that a signal has been acted upon and a position is now active. It's used within the backtest-kit framework to track the lifecycle of a trading signal.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has already been closed, meaning a trade has been executed and settled. It holds information specific to closed signals, like how much profit or loss was made.

The `status` property confirms the signal is indeed in a "closed" state. 

Crucially, it also includes the `pnl`, which is a detailed record of the profit and loss generated by that particular trade when it was closed out.


## Interface IStorageSignalRowCancelled

This interface defines the structure for a signal row that has been cancelled. It’s really straightforward - it just specifies that the `status` property will always be set to "cancelled". Think of it as a way to mark a signal as no longer valid or actionable within your backtesting system. This is used to track the state of a signal.

## Interface IStorageSignalRowBase

This defines the fundamental structure for how signals are stored, ensuring they have accurate timestamps and a priority level. Every signal, regardless of its status, will adhere to this base format. 

`createdAt` records precisely when the signal was initially created, using the information from the strategy’s tick results.

`updatedAt` keeps track of when the signal was last modified, also drawing from the strategy’s tick results.

`priority` determines the order in which the storage adapter processes signals. It’s currently set to the current time, ensuring consistent handling whether it's a live or backtesting environment.

## Interface IStateParams

The `IStateParams` interface helps you define how your signals will manage their state. Think of it as setting up containers, called "buckets," to organize different aspects of your signal, like trade data or performance metrics. You’ll also specify a starting value—what the signal will be initially—if no saved data is available. This provides a clear structure for managing and restoring the state of your signals.

## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data associated with individual trading signals. It's designed to hold information that changes over time, like peak unrealized profit or how long a position has been open. This is especially useful for strategies that use LLMs and need to track performance metrics throughout a trade's lifecycle.

Think of it as a container for mutable data related to a single trade, allowing you to track its behavior and make decisions based on that history.

The `waitForInit` method gets things started, letting you signal that the state instance is ready.

`getState` lets you read the current state at a specific point in time, but it's designed to prevent looking into the future – it won’t return data that hasn't happened yet.

`setState` is how you update the data – newer updates overwrite older ones, so restarting a backtest won’t corrupt previous data.  When updating, you have the option to receive the current state, protected from future information, which can be useful for calculations.

Finally, `dispose` cleans up any resources the state instance is using when it's no longer needed.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion. It's a method for determining how much of your capital to risk on each trade.

The `method` property is fixed and identifies this as a Kelly Criterion sizing approach.  

The `kellyMultiplier` property controls the aggressiveness of the sizing. It's a number between 0 and 1, and a lower value (like the default 0.25) represents a more conservative approach, risking a smaller portion of your capital. A higher multiplier would risk more.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades, consistently risking a fixed percentage of your capital on each one. It's straightforward: you specify a `riskPercentage`, a number between 0 and 100, that represents the proportion of your capital you're willing to lose on any single trade.  The framework will then automatically calculate the trade size based on this percentage. This is a good choice when you want a predictable and easily understood sizing strategy.

## Interface ISizingSchemaBase

This interface defines the fundamental structure for sizing schemas used within the backtest-kit trading framework. Each sizing schema needs a unique identifier, often referred to as `sizingName`, to distinguish it from others. 

You can also add a `note` to provide extra details or explanations for developers. 

The schema also defines limits on position sizes – `maxPositionPercentage` represents the maximum allowed as a percentage of your total account value, while `minPositionSize` and `maxPositionSize` set absolute minimum and maximum position sizes.

Finally, you can optionally include `callbacks` to execute custom logic at different points in the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size trades using the Average True Range (ATR). 

It's designed to manage risk dynamically based on market volatility.

The `method` is always set to "atr-based" to indicate this sizing approach.

You'll specify `riskPercentage`, which represents the maximum percentage of your capital you're willing to risk on a single trade—typically between 0 and 100.

The `atrMultiplier` determines how the ATR value is used to calculate the stop-loss distance. A higher multiplier results in a wider stop, allowing for more price fluctuation.

## Interface ISizingParamsKelly

This interface defines the parameters needed to use the Kelly Criterion for determining position sizes when placing trades. 

It primarily focuses on logging; the `logger` property lets you specify a service for recording debugging information related to the sizing calculations. 
This helps you understand how the Kelly Criterion is influencing your trade sizes and troubleshoot any issues.


## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed when you want to size your trades using a fixed percentage of your capital. It’s all about consistently risking a specific portion of your funds with each trade.

The `logger` property is where you provide a way to record debugging information – helpful for tracking how the sizing is working and troubleshooting any issues. Think of it as a tool to keep an eye on the process.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining trade sizes based on the Average True Range (ATR).

Essentially, it allows you to incorporate a logger to monitor what's happening during the sizing process for debugging. The logger helps you keep track of how your sizing logic is performing and identify any potential issues.

## Interface ISizingCallbacks

The `ISizingCallbacks` interface provides a way to hook into the sizing process within the backtest-kit framework. Specifically, you can use it to observe and potentially influence how position sizes are determined. 

The `onCalculate` callback is triggered immediately after the framework calculates a potential position size.  This is a great spot to log the calculated size and the parameters used, or to perform any checks to ensure the size is reasonable before it's actually used in the backtest. You can use a regular function or a function returning a Promise if you need to perform asynchronous validation.


## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate trade sizes using the Kelly Criterion. 

It requires you to specify the method being used (which is "kelly-criterion" in this case) and provide the win rate, expressed as a decimal between 0 and 1. You also need to supply the average win/loss ratio, representing how much you typically win compared to how much you lose on a trade. These values are essential for determining an optimal bet size based on your historical performance.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the parameters needed to calculate order size using a fixed percentage approach.  Essentially, it tells the backtest framework that you want to size your trades based on a predetermined percentage of your available capital. 

It requires you to specify the `method`, which must be "fixed-percentage" to indicate this sizing strategy. You'll also need to set a `priceStopLoss`, which represents the price level at which you'll place a stop-loss order to manage risk.

## Interface ISizingCalculateParamsBase

This interface provides the core data needed for calculating the size of a trade. It includes the trading symbol, like "BTCUSDT", to identify what you're trading. You'll also find the current account balance, which determines how much capital you have available. Lastly, it specifies the anticipated entry price for the trade, crucial for sizing calculations. Think of it as the foundational information for determining how many units of an asset you can reasonably buy or sell.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining trade size based on the Average True Range (ATR).

It requires specifying that the sizing method is "atr-based".  You’ll also need to provide a numerical value for the ATR, representing the current volatility level.  This ATR value is a crucial input for calculating how much to trade.

## Interface ISizing

The `ISizing` interface is the core of how your backtest-kit strategy determines how much to trade in each situation. Think of it as the brain responsible for figuring out the right size of your positions.

It has a single, crucial method, `calculate`. This method takes some input parameters describing your risk preferences and market conditions, and then it crunches the numbers to tell you exactly how many shares or contracts to buy or sell.  Essentially, it translates your risk management rules into actual position sizes. It returns a promise that resolves to the calculated position size.

## Interface ISignalRow

This interface, `ISignalRow`, represents a complete trading signal after it's been validated and prepared for execution. Each signal has a unique identifier, and includes important details like the cost of the trade, the entry price, and the expected duration of the position.  You'll find information about the exchange and strategy used, as well as timestamps tracking the signal's lifecycle—from creation to pending and beyond.

The signal also holds data regarding partial closes (profit or loss), a record of any DCA (dollar-cost averaging) entries, and dynamically adjusted take-profit and stop-loss prices using trailing mechanisms. Key performance indicators like the highest and lowest prices seen during the trade are also tracked, providing a comprehensive view of the position's performance. Finally, a timestamp marks when the signal was initially created or fetched.


## Interface ISignalIntervalDto

This data structure helps manage signals, especially when you need to bundle them together and release them at specific intervals. Think of it as a way to group signals and control when they become active. Each signal has a unique identifier, like a serial number, so the system knows exactly which signal is which. It’s used to ensure signals are delivered in a controlled manner, pausing further signals until a certain time has passed.

## Interface ISignalDto

This interface defines the structure of a signal, the instructions for a trade. When you request a signal, this is the data you'll receive.  Each signal includes information like the ticker symbol, whether you should buy (long) or sell (short), a description of why the signal was generated, and key price levels. You'll find entry prices, take profit targets, and stop-loss levels to manage risk.

A unique ID will automatically be assigned to each signal. You can also specify a timeout for the position using `minuteEstimatedTime`; if no timeout is set, the position remains active until a stop loss or take profit is triggered. The `cost` property specifies the financial cost of initiating the trade.

## Interface ISessionInstance

This interface outlines how different types of session instances should behave within the backtest-kit framework. Think of a session instance as a place to store temporary information related to a specific trading setup – like the symbol being traded, the strategy being used, the exchange involved, and the timeframe of the data. 

It’s designed to hold mutable data that’s shared during a single backtest run, perhaps things like cached results from AI models, intermediate calculations for indicators, or data that needs to be tracked across multiple time periods.

The `waitForInit` method allows you to prepare the session before things get started.  `setData` lets you save new information with a timestamp, and `getData` allows you to retrieve it later – making sure you don't accidentally peek into the future. Finally, `dispose` provides a way to clean up any resources the session is using when it’s no longer needed.

## Interface IScheduledSignalRow

The `IScheduledSignalRow` represents a signal that isn't acted on immediately. It's essentially a signal waiting for a specific price to be reached before a trade is executed. Think of it like setting a buy order at a particular price – the system will hold off on taking action until that price is hit. 

This type inherits from a more general signal representation, adding the crucial element of a target price (`priceOpen`). Once the market price hits the specified `priceOpen`, the signal transforms into a standard pending signal, ready for immediate execution. A timestamp (`scheduledAt`) tracks when the signal was initially scheduled, and this is maintained until the signal is activated.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that can be canceled by the user. It builds upon the standard scheduled signal information by adding details specific to cancellations. If a user cancels a signal, this interface holds the unique identification of that cancellation (cancelId) and any notes the user provided when canceling it. Essentially, it's how the system tracks user-driven signal cancellations alongside the regular scheduling data.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the time period your backtest covers. It’s how the backtest-kit knows when to start and stop running your trading strategy. It has two key parts: a `from` date, representing the beginning of the backtest, and a `to` date, marking the end. Think of it as defining the window of historical data your strategy will be tested against.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface provides essential details about what's happening during a backtest or live trading session. It tells you which trading pair is being analyzed, the timeframe of the historical data being used for a backtest (or null if it’s a live run), and any custom data your strategy might need.

You'll also find information about the exchange, the strategy itself, and the timeframe being used, alongside the precise date and time of the current data point.  A handy current price is also provided for the trading symbol, and a flag indicates if the strategy is running in backtest mode versus a live trading environment. This interface acts as a central hub for accessing important contextual information while your strategy is running.

## Interface IRunContext

The `IRunContext` object holds all the information needed for a function to operate within the backtest-kit framework. Think of it as a container combining two key pieces of data: routing information about your strategy and exchange, and runtime details like the symbol being traded and the precise time of the trade. It's the central hub used internally to manage function execution, distributing different parts of its data to specialized services to handle them effectively.

## Interface IRiskValidationPayload

This object holds the data needed to evaluate risk during trading. Think of it as a snapshot of what’s happening in your portfolio right now.

It includes the current trading signal that's being considered – that’s the `currentSignal` property, which gives you details about the potential trade. 

You’ll also find information on how many positions you’re currently holding (`activePositionCount`) and a detailed list of those active positions (`activePositions`), providing a comprehensive view of your exposure.

## Interface IRiskValidationFn

This defines a special function used for checking if a trade is safe to execute. It's designed to ensure your trading strategy doesn't violate any pre-defined risk rules. If the function confirms a trade is okay, it does nothing. If it finds a problem – like the trade exceeding a risk limit – it either returns a specific rejection reason or throws an error, both of which signal that the trade should be blocked. Essentially, it's a gatekeeper for your trades, making sure they align with your risk management plan.


## Interface IRiskValidation

This section describes how to define rules for checking the safety and appropriateness of your trading strategies. It lets you specify functions – the `validate` property – that will be run to evaluate certain parameters. Think of this as setting up custom checks to make sure everything is within acceptable bounds.  You can also add a `note` to explain what each check is doing, making your code easier to understand and maintain.

## Interface IRiskSignalRow

This interface, IRiskSignalRow, helps manage risk during trading. It builds upon the existing SignalDto and adds crucial details about the initial trade setup. Specifically, it stores the entry price (priceOpen) along with the original stop-loss and take-profit levels that were set when the trade signal was first generated. This information is vital for validating risk parameters and ensuring consistent risk management throughout the backtesting process.

## Interface IRiskSchema

The `IRiskSchema` lets you define and manage risk controls for your trading portfolio. Think of it as a way to create custom rules to ensure your portfolio behaves as expected. Each risk schema has a unique name to identify it, and you can add notes to explain what it does. 

You can also specify callbacks to be triggered at certain points in the process, like when a trade is rejected or allowed. The most important part is the `validations` array, which contains the actual logic that determines if a trade meets your risk criteria. These validations can be simple functions or more complex objects allowing you to implement sophisticated risk management strategies.

## Interface IRiskRejectionResult

This interface, `IRiskRejectionResult`, helps you understand why a risk validation check failed. It's like a report card for your trading strategy's risk management. When a validation fails – meaning something isn't quite right – this result provides two key pieces of information.  First, it gives you a unique `id` to track the specific rejection. Second, and most importantly, it gives you a `note` – a clear explanation in plain language about *why* the validation failed, making it easier to debug and fix the issue.

## Interface IRiskParams

This interface defines the settings you'll use to configure the risk management system. It includes essential information like the exchange you're working with, a way to log debugging information, and a way to handle time consistently to avoid errors in your backtesting or live trading. You'll also find a special callback function that gets triggered when a trading signal is blocked due to risk limits, allowing you to react to those situations. Ultimately, it's about setting up the framework with the right context for managing risk effectively.

## Interface IRiskCheckOptions

This setting controls how the risk check behaves when multiple parts of your trading strategy are trying to use the same position at the same time. When `reserve` is set to `true`, the system temporarily marks the position as being used, preventing other parts of your strategy from trying to access it until the check is complete. This helps avoid conflicts and ensures that everyone sees an accurate view of available positions, especially when dealing with complex trading logic. Think of it like putting a temporary hold on something to make sure no one else grabs it unexpectedly.

## Interface IRiskCheckArgs

The `IRiskCheckArgs` interface holds all the information needed to perform a risk check before a trading signal is generated. Think of it as a set of checks to make sure it’s a good time to open a new trade.

It includes details like the trading symbol, the signal being considered, the name of the strategy making the request, and the exchange being used. 

You’ll also find data points such as the current price and timestamp, along with the risk and frame names.

Essentially, this interface packages all the relevant data so a risk management system can determine whether opening a new position is safe and appropriate. It’s a collection of arguments passed from the `ClientStrategy` context to perform this validation.

## Interface IRiskCallbacks

This interface lets you define functions that get triggered when your risk management system makes decisions about a trade. Specifically, `onRejected` is called when a trading signal is blocked because it violates your pre-defined risk limits.  Conversely, `onAllowed` is called when a signal passes all the risk checks and is approved for execution. These callbacks give you opportunities to log these events, monitor your risk controls, or even react programmatically based on the risk assessment outcome.

## Interface IRiskActivePosition

This interface describes a single, active trading position that's being monitored for risk management. It’s used to track positions across different trading strategies, giving you a combined view of your overall exposure. Each position record includes details like the name of the strategy that opened it, the exchange used, the timeframe it's based on, and the symbol being traded.

You'll find information about whether the position is a long or short trade, the price at which it was entered, and any stop-loss or take-profit levels set. Finally, there's a timestamp indicating when the position was originally opened, along with an estimated duration. This comprehensive data helps you understand and manage risk effectively across all your strategies.


## Interface IRisk

This interface defines how to manage and control risk during trading. It allows you to check if a trade should be allowed based on predefined risk limits. The `checkSignal` method lets you verify if a trade is permissible, while `checkSignalAndReserve` goes a step further by not only validating the trade but also temporarily marking space for it, preventing other strategies from exceeding limits. Think of `checkSignalAndReserve` as a way to guarantee that a trade won't accidentally trigger a limit breach when multiple trading strategies are operating simultaneously.

To complete the process, `addSignal` registers a new, opened trade, and `removeSignal` cleans up when a trade is closed. It’s essential to always follow up on a successful `checkSignalAndReserve` with either adding the trade (`addSignal`) or removing the reservation (`removeSignal`) to keep the risk management system accurate.

## Interface IReportTarget

This interface lets you fine-tune what data gets logged during your trading simulations. You can pick and choose which aspects you want to monitor, like strategy actions, risk rejections, breakeven points, partial order fills, performance metrics, or scheduled signals. It's designed to give you granular control over the reporting process and allows you to focus on the specific areas you're most interested in analyzing. This helps keep your logs clean and manageable while still providing valuable insights into your trading system's behavior. Each property represents a different type of event that can be logged, and setting it to `true` activates that logging.

## Interface IReportDumpOptions

This interface helps you control how backtest reports are generated and filtered. Think of it as a way to specify exactly what data you want to see and organize within your backtest results. Each property represents a piece of information used to identify and categorize events during the backtest process—like the trading pair (symbol), the name of your strategy, the exchange used, the timeframe, a unique signal identifier, and the name of the optimization walker. By providing these details, you can target specific scenarios or optimize the clarity of your reports.

## Interface IRecentUtils

This interface defines how different systems store and manage recent trading signals. It allows backtest-kit to keep track of the most recent signals generated by strategies.

The `handleActivePing` method is used to update the storage with new signal data whenever a ping event occurs.  `getLatestSignal` lets you fetch the most recent signal for a specific trading setup (symbol, strategy, exchange, timeframe, and whether it's a backtest). Importantly, it prevents looking into the future by only returning signals that were created *before* the specified time. Finally, `getMinutesSinceLatestSignalCreated` helps determine how long ago a signal was generated, which is useful for assessing lag or ensuring data integrity.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share key details about a trading signal with users, even when advanced features like trailing stop-loss or take-profit are in use. It builds upon the standard `ISignalRow` to add transparency by including the original stop-loss and take-profit prices that were set when the signal was initially created.

You'll find information here such as the initial cost of entering the trade, as well as the original stop-loss and take-profit levels. Importantly, these original prices remain fixed, even if the actual stop-loss or take-profit prices change due to trailing adjustments.  This lets users see exactly what the initial risk parameters were.

Beyond that, it also includes information about how much of the position has been closed partially, the number of times the position has been entered (for averaging strategies), and the overall profit/loss, peak profit, and maximum drawdown achieved so far. The `originalPriceOpen` value maintains the initial entry price, regardless of any subsequent averaging. Finally, the `pnl` field shows the current unrealized profit or loss, while `peakProfit` and `maxDrawdown` track the highest profit and largest loss experienced.

## Interface IPublicCandleData

This interface describes the structure of a single candlestick data point, representing a specific time interval in trading. 

Each candlestick contains information about when it began (timestamp), the price when trading started (open), the highest and lowest prices reached during that time (high and low), the price when trading ended (close), and the total trading activity (volume). This data is fundamental for visualizing price movements and analyzing trading patterns.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It focuses on the core values of the strategy.

You'll need to specify your expected win rate, expressed as a number between 0 and 1.

Also, provide the average win/loss ratio, representing the typical return you expect from a winning trade compared to the loss from a losing one. 

These parameters will help determine the optimal amount of capital to allocate to each trade.


## Interface IPositionSizeFixedPercentageParams

This section describes the parameters used for a trading strategy that sizes positions based on a fixed percentage of your available capital. The most important parameter here is `priceStopLoss`, which defines the price level at which a stop-loss order would be triggered to limit potential losses. This value helps protect your investment by automatically selling if the price moves against your position.

## Interface IPositionSizeATRParams

The `IPositionSizeATRParams` interface holds the information needed when calculating position size using an Average True Range (ATR) approach. It’s a straightforward way to define how much of your capital you'll risk based on the current ATR value. The core of this interface is the `atr` property, which represents the calculated Average True Range – essentially a measure of market volatility. You'll use this value to determine how much to trade, with higher ATR values generally leading to smaller position sizes to manage risk.

## Interface IPositionOverlapLadder

This interface lets you define a zone of tolerance to check for overlapping positions when using dollar-cost averaging (DCA). Think of it as setting boundaries around each DCA level. 

The `upperPercent` property determines how much above each DCA level you consider an overlap. The `lowerPercent` property does the same for below each DCA level.

Both percentages are expressed as values between 0 and 100, so 5 represents 5%. You'll use these percentages to fine-tune how strictly you want to detect potential overlaps in your trading strategy.

## Interface IPersistStorageInstance

This interface defines how to handle storing and retrieving signals during a backtest or live trading session. It's designed to allow you to customize how signals are saved, potentially moving away from the default file-based storage.

Think of it as a way to manage the data about each signal – when it was created, its values, etc. – and keep that data separate for either backtesting or live trading.

The `waitForInit` method prepares the storage for use, essentially getting things ready.

`readStorageData` pulls all the saved signal information, bringing everything back into memory.

Finally, `writeStorageData` is how you save the signal data, linking each signal by its unique identifier.


## Interface IPersistStateInstance

This interface defines how to manage persistent state for a specific trading strategy, focusing on ensuring data isn't lost even if things go wrong. Think of it as a way to safely store and retrieve data related to a particular trading signal and its associated bucket. 

If you're building a custom solution for how your strategy keeps track of its progress or settings, you can use this interface as a template.

The `waitForInit` method lets you set up the storage when it's needed. `readStateData` retrieves previously saved information, while `writeStateData` saves new or updated data with a timestamp.  Finally, `dispose` cleans up any resources when the storage is no longer needed, although this might not do anything special by default.

## Interface IPersistSignalInstance

This interface defines how your custom code can manage and store signal data for a specific trading setup – think of it as keeping track of what happened in a test. It’s tied to a particular combination of the traded asset, the strategy being tested, and the exchange used.

If you want to change how backtest-kit saves and retrieves signals (instead of using a standard file), you'll need to build something that follows this pattern.

The `waitForInit` method lets you set up the storage when things start.
`readSignalData` retrieves the stored data, giving you the signal information.
And `writeSignalData` lets you save new data or clear out the existing data.

## Interface IPersistSessionInstance

This interface defines how to manage session data specifically for a particular trading strategy, exchange, and frame combination. It's designed to help your backtesting system safely store and retrieve information even if things go wrong.

If you need to customize how session data is saved (instead of using the default file storage), you can create your own adapter that implements this interface.

Here's what you'll need to do:

*   `waitForInit`:  Sets up the storage area for the session when it starts.
*   `readSessionData`:  Loads any existing session data that's already been saved.
*   `writeSessionData`:  Saves new or updated session data.  You’ll need to indicate when the data was written.
*   `dispose`: Cleans up any resources that your custom session storage is using when the session is finished.

## Interface IPersistScheduleInstance

This interface helps backtest-kit remember what signals were generated for a specific trading strategy on a specific asset and exchange. Think of it as a way to save and load the signals so you can continue a backtest from where you left off, or reuse signals across different testing scenarios.

If you want to customize how these signals are saved—perhaps storing them in a database instead of a file—you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage initially. `readScheduleData` retrieves any previously saved signals, while `writeScheduleData` saves new or updated signals. Sending null to `writeScheduleData` allows you to clear the stored signal.

## Interface IPersistRiskInstance

This interface helps manage how your trading strategies remember their risk positions, like open orders or exposure limits, for a specific trading context. Think of it as a way to customize how this information is saved and loaded.

It’s specifically designed for each combination of a risk name and exchange name, ensuring that persistence is handled separately for different risk scenarios.

If you want to control exactly where and how these risk positions are stored – perhaps using a database instead of files – you can build your own adapter that implements this interface.

The `waitForInit` method allows you to set up the storage area when things start up. `readPositionData` lets you retrieve previously saved risk positions at a certain point in time. Finally, `writePositionData` is used to save the current state of your risk positions.

## Interface IPersistRecentInstance

This interface helps keep track of the most recent trading signal used for a particular setup – think of it as remembering what you did last. It's designed to be specific to a unique combination of factors like the asset being traded, the strategy being used, the exchange, the timeframe, and the type of test (backtest or live trading). 

You can think of it as a way to customize how these recent signals are stored, potentially bypassing the default file storage method. 

The `waitForInit` method sets up the storage space for this specific context.  `readRecentData` retrieves the most recently saved signal. Finally, `writeRecentData` saves a new signal, along with the timestamp of when it was generated.

## Interface IPersistPartialInstance

This interface helps manage how trading strategies remember their progress, specifically focusing on profit and loss calculations. Think of it as a way to save snapshots of where a strategy stands at certain points.

It’s designed to keep track of information related to a particular trading strategy, symbol, and exchange – so it’s aware of the specific context. Each piece of information is stored using a unique identifier.

If you want to customize how this data is saved—perhaps to a database instead of a file—you can create your own adapter that follows this interface.

The `waitForInit` method is like a readiness check to ensure everything is set up correctly before you start. `readPartialData` lets you load previously saved progress for a specific situation, and `writePartialData` is used to save the current state.


## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are saved and loaded. Think of notifications as important events that happen during a trade – things like order confirmations or errors.

It allows you to create your own storage system, perhaps to store notifications in a database instead of a file.

The `waitForInit` method prepares your custom storage when the system starts, either in backtesting mode or live trading mode.

`readNotificationData` retrieves all previously saved notifications, allowing you to review past events.

Finally, `writeNotificationData` stores new notifications, so you can keep a record of what happened. Each notification is identified by a unique ID, making it easy to track them.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts, like when using large language models (LLMs). Think of it as a way to save and manage pieces of information related to a particular task or conversation.

It allows you to initialize storage, read individual memory entries identified by a unique ID, and check if a specific entry exists.  You can also write new memory entries, marking them with a timestamp.

Importantly, this interface provides a way to "soft delete" memory entries by marking them as removed—the files remain on disk, but they are excluded from typical searches and listings.

You can list all the currently active (non-deleted) memory entries, which is useful for rebuilding indexes. Finally, there’s a `dispose` function to release any resources that the storage might be using, although in some cases, this might not actually do anything. This is designed for situations where you want to customize how memory data is handled beyond the default file-based approach.

## Interface IPersistMeasureInstance

This interface defines how to manage cached data for specific trading strategies or time periods. Think of it as a way to store and retrieve information that's used repeatedly during backtesting, potentially reducing the load on external data sources.

It allows for a feature called soft deletion, meaning data isn't truly removed from storage but is marked as unavailable for normal use, which can be helpful for recovery or auditing.

If you want to customize how this data is stored – perhaps using a database instead of files – you can create a custom implementation of this interface.

Here's what the methods do:

*   `waitForInit`: Sets up the storage area for this specific data set.
*   `readMeasureData`: Retrieves a specific data entry based on its unique identifier (key).
*   `writeMeasureData`: Saves a new data entry or updates an existing one.
*   `removeMeasureData`: Marks a data entry as deleted, keeping the file but excluding it from future searches.
*   `listMeasureData`:  Provides a way to see all the available data entries that haven't been marked for deletion.

## Interface IPersistLogInstance

This interface defines how log data is stored persistently across your backtest kit application. Think of it as a way to save your trading logs so they're not lost when the application closes.

Unlike other storage methods, this log storage is global, meaning there’s just one instance managing all logs within your process. 

If you want to change how your logs are saved – maybe to a database instead of a file – you can create a custom adapter that implements this interface.

The `waitForInit` method lets you ensure the log storage is ready before you start writing logs. The `readLogData` method retrieves all your existing log entries. Finally, `writeLogData` is how you actually save new log entries, ensuring that existing entries aren't overwritten because each log uses a unique ID.

## Interface IPersistIntervalInstance

This interface helps backtest-kit remember which time intervals have already been processed for a specific trading setup. Think of it as a way to ensure certain actions only happen once per interval. 

If you need to customize how backtest-kit tracks these intervals – for example, if you want to store this information differently than in a file – you can create your own adapter that implements this interface.

The `waitForInit` method sets up the storage for a specific time bucket. `readIntervalData` retrieves information about a previously processed interval, while `writeIntervalData` creates a record to mark an interval as processed.  `removeIntervalData` essentially tells the system that an interval can be triggered again, like resetting the counter.  Finally, `listIntervalData` provides a way to see all the intervals that haven’t been marked as completed.

## Interface IPersistCandleInstance

This interface helps manage a cache of historical candle data specifically for a single trading instrument (like a stock) and timeframe (like 1-minute or daily). Think of it as a way to store and retrieve the price history for a particular symbol.

When you're working with a specific symbol and timeframe, this interface defines the core operations: initializing the cache, reading a chunk of data within a time range, and writing new data. 

If you need to customize how candle data is stored – maybe you want to use a database instead of a file – you can build a custom adapter that implements this interface.

The `waitForInit` method prepares the cache for use.  `readCandlesData` allows you to get existing cached data.  Importantly, if even one expected candle is missing, `readCandlesData` will return `null`, indicating that you need to fetch the data from the original source. `writeCandlesData` is for adding new candle data to the cache. You might choose to skip writing candles that haven’t fully closed yet to avoid overwriting complete records.

## Interface IPersistBreakevenInstance

This interface lets you manage where and how breakeven data – the point where a trade becomes profitable – is stored. It's specifically linked to a combination of symbol, trading strategy, and exchange. Think of it as a personalized storage space for breakeven information related to different trading setups.

Each trading signal gets its own designated spot for this data.

If you want to change how this information is saved (perhaps using a database instead of a file), you can create your own adapter and implement this interface. 

The `waitForInit` method prepares the storage area for a particular trading setup.
The `readBreakevenData` method retrieves previously saved breakeven data for a specific signal and timestamp.
The `writeBreakevenData` method saves new or updated breakeven data for a signal, associating it with a timestamp.


## Interface IPersistBase

This interface lays out the basic building blocks for how your custom storage systems interact with the backtest-kit framework. Think of it as a contract—if your storage solution wants to be used by the framework, it needs to provide methods for initializing, reading, checking for existence, writing, and listing all the data it holds.  The `waitForInit` method handles setup and ensures things only happen once. `readValue` gets data, `hasValue` simply verifies something exists, `writeValue` saves data safely, and `keys` provides a way to see all the identifiers of the data stored. This ensures a consistent and reliable way to manage your persistent data.

## Interface IPartialProfitCommitRow

This represents a single instruction to take a partial profit on a trade within a backtest. 

Think of it as a row in a queue telling the backtest system to sell a portion of your position. 

It specifies that the action is a "partial-profit", then details what percentage of the position should be closed (percentToClose) and the price at which this partial profit was actually achieved (currentPrice). This information helps track and analyze the execution of your trading strategy.


## Interface IPartialLossCommitRow

This represents a request to partially close a trading position. Think of it as a single instruction to reduce the size of a trade.

It includes the type of action being requested, which is "partial-loss."

You'll also find the percentage of the position that's being closed, represented as a number (e.g., 50 for 50%).

Finally, it records the price at which this partial closure happened, allowing you to track the execution details.

## Interface IPartialData

IPartialData helps save bits and pieces of your trading signal's progress so it can be restored later. Think of it as a snapshot of important information.

It focuses on keeping track of the profit and loss levels reached during trading. These levels are stored as arrays, ready for saving and retrieving, and will eventually be rebuilt into the full trading state.

The `profitLevels` property holds the profit levels, while `lossLevels` stores the loss levels. They're basically lists of the significant points where the trade has moved.

## Interface IPartial

The `IPartial` interface is all about keeping track of how your trading signals are performing, specifically focusing on profit and loss milestones. Think of it as a system that monitors signals and announces when they hit significant levels of profit (like 10%, 20%, 30%) or loss. 

This system is used by both the client-side trading logic and the connection service to ensure accurate profit/loss reporting.

The `profit` method is called when a signal is making money, determining which profit milestones have been reached and notifying everyone involved. The `loss` method does the same for signals experiencing losses.

Finally, the `clear` method steps in when a signal finishes – whether it hits a take profit, stop loss, or its time expires – to clean up any lingering data and prepare for the next trade. It effectively resets the tracking for that signal.

## Interface IParseArgsResult

This object holds the results after interpreting command-line arguments related to how your trading system will operate. It essentially tells you whether you're simulating trading with historical data (backtest), practicing with live data but using fake money (paper), or actually trading with real money (live). The `backtest` property is true if you're using historical data, `paper` is true if you're practicing, and `live` is true if you're actively trading.


## Interface IParseArgsParams

The `IParseArgsParams` interface is a way to organize the information needed to run a backtest. Think of it as a recipe – it lists the essential ingredients. 

It specifies things like the trading pair you're interested in (like "BTCUSDT"), the name of the strategy you want to test, which exchange you'll be using (like "binance"), and the timeframe of the data you’ll be analyzing (like "1h" for one-hour candles). These are the basic details to get your backtest started.

## Interface IOrderBookData

The `IOrderBookData` interface holds the current state of an order book, which represents the bids and asks for a specific trading pair. It provides access to the symbol of the trading pair, along with lists of bid and ask orders. Each bid represents a buyer's offer, while each ask represents a seller's offer. You can use this data to understand the current market sentiment and potential price movements.

## Interface INotificationUtils

This interface serves as a foundation for how different systems communicate about important events happening during a trading strategy's backtest or live execution. It defines a set of methods that notification adapters need to implement, allowing them to receive and process various signals and updates.

You'll find methods for handling things like when a trade is opened or closed, when partial profit or loss targets are reached, or when a strategy's settings are changed. There’s also specific handling for synchronization events, rejection of risk, and different levels of errors that might occur.

The `getData` method lets you retrieve a history of all notifications that have been recorded, and `dispose` clears that history when it’s no longer needed. Essentially, this interface provides a standardized way to keep track of and react to the key events within your trading system.

## Interface INotificationTarget

The `INotificationTarget` interface lets you finely control which notifications your backtest or trading system receives. Think of it as a way to filter out the noise and only listen for the specific events you're interested in. If you don't specify this interface, you'll receive all possible notifications, which can be overwhelming.

You can selectively subscribe to different categories of notifications:

*   **Signal Events:** These relate to the lifecycle of trading signals, covering openings, scheduling, closures, and cancellations.
*   **Partial Profit/Loss:** Notifications about reaching pre-defined profit or loss targets.
*   **Breakeven:** Alerts when the price hits the breakeven point.
*   **Strategy Commit:** Confirmations that a strategy has taken a specific action, like taking partial profits or canceling a scheduled order.
*   **Signal Synchronization:** Events related to order confirmations from the exchange during live trading.
*   **Risk Rejection:** Notifications if the risk manager prevents a new signal from being generated.
*   **Informational Signal:** Manual or strategy-triggered messages related to signals.
*   **Common Errors:** Non-fatal errors that are logged but don't stop the process.
*   **Critical Errors:** Fatal errors that cause the backtest to stop.
*   **Validation Errors:** Alerts when there’s an issue with your strategy's configuration or the data you're using.



By only enabling the properties you require, you improve efficiency and focus on the most crucial data points.

## Interface IMethodContext

The `IMethodContext` object is like a little roadmap for your backtesting processes. It holds the names of the specific strategy, exchange, and frame you're working with. Think of it as ensuring that the right components – like your trading strategy, the market it's interacting with, and the time period it's being evaluated on – are all aligned during the backtest. This object is automatically passed around during a backtest, ensuring everyone is on the same page. The `frameName` is especially important: an empty string signifies you're running in live mode, not a historical backtest.

## Interface IMemoryInstance

This interface outlines how memory instances, which can be local, persistent, or simulated, should behave. It's the foundation for managing data within the backtest-kit framework.

The `waitForInit` method prepares the memory instance for use, ensuring it's ready to store and retrieve information.

`writeMemory` is used to save data, allowing you to specify the data itself, a description, and the timestamp of when it occurred.

`searchMemory` lets you find data using a search term, a timestamp filter, and customizable search settings, ranking results by relevance.

`listMemory` provides a way to retrieve all data entries up to a specific timestamp.

You can remove individual data entries with `removeMemory`, again specifying the entry's ID and timestamp.

`readMemory` fetches a single data entry by its ID and timestamp, returning nothing if the data is newer than the requested timestamp.

Finally, `dispose` cleans up any resources used by the memory instance when it's no longer needed.

## Interface IMarkdownTarget

This interface lets you fine-tune which detailed reports are generated by the backtest-kit framework. Think of it as a way to control the level of detail in your analysis.

You can choose to track things like strategy signals (when trades are entered or exited), risk-related rejections (signals blocked by risk limits), or when stop-loss orders move to break-even.

It also offers options for portfolio heatmaps, strategy comparison and optimization, performance bottlenecks, and scheduled signal tracking.

For more comprehensive insights, you can enable reports on live trading events, the complete backtest results with trade history, signal synchronization, and milestone tracking for maximum profit and drawdown. It's all about picking the reports that best suit your specific analysis needs.

## Interface IMarkdownDumpOptions

This interface defines the settings you can use when generating markdown documentation from your backtest-kit project. It allows you to specify exactly which parts of your backtesting setup you want to document – think of it as a way to filter the information included.  You control things like the directory path where the documentation will be created, the name of the specific file being documented, and identifiers like the trading pair, strategy name, exchange, and timeframe. This is helpful for creating focused reports or organizing large backtesting projects. By specifying these properties, you pinpoint the exact data to be represented in the markdown output.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It’s like a central place to record events and messages so you can understand what's going on, find problems, and keep track of everything.

You can use it to write messages about various things:

*   General events like agent activity or storage changes.
*   Detailed debugging information to help troubleshoot issues.
*   Informational updates on things like policy checks or history updates.
*   Warnings about potential problems that you might want to investigate.

The interface provides methods for different levels of logging – `log`, `debug`, `info`, and `warn` – allowing you to control the level of detail in your logs. This helps you focus on what's important for different situations, from regular monitoring to in-depth debugging.

## Interface ILogEntry

ILogEntry represents a single entry in the system's log history. Each log entry has a unique ID and a type indicating its severity – it could be a regular log, a debug message, an informational note, or a warning. 

Timestamps are included to help with organization and potential log rotation. A `createdAt` timestamp provides a user-friendly date, while a more precise numeric timestamp is also stored. 

You can also add context to your log entries; `methodContext` and `executionContext` provide more details about where and how the log was generated. Finally, the `topic` indicates what part of the system created the log, and `args` allows you to pass along extra information you want to record.

## Interface ILog

The `ILog` interface helps you keep track of what's happening during your backtesting process. It provides a way to access a history of all the logged events. 

Specifically, the `getList` method lets you retrieve all the log entries that have been recorded, giving you a complete record of actions and messages generated during the backtest. This is useful for debugging, analyzing performance, or auditing your trading strategy.

## Interface IHeatmapRow

This interface describes a single row of data for a heatmap visualizing trading performance. Each row represents a single trading symbol, like BTCUSDT, and provides a wealth of information about how strategies performed on that symbol.

It includes key metrics like total profit/loss, Sharpe ratio (measuring risk-adjusted return), maximum drawdown (the largest loss experienced), and the total number of trades. You'll also find details about win rates, average profits and losses per trade, and streaks of consecutive wins or losses.

Beyond basic profitability, the data also includes insights into trade duration, the distribution of profits and losses, and more advanced ratios like the Sortino and Calmar ratios.  Finally, it even provides information about the market trend and momentum, including buyer and seller pressures. This detailed view allows for a comprehensive understanding of how a trading strategy is performing for a specific asset.


## Interface IFrameSchema

This describes a blueprint for how your backtesting data is structured, essentially defining a segment of time to analyze. Each blueprint, or frame, has a unique name to identify it. You can add a note for yourself to explain what this frame represents.

It specifies the timeframe for data generation—like one-minute intervals ("1m") or daily data. You’ll also need to set the start and end dates for the backtest period you want to cover.

Finally, you can optionally provide callbacks that let you hook into different stages of the frame's lifecycle. This lets you do things like perform custom calculations or log events as the data is processed.

## Interface IFrameParams

The `IFrameParams` object defines the information needed to set up a frame within the backtest-kit framework. Think of it as a container holding essential details for each step in your backtesting process. It includes a logger, which is incredibly useful for tracking what's happening and debugging any issues. You also specify a unique name, or "interval," for each frame, which helps you keep everything organized and identify individual steps in your backtest.

## Interface IFrameCallbacks

The `IFrameCallbacks` interface lets you hook into what happens during the timeframe generation process. 

Specifically, the `onTimeframe` function gets called once the timeframes have been created. You can use this to keep an eye on the generated timeframe data – perhaps to log it, check its validity, or do some other processing after the fact. It receives the array of timeframes, the start and end dates used for the timeframe generation, and the interval used (like 'daily' or 'weekly').


## Interface IFrame

The `IFrame` interface is a core component for creating the timeline of data used in backtesting. Think of it as the engine that produces the sequence of dates and times your trading strategy will analyze.

Its main function, `getTimeframe`, takes a trading symbol (like "BTCUSDT") and a frame name (like "1h" for one-hour intervals) and returns an array of dates. These dates represent the points in time your backtest will evaluate. The spacing between these dates is determined by the timeframe you specify. Essentially, it sets up the backbone for running your backtest.

## Interface IExecutionContext

The `IExecutionContext` object is like a little package of information that's passed around to your trading strategies and exchange interactions. It tells your code what's going on right now, giving it the necessary details to function. 

Essentially, it holds the current trading symbol, like "BTCUSDT", and the exact timestamp of the current operation. 

Crucially, it also indicates whether the code is running in a backtest—simulated trading—or in a live trading environment. This allows your code to behave differently depending on the context. Think of it as the context needed for functions such as fetching historical data or processing incoming ticks.


## Interface IExchangeSchema

The `IExchangeSchema` describes how backtest-kit interacts with a specific cryptocurrency exchange. It's essentially a blueprint for telling the framework where to get data and how to handle quantities and prices correctly.

Each exchange needs a unique identifier, and you can add a note for yourself to remember details about its implementation.

The core of the schema is the `getCandles` function – this is what retrieves historical price data (candles) for a symbol, given a timeframe and starting point.

`formatQuantity` and `formatPrice` are optional functions that handle the potentially complex rules for representing trade sizes and prices accurately for each exchange, making sure they conform to the exchange’s standards. If you don't define these, it will assume a default Bitcoin precision.

You can also define `getOrderBook` and `getAggregatedTrades` to retrieve order book data and trade history, although providing these is optional—if they aren't provided, the system will indicate that these functions need to be implemented.

Finally, there's an optional `callbacks` section that lets you define functions to react to certain events, like when new candle data becomes available.

## Interface IExchangeParams

This interface defines the essential configuration needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. Think of it as a blueprint for how your backtesting system will communicate with an exchange’s data.

You'll provide functions that handle retrieving historical data like candles, order books, and aggregated trades, as well as formatting quantities and prices to match the exchange's specific rules. The `logger` helps with debugging and monitoring, while `execution` provides context such as the trading symbol and the backtest flag. 

Critically, most functions are required, meaning you must provide implementations to ensure the framework can access the necessary data and properly execute trades during backtesting. Default implementations are available to simplify the setup when possible.

## Interface IExchangeCallbacks

This allows you to react to new candle data coming in from the exchange. You'll be notified whenever a set of candles is retrieved, giving you the symbol, time interval, starting date, number of candles fetched, and the actual candle data itself. Use this to update visualizations, trigger alerts, or perform other actions based on the latest price action.


## Interface IExchange

The `IExchange` interface defines how your backtest kit interacts with a specific exchange. It provides essential methods for retrieving historical and future market data, calculating average prices, and formatting order quantities.

You can request historical candle data using `getCandles` and future candles for backtesting with `getNextCandles`. `getRawCandles` offers even more flexibility, allowing you to specify start and end dates or simply a limit for how much data to retrieve, all while ensuring data consistency for accurate backtesting.

The framework also handles the complexities of trading by providing functions to format quantities and prices according to the exchange's requirements. It allows to fetch order books, aggregated trades and retrieve the closing price of the last candle. Finally, `getAveragePrice` calculates the VWAP (Volume Weighted Average Price) based on recent candle data.

## Interface IEntity

This interface serves as the foundation for all objects that are stored and retrieved persistently within the backtest-kit framework. Think of it as the common blueprint ensuring that any data you save, like trading strategies or historical market data, adheres to a consistent structure. It's the starting point for building reliable and organized data management within your backtesting environment.

## Interface IDumpInstance

This interface defines how a component can save data during a backtesting run. Think of it as a way to record key information about what happened. 

You can use it to capture things like:

*   Full conversation histories between agents.
*   Simple key-value data records.
*   Tables of data, where the column names are automatically figured out from the data itself.
*   Raw text or markdown notes and descriptions.
*   Error messages to help troubleshoot problems.
*   Complex JavaScript objects, safely formatted as JSON.

The `dispose` method is used to clean up any resources the component might be using when the backtest is finished. Each instance of this interface is linked to a specific signal and bucket, so it knows where to save the information.

## Interface IDumpContext

The IDumpContext provides essential information for identifying each individual dump record. Think of it as a label that attaches to a piece of data, letting you know what trade it relates to, which strategy or agent created it, and whether it’s from a backtest or live trading environment. It includes a unique ID for the dump itself, a descriptive label you can use to understand what's in the dump, and flags indicating whether it came from a backtest. This context is automatically passed during the dump process, so you don't directly create it yourself.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that need to be processed later, like when a trade happens. It's designed to hold basic information about those events, ensuring they're handled correctly even if the system isn't immediately ready. 

Each event includes the trading symbol, letting you know which asset was involved.
It also flags whether the event occurred during a backtest, which can be important for analysis and reporting.

## Interface ICheckCandlesParams

This interface defines the information needed to check if your candle data is available. It’s designed to quickly verify if the backtest-kit has the required historical data without needing to search through the files. You’ll provide the trading pair's symbol, the exchange it's on, the candle timeframe (like 1 minute or 4 hours), and a start and end date to specify the range you’re interested in. Essentially, it's a way to ask, "Do I have the data I need for this particular trading pair, timeframe, and date range?".

## Interface ICandleData

This interface represents a single candlestick, a common way to organize price data over time. Each candlestick holds information about the opening price, the highest price reached, the lowest price touched, the closing price, and the volume traded during that specific period.  The `timestamp` tells you exactly when that candle's timeframe began. This data structure is fundamental for backtesting trading strategies and calculating indicators like VWAP.

## Interface ICacheCandlesParams

This interface defines the settings you can use when preparing your historical data for backtesting. It’s designed to help streamline the process of making sure your data is correct and ready to go. 

You can provide functions that get triggered at key moments: 

*   `onWarmStart`: This function runs right before the system starts warming up the cache after it's detected that the data isn’t valid.
*   `onCheckStart`: This function runs right before the warm-up phase begins, only if the data needed to be warmed up.

These callbacks let you add extra logic or monitoring during these critical data preparation steps.

## Interface IBroker

The `IBroker` interface defines how backtest-kit connects to a live trading broker. Think of it as a blueprint for adapting the framework to interact with specific exchanges.

It outlines a set of methods that are called just before the backtest-kit makes any changes to its internal records, ensuring that if something goes wrong during a broker interaction, the system remains in a consistent state.

Crucially, when in backtest mode, these methods won’t actually do anything – they’re essentially ignored, preventing real orders from being placed.

The methods cover a range of trading actions:

*   `waitForInit`: A one-time setup call for connecting to the broker and loading any necessary information.
*   `onSignalCloseCommit`:  Handles the closing of an existing trade, whether by reaching a target profit, a stop-loss, or a manual order.
*   `onSignalOpenCommit`:  Manages the opening of a new position.
*   `onPartialProfitCommit`: Deals with taking a portion of profits.
*   `onPartialLossCommit`: Handles taking a portion of losses.
*   `onTrailingStopCommit`: Updates a trailing stop-loss order.
*   `onTrailingTakeCommit`: Updates a trailing take-profit order.
*   `onBreakevenCommit`: Sets or adjusts a breakeven stop-loss.
*   `onAverageBuyCommit`:  Executes a dollar-cost averaging (DCA) buy order.

## Interface IBreakevenData

This data structure, `IBreakevenData`, is designed to save and load information about whether a breakeven point has been achieved for a specific trading signal. It's a simplified version of a more complex state, specifically made to be easily stored as JSON – think of it as a snapshot for saving your progress. When your trading system loads, this data helps recreate the breakeven status for each signal it tracks. Essentially, it tells you if the target has been met.

## Interface IBreakevenCommitRow

This interface represents a single action taken during a backtest related to breakeven points. It's essentially a record of when a breakeven adjustment occurred.

Each record includes the action type, always "breakeven" in this case.  It also stores the price at which the breakeven level was established – this is the price relevant to that particular breakeven calculation.

## Interface IBreakeven

The `IBreakeven` interface helps manage when a trading signal's stop-loss order should be adjusted to the original entry price, essentially protecting profits. It's used by components that track and manage these breakeven adjustments.

The `check` method is the core of this functionality; it's used to regularly assess if the price has moved favorably enough to justify moving the stop-loss to breakeven, taking into account any transaction costs involved. When the conditions are right—meaning breakeven hasn't already been achieved, the price has moved sufficiently, and the stop-loss can be safely adjusted—the system marks breakeven as reached, notifies interested parties, and saves the change.

Conversely, the `clear` method resets the breakeven state when a signal is finished, whether that's from hitting a take-profit, stop-loss, or simply time expiring. This ensures the system cleans up and prepares for the next signal.

## Interface IBidData

This data structure represents a single bid or ask price point found within an order book. Each entry includes the price at which that level exists, expressed as a string. Alongside the price, you'll find the quantity of assets available at that particular price, also represented as a string. This gives you a snapshot of the market depth at a specific price point.

## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (often called DCA - Dollar-Cost Averaging) process. It essentially describes one purchase within a series of purchases designed to smooth out the cost of acquiring an asset. 

Each `IAverageBuyCommitRow` details a specific averaging entry, including the price at which it was bought and the total cost of that individual purchase. You’ll also find the total number of averaging entries that exist so far, giving context within the entire buy sequence. It's a snapshot of a particular transaction within a broader DCA strategy.

## Interface IAggregatedTradeData

This data structure holds information about a single trade that took place. It’s designed to give you the specifics of each transaction, like the price, how many units were traded, and exactly when it happened. You'll find a unique ID for each trade, along with the trade price and quantity. Importantly, it tells you whether the buyer was acting as a market maker, which helps understand the direction of the trade.

## Interface IActivityEntry

An `IActivityEntry` represents a single trading run, whether it's a backtest or a live trade. 

It’s like a record keeping track of what's happening during a specific test or trading period. 

This record includes the trading pair (like "BTCUSDT"), details about the strategy being used (its name, the exchange it's on, and potentially the timeframe), and whether it’s a backtest or a live execution.

The system uses these entries to manage and coordinate activities, ensuring that multiple runs don't interfere with each other.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a scheduled commit, essentially triggering a pre-planned action. It's used when a system needs to execute a task that was previously scheduled.

The `action` property confirms the type of request is an "activate-scheduled" action. 

The `signalId` is a crucial identifier, specifying which scheduled event is being activated.  It's the primary key to locating the commit.

Finally, `activateId` provides a way to tie the activation to a specific user action, though it's not always required.


## Interface IActionStrategy

The `IActionStrategy` interface gives your action handlers a way to peek at the current trading signal status. It’s like a read-only window into what's happening with signals, so you can make informed decisions within your trading logic.

Specifically, it lets you quickly see if there's an open position (a pending signal) or a signal that's about to happen (a scheduled signal) for a given symbol.

This information is helpful for things like deciding whether to allow certain actions - like taking profits or losses, or even just checking in – because you only want those actions to happen when a signal is actually present. It ensures actions are executed appropriately based on the current state of the trading environment.


## Interface IActionSchema

The `IActionSchema` lets you extend the backtest-kit framework with your own custom event handling logic. Think of it as a way to hook into the trading strategy's execution flow and do things like manage state, log events, send notifications, or even trigger custom behaviors.

You define these actions by providing a unique identifier and an optional description. 

The core of an action is the `handler`, which is either a constructor function that builds your event handler or a set of predefined functions that the framework can call. 

Finally, you can specify optional `callbacks` to control when and how your action is invoked during the backtesting process. Essentially, it provides a flexible mechanism to add custom logic to your strategies without directly modifying the core framework.

## Interface IActionParams

This interface, `IActionParams`, is all about giving your actions the information they need to do their job effectively. Think of it as a package containing everything an action needs to know about its surroundings. 

It builds upon a base schema and includes a `logger` for keeping track of what's happening during execution – essential for spotting problems and understanding performance. You’ll also find details like the name of the strategy and exchange involved, and whether the action is part of a backtest.  Finally, it gives you access to the current state of the strategy, which is very useful for making informed decisions.

## Interface IActionCallbacks

This interface lets you hook into different stages of an action handler's lifecycle, giving you flexibility to manage resources and respond to events. Think of it as a way to customize how your actions behave.

You can set up initialization routines with `onInit` to do things like connect to databases or load initial data. `onDispose` lets you clean up after things, closing connections and saving state.

Several callbacks exist for different signal events. `onSignal` gets called for all modes (live and backtest), while `onSignalLive` and `onSignalBacktest` are specific to live and backtest modes respectively. You’ll get notified when breakeven is reached (`onBreakevenAvailable`), when partial profit or loss levels are hit (`onPartialProfitAvailable`, `onPartialLossAvailable`), and during scheduled signal monitoring (`onPingScheduled`, `onPingActive`, `onPingIdle`).  `onRiskRejection` tells you when a signal is rejected by your risk management system.

There’s also `onSignalSync`, a special callback that gives you a chance to approve or reject a limit order placed by the framework—returning `false` or throwing an error will cause the framework to try again on the next tick.

## Interface IAction

This interface, `IAction`, is your central hub for reacting to events generated by the backtest-kit framework. Think of it as a way to hook into the framework's inner workings to build custom tools and integrations.  You can use it to create things like custom dashboards, logging systems, or to integrate with external services.

It provides a set of functions, each responding to a specific type of event:

*   `signal`: A general event triggered during both backtesting and live trading.
*   `signalLive`: Specifically for live trading scenarios.
*   `signalBacktest`: For backtesting runs only.
*   `breakevenAvailable`:  Notifies you when a stop-loss hits entry price.
*   `partialProfitAvailable` and `partialLossAvailable`:  Let you know when you hit specific profit or loss levels.
*   `pingScheduled`, `pingActive`, and `pingIdle`: Handle events related to scheduled, active, or idle signal monitoring.
*   `riskRejection`: Alerts you when a trade is rejected due to risk considerations.
*   `signalSync`: This allows you to intervene when the framework is trying to execute a trade using a limit order - you can even reject the order.
*   `dispose`: Essential for cleaning up any resources (like subscriptions or open connections) when you're finished with your custom logic.

Essentially, `IAction` is designed to make the backtest-kit framework flexible and extensible, allowing you to tailor its behavior and integrate it with your unique workflows.

## Interface HighestProfitStatisticsModel

This model holds the results when you're looking for the times your trading strategy made the most profit. It includes a complete, ordered list of those profitable events, with the most recent ones appearing first. You'll also find a simple count of how many profitable events were recorded overall. Essentially, it's a convenient way to review and analyze your strategy's best-performing moments.

## Interface HighestProfitEvent

This data represents the single most profitable moment recorded for a specific trading position. It captures key details like the exact time it happened, which trading pair was involved, and the name of the strategy used. You'll also find the unique ID of the signal that triggered the trade, and whether the position was a long or short.

The information includes the overall profit and loss (PNL) for the entire trade, along with the highest profit reached at any point and the largest drawdown experienced.  You can see the price at which the peak profit was achieved, alongside the entry price, take profit level, and stop-loss order. Finally, it indicates whether this event occurred during a backtesting simulation or a live trade.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading strategy hits a new peak profit. It’s essentially a notification that something good happened in your trading! Each notification includes details like the trading symbol (e.g., BTC/USDT), the current price, and the exact time of the update.

You'll also find the name of the strategy, the exchange used, and the timeframe being analyzed. Importantly, it includes the signal data that triggered the trade and a flag indicating whether this event occurred during a backtest or in live trading. This allows you to react to profit milestones – perhaps by adjusting your trailing stops or taking partial profits.

## Interface HeatmapStatisticsModel

This model summarizes the overall performance of your trading portfolio, pulling together data from all the individual assets you're trading. It provides a broad view of how your portfolio is doing, covering everything from total profit and loss to risk-adjusted returns and trade durations. 

You'll find aggregated metrics like total portfolio profit, Sharpe Ratio, and the number of trades executed. It also calculates trade-weighted averages for peak and fall profit/loss, giving a clearer picture of typical performance.

The model also digs into trade characteristics, offering insights like average winning and losing durations, standard deviation of returns, and various ratios like Sortino, Calmar, and Recovery Factor to assess different aspects of risk and return. Finally, it presents extrapolated yearly performance metrics to project long-term potential. This comprehensive view helps you evaluate your overall portfolio strategy and identify areas for improvement.


## Interface DoneContract

This interface represents what happens when a background task, like a backtest or live trading process, finishes running. 

It gives you information about the completed execution, such as the exchange used, the name of the trading strategy involved, and whether it was a backtest or live trading session. 

You'll also find the trading symbol – like BTCUSDT – and the frame name, which is empty when running in live mode. Essentially, it's a notification with details about the job that just concluded.


## Interface CronHandle

This object lets you cancel a scheduled task you previously set up using the `Cron` system. Think of it like an "off switch" for your automated actions. When you're finished with a scheduled task, calling a method on this object will remove it from the schedule, preventing it from running again. It's essentially a convenient way to clean up your scheduled tasks.

## Interface CronEntry

A CronEntry defines when and how a specific task will run within the backtest framework. 

Each entry needs a unique name to identify it, and that name can't contain colons. 

You also specify an interval—like "1m" for every minute—telling the system when to trigger the task. If you skip the interval, it will run only once, immediately when the conditions are met.

The `symbols` property determines if the task executes globally (once per interval) or specifically for a set of symbols. When you provide symbols, the task runs once for each symbol in that list during each interval.

Finally, a handler function defines the actual code that executes when the cron entry is triggered.

## Interface CriticalErrorNotification

This notification signals a critical error that needs immediate attention, likely requiring the process to shut down. 

It provides a unique identifier for tracking the error. 

You'll also find a human-friendly error message to help understand what went wrong, along with details like a stack trace and other relevant information within the `error` property. 

Importantly, the `backtest` flag is always false, indicating the error occurred in a live environment, not a simulated backtest.

## Interface ColumnModel

This interface helps you define how data should be presented in a table. Think of it as a blueprint for each column you want to display.

It lets you specify a unique identifier for each column (`key`), a user-friendly name to show in the header (`label`), and a function to transform the raw data into a readable string (`format`).

You can even control whether a column should be shown at all, using a function to determine its visibility (`isVisible`). This allows for dynamic column management based on different conditions.

## Interface ClosePendingCommitNotification

This notification lets you know when a pending signal is closed before it actually turns into a live position. It’s like a signal being canceled before it’s fully activated.

It provides a wealth of information about the closed signal, including a unique ID, when the close happened, and whether it occurred during a backtest or live trading. You’ll find details about the strategy, exchange, and the specific signal itself. 

The notification also includes comprehensive performance data: PNL, peak profit, maximum drawdown, and related prices – all broken down to show the detailed financial picture of what *would have* been the trade. It's useful for understanding why signals are being canceled and analyzing their potential profitability. There’s even a field for a descriptive note that might explain the reason for the closure. Finally, the notification includes a timestamp of when it was created for accurate tracking.


## Interface ClosePendingCommit

This signal tells the backtest system that a position has been closed. It includes details about the closure, such as an identifier you can provide to explain why the position was closed. 

You'll also find data about the position's performance, like its total profit and loss, the highest profit it reached, and its biggest drawdown – all calculated up to the point when this signal was sent. This information helps you understand how the position performed over its lifetime.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it was executed. It provides a wealth of information about the signal and its potential outcome, even though it wasn't activated. You'll find details like a unique ID, the exact time of cancellation, and whether it occurred during a backtest or live trading session.

The notification includes comprehensive data concerning the intended trade, like the symbol, strategy name, and exchange used, along with identifiers for the signal and cancellation itself.  It also tracks details around potential averaging (number of entries and partials), the original intended entry price, and projected Profit & Loss (PNL), including peak profit and maximum drawdown metrics, all expressed in both numerical and percentage terms.

Finally, you'll see contextual details like the reason for cancellation (if provided), timestamps for creation and cancellation, and an optional note that might offer a human-readable explanation. Essentially, this notification gives you a snapshot of a trade that didn't happen, but includes all the information as if it did.

## Interface CancelScheduledCommit

This interface defines a message used to cancel a previously scheduled trading signal. It’s essentially a way to tell the system to disregard a signal that was supposed to be executed later.

The `action` property always identifies this as a cancellation request.

You can optionally include a `cancelId` to provide a reason or identifier for the cancellation, which can be helpful for tracking purposes.

Along with the cancellation details, the message also includes information about the trade that was being managed, namely the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`). This data allows you to understand the performance characteristics of the trade being canceled.


## Interface BreakevenStatisticsModel

This model holds information about the breakeven points reached during a trading backtest. 

It essentially tracks how often the price has returned to the initial entry price.

The `eventList` property gives you a detailed look at each individual breakeven occurrence, including all associated data. 

You can also see the overall number of breakeven events through the `totalEvents` property, giving you a quick summary of how frequently this milestone has been hit.

## Interface BreakevenEvent

This data structure holds all the key information related to when a trading signal reaches its breakeven point. It’s designed to be used when generating reports about your trading performance.

You'll find details like the exact time the breakeven was hit, the trading pair involved, and the name of the strategy that generated the signal. It also includes crucial pricing data, such as the initial entry price, take profit target, and stop-loss levels, as well as their original values set when the signal was first created.

If you've used a dollar-cost averaging (DCA) strategy, the data will also show you the number of entries and partial closes. Other important details are the unrealized profit and loss (PNL) at that point, a description of the signal, and timestamps for when the position became active and the signal was created. Finally, a flag indicates whether the event occurred during a backtest or in live trading.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is moved back to the original entry price. Think of it as a safety milestone - your trade has made enough profit to cover the initial risk. 

It's emitted by the backtest-kit system and is designed to be tracked so you can understand how your strategies are managing risk. Events of this type are only generated once for each signal.

The information included in the event tells you exactly what happened: which trading pair (symbol) was involved, what strategy generated the signal, which exchange and timeframe were used, and the complete original signal details. You'll also find the current price at the time of the breakeven and a flag to indicate if this happened during a backtest or live trading. Finally, a timestamp tells you precisely when this event occurred.

## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a trade has been closed. It provides a wealth of information about the closed position, allowing you to understand exactly what happened and analyze its performance. You'll find details like a unique identifier for the notification, the timestamp of the event, and whether it occurred during backtesting or live trading.

The notification breaks down the specifics of the trade, including the trading pair, the strategy involved, and the exchange where it was executed. It specifies if it was a long or short position and details the entry, take profit, and stop-loss prices, both original and adjusted for trailing. 

Beyond the basic trade details, you get a comprehensive performance report. This includes key metrics like profit and loss (both absolute and percentage), peak profit, maximum drawdown, and even prices associated with these figures. The notification also includes information about the number of entries used (useful for understanding DCA strategies) and the number of partial closes executed. Finally, there's an optional note field for any custom explanation of the trade's reasoning.

## Interface BreakevenCommit

The BreakevenCommit event signifies a breakeven adjustment has occurred during a trade. It provides detailed information about the trade's state at the moment of the adjustment.

This includes the current market price, the overall profit and loss (pnl) of the position, and performance metrics like peak profit and maximum drawdown achieved.

You'll find details about the trade's direction (long or short), the original entry price, and the take profit and stop loss prices, both as they are currently set and as they were initially defined.

The event also logs the timestamps related to when the signal was created and when the position was initially activated, giving you a full timeline of the trade’s lifecycle up to this breakeven point.


## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss order can be adjusted to the entry price, effectively breaking even. It’s a positive sign indicating the trade has moved in your favor.

The notification provides a wealth of information about the trade, including a unique ID, the exact time it happened, whether it's from a backtest or live trading, and the trading pair involved. It also details key metrics like the current price, entry price, trade direction (long or short), take profit and stop loss levels, and the original prices set when the trade was initiated.

You’ll find detailed data about the trade's performance, including profit and loss (P&L), peak profit, maximum drawdown, and the number of entries and partial exits.  It also offers granular price data related to those performance metrics.  Finally, there are timestamp details related to signal scheduling and position activation. This allows you to thoroughly analyze the trade’s journey and understand how the strategy performed.

## Interface BeforeStartContract

This event lets you perform one-time setup tasks right before a trading strategy begins running, whether it's a backtest or live trading session. Think of it as a preparation stage that happens only once for each run. It's your chance to initialize things like log files, reset counters, or send notifications that the run has started.

It's designed to work hand-in-hand with the `AfterEndContract` event, ensuring a clean start and end for each trading run.  Any errors that happen within your initialization code won't stop the run, but will be handled elsewhere.

The information included with this event tells you which symbol the trading is for, the strategy's name, the exchange providing data, and whether it’s a backtest or live run. You’ll also find the current price, the event's time as a `Date` object, and the same time as a timestamp (in milliseconds), which is useful for logging or other processes. Remember that the time provided in a backtest represents the intended starting time of the historical data, while in live trading, it’s the actual current time.

## Interface BacktestStatisticsModel

This model provides a comprehensive breakdown of your backtest results, presenting key performance indicators to help you understand your strategy's strengths and weaknesses. It contains a detailed list of closed signals along with essential metrics like total signals, win/loss counts, and win rate. 

You'll find calculations for profitability like average PNL, total PNL, and expectancy, as well as measures of risk and volatility, including standard deviation, Sharpe Ratio, and Sortino Ratio. It also details trade durations and offers insights into consecutive wins and losses.

Beyond basic metrics, the model offers more nuanced perspectives on market behavior with buyer and seller pressure indicators, trend analysis (including strength and confidence), and insights into step size distributions. Essentially, it provides a robust framework for analyzing your strategy's performance and identifying areas for improvement.

## Interface AverageBuyCommitNotification

This notification signals that a new part of your dollar-cost averaging (DCA) strategy has been executed. It provides detailed information about this latest averaging step, including the precise price, cost, and the cumulative effect on your position. You’ll find specifics like the total number of DCA entries made so far, the total partial closes executed, and how these actions have impacted your effective entry price.

The notification also gives you a comprehensive view of the position's performance. You can see the total profit or loss (both in USD and percentage), peak profit achieved, maximum drawdown, and relevant prices at those points. Additional data like the original entry price, take profit, and stop loss prices, along with signal creation and scheduling timestamps, are included for context. A human-readable note field may offer extra insight into the reasoning behind this signal.

## Interface AverageBuyCommit

This interface, AverageBuyCommit, represents a signal generated when a new buy order is executed as part of a dollar-cost averaging (DCA) strategy. It provides detailed information about this particular averaging event.

You'll find the price at which the buy was made, along with the total cost of that buy in USD. The `effectivePriceOpen` property shows you the new, averaged entry price after this averaging buy has been factored in.

The signal also includes key performance indicators related to the position’s life, such as current unrealized profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).

It also tracks the initial entry price (`priceOpen`), as well as any adjusted take profit and stop loss prices. All timestamps related to the event are provided to track the signal's lifecycle.

## Interface AfterEndContract

This interface, `AfterEndContract`, signals the completion of a trading strategy run. Think of it as a notification sent after a strategy has finished executing, whether that’s due to reaching the end of the historical data, being stopped manually, or encountering an error. It's designed for cleanup tasks like flushing data buffers, closing files, or sending completion notifications – things that need to happen reliably at the very end of each run.

You’re guaranteed to receive this event exactly once for each strategy run, always paired with a corresponding `BeforeStartContract` event marking the beginning. Any errors happening while processing this event are handled internally, preventing them from disrupting your application.

The `when` property is particularly important. During backtesting, it reflects the exact time of the last processed candle. If no candles were processed (perhaps the data frame was empty), it falls back to the planned start date of the frame to match the `BeforeStartContract`. In live trading, it represents the current system time, rounded down to the nearest minute.

The event also provides useful information like the trading symbol, strategy name, exchange name, frame name, and whether the run was a backtest or live run. A convenient `currentPrice` is included, giving you the average price observed at the end of the run, so you don't need to fetch it separately.  Finally, `timestamp` provides the same information as `when` but as a numerical representation for easier serialization and logging.

## Interface ActivePingContract

This interface describes the information sent when a pending trading signal is actively being monitored. Think of it as a regular heartbeat during the life of a pending order, letting you know the signal is still "alive."

Each heartbeat contains key details like the trading pair (e.g., BTCUSDT), the name of the strategy that created the order, the exchange being used, and the timeframe involved.

You also get the full data associated with the pending signal – including all the usual order details. The current market price is included, allowing you to react to price movements even during the pending order stage.

Finally, there’s an indicator of whether this ping is coming from a backtest (historical data) or live trading, and a timestamp marking exactly when the ping occurred. This allows for more advanced and customized trading logic.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been manually activated, meaning a trade is about to happen. It provides a wealth of information about the impending trade, including a unique ID, the exact time it was triggered, and whether it's happening in a test or live environment.

You’ll find details about the trade itself, such as the symbol being traded (e.g., BTCUSDT), the strategy that generated the signal, and the intended trade direction (long or short). The notification also includes the entry price, take profit, and stop loss levels, as well as the original values before any adjustments.

Crucially, it includes performance data for the trade, like total profit and loss (both in USD and as a percentage), peak profit, and maximum drawdown, along with the specific prices at which those points were achieved.  You can also see details about how many entries (DCA averaging) and partial closes were involved. Finally, there are timestamps indicating when the signal was originally scheduled, when it became pending, and when the activation occurred, along with the current market price at that moment. A note field allows for adding custom reasons for signal activation.

## Interface ActivateScheduledCommit

This interface describes the data you receive when a scheduled trading signal is activated. Think of it as a notification that a pre-planned trade is now happening.

It includes key information about the trade, such as whether it's a long (buy) or short (sell) position, the entry price, and the take profit and stop-loss levels, both as originally set and after any adjustments. You'll also find details about the trade’s profit and loss history, including peak profit and maximum drawdown experienced.

Crucially, it includes a timestamp indicating when the signal was initially created and another showing when it was actually activated. An optional identifier allows you to track the reason for this specific activation. This information helps you understand the context and performance of the triggered trade.
