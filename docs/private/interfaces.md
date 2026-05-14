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

The WalkerStopContract represents a signal that a walker has been instructed to stop.

This happens when you want to pause or interrupt a running automated trading process.

It provides details about which specific walker and trading strategy needs to be halted, including the walker’s name, which is helpful when multiple walkers are active on the same trading symbol.

Essentially, it's a notification containing the symbol being traded, the name of the strategy involved, and the name of the walker that's being stopped.

## Interface WalkerStatisticsModel

The WalkerStatisticsModel provides a way to represent the results of a backtesting process, specifically designed to make things easier to understand when working with markdown documents. It builds upon the existing IWalkerResults structure and adds extra information related to comparing different strategies. The most important piece of data you'll find here is the `strategyResults` array – this list holds all the outcomes from each strategy you tested, allowing you to analyze performance and make comparisons.

## Interface WalkerContract

The WalkerContract provides updates on the progress of strategy testing, letting you know when a strategy finishes its evaluation and its placement in the rankings. Each update contains details like the strategy's name, the exchange and symbol being tested, and the statistics generated from the backtest. You'll also see key performance metrics, the best-performing strategy so far, and how many strategies have been tested compared to the total. This allows you to track the optimization process and see how strategies are being compared against each other.

## Interface WalkerCompleteContract

The WalkerCompleteContract signals that a backtesting process is finished and all strategies have been evaluated. 

It bundles together all the results from the backtest, including details about which symbol, exchange, and timeframe were used. 

You'll find information about the optimization metric, the total number of strategies that were tested, and importantly, which strategy emerged as the best performer.

The contract provides the best strategy’s name, the metric value it achieved, and comprehensive statistics about its performance. Essentially, it’s your final report card for the backtesting run.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during your trading strategy's evaluation. 
It pops up whenever your risk validation functions encounter a problem, like an unexpected condition or constraint being violated. 

Here's what you can find in this notification:

*   A unique ID to identify the specific error.
*   A detailed error object that includes a stack trace and any extra information about the error.
*   A clear, human-readable message explaining the validation issue.
*   A flag confirming that the error originates from a live context and not the backtest itself.

## Interface ValidateArgs

The `ValidateArgs` interface helps ensure that all the names you're using within your backtesting setup – things like the exchange, timeframe, strategy, risk profile, action, sizing method, and parameter sweep – are valid and recognized by the system. Think of it as a checklist to prevent errors caused by typos or using names that don't exist. 

Each property within `ValidateArgs` expects an enum object. These enums contain the allowable values for each of these naming components.

Here's a breakdown of what each property represents:

*   **ExchangeName:** The name of the exchange being used.
*   **FrameName:** The timeframe for your data (e.g., "1m", "1h").
*   **StrategyName:** The name of the trading strategy you're employing.
*   **RiskName:** The name of your risk management profile.
*   **ActionName:** The name of the action handler (like placing an order).
*   **SizingName:** The name of the strategy used for determining order size.
*   **WalkerName:** The name of the parameter sweep, used to optimize strategy settings.

## Interface TrailingTakeCommitNotification

This notification signals that a trailing take profit order has been executed. It provides a wealth of information about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading.

You'll find details about the trading pair, the strategy that triggered the action, and the exchange involved. It also gives you the signal's unique ID, along with how much the take profit price shifted.

The notification details the current price at execution, the trade direction (long or short), and the original entry and take profit/stop loss prices, as well as the adjusted values after trailing. It also includes comprehensive profit and loss data: total P&L, peak profit, maximum drawdown, and all the related prices and percentages.

Beyond the core financial data, there's information about the total number of entries (for averaging) and partial closes, along with timestamps for signal creation, pending status, and the creation of the notification itself. A free-text note field allows for additional context or explanation about why the signal was generated.

## Interface TrailingTakeCommit

This interface represents a trailing take profit event within the trading strategy. It provides details about when and how a take profit level was adjusted based on a trailing mechanism. 

You'll find information about the action type, which is specifically "trailing-take".  The `percentShift` indicates how much the take profit level moves with the price, defining the trailing distance.

Along with this, the event logs the current market price at the time of the adjustment, as well as the current profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown (`maxDrawdown`) for the position.

It also includes details about the trade itself, such as the direction (long or short), entry price, original and updated take profit and stop-loss prices, and timestamps related to when the signal was created and the position was activated. This data allows for a complete understanding of the trailing take profit event's impact on the trade.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a wealth of information about the trade, including when it happened, what exchange was involved, and the specifics of the trading strategy that initiated it. You'll find details like the original and adjusted stop-loss and take-profit prices, along with the current market price at the time of execution.

The notification also covers the performance of the trade itself, showing the profit and loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced.  It breaks down the investment details, like the number of entries and partial closes, and provides timestamps for key events like signal creation, pending status, and when the trade was created. Finally, a note field allows for a human-readable explanation of why the signal was generated.

## Interface TrailingStopCommit

This data describes an event triggered by a trailing stop order being executed. It essentially captures all the details about the trade at the moment the trailing stop adjustment occurred.

You'll find information on the action type, which is specifically "trailing-stop".

The event also includes the percentage shift used to adjust the stop-loss price, and the current market price at the time of the change.

Key performance metrics of the position are provided, such as the profit and loss (PNL), the highest profit reached, and the largest drawdown experienced.

The trade direction (long or short) and the original entry price are also present.

Furthermore, the data lists the current take profit and stop loss prices, along with their initial, untrailed values.

Timestamps mark when the signal was created and when the position was actually activated. This allows you to track the full lifecycle of the trade.

## Interface TickEvent

This interface, `TickEvent`, serves as a standardized way to represent all the data related to a trading event, regardless of the specific action that occurred. Think of it as a comprehensive record of what happened during a trade.

It captures various details such as the exact time of the event (`timestamp`), the type of action (`action` - like 'closed', 'opened', or 'scheduled'), and important information about the trade itself. This includes the symbol being traded (`symbol`), the signal identifier (`signalId`), and the position type.

For trades that involve averaging or partial closures, you’ll find information about the number of entries (`totalEntries`) and partial executions (`totalPartials`). 

Profit and loss data is also included, distinguishing between unrealized (for active positions) and realized (for closed positions) values, along with metrics for tracking progress towards take profit and stop loss levels.

Finally, when a position is closed or cancelled, you'll find details like the reason for closure or cancellation, the duration of the trade, and performance metrics reflecting the peak and fall in potential profit. Essentially, `TickEvent` brings all crucial data points together for detailed analysis and reporting.

## Interface SyncStatisticsModel

This model helps you understand how often signals are being opened and closed within your trading system. It gathers information about signal synchronization events, giving you a detailed view of their lifecycle. You'll find a complete list of these events, along with the total number of events processed, as well as specific counts for when signals are initiated and when they are closed. This provides valuable insights for monitoring and troubleshooting signal behavior.

## Interface SyncEvent

This data structure holds all the important details about events that happen during a trading signal's lifecycle, helping to generate clear reports. It's designed to contain information across different stages – from the signal being created, to when it's executed, and finally when it’s closed.

Each event includes things like when it happened (timestamp), which asset was traded (symbol), the name of the strategy used, and the trading direction (long or short). You'll also find details about order prices, like the entry price, take profit, and stop loss levels, both the original values and any adjusted ones.

Beyond the core trade details, it tracks performance metrics such as peak profit, maximum drawdown, and total profit and loss (PNL). If the signal was closed, the reason for closure is also included.  The structure indicates if the event comes from a backtest simulation and provides a creation timestamp. Finally, it specifies if the signal has been pending or scheduled for activation.

## Interface StrategyStatisticsModel

This model holds the statistical information gathered during a backtest run, specifically focusing on the different types of actions your trading strategy took. It includes a complete list of all events that occurred, alongside summaries like the total number of events and the count for specific actions such as closing positions, taking partial profits or losses, and implementing trailing stops. You’ll find numbers representing actions like setting breakeven prices or using a dollar-cost averaging (DCA) strategy, providing a detailed breakdown of your strategy's behavior. This data helps you analyze and understand how your strategy performed.

## Interface StrategyEvent

This `StrategyEvent` provides a comprehensive record of everything happening within your trading strategy, whether you're backtesting historical data or running live trades. It bundles all the important details about strategy actions into a single, organized object.

Think of it as a detailed log entry for each trade, including when it happened (`timestamp`), which asset was involved (`symbol`), the strategy and exchange being used (`strategyName`, `exchangeName`), and the timeframe (`frameName`). You'll find information about the specific signal that triggered the action (`signalId`) and the type of action taken (`action`).

It also contains critical pricing data, like the current market price (`currentPrice`), and any percentage adjustments used for profit taking or stop losses (`percentToClose`, `percentShift`). For scheduled or pending actions, unique IDs are included (`cancelId`, `closeId`, `activateId`) along with timestamps of creation (`createdAt`) and when the action became pending (`pendingAt`).

When looking at a trade, you'll have access to vital details like entry price (`priceOpen`), take profit and stop loss prices (`priceTakeProfit`, `priceStopLoss`), and even the original prices before any trailing adjustments. If your strategy uses dollar-cost averaging (DCA), information about the total entries and cost will also be included. Finally, the event also captures performance metrics like the Profit and Loss (`pnl`) and any optional notes from the commit that generated the action (`note`).

## Interface SignalSyncOpenNotification

This notification tells you when a trading signal, specifically a limit order, has been activated and a position has been opened. It provides a wealth of detail about the trade, including the unique ID of the signal, the timestamp of when it happened, and whether it occurred during backtesting or live trading. You'll find key information like the trading symbol, strategy used, and exchange where the trade executed.

The notification also breaks down the performance of the position so far, detailing the profit and loss (both in USD and percentage), peak profit achieved, and maximum drawdown experienced.  You can track the entry and exit prices used for these calculations and see how many entries and partial exits have occurred. Finally, it provides specifics about the order itself, including the original and adjusted take profit and stop loss prices, as well as timestamps related to signal creation and order activation. A note field is available for adding any relevant context or explanation for the signal.

## Interface SignalSyncCloseNotification

This notification tells you when a trading signal has been closed, whether it was due to hitting a take profit or stop loss, time expiration, or manual closure. It provides a comprehensive breakdown of the trade's performance, including profit and loss (both absolute and as a percentage), peak profit achieved, and maximum drawdown experienced.  You'll find details like the entry and exit prices used for PNL calculation, the number of entries and partial closes, and the reason for the signal's closure – whether it was automatic or manual.  It also includes key information about the trade, such as the strategy that generated it, the exchange used, and the original take profit and stop-loss prices before any adjustments were made. This allows for a detailed analysis of signal performance and provides valuable insight for backtesting and optimization.


## Interface SignalSyncBase

This defines the fundamental information shared by all signal synchronization events within the backtest-kit framework. Each signal event includes details like the trading symbol (e.g., BTCUSDT), the name of the strategy that produced it, and the exchange it's associated with. 

You'll also find the timeframe used for the signal, a flag indicating whether it originates from a backtest or live trading, and a unique ID to identify each signal. The timestamp marks when the signal was generated, either during a backtest or based on the tick or candle data. Finally, the full signal data is also included, providing a comprehensive view of the signal at that moment.

## Interface SignalScheduledNotification

This notification type tells you when a trading signal has been planned for future execution. It’s like a heads-up that something’s going to happen, but it hasn't happened yet.

Each notification includes details like a unique ID, the exact time the signal was scheduled, and whether it’s part of a test or live trading scenario. You'll also find key information about the trade itself - the symbol being traded (like BTCUSDT), the strategy that generated the signal, and the planned entry, take profit, and stop loss prices. 

It goes beyond just the basic prices too, providing the original prices before any adjustments for things like trailing stops. You can see how many entries were used if the strategy involves averaging in, as well as the total cost of the position and projected profit/loss information, including peak profit and maximum drawdown metrics. The notification also includes data around how much capital was invested and which price was used for PNL calculation. Finally, there's a space for a note to explain why the signal was triggered.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position, providing a wealth of information about the trade. It's triggered whenever a trading position is initiated, whether it’s part of a backtest or a live trading scenario.

The notification includes details like a unique identifier, the exact time the position was opened, and whether it's a backtest or live trade. You'll find specifics about the trading symbol, the strategy responsible, and the exchange where the trade occurred.

It outlines key parameters of the trade: the direction (long or short), the entry price, take profit and stop-loss levels, and any adjustments made. You also get details about the total entries and partial closes for the position.

Beyond the core trade details, you’ll receive performance metrics such as Profit and Loss (PNL), peak profit, maximum drawdown, and relevant prices. The notification also exposes information about the number of entries and partials, and gives a human-readable note explaining the trade's rationale. Finally, it includes timestamps relating to scheduling, pending, and creation of the event.

## Interface SignalOpenContract

This event, `SignalOpenContract`, signifies that a pre-planned trade, initiated with a limit order, has been executed. Think of it as confirmation that your order has been filled on the exchange.

It's particularly useful for synchronizing external systems – if you're using a separate system to manage orders, this event lets you know exactly when the trade has gone through.

The event provides a wealth of information about the trade, including the price at which it entered the market, the original take profit and stop-loss levels, and its performance so far (profit/loss, peak profit, maximum drawdown).  You'll also find details on how the position was built – whether it was a simple one-time entry or involved multiple averaging steps.

The timestamp properties, `scheduledAt` and `pendingAt`, track when the signal was initially created and when the position actually started.  The `currentPrice` reflects the prevailing market price at the moment the trade was activated. Finally, the `totalEntries` and `totalPartials` tell you how many individual transactions were involved in setting up and closing the position.

## Interface SignalInfoNotification

This notification type lets you receive informational updates directly from your trading strategies – it's like a way for them to "talk" to you. When a strategy wants to share a note about an open position, this notification is sent, providing a wealth of detail about the trade. 

You'll find information such as the strategy’s name, the exchange it's operating on, the current market price, the position's direction (long or short), and key pricing details like entry, take profit, and stop-loss levels.  The notification also gives you performance metrics including profit/loss, peak profit, and maximum drawdown, alongside details about the entries and partial closes that have occurred. Finally, it includes a user-defined note from the strategy itself, as well as identifiers and timestamps to help track the signal's journey.

## Interface SignalInfoContract

This defines a standard way for strategies to send out custom information about their trading activity. When a strategy wants to share a message – perhaps for debugging, custom alerts, or logging – it uses this structure.

It contains key details about the event: what symbol is involved, which strategy generated it, the exchange and frame being used, and the complete data related to the signal.  The message also includes the current price, a user-defined note, an optional identifier, and whether it’s from a backtest or live trading environment.  You can subscribe to receive these notifications to keep track of what's happening during strategy execution. The timestamp tells you exactly when the event occurred, and it means different things depending on whether it's a backtest or live trade.

## Interface SignalData$1

This data structure holds all the key details about a completed trading signal, useful for analyzing performance. It includes information like which strategy created the signal, a unique identifier for the signal itself, and the trading symbol involved. You'll also find the direction of the trade (long or short), the profit and loss expressed as a percentage, and the reason the signal was closed. Crucially, it records the exact times the signal was opened and closed, allowing for precise timing analysis of your trading strategies. This information is vital for building and evaluating backtesting results.

## Interface SignalCommitBase

This describes the common information you'll find in events related to signals generated by your trading strategies. Every signal event, whether from a backtest or a live trading environment, includes details like the trading pair symbol (e.g., BTCUSDT), the name of the strategy that created it, and the exchange it was executed on.

You'll also see the timeframe used (important for backtesting), whether the signal came from a backtest or live mode, and a unique ID for tracking purposes. The timestamp indicates when the signal was triggered, and the event also includes information about the number of entries and partial exits made at that point.

Crucially, it captures the original entry price, the signal data itself, and an optional note to explain why the signal was generated – useful for understanding your strategy's reasoning.

## Interface SignalClosedNotification

This notification tells you when a trading position has been closed, whether it was stopped out by a stop-loss, hit a take-profit target, or expired. It provides a wealth of information about the trade, including the unique identifier, when it closed, and whether it occurred during a backtest or live trading.

You’ll find details like the trading pair, the strategy involved, and the direction of the trade (long or short). The notification also includes the entry and exit prices, along with the original take-profit and stop-loss levels. 

To help analyze performance, it tracks the profit and loss (both percentage and absolute value), peak profit, and maximum drawdown experienced during the trade’s lifecycle.  You'll also find details related to any DCA (Dollar Cost Averaging) that may have occurred, showing the total entries and partial closes. Finally, the notification explains *why* the position was closed, how long it lasted, and provides an optional human-readable note explaining the closure.

## Interface SignalCloseContract

This event lets you know when a trading signal you're tracking has been closed, whether that's due to hitting a profit target, a stop-loss, or simply time running out. It’s designed to help external systems keep in sync with what's happening in the trading process.

You’ll receive this event whenever a signal is closed, and it provides a wealth of information. This includes the current market price at the time of closure, the overall profit and loss (PNL) for the position, and key performance metrics like the peak profit and maximum drawdown experienced.

The event also details the trade direction (long or short), the entry and exit prices (both original and adjusted for things like trailing stops), the time the signal was created and activated, and most importantly, *why* the signal was closed. Information on any DCA averaging or partial closures is provided as well, giving you a complete picture of how the position was managed. This allows external systems to correctly record the trade and potentially adjust related orders.

## Interface SignalCancelledNotification

This notification is sent when a trading signal that was planned for execution is cancelled before it actually happens. It provides detailed information about the signal and the reason for its cancellation, helping you understand why a trade didn't go through. 

The notification includes a unique identifier, the timestamp of the cancellation, and whether it occurred during a backtest or live trading. You'll also find details like the trading pair (e.g., BTCUSDT), the strategy responsible, and the planned trade direction (long or short).

Furthermore, it contains all the original order parameters like take profit, stop loss, and entry prices, alongside information about any DCA averaging or partial closes that were planned. The `cancelReason` field is particularly important, explaining why the signal was cancelled, for example, due to a timeout, price rejection, or a manual cancellation. There's also an optional note field for any additional explanations. Finally, the notification includes timestamps related to the signal’s lifecycle, including when it was initially created and when it started pending.

## Interface Signal

The `Signal` object represents a trading signal, essentially a record of a trade's details as it unfolds. 

It tracks the initial entry price using `priceOpen`.

Internally, it keeps a history of entry events in the `_entry` array, detailing the price, cost, and time of each entry.

Similarly, `_partial` stores information about any partial exits (both profit-taking and loss-limiting) including the type of action, percentage, price, cost basis, entry count, and timestamp.

## Interface Signal$2

This `Signal` object represents a trading signal, keeping track of key information about a position. It stores the initial entry price, known as `priceOpen`.

The `_entry` array records the details of each entry made into the position, including the price, cost, and timestamp of the transaction.

Finally, `_partial` logs any partial exits from the position, noting whether they were profit or loss scenarios, the percentage and price at the time, and relevant cost and entry count data.

## Interface Signal$1

This `Signal` object holds crucial information about a single trading position.

It includes the `priceOpen`, which is simply the price at which you initially entered the trade.

You'll also find records of entry details within the `_entry` array, detailing each time the position was started.

Finally, the `_partial` array tracks any partial exits from the position, whether they resulted in a profit or loss, along with relevant pricing and quantity information at the time of each partial exit.

## Interface ScheduledEvent

The `ScheduledEvent` provides a single place to find all the important details about trading events – when they were scheduled, opened, or cancelled. It bundles together information like the exact time of the event, what kind of action was taken (opening, scheduling, or cancelling a trade), the trading pair involved, and a unique identifier for the signal.

You'll also find details specific to the trade itself, such as the entry price, take profit and stop-loss levels, and any modifications made to those prices. For signals using DCA (Dollar-Cost Averaging), it tracks the number of entries and partial closes.

If a trade was cancelled, you'll find reasons why and potentially an ID linked to a user's action. For opened positions, there's a timestamp indicating when the trade became active. Lastly, the `ScheduledEvent` gives you the unrealized profit and loss (PNL) at the time of the event, and the duration if it was cancelled or opened.

## Interface ScheduleStatisticsModel

This model holds statistics about signals scheduled for execution. 

It gives you a breakdown of how many signals were scheduled, activated, or cancelled.

You can see the overall number of events and rates like cancellation and activation, expressed as percentages. 

It also calculates average waiting times for signals that were either cancelled or activated. This allows you to analyze the performance of your scheduled signal system and identify potential areas for optimization. The detailed event list provides insight into individual signal lifecycles.

## Interface SchedulePingContract

This contract represents a regular heartbeat signal during the monitoring of a scheduled trading signal. Think of it as a way to keep tabs on a signal's lifecycle—knowing it’s active and being watched. 

These signals are emitted every minute while the signal is actively running, not when it’s canceled or has already been triggered. 

You can use this information to build custom monitoring logic – for example, automatically canceling a signal if the market price deviates too much from the original entry price.

The information included provides details like the trading pair, the name of the strategy using the signal, the exchange involved, all the signal’s data (like entry price, take profit, stop loss), the current market price at the time of the ping, whether it's a backtest or live trade, and a timestamp for accurate tracking. The timestamp's meaning changes based on whether it's a live or backtest execution.

## Interface RiskStatisticsModel

This model holds information about risk events, specifically rejections, that occurred during a backtest or live trading. It's designed to help you understand where your risk controls are being triggered and potentially identify areas for improvement. 

The `eventList` property gives you access to the complete details of each risk rejection event, allowing for in-depth analysis. 

`totalRejections` simply tells you the overall number of risk rejections.

To help you pinpoint the source of these rejections, the `bySymbol` property shows you a breakdown of how many rejections occurred for each trading symbol. Similarly, `byStrategy` groups rejections by the trading strategy that triggered them.

## Interface RiskRejectionNotification

This notification informs you when a trading signal was blocked by your risk management rules. It's a way of knowing why a potential trade didn't go through.

Each notification has a unique ID and a timestamp marking when the rejection happened. You'll see details like the strategy attempting the trade, the exchange involved, and a clear explanation of why the signal was rejected.

The notification also includes key information about the rejected trade, such as the trading symbol (like BTCUSDT), the trade direction (long or short), planned take profit and stop-loss prices, and the current market price at the time of the rejection. If applicable, it also tells you which pending signal caused the rejection. Whether it originated from a backtest (simulated trading) or live trading is also included.

## Interface RiskEvent

This data structure describes why a trading signal was blocked due to risk limits. It bundles together all the information needed to understand what happened when a signal was rejected. 

You'll find details like the exact time of the rejection, the trading pair involved, and the specifics of the signal itself. 

It also includes identifying information like the strategy and exchange names, along with the current price at the time, and how many active positions were open. 

A unique ID helps track individual rejections, and a note provides the reason why the signal was rejected. Finally, it indicates whether the rejection occurred during a backtest or live trading session.

## Interface RiskContract

The RiskContract represents a signal that was blocked because it violated risk rules. It's a record of when the system prevented a trade from happening due to risk constraints.

Think of it as an audit trail for risk management – it tells you exactly *why* a trade wasn't executed.

Here's what information you get from a RiskContract:

*   **symbol:** Which trading pair was involved (like BTCUSDT).
*   **currentSignal:** The details of the trade that was being proposed.
*   **strategyName:**  The trading strategy that tried to place the order.
*   **frameName:** The time frame used for the backtest.
*   **exchangeName:** The exchange where the trade was intended.
*   **currentPrice:** The price of the asset at the moment the risk check failed.
*   **activePositionCount:**  How many other trades were already open.
*   **rejectionId:**  A unique ID for this specific rejection event, helpful for tracking.
*   **rejectionNote:** A clear explanation of *why* the trade was rejected.
*   **timestamp:** When the rejection occurred.
*   **backtest:**  Indicates whether the event happened during a backtest or in live trading.

This information is useful for services that generate risk reports and for users who want to be notified of rejected trades.

## Interface ProgressWalkerContract

This interface describes the updates you'll receive as a background process, like testing trading strategies, runs within the backtest-kit framework. It gives you a snapshot of how far along the process is.

You'll see information about the specific walker, the exchange being used, the frame in use, and the symbol being traded.

It also tracks the total number of strategies it needs to evaluate, how many it has already checked, and calculates the overall progress as a percentage. This lets you monitor the progress of longer-running tasks and provides valuable context about what's happening behind the scenes.


## Interface ProgressBacktestContract

This contract provides updates as a backtest runs. It’s designed to let you monitor the progress of a backtest, giving you details like which exchange and strategy are being used, the trading symbol involved, and how far along the process is. You’ll see the total number of historical data points (frames) being analyzed, as well as how many have already been processed. Finally, a percentage representing the overall completion of the backtest is included, letting you know exactly how much longer it will take.


## Interface PerformanceStatisticsModel

This model holds all the performance data collected for a specific trading strategy. It gives you a central place to see how a strategy performed overall. 

You'll find the strategy's name, a count of all the performance events tracked, and the total time it took to run performance checks. 

Most importantly, it includes a breakdown of statistics by metric type, allowing you to analyze specific areas of performance. Finally, it provides access to the complete list of individual performance events, which are the raw data points that make up the overall statistics.

## Interface PerformanceContract

The PerformanceContract helps you understand how quickly and efficiently your trading strategies are running. It captures specific events during the backtesting or live trading process, giving you valuable insights into performance. Each event includes a timestamp, allowing you to track changes over time, along with the time it took for the related action to complete. 

You'll find information about which strategy and exchange were involved, along with the trading symbol being used. The PerformanceContract also distinguishes between backtest and live trading environments. This data is invaluable for spotting slow operations and optimizing your system.

## Interface PartialStatisticsModel

This model holds data about partial profit and loss milestones during a backtest. Think of it as a snapshot of how often your trading strategy experienced small wins or losses.

It breaks down the results into several key pieces of information:

*   The `eventList` contains a complete record of each partial profit or loss event.
*   `totalEvents` tells you the total number of times your strategy hit these milestones.
*   `totalProfit` specifically counts the number of times you made a small profit.
*   `totalLoss` represents the number of times you experienced a small loss.

Essentially, it helps you understand the frequency and distribution of partial wins and losses in your trading strategy.

## Interface PartialProfitContract

This interface describes the notifications you receive when a trading strategy hits a partial profit target, like 10%, 20%, or 30% gain. It’s a way to keep track of how your strategy is performing and when it's executing partial take-profit orders.

Each notification includes important details like the trading symbol (e.g., BTCUSDT), the name of the strategy that generated the signal, the exchange being used, and the price at which the profit level was achieved. The `data` field provides access to the original signal information, such as the initial stop-loss and take-profit prices. You'll also find the specific profit level reached (e.g., 20%) and a flag indicating whether the event occurred during a backtest or live trading. Finally, a timestamp provides the exact moment the profit level was detected.

## Interface PartialProfitCommitNotification

This notification tells you when a partial profit commitment has been executed, whether it's during a backtest or live trading. It provides a ton of detail about the trade, including a unique identifier, the exact time it happened, and whether it was a test run or real money.

You'll find information like the trading pair (e.g., BTCUSDT), the strategy that triggered the action, and the exchange used. It also includes specifics on the trade itself: entry price, take profit levels, stop losses, and the percentage of the position that was closed.

Beyond the basics, it offers a deep dive into the trade's performance. You can see the total profit and loss (PNL), the highest profit reached, the largest drawdown experienced, and various price points and costs associated with the trade. It even tracks details about any averaging or partial closures that occurred. Finally, there’s a place for an optional note that gives extra context to the trade.

## Interface PartialProfitCommit

This event signifies a partial profit taking action during a trading strategy's backtest. It provides a snapshot of the position's performance and details at the moment the partial profit was triggered. 

You’ll find information about the percentage of the position being closed, the current market price, and the profit and loss (PNL) realized so far, including the cumulative PNL for the entire trade.  The record also includes the peak profit and maximum drawdown experienced by the position up to that point. 

Essential details like the trade direction (long or short), the original entry price, and the original and effective take profit and stop loss prices are all included.  The timestamps for when the signal was created and the position was activated are also recorded, providing a complete timeline of the trade's evolution.

## Interface PartialProfitAvailableNotification

This notification signals that your trading strategy has reached a predefined profit milestone, like 10%, 20%, or 30% gain. It's a way to track progress and understand how your strategy is performing. 

The notification includes details such as a unique ID, the exact time it occurred, whether it's from a backtest or live trading, and specifics about the traded pair, strategy, and exchange. You’ll find key information about the trade itself, including the entry price, current price, trade direction (long or short), and the originally set take profit and stop loss levels.

It also provides insight into the position’s financial performance, showing total profit/loss, peak profit achieved, and maximum drawdown experienced, along with relevant prices and costs for these metrics. If you’ve used DCA (Dollar-Cost Averaging), you'll see the total number of entries, and if you've taken partial profits, you'll see how many.  Finally, any optional notes associated with the signal are included, alongside timestamps related to the signal’s lifecycle.

## Interface PartialLossContract

The `PartialLossContract` represents a signal reaching a predefined loss level, like -10%, -20%, or -30% of the initial entry price. This helps track how a trading strategy is performing and when stop-loss levels are triggered.

You’ll see these events emitted whenever a strategy's drawdown hits one of these milestones. Importantly, each level is only reported once for a specific signal, even if the price moves quickly.

Several components within the trading framework use these events, including services that build reports and your own custom logic you might add via functions that listen for these events.

Here's a breakdown of what each piece of information means:

*   **symbol:** The trading pair involved, like "BTCUSDT."
*   **strategyName:**  The name of the strategy that generated the signal.
*   **exchangeName:** The exchange where the trade is taking place.
*   **frameName:**  A descriptor for the execution frame (not present in live trading).
*   **data:**  All the original signal data, including the initial stop-loss and take-profit prices.
*   **currentPrice:** The price at which the loss level was hit.
*   **level:** The specific loss level reached (e.g., 20 represents a -20% loss).
*   **backtest:** Indicates whether this is a historical backtest or a live trading event.
*   **timestamp:**  The time the loss level was detected; it’s based on the live tick time or the historical candle time, depending on the execution mode.

## Interface PartialLossCommitNotification

This notification tells you when a portion of a trading position has been closed. It’s like getting a status update on a partial sell-off of your holdings.

The `type` confirms it’s a partial loss commit notification, and the `id` uniquely identifies this specific event.  You’ll also find the `timestamp` indicating exactly when this action occurred, along with whether it happened during a backtest or in live trading (`backtest`).

The notification details the specifics of the trade, like the `symbol` (e.g., BTCUSDT), the `strategyName` that triggered it, and the `exchangeName` where it executed.  It also includes a unique `signalId` for tracking.

You can see exactly what percentage of the position was closed (`percentToClose`), the `currentPrice` at the time, and the trade direction (`position` - either 'long' or 'short').  Further details, like the original entry price (`priceOpen`), take profit, and stop loss prices (both original and adjusted by trailing), are also provided.

For positions that were built up with multiple entries (like through dollar-cost averaging), you can see the total number of entries (`totalEntries`). The notification also indicates how many partial closes have been performed (`totalPartials`).

The notification goes into significant detail about the financial performance of the position: total `pnl`, peak profit, maximum drawdown, profit/loss percentage, and the prices and costs associated with these values. You'll find insight into how much was invested (`pnlEntries`), and the prices used to calculate the profit/loss.

Finally, there’s optional information like a `note` explaining the reason for the partial close, and timestamps for when the signal was created (`scheduledAt`), became pending (`pendingAt`), and the notification itself (`createdAt`).

## Interface PartialLossCommit

This data represents a partial loss event during a backtest or live trading simulation. It details how a portion of a position was closed, providing a snapshot of the position's performance and pricing at that moment.

The `action` property confirms that this is a partial loss signal. The `percentToClose` indicates what percentage of the total position was reduced.  You’ll also find key pricing information like the `currentPrice`, the original entry `priceOpen`, and the take profit and stop loss prices, both as they were initially set and after any trailing adjustments. 

The signal also includes historical performance metrics for the position, like `peakProfit` and `maxDrawdown`, which show the best and worst point for that position up to that point in time. You can determine the position's direction – whether it was a `long` (buy) or `short` (sell) trade – and see the total profit and loss (`pnl`) associated with closing a piece of the position. The `scheduledAt` and `pendingAt` properties provide timestamps for when the signal was generated and when the position was initially activated, respectively.

## Interface PartialLossAvailableNotification

This notification signals that a trading position has hit a pre-defined loss milestone, like a 10% or 20% drawdown. It provides detailed information about the event, including a unique ID, the exact time it occurred, and whether it's happening in a backtest or live trading environment. You'll find specifics about the trading pair, the strategy that triggered it, and the exchange involved.

The notification also breaks down the position details: the entry price, trade direction (long or short), stop-loss and take-profit levels (both original and adjusted), and the number of entries and partial closes executed. Crucially, it includes comprehensive profit and loss (PNL) data, showing the total profit/loss, peak profit, maximum drawdown, and related prices and percentages. This information helps understand the position's performance and potential risks. Finally, it includes optional notes and timestamps for signal creation, pending status, and notification creation.

## Interface PartialEvent

The `PartialEvent` object holds all the key data points you need when tracking profit and loss milestones during a trading backtest or live execution. It essentially acts as a record of each time a profit or loss level is hit, like 10%, 20%, or 30%.

You’ll find details such as the exact time of the event, whether it’s a profit or loss, the trading pair involved, the strategy and signal IDs, and the type of position held.  It also includes the current market price, the entry price, and the initial take profit and stop loss prices set when the trade was first opened. 

Advanced information like the total number of entries in a dollar-cost averaging (DCA) strategy, the total partials executed, and details about the original entry price before averaging are also included when applicable. You'll also find metrics like unrealized profit and loss (PNL) and a human-readable note explaining the reasoning behind the signal. Finally, timestamps for when the position became active and when the signal was created, along with a flag to indicate if the event happened during a backtest, are provided for more comprehensive analysis.

## Interface MetricStats

This object represents a collection of statistics for a particular metric, like order execution time or message processing duration. It provides a comprehensive view of how that metric performed over a series of tests.

You’ll find details like the total number of times the metric was recorded, the sum of all durations, and key statistical measures.

Important values include the average, minimum, and maximum durations, along with the standard deviation to understand the spread of the data. Percentiles (like the 95th and 99th) give insight into performance at different points in the distribution.

Wait time information, including minimum, maximum, and average, is also included if applicable to the metric. This helps analyze the time between events that trigger the metric.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversation with a large language model. Each message has a `role` indicating who sent it – whether it's a system instruction, a user's input, the model's response, or the result of a tool call.  The core of the message is its `content`, which is the actual text being conveyed. 

Sometimes, a message will also contain `reasoning_content`, providing insights into the model's thought process, which can be helpful for debugging or understanding its decision-making.  Assistant messages, in particular, might include `tool_calls` if they involve using external tools, or a `tool_call_id` linking the message to a specific tool interaction. Finally, images can be attached to messages, supported in various formats.

## Interface MaxDrawdownStatisticsModel

The `MaxDrawdownStatisticsModel` helps you keep track of how much your trading strategy has lost at its worst points. 

It essentially provides two key pieces of information:

*   `eventList`: This is a complete record of every maximum drawdown event that occurred, presented in reverse chronological order (most recent events first).  You can use this to analyze patterns in your drawdown.
*   `totalEvents`: This simply tells you how many maximum drawdown events have been logged overall.

## Interface MaxDrawdownEvent

This data represents a single instance of a maximum drawdown experienced during a trading position. It captures key details about when and how the drawdown occurred.

You'll find information like the precise timestamp, the trading symbol involved, the name of the strategy being used, and a unique identifier for the signal that triggered the trade. 

The record also includes details about the position itself - whether it was a long or short trade - and a breakdown of the profit and loss (PNL) for the entire position. Crucially, it stores the peak profit achieved, the maximum drawdown amount, and the price at which the drawdown was reached. 

Additional data provides the entry price, take profit level, stop loss level, and whether this event happened during a backtesting simulation.

## Interface MaxDrawdownContract

The MaxDrawdownContract provides information when a new maximum drawdown is observed for a trading position. It tells you the symbol involved, the current price at that moment, and the exact time the drawdown occurred. You'll also get the strategy, exchange, and frame (like 1-minute or 5-minute intervals) associated with the position. The contract includes the signal data itself, giving a detailed picture of the trade. A crucial `backtest` flag lets you know if this information is from a historical simulation or live trading. These updates are designed to help you monitor risk and react to changes in your positions.

## Interface LiveStatisticsModel

The LiveStatisticsModel provides a detailed snapshot of your live trading performance. It tracks everything from the individual events—like when a signal is opened, active, or closed—to key statistical metrics that help you understand how well your strategy is doing. You'll find a list of all the trading events along with overall counts of signals and how many were profitable versus losing.

Several vital performance indicators are calculated, including win rate, average profit/loss per trade, and total profit/loss across all trades. It also goes beyond simple profit to include volatility measures like standard deviation and sophisticated ratios such as Sharpe and Sortino ratios, which assess risk-adjusted returns.  You’ll find indicators that reveal potential for yearly returns and also metrics measuring the peaks and valleys of your trading performance. All numerical values are carefully managed; if a calculation produces an unreliable result (like division by zero), that value will be recorded as null.

## Interface InfoErrorNotification

This notification lets you know about problems encountered during background tasks, but these are generally issues that your system can recover from. It’s like a heads-up that something might need attention, but isn't a critical failure. Each notification has a unique identifier, a detailed error message for humans to understand, and a record of the error itself, including technical details like a stack trace. The `backtest` flag is always `false` because these errors occur in the live trading environment, not during a simulation.

## Interface IdlePingContract

This interface describes events that occur when a trading strategy isn't actively making decisions – essentially, it's in an idle state. These "idle ping" events provide information about the strategy, the trading pair, the exchange it's running on, and the current market price at the time of the idle state.  

The events also include whether the execution is a backtest (using historical data) or live trading, along with a timestamp indicating when the ping occurred.  

You can subscribe to these events using the `listenIdlePing()` or `listenIdlePingOnce()` functions to track the lifecycle of your trading strategies and understand when they're not actively engaged. Each event includes the symbol being traded, the name of the idle strategy, the exchange, the frame (in backtest scenarios), the current price, a flag indicating if it’s a backtest, and a timestamp.

## Interface IWalkerStrategyResult

This interface defines the structure for the results you get when backtesting and comparing different trading strategies. Each result represents a single strategy that was run, and contains important information about its performance.

It includes the strategy's name so you know which strategy the data belongs to. 

You'll also find comprehensive backtest statistics providing detailed insights into the strategy's performance.  A key metric value is provided, used for comparing strategies, and a rank indicates how the strategy performed relative to the others. The rank is based on the metric value – a lower rank is better.


## Interface IWalkerSchema

The IWalkerSchema helps you set up and run A/B tests comparing different trading strategies. 

Think of it as a blueprint for how you want to test a group of strategies against each other. 

You define a unique name for the test (walkerName), a short note for yourself, and specify the exchange and timeframe to use for all strategies involved. 

The most important part is listing the strategy names (strategies) you want to compare, which need to be previously registered. 

You can also choose a specific metric like Sharpe Ratio (metric) to optimize during the backtest, and optionally provide callbacks to customize certain events during the testing process.


## Interface IWalkerResults

This object holds all the results you get after running a complete test of your trading strategies. It bundles together key details about what was tested, including the financial instrument being traded (the symbol), the exchange used for the data, the specific testing process used (the walker name), and the timeframe of the data. Think of it as a summary report detailing the context of your backtesting run.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into key moments during the backtesting process when comparing different strategies. Think of it as a way to get notified about what’s happening behind the scenes.

You’ll receive a notification when each strategy begins testing, allowing you to log its start or perform any necessary setup. 

Similarly, when a strategy finishes its backtest, you'll be informed with statistics and a key performance metric.  If a strategy backtest encounters an error and stops, you'll be alerted and given details about the error.

Finally, once all the strategies have been tested and the entire process concludes, you'll receive a summary of the results.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing take profit and commitment strategies. 

Essentially, it represents a request to adjust your trading position. 

The `action` property simply confirms this is a "trailing-take" action.

The `percentShift` value indicates how much the price needs to shift from the initially established level before a trade is triggered.

Finally, the `currentPrice` remembers the price at which the trailing order was originally placed, which is valuable for context.


## Interface ITrailingStopCommitRow

This interface represents a single instruction to adjust a trailing stop order. Think of it as a record of what needs to happen—it tells the system to perform a "trailing-stop" action.

It includes details like the percentage shift needed for the trailing stop, and the price at which the trailing stop was initially established. This information helps to accurately update the order based on market movement. 

Essentially, it’s a snapshot of a specific trailing stop adjustment request.


## Interface IStrategyTickResultWaiting

This interface describes a specific type of result you'll receive when a strategy is monitoring a signal that's scheduled to activate later. Think of it as a holding pattern – the strategy is waiting for the price to hit the entry point defined in the signal. 

You’ll see these "waiting" results repeatedly as the price fluctuates, until the signal finally triggers.

Here's what information is included:

*   **action:**  Clearly indicates that the strategy is in a "waiting" state.
*   **signal:** Details about the signal itself, allowing you to understand the conditions being monitored.
*   **currentPrice:**  The price being tracked against the signal’s entry point.
*   **strategyName, exchangeName, frameName, symbol:**  Information for identifying the specific strategy, exchange, timeframe, and trading pair involved.
*   **percentTp, percentSl:**  These always show as 0 because the position isn't active yet.
*   **pnl:**  A theoretical, unrealized profit and loss calculation for the position that hasn’t been activated.
*   **backtest:**  Confirms if this is a backtest run or live trading.
*   **createdAt:**  The timestamp indicating when the result was generated.

## Interface IStrategyTickResultScheduled

This interface describes a specific type of event within the backtest kit, indicating that a trading strategy has generated a scheduled signal and is waiting for the price to reach a predefined entry point. It's triggered when a strategy calculates a signal that includes a specific price expectation.

The event provides key details about the situation, like the strategy's name, the exchange being used, the timeframe for the price data, and the symbol being traded.  You'll also find the current VWAP price at the time the signal was created and whether the simulation is in backtest or live mode.  Finally, a timestamp records precisely when the event occurred, useful for tracking the sequence of events.

## Interface IStrategyTickResultOpened

This data represents a new trading signal that's just been created. It's a notification that a signal has been successfully processed and stored. 

You’ll find important details included, such as the signal's ID, the name of the strategy that generated it, and the exchange and timeframe it applies to. There's also information about the trading pair, the price at the time the signal opened, and whether this event occurred during a backtest or in a live trading environment. This data helps track and understand the lifecycle of your trading signals.


## Interface IStrategyTickResultIdle

This interface describes what happens when your trading strategy is in an "idle" state – meaning no active trading signals are present. It provides key details about the market conditions at that moment.

You’ll find the name of your strategy, the exchange it’s running on, and the timeframe being used. It also includes the trading symbol (like BTCUSDT), the current price, and whether the system is in backtest or live mode. Finally, it records when this idle state was detected, useful for tracking and analysis. Essentially, it's a snapshot of the market and the strategy's state when it’s not actively trading.

## Interface IStrategyTickResultClosed

This interface describes the data you receive when a trading signal is closed, providing a complete picture of what happened. It includes information like the reason for closing the signal, whether it was a time limit, a profit target, a stop loss, or a manual closure.

You'll find the completed signal data, the price at the time of closure, and a detailed profit/loss calculation factoring in fees and slippage. The interface also keeps track of important identifiers such as the strategy name, exchange, timeframe, and trading symbol. 

Finally, it includes details to distinguish between backtesting and live trading environments, a unique close ID for manual closures, and a timestamp indicating when the result was generated.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a scheduled trading signal is cancelled. This can occur when the signal doesn't actually trigger an order, or if a stop-loss is hit before a position can be opened.

The data included details about the cancelled signal itself, like its properties, the current price at the time of cancellation, and timestamps for when the cancellation happened and when the result was created. You'll also find information for tracking purposes, such as the strategy and exchange names, the timeframe used, and the trading symbol.

There's also a flag to identify if the event comes from a backtest or live trading environment, and a `reason` property to explain why the signal was cancelled.  Finally, if the cancellation was manually initiated using a cancel ID, that ID will be included here.

## Interface IStrategyTickResultActive

This interface describes a tick result when a strategy is actively monitoring a signal, waiting for a take profit (TP), stop loss (SL) event, or a time expiration. It provides detailed information about the current state of the active strategy.

You'll find details like the strategy's name, the exchange and time frame it's operating on, and the trading symbol involved. The `action` property confirms that the strategy is in an "active" monitoring state. 

The `signal` property holds the specific signal being tracked.  You can also see the `currentPrice` used for monitoring, along with progress indicators – `percentTp` and `percentSl` – representing how far the position is from its TP or SL targets.

Crucially, it includes `pnl`, the unrealized profit and loss for the position, accounting for fees and slippage.  The `backtest` flag lets you differentiate between backtesting and live trading scenarios, and `createdAt` and `_backtestLastTimestamp` are timestamps useful for tracking and timing within the system.

## Interface IStrategySchema

This defines the structure for creating and registering your trading strategies within the backtest-kit framework. Think of it as the blueprint for how your strategy will behave.

Each strategy needs a unique name to be recognized by the system. You can also add a note to help you remember what the strategy does or to provide documentation for others.

The `interval` property controls how frequently your strategy can generate signals; it's a way to prevent your strategy from sending signals too quickly.

The core of the strategy is the `getSignal` function, which takes market data like the symbol, timestamp, and current price and calculates a signal.  It can either generate a signal right away or schedule it based on a desired entry price.

You can provide optional callback functions, like `onOpen` and `onClose`, to perform actions when a trade is initiated or closed.

The `riskName` and `riskList` allow you to categorize and manage the risk associated with your strategy, and `actions` lets you tag your strategy with specific actions.

## Interface IStrategyResult

The `IStrategyResult` represents a single run of a trading strategy during a backtest. It's essentially a container for everything you need to compare different strategies against each other.

Each result includes the strategy's name so you know which one you're looking at, along with comprehensive backtest statistics, giving you a full picture of its performance.

You’ll also find a metric value, which represents the objective you’re trying to optimize (like Sharpe Ratio or Sortino Ratio).  If a strategy produced an invalid result (perhaps due to an error or no trades), this value will be null.

Finally, the `firstEventTime` and `lastEventTime` properties tell you when the strategy started generating signals – the earliest and latest times a trade was suggested during the backtest.  If no signals were generated, these values will be null.

## Interface IStrategyPnL

This interface, IStrategyPnL, represents the results of a trading strategy's profit and loss calculation. It provides a clear picture of how your strategy performed, considering the impact of fees and slippage.

The `pnlPercentage` tells you the profit or loss as a percentage – a positive number means profit, a negative number indicates a loss.

You'll also find the `priceOpen` and `priceClose`, both adjusted to factor in those fees and slippage that are common in real trading.

The `pnlCost` shows the actual profit or loss in dollars, calculated based on the total amount you invested. Lastly, `pnlEntries` reveals the total capital initially used to start those trades.

## Interface IStrategyCallbacks

This interface defines optional event handlers you can use to monitor and react to different stages of a trading strategy's lifecycle. Think of these callbacks as a way to get notified about important events like when a signal is opened, actively being watched, or closed. You can use them to log events, trigger custom actions, or even dynamically adjust your strategy.

Here’s a breakdown of what each callback does:

*   **onTick:** Runs every time there's a new market tick, providing you with the latest data.
*   **onOpen:** Notifies you when a new signal is successfully opened.
*   **onActive:** Signals when a signal is actively being monitored.
*   **onIdle:**  Alerts you when there are no active signals being monitored.
*   **onClose:**  Informs you when a signal is closed, giving you the closing price.
*   **onSchedule:** Called when a signal is scheduled for entry at a future time.
*   **onCancel:**  Notifies you when a scheduled signal is cancelled before a position is opened.
*   **onWrite:**  Triggered when signal data is saved, primarily for testing and persistence.
*   **onPartialProfit:** Alerts you when a signal reaches a state of partial profit.
*   **onPartialLoss:** Informs you when a signal reaches a state of partial loss.
*   **onBreakeven:** Lets you know when a signal hits breakeven point.
*   **onSchedulePing:** Provides periodic updates for scheduled signals, useful for custom checks.
*   **onActivePing:** Provides periodic updates for active pending signals, allowing for custom monitoring.



Each callback receives information about the symbol, related data, current price, and a flag indicating whether the test is a backtest.

## Interface IStrategy

The `IStrategy` interface defines the core methods for how a trading strategy operates. It's essentially a blueprint for how the strategy executes trades and handles signals.

The `tick` method is called on each price update. It checks for signals, potential profit targets, and stop-loss triggers.

There are separate methods (`getPendingSignal`, `getScheduledSignal`) to retrieve active signals, allowing the strategy to monitor for profit targets and expiration times.

Several methods (`getBreakeven`, `getTotalPercentClosed`, `getTotalCostClosed`, etc.) help monitor the status of a trade and its financial details like how much has been closed and how much is still invested.

`getPositionEffectivePrice` and related methods offer insight into the average entry price and investment details for a trade.

The `backtest` method allows you to test your strategy against historical data.  `stopStrategy`, `cancelScheduled` and `activateScheduled` provide control over the strategy's operational state.

`partialProfit` and `validatePartialProfit` methods facilitate closing a portion of a trade at a profit level.  `partialLoss` and `validatePartialLoss` provide similar functionality for closing a portion of a trade at a loss level.  `trailingStop` and `validateTrailingStop` handle automatic adjustments to stop-loss orders based on price movement.

The `breakeven` method allows shifting the stop-loss to cover costs.  `averageBuy` adds to the size of a trade, while `validateAverageBuy` ensures it's done at a favorable price.

Several `get...` methods are available to extract detailed metrics about the trade's performance, including peak profit, drawdown, and elapsed time. Finally `dispose` cleans up the resources held by strategy.

## Interface IStorageUtils

The `IStorageUtils` interface defines the core functions that any storage adapter used by the backtest-kit framework must provide. Think of it as a blueprint for how different storage systems (like databases or files) interact with the backtesting process.

It includes methods to react to different signal events – when a signal is opened, closed, scheduled, or cancelled. These methods allow the storage system to keep track of the signal’s lifecycle.

You can also use it to retrieve specific signals by their unique ID, or list all signals currently stored.

Finally, there are methods specifically for handling ping events, which are used to keep the `updatedAt` timestamp accurate for signals that are actively open or scheduled. This helps maintain the signal’s historical record.

## Interface IStorageSignalRowScheduled

This interface represents a signal that's been scheduled for future execution. It essentially indicates that a trading signal has been planned but hasn’t yet been triggered. The key piece of information is the `status` property, which will always be "scheduled" for this type of signal. Think of it as a flag marking a signal as being in the queue.

## Interface IStorageSignalRowOpened

This interface represents a signal that has been opened, essentially marking it as active or in use. It's a simple record that confirms a signal has transitioned to an "opened" state. The key piece of information it holds is the `status` property, which is always set to the string "opened." This is useful for tracking the lifecycle of a signal within a trading system.

## Interface IStorageSignalRowClosed

This interface represents a trading signal that has been closed and finalized.  It's used to store information specifically about signals that have reached a conclusion, unlike signals that are still open and actively trading.  The most important detail held here is the Profit and Loss (PNL) data, which reflects the financial outcome of the trade at the point it was closed.  Essentially, it provides a snapshot of the signal's performance after it's finished executing.

It includes:

*   **status**:  Always "closed" to clearly identify this type of signal row.
*   **pnl**:  The PNL data, detailing the profit or loss generated by the signal during its closed lifecycle.

## Interface IStorageSignalRowCancelled

This interface defines a row of data representing a trading signal that has been cancelled. 

It contains a single property: `status`, which will always be set to the string "cancelled". Essentially, it's a standardized way to mark a signal as no longer active or valid within the system. This helps track signal lifecycle and prevent unwanted trades based on outdated information.

## Interface IStorageSignalRowBase

This interface defines the basic structure for how signal data is stored. Every signal, regardless of its status, will have these core details.

It includes the `createdAt` timestamp, marking precisely when the signal was initially created from strategy results.

There’s also an `updatedAt` timestamp to track any subsequent changes.

Finally, a `priority` field dictates the order in which signals are processed or rewritten by the storage adapter, using the current time to ensure a consistent order.

## Interface IStateParams

`IStateParams` defines how you set up the initial state for a trading signal. Think of it as telling the system where to store information related to your signal – you specify a `bucketName`, which is like a folder to organize things.  You also provide an `initialValue`, which is what the signal starts with if there's no saved data already available. This helps keep your trading signals organized and predictable.


## Interface IStateInstance

This interface outlines how state instances should work within the backtest-kit framework. It's designed to provide a place to store and update information specific to each trading signal. Think of it as a container for tracking key metrics related to a trade, like its maximum unrealized profit, how long it's been open, and thresholds for when to exit a position.

The goal is to let you monitor performance metrics and implement rules – for example, automatically closing a trade if it hasn't reached a certain profit level within a specific timeframe.

Here’s a rundown of what you can do with a state instance:

*   **Initialization:** You can use `waitForInit` to set up the initial state.
*   **Reading State:** `getState` lets you retrieve the current values of these metrics.
*   **Updating State:** `setState` is used to modify or replace the values being tracked.
*   **Cleanup:** `dispose` is called to free up any resources the instance might be using.

## Interface ISizingSchemaKelly

This schema defines a sizing strategy based on the Kelly Criterion, a method for calculating optimal bet sizes. It’s designed to help manage risk and maximize long-term growth in your trading.

The `method` property simply confirms you're using the Kelly Criterion approach. 

The `kellyMultiplier` determines how aggressively you apply the Kelly formula; a value of 0.25 (the default) represents a "quarter Kelly" strategy, which is generally considered a more conservative approach. You can adjust this value to be more or less aggressive, but be aware of the potential for increased volatility with higher multipliers.

## Interface ISizingSchemaFixedPercentage

This schema defines a simple way to size your trades – consistently risking a fixed percentage of your capital on each one.  It's straightforward: you specify a `riskPercentage`, which represents the percentage of your total capital you're willing to lose on any single trade. The `method` property simply confirms that you’re using the fixed-percentage sizing approach. This makes it easy to ensure consistent risk management across all your trades.

## Interface ISizingSchemaBase

This interface defines the basic structure for sizing configurations used within the backtest-kit framework. Each sizing configuration needs a unique identifier, which is its `sizingName`. You can also add a `note` for documentation purposes, like a brief explanation of the sizing strategy.

To control risk, every sizing schema specifies a `maxPositionPercentage` that limits the portion of your account used for a single trade. You'll also generally set a `minPositionSize` to ensure trades are meaningful and a `maxPositionSize` to avoid excessively large positions.

Finally, you have the option of providing `callbacks` to hook into different stages of the sizing process, allowing for more customized behavior.

## Interface ISizingSchemaATR

This schema defines how to size your trades using the Average True Range (ATR) indicator. It’s specifically designed for strategies where you want your stop-loss distance to be related to the ATR.

You'll specify a `riskPercentage` to determine how much of your capital you're willing to risk on each trade – a value between 0 and 100.

Then, you set an `atrMultiplier` which dictates how many times the ATR value will be used to calculate the distance between your entry price and your stop-loss.  A higher multiplier means a wider stop-loss based on the ATR.


## Interface ISizingParamsKelly

This interface defines how you can control trade sizing using the Kelly Criterion within the backtest-kit framework. It primarily includes a `logger` property, which allows you to add logging for debugging and understanding how the sizing parameters are being applied. The `logger` is a crucial tool for monitoring and troubleshooting your trading strategies.

## Interface ISizingParamsFixedPercentage

This interface describes the structure of historical data, primarily focusing on candlestick data.

It includes a `candles` property, which is an array of `ICandle` objects. Each `ICandle` represents a single time period (e.g., a minute, hour, or day) and contains information like open, high, low, close prices, and volume for that period.

## Interface ISizingParamsATR

This interface defines the settings you'll use when determining position sizes based on the Average True Range (ATR) indicator. It's essentially a way to configure how much you'll trade based on market volatility as measured by ATR. 

The `logger` property is important; it allows you to receive debugging information about the sizing calculations, which can be incredibly helpful when troubleshooting or optimizing your strategy. Think of it as a way to get insights into how the sizing is working under the hood.


## Interface ISizingCallbacks

When determining how much to trade, `ISizingCallbacks` allows you to step in and observe or adjust the sizing process. Specifically, the `onCalculate` callback gets triggered immediately after the framework calculates the position size. This is a prime spot for logging what size was determined or even performing some checks to ensure the size makes sense within your strategy. You can use it to validate calculations and ensure your trading sizes are appropriate.


## Interface ISizingCalculateParamsKelly

When calculating your trade sizes using the Kelly Criterion, this object defines the necessary inputs. You’ll need to specify the method as "kelly-criterion" to indicate you're using that approach.  Then, provide the win rate – a value between 0 and 1 representing the probability of a winning trade – and the average win/loss ratio, which reflects how much you typically win compared to how much you lose on each trade. These values help determine the optimal fraction of your capital to risk on each trade.

## Interface ISizingCalculateParamsFixedPercentage

This interface defines the settings you'll use when your trading strategy wants to size a position based on a fixed percentage of your available capital, and also includes a stop-loss price. Essentially, it tells the backtest framework how to calculate the size of a trade—it's a straightforward approach where the size is determined by a pre-set percentage. You provide a stop-loss price that the system will use in conjunction with this percentage sizing method. This ensures a consistent, predictable approach to position sizing.

## Interface ISizingCalculateParamsBase

This interface defines the basic information needed when figuring out how much to trade. 

It includes the symbol of the trading pair, like "BTCUSDT", the current balance in your account, and the price at which you plan to enter the trade. These are essential details used in various sizing calculations to determine appropriate trade sizes. Think of it as the foundation for deciding how much of a particular asset you'll be buying or selling.

## Interface ISizingCalculateParamsATR

This interface defines the settings used when determining the size of trades based on the Average True Range (ATR). 

It requires specifying that the sizing method is "atr-based".

You'll also need to provide a numerical value for the ATR, representing the current Average True Range. This value is crucial for calculating an appropriate position size.

## Interface ISizing

The `ISizing` interface defines how a strategy determines how much of an asset to trade. It's the core of managing position sizes.

The `calculate` method is the key part of this interface. It takes a set of parameters, like your risk tolerance and the current market conditions, and uses them to figure out the appropriate position size for a trade. The result is a promise that resolves to the calculated size, usually a numerical value. This allows for asynchronous calculations if needed.

## Interface ISignalRow

This `ISignalRow` interface represents a complete trading signal within the backtesting framework. Each signal has a unique identifier, a cost associated with it, and details about the trade, like the entry price, exchange, strategy, and symbol being traded. It also includes information about when the signal was scheduled and when the position became active.

The signal carries runtime information like expected duration and flags indicating if it was initially scheduled.  A detailed history of any partial profits or losses is tracked for accurate profit and loss (PNL) calculations.

The `ISignalRow` also manages trailing stop-loss and take-profit prices, which dynamically adjust during the trade, and keeps a record of entry prices for dollar-cost averaging (DCA).  The `_peak` and `_fall` properties track the highest and lowest prices reached during the trade to monitor performance. Finally, a timestamp records when the signal was initially created.

## Interface ISignalIntervalDto

This data structure helps manage signals, particularly when you want to delay the next signal until a certain time interval has passed. Think of it as a way to group signals together and release them as a batch. Each signal has a unique ID, ensuring you can track them individually. The `id` property simply holds that unique identifier.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, essentially a set of instructions for executing a trade. When you request a signal, this is the data you'll receive.

Each signal includes a unique identifier – it’s generated automatically if you don’t provide one.  You'll specify whether the trade is a "long" (buy) or "short" (sell) position.  A descriptive note helps explain the reasoning behind the signal, so you understand why the trade is being suggested.

The signal also defines the entry price, as well as target prices for taking profit and stopping losses.  These price targets have specific relationships to the entry price; for a long position, the take profit must be higher and the stop loss lower.

You can set a time limit on the signal’s duration – how long the position should remain open – or configure it to run indefinitely. There's also a field for the cost of entering the position, which has a default value you can adjust.

## Interface ISessionInstance

The `ISessionInstance` interface provides a way to manage temporary data for each specific combination of trading symbol, strategy, exchange, and timeframe. Think of it as a container for information that needs to be shared between different parts of your trading strategy during a single backtesting run. It’s useful for things like storing the results of complex calculations, tracking intermediate results, or caching data that might be expensive to recompute. 

This allows you to keep related data organized and accessible without cluttering your core strategy logic.  The `waitForInit` method allows you to prepare the session data, `setData` lets you write new data to it, `getData` allows retrieving the existing data, and `dispose` cleans up any resources when the session is finished.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that's designed to be triggered at a specific price in the future. Think of it as a signal that's "on hold" until the market reaches a certain price level.

It builds upon the basic `ISignalRow` and adds the concept of a "pending" state - it waits for `priceOpen` to be met.

Once the market price hits that `priceOpen` level, this scheduled signal transforms into a regular, active signal. 

Crucially, a timestamp `scheduledAt` tracks when the signal was initially scheduled, and another `pendingAt` is recorded when the signal actually activates.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that has been cancelled, specifically due to a user action. It builds upon the standard scheduled signal information by adding details about the cancellation itself. If a user cancels a signal, the `cancelId` will be present to uniquely identify that cancellation request, and a `cancelNote` allows for adding a short explanation of why the cancellation occurred. These extra pieces of information are only included when a cancellation has taken place.

## Interface IRunContext

The `IRunContext` acts as a central hub, holding everything a function needs to operate within the backtest-kit framework. Think of it as a package deal, blending information about *how* a trade is routed – like the exchange and strategy involved – with real-time data like the specific symbol and the exact moment in time the trade is happening.  It's designed to streamline operations by providing all this necessary context in one place, rather than having functions search for pieces of information separately.  Behind the scenes, the `IRunContext` is used by internal systems to efficiently distribute its components.

## Interface IRiskValidationPayload

This data structure holds the information needed to assess potential risks when placing a trade. It combines the arguments you initially provided for the risk check with details about your portfolio's current state. 

Specifically, you'll find the signal that triggered the potential trade, represented by `currentSignal`, which includes price data. It also provides insight into how many positions are already open (`activePositionCount`) and a list of those active positions (`activePositions`). This allows your risk validation functions to make informed decisions based on the broader context of your trading activity.

## Interface IRiskValidationFn

This defines the blueprint for functions that check if a trade idea is safe to execute. Think of it as a gatekeeper – if the function approves the trade, it does nothing and lets it proceed. If it finds a problem, it either stops the trade and provides a reason (an `IRiskRejectionResult`) or raises an error, which is then automatically converted into a reason for rejection. This ensures consistent error handling during the validation process.

## Interface IRiskValidation

This section describes how to configure risk validation checks within the backtest-kit framework. You define validation logic by providing a function, `validate`, that handles the actual check. To make the validation easier to understand, you can also add a `note` - a simple text description that explains what the validation does and why it's important. This note serves as documentation for anyone using or maintaining the system.

## Interface IRiskSignalRow

The `IRiskSignalRow` interface represents a single risk signal within the backtest framework, building upon the existing `ISignalDto`. It's designed for internal use, particularly in risk validation processes. This interface provides access to the entry price (`priceOpen`), the initially set stop-loss price (`originalPriceStopLoss`), and the original take-profit price (`originalPriceTakeProfit`) that were defined when the signal was created. Essentially, it allows for checking and managing risk based on the original parameters of a trade.

## Interface IRiskSchema

This defines how to set up rules and checks for your portfolio's risk management. Think of it as creating custom guidelines to ensure your trading strategy stays within acceptable boundaries. Each risk schema has a unique name to identify it and can include notes for developers to explain its purpose. 

You can also add callbacks to trigger specific actions when a risk check fails or passes. 

The core of the schema is a set of validations – these are the actual rules and calculations that determine if a trade is allowed to proceed.  You can create these validations as functions or pre-defined objects, allowing you to tailor the risk checks precisely to your needs.

## Interface IRiskRejectionResult

When your risk validation fails, this object provides details about why. It includes a unique ID to track the specific rejection and a helpful note explaining the reason for the failure in plain language. Think of it as a friendly explanation of what went wrong during the risk check.

## Interface IRiskParams

The `IRiskParams` object defines the settings and information passed to the risk management system. It includes the name of the exchange you're working with, a logger for debugging, and details about the current execution context, like the symbol being traded and whether it's a backtest or live run. 

You'll also find a callback function, `onRejected`, which gets triggered when a trade is blocked due to risk checks. This lets you respond to those rejections, potentially log details or emit events. It’s a crucial piece for understanding why trades might be failing and for monitoring risk-related events.

## Interface IRiskCheckOptions

To help prevent problems when multiple parts of your trading system are trying to adjust positions at the same time, the `IRiskCheckOptions` lets you temporarily mark a position as reserved. This reservation acts like a quick flag, ensuring that all parts of the system see the updated position size *before* any actual trades are executed. Essentially, it provides a safety net to avoid unintended consequences from simultaneous actions, particularly when dealing with complex strategies and rapid order placement. You can enable this reservation by setting the `reserve` property to `true`.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, holds all the information a trading strategy needs to determine if it's safe to place a new trade. Think of it as a safety checklist before a signal is executed. It provides details about the trading pair, the signal itself, which strategy is requesting the trade, and other crucial identifiers like the exchange, risk profile, and timeframe being used.  The checklist also includes the current price and timestamp of the market. Essentially, it’s a package of data allowing the risk management system to validate whether opening a new position aligns with predefined rules and conditions.

## Interface IRiskCallbacks

This interface defines optional callbacks you can use to be notified about the results of risk checks during trading. Specifically, you'll get an `onRejected` call when a trading signal is blocked because it exceeds defined risk limits. Conversely, the `onAllowed` callback is triggered whenever a signal successfully passes all the risk checks, indicating it's clear to proceed. These callbacks provide a way to react to risk assessments programmatically, for example, logging events or triggering other actions.


## Interface IRiskActivePosition

This interface describes a single trading position that's being actively managed and tracked, particularly useful when you’re combining different trading strategies and want to see how they interact. It holds key information about the position, like the name of the strategy that created it, which exchange it's on, and the trading symbol involved (like BTCUSDT). 

You’ll find details like whether it's a long or short position, the original entry price, and the prices set for stop-loss and take-profit orders. Additionally, it keeps track of estimated time and the precise timestamp of when the position was initially opened, providing a complete picture of the trade's lifecycle.

## Interface IRisk

The `IRisk` interface manages and enforces risk limits for your trading strategies. It’s essentially a gatekeeper, ensuring that trades align with your defined risk profile.

The `checkSignal` method lets you verify if a specific trading signal is permissible based on predefined limits. There’s also `checkSignalAndReserve`, which is a more robust version. It's like a double-check that *immediately* sets aside space for the trade if approved, preventing other strategies from accidentally exceeding limits concurrently. Think of it as a safety lock to avoid over-trading.

When a signal is successfully approved and reserved with `checkSignalAndReserve`, it's crucial to either finalize the trade with `addSignal` or cancel it with `removeSignal`. This prevents a buildup of placeholders that can skew your risk calculations.

`addSignal` is how you formally register an open position within the system, providing details about the trade. Conversely, `removeSignal` cleans up when a trade is closed, removing it from the active position tracking.

## Interface IReportTarget

This interface lets you fine-tune which details are recorded during your trading simulations. Think of it as a way to pick and choose what information you want to see in your reports.

You can enable logging for things like strategy decisions, risk assessments, breakeven points, partial order fills, heatmap visualizations, walker iterations, performance metrics, scheduled signals, live trading activity, backtest closures, signal synchronization, or milestones like highest profit and maximum drawdown.

Each property (strategy, risk, breakeven, etc.) acts as a switch: setting it to `true` turns on the corresponding logging feature, while `false` turns it off. This allows for very specific and focused reporting.

## Interface IReportDumpOptions

This interface lets you control what information gets included when you're generating reports from your backtesting results. Think of it as a way to specify exactly what details you want to see, such as the trading symbol (like BTCUSDT), the name of the strategy used, the exchange it ran on, and the timeframe being tested. It also allows you to identify specific signals and optimization runs by providing unique identifiers for each. Ultimately, it’s all about filtering and organizing your report data to find the insights you’re looking for.

## Interface IRecentUtils

This interface helps manage and access recent trading signals. It provides a way to record new signals when they come in, specifically when a "ping" event occurs. You can also easily fetch the most recent signal for a particular trading setup, defined by factors like the asset symbol, strategy name, exchange, timeframe, and whether it's a backtest. Finally, it's helpful to know how long ago the last signal was generated, calculated in minutes, which can be useful for assessing signal freshness.


## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a way to share detailed information about a trading signal with users, even when strategies are using advanced features like trailing stop-loss or take-profit orders. It builds on the base `ISignalRow` by adding crucial information about the *original* stop-loss and take-profit prices set when the signal was first created.

This is helpful because it lets users see the initial risk parameters alongside the currently adjusted values due to trailing mechanisms, increasing transparency. The original stop-loss and take-profit values will not change, giving a clear picture of the intended strategy.

Beyond the original prices, you’ll also find key performance metrics like the cost of entering the position, how much of the position has been partially closed, the number of entry and partial close executions, and details about the position's profit and loss, peak profit, and maximum drawdown. The `originalPriceOpen` property gives you the initial entry price, which remains constant even with averaging. This interface gives a comprehensive overview of a signal's history and current status, suitable for reporting and user-friendly interfaces.

## Interface IPublicCandleData

This interface defines the structure of a single candlestick, representing a period of price action for a trading instrument. Each candlestick holds key data points: the time it began, the opening price, the highest and lowest prices reached, the closing price, and the volume of trades that occurred during that time. Think of it as a snapshot of market activity over a specific interval. The timestamp provides the exact moment the candle started, measured in milliseconds since January 1, 1970. The `open`, `high`, `low`, `close`, and `volume` properties provide the core information about the price movement and trading intensity within that time frame.

## Interface IPositionSizeKellyParams

This interface defines the parameters needed to calculate position sizes using the Kelly Criterion. It essentially helps you determine how much of your capital to risk based on your expected profitability. 

You'll provide two key pieces of information: your win rate, which represents the percentage of winning trades, and your average win/loss ratio, which describes how much you win compared to how much you lose on each trade. These values are used to compute an optimal position size for each trade.

## Interface IPositionSizeFixedPercentageParams

This defines how to set a stop-loss price when using a fixed percentage position sizing strategy. 

It's a simple numerical value representing the price at which you want to automatically exit a trade to limit potential losses.

## Interface IPositionSizeATRParams

This parameter defines the Average True Range (ATR) value used for determining position sizing. It represents the current volatility level, which is a key factor in how much capital you allocate to a trade. A higher ATR suggests greater volatility, potentially influencing a smaller position size to manage risk. The value should be a numerical representation of the ATR.

## Interface IPositionOverlapLadder

This configuration defines a safety zone around each dollar-cost averaging (DCA) price point to help identify potential overlaps in your trading positions. The `upperPercent` setting controls how much higher than each DCA level you consider a position to be overlapping, expressed as a percentage. Similarly, `lowerPercent` defines how much lower than each DCA level you'll flag as an overlap, also as a percentage. These percentages let you fine-tune how sensitive the overlap detection is, allowing you to avoid unintended flags while still catching genuine overlaps.

## Interface IPersistStorageInstance

This interface allows you to customize how trading signals are saved and loaded for backtesting or live trading. Think of it as a way to replace the default file storage with something else, like a database or an in-memory solution.

It manages storage separately for backtesting and live trading, ensuring data integrity in each environment.

When you read the storage, it goes through all the saved signals and presents them as a list. Writing involves saving signals, organized by their unique signal IDs. 

To use this, you'll create your own storage adapter and make it conform to this interface, providing your own implementation of `waitForInit`, `readStorageData`, and `writeStorageData`.

## Interface IPersistStateInstance

This interface defines how to handle persistent storage for strategy state, ensuring data isn't lost even if the system crashes. It's specifically tied to a unique combination of a signal and a bucket name, meaning each storage area is clearly defined.

If you're building a custom solution to save and load strategy information, you'll need to implement this interface.

The `waitForInit` method sets up the storage when it's first needed. `readStateData` retrieves any previously saved data, `writeStateData` saves new or updated data, and `dispose` cleans up any resources used. Think of it as a standardized way to manage data for a specific part of your strategy's lifecycle.

## Interface IPersistSignalInstance

This interface lets you customize how trading signals are saved and loaded for a particular strategy and exchange combination. Think of it as a way to replace the default file-based storage with something else, like a database or in-memory solution.

The `waitForInit` method is called to set up the storage when needed.  `readSignalData` retrieves previously saved signal information, and `writeSignalData` is used to store new signal data – or to clear out any existing data if you pass `null`.  Each instance of this interface handles signal persistence for a unique combination of symbol, strategy, and exchange.

## Interface IPersistSessionInstance

This interface helps manage how trading sessions are saved and loaded, ensuring your strategies don't lose important information even if things go wrong. Think of it as a way to keep a record of what happened during a specific trading setup. 

Each session gets its own dedicated storage space, defined by a unique combination of strategy, exchange, and frame. This ensures isolation and prevents conflicts.

If you want to customize how session data is stored (beyond the default file-based approach), you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage specifically for that trading session. `readSessionData` retrieves any previously saved data. `writeSessionData` saves the current session’s information. Finally, `dispose` releases any resources the storage is using, though it might not always need to do anything.

## Interface IPersistScheduleInstance

This interface lets you customize how backtest-kit saves and loads scheduled signals – those signals that trigger actions at specific times. It’s designed to work within a particular combination of a symbol, strategy name, and exchange.

Think of it as a way to replace the default file-based storage with your own method, maybe to use a database or an in-memory solution.

The `waitForInit` method prepares the storage for your scheduled signals.  `readScheduleData` retrieves a previously saved signal. And `writeScheduleData` saves a new signal or clears the existing one. This lets you manage the data for each scheduled signal independently.


## Interface IPersistRiskInstance

This interface defines how your custom code can manage and save the active positions for a specific risk profile and exchange combination. Think of it as a way to handle where and how your trading system remembers the current risk levels for a particular setup. 

If you want to move away from the default file storage, you can create your own adapter that implements these methods. `waitForInit` lets you prepare your storage when the system starts up. `readPositionData` loads the saved positions from wherever you're storing them. And finally, `writePositionData` allows you to save the current positions so they're available later.


## Interface IPersistRecentInstance

This interface defines how to store and retrieve the most recent trading signal for a specific setup. Think of it as a way to remember what signal was active for a particular symbol, strategy, exchange, and timeframe during a backtest or live trading session.

It's designed to let you customize how this information is saved – you can build your own storage system instead of relying on the default file-based approach.

The `waitForInit` method prepares the storage for use, `readRecentData` loads the last known signal, and `writeRecentData` saves the current signal. This ensures that you can pick up where you left off, even if the backtest or live session is interrupted.

## Interface IPersistPartialInstance

This interface helps manage how trading data, specifically partial profit and loss information, is saved and loaded for each unique combination of asset, strategy, and exchange. Think of it as a way to keep track of progress for individual trading signals within a larger context. 

It allows you to customize where and how this partial data is stored – instead of relying on the default file storage. 

The `waitForInit` method sets up the storage area. `readPartialData` retrieves the saved data for a particular signal, and `writePartialData` saves new or updated data for a specific signal. Essentially, it provides a framework to handle the saving and loading of intermediate results during backtesting or live trading.

## Interface IPersistNotificationInstance

This interface defines how your custom code can manage and store notifications—essentially little pieces of information—within the backtest-kit framework. Think of it as a way to save and load important updates or events that happen during a trading simulation or a live trading session. There’s a separate storage system for backtesting and live trading.

The `waitForInit` method prepares the storage space when the system starts up, letting you set things up before notifications begin.  `readNotificationData` retrieves all the stored notifications, bringing them back into the system.  Finally, `writeNotificationData` allows you to save notifications to storage, associating each one with a unique identifier so it can be found later. 

This allows for persistence of notifications across sessions, if needed.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for specific contexts within the backtest-kit framework. Think of it as a way to manage and persist information related to your trading strategies. 

It’s particularly useful when you’re using Large Language Models (LLMs) in your trading system because it allows them to remember things between different trading scenarios.

You can customize how memory is stored, moving away from the default file-based approach, by creating your own adapters that implement this interface.

Here’s a breakdown of what it lets you do:

*   **Initialization:** `waitForInit` prepares the storage area for your memory.
*   **Reading:** `readMemoryData` gets a specific memory entry by its ID. `hasMemoryData` checks if a memory entry exists.
*   **Writing:** `writeMemoryData` saves a new memory entry.
*   **Deletion:** `removeMemoryData` allows for "soft deletes"—memory entries are effectively hidden but not permanently removed from disk.
*   **Listing:** `listMemoryData` retrieves all the active (non-deleted) memory entries.
*   **Cleanup:** `dispose` releases any resources the storage might be using.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data for backtest measures. It’s designed to let you customize how that caching works, moving beyond the default file-based approach. The system supports a soft-delete mechanism, which means that when data is removed, it’s not actually erased but marked as deleted; these marked entries are then excluded during reads.

Here's a breakdown of what you'll need to do if you create your own implementation:

*   `waitForInit`: Prepares the storage for a specific set of measures.
*   `readMeasureData`: Loads a cached measure from storage using a unique key.
*   `writeMeasureData`: Saves cached measure data using a key.
*   `removeMeasureData`:  Marks a measure as deleted without permanently removing it from storage.
*   `listMeasureData`: Provides a way to see all the keys of measures that haven't been marked as deleted.

## Interface IPersistLogInstance

This interface lets you customize how backtest-kit stores its logs. Think of it as a way to replace the default file-based log storage with something else, like a database or a cloud service. 

There's one global log storage area per process, and it’s accessed through this interface.

To use it, you'll provide your own implementation that handles reading and writing log entries. The `waitForInit` method is used to set up the initial state of the log storage. `readLogData` retrieves all existing log entries, and `writeLogData` adds new entries, ensuring that no existing entries are overwritten to maintain a history.


## Interface IPersistIntervalInstance

This interface helps manage how trading strategies remember which time periods they’ve already processed for a specific data source. Think of it as a way to avoid repeatedly running the same calculations.

It allows you to customize how that "memory" is stored, moving beyond the default file-based approach.

The `waitForInit` method gets things started for a particular time period.

`readIntervalData` retrieves the record for a specific key, like a stock symbol.

`writeIntervalData` saves the fact that an interval has run.

If you need to re-run a calculation, `removeIntervalData` essentially clears the record, allowing it to be processed again.

Finally, `listIntervalData` lets you see all the time periods that have already been accounted for.

## Interface IPersistCandleInstance

This interface defines how your trading strategy can persistently store and retrieve historical candle data for a specific trading symbol, time interval, and exchange. Think of it as a way to save your past data so you don't have to re-download it every time. 

The `waitForInit` method sets up the storage area for your data. The core functionality lies in `readCandlesData`, which fetches a chunk of cached candles within a specified time range; if any candle is missing from the cache, it returns null, signaling that the data needs to be fetched from the original source.  `writeCandlesData` is used to save candles to the cache – it's a good idea to avoid saving incomplete or duplicate data. This provides flexibility to swap out the default file-based storage with a custom storage solution tailored to your needs.

## Interface IPersistBreakevenInstance

This interface lets you manage how breakeven data—the point where a trade becomes profitable—is stored for each individual trading strategy, exchange, and asset combination. Think of it as a specialized container for this important information. 

You can use it to customize where this data lives, instead of relying on the default file storage.

The `waitForInit` method sets things up when the storage for a particular trading setup needs to be prepared. 

`readBreakevenData` retrieves previously saved breakeven details for a specific trade signal.  `writeBreakevenData` is how you store those breakeven details for a trade signal. 


## Interface IPersistBase

This interface is designed to let you build your own ways to store and retrieve data for backtesting. 

Think of it as a basic set of rules for how your custom storage system should work. It lays out the core functions you need: initializing the storage, reading data, checking if data exists, writing data, and getting a list of all the data keys.

The `waitForInit` function makes sure that any necessary setup happens only once.
`readValue` grabs a specific piece of data.
`hasValue` confirms that a particular piece of data is stored.
`writeValue` saves a piece of data, doing so safely to prevent data corruption.
And finally, `keys` gives you a way to go through all the data that's been stored, in alphabetical order.


## Interface IPartialProfitCommitRow

This object represents a request to take a partial profit on a trade. It’s triggered as part of a trading strategy and tells the system how much of a position to close.

It contains a few key pieces of information:

*   `action`: This always specifies the action as "partial-profit", clearly identifying the type of instruction.
*   `percentToClose`: This number indicates what percentage of the total position size should be closed.
*   `currentPrice`: This is the price at which the partial profit taking action actually occurred.

## Interface IPartialLossCommitRow

This represents a record of a partial loss transaction that's been scheduled for execution. 

It tells you that a partial loss is happening.

The `action` confirms it’s a partial loss.

`percentToClose` specifies what portion of the position will be closed.

`currentPrice` indicates the price at which the partial loss trade was carried out.

## Interface IPartialData

This interface, IPartialData, is designed to store bits and pieces of data for later saving and loading. Think of it as a snapshot of important information related to a specific trading signal. It's particularly useful for persisting data like the profit and loss levels that a signal has encountered.

The data is structured with two main components: profitLevels and lossLevels. These are arrays of "PartialLevel" objects, which represent the levels where a signal achieved profit or incurred a loss. Essentially, IPartialData breaks down a more complex state into something that can be easily saved, like converting a collection of data into a list. This allows the framework to remember where a signal was when it needs to be resumed later.


## Interface IPartial

The `IPartial` interface is responsible for keeping track of how much profit or loss a trading signal is generating. It’s used by components like `ClientPartial` and `PartialConnectionService`.

When a signal is making money, the `profit` method calculates if it has hit milestones like 10%, 20%, or 30% profit, and sends out notifications accordingly. If the signal is losing money, the `loss` method does the same for loss percentages. These methods avoid sending duplicate notifications by remembering which levels have already been reported.

Finally, the `clear` method resets the profit/loss tracking when a signal finishes—whether it hits a stop loss, takes profit, or simply expires—and cleans up associated data.

## Interface IParseArgsResult

The `IParseArgsResult` object holds the information gathered from command-line arguments when starting a trading session. It takes your initial parameters and adds flags that determine the type of trading you'll be doing. Specifically, it tells you whether the session is a backtest (using historical data), a paper trade (simulated trading with live data), or a live trade (actual trading with real money). This lets you easily control the execution environment without altering the core trading logic.

## Interface IParseArgsParams

This interface outlines the information needed to run a trading strategy from the command line. Think of it as a blueprint for what the backtest-kit needs to know to get started. It specifies the essential details: which cryptocurrency pair to trade (like BTCUSDT), the name of the trading strategy you want to use, which exchange it should connect to (like Binance or Bybit), and the timeframe for the price data (such as 1-hour candles). You essentially provide these pieces of information to kick off the backtesting process.

## Interface IOrderBookData

The `IOrderBookData` interface represents the data you receive from an order book. It holds information about the current state of bids and asks for a specific trading pair. Each order book data object includes the `symbol` which identifies the trading pair, like "BTCUSDT".  You'll also find arrays of `bids` and `asks`; these arrays contain details about the buy and sell orders, respectively, that are currently waiting to be filled.

## Interface INotificationUtils

This interface defines the basic structure for how different systems can send notifications about what’s happening in your backtest or trading strategy. Think of it as a contract that ensures all notification systems – whether it’s email, SMS, or a custom dashboard – speak the same language. 

It outlines a set of methods, each representing a specific event or piece of information to be relayed, such as when a trade is opened or closed, when partial profit or loss targets are reached, or when errors occur.  You'll find methods for handling different types of signals and status updates.

The `getData` method allows you to retrieve a record of all previously sent notifications, and `dispose` lets you clear that history.  Any custom notification system you build needs to implement these methods to work seamlessly within the backtest-kit framework.

## Interface INotificationTarget

This interface helps you fine-tune which notifications your backtest or live trading system receives, preventing unnecessary data from flooding your system. Think of it as a way to subscribe only to the specific types of events you're interested in.

If you don’t specify this interface, you’ll receive all notifications, which is like subscribing to everything.

Here's a breakdown of the different notification categories you can control:

*   **Signal Events:** Notifications related to signal lifecycle, like when a signal is opened, scheduled, closed, or cancelled.
*   **Profit/Loss Events:** Alerts when partial profit, partial loss, or breakeven levels are hit. These occur before any final decisions are made.
*   **Strategy Commitments:** Notifications confirming when the strategy takes actions like committing to partial profits or losses.
*   **Signal Synchronization:** Events related to when signals are confirmed by the exchange (for live trading).
*   **Risk Rejections:** Notifications when the risk manager blocks a new signal.
*   **Informational Signals:** Manual or strategy-generated messages providing extra details about active signals.
*   **Error Notifications:** Different levels of errors, from common, recoverable errors to critical, unrecoverable errors that may terminate the process.
*   **Validation Errors:** Alerts when there are problems with your strategy configuration or the data you're using.



By using this interface, you can tailor your notifications to focus on the events that are most important for your analysis or decision-making.

## Interface IMethodContext

The `IMethodContext` object is like a little package of information that helps the backtest-kit framework know which specific pieces it needs to run a simulation. It holds the names of the strategy, exchange, and frame being used. Think of it as a set of instructions that ensures the right components are loaded and used during the backtesting process, making sure everything aligns with the chosen simulation setup. The `frameName` being empty indicates a live trading scenario.

## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems should work within the backtest-kit framework. Think of it as a blueprint for managing data used during backtesting.

It provides methods for initializing the memory, writing new data, retrieving data, and cleaning up.

Specifically, you can use these methods to:

*   Start up the memory storage.
*   Store information (like historical prices or trading signals) using a unique identifier.
*   Find specific data using keyword searches.
*   View a complete list of stored data.
*   Delete data entries.
*   Retrieve a single piece of data by its identifier.
*   Release resources when the memory storage is no longer needed.

## Interface IMarkdownTarget

This interface lets you choose which detailed reports to generate when running a backtest. Think of it as fine-tuning what kind of data you want to see beyond the core backtest results.

You can toggle on reports for specific events like when a trade enters or exits, when risk limits prevent a trade, or when a stop-loss adjusts to the entry price.

It also offers options for more advanced analysis, such as visualizing portfolio performance with a heatmap, comparing different strategies, or identifying performance bottlenecks.

Finally, you can enable reports to track signal scheduling, live trading activity, synchronization events, and milestones like reaching the highest profit or experiencing the maximum drawdown. Essentially, it allows you to control the level of detail in your backtest reporting.

## Interface IMarkdownDumpOptions

This interface defines the settings you can use to specify where and what data to include when generating documentation. Think of it as a set of clues that tells the system exactly which files and folders to process and what information to extract. You can pinpoint a specific trading pair, strategy, exchange, or timeframe to focus on, or specify a directory and file to target. The `path` property tells it where to look, `file` identifies the specific file, and the other properties refine the selection by narrowing down the symbol, strategy, exchange, frame, and signal ID. It’s like having a precise address to find a particular piece of information within your project's documentation.


## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what’s happening. It allows components like agents, sessions, and storage to record events, errors, and important details. 

Think of it as a way to create a detailed record of your backtesting process.

You can use `log` for general updates, `debug` for very detailed troubleshooting information, `info` for important milestones, and `warn` to flag potential issues that need investigating. This detailed logging makes it much easier to understand what happened during a backtest and to identify any problems.

## Interface ILogEntry

This describes a single entry in the system's log history. Each log entry has a unique ID and a type indicating its severity level (log, debug, info, or warning). 

The entries are timestamped for tracking and potential rotation of older logs, with several timestamps providing different levels of detail. 

Optional contextual information, like the method and execution context, can be included to give more insight into where and how the log entry was generated. There's also space to include additional arguments passed when the log entry was created.


## Interface ILog

The `ILog` interface provides a way to access and manage a history of log entries within the backtest-kit framework. It's like having a record of everything that happened during your trading simulations.

The primary method, `getList`, allows you to retrieve all the logged events, letting you examine the sequence of actions and decisions made during a backtest. This can be really useful for debugging, analyzing strategy performance, or understanding the flow of your trading system.

## Interface IHeatmapRow

This interface describes the key performance statistics for a specific trading pair, like BTCUSDT, when you’re evaluating strategies in a backtest. It provides a comprehensive snapshot of a trading pair's performance, aggregating results from all the strategies applied to it.

You’ll find metrics like total profit or loss, Sharpe Ratio (measuring risk-adjusted return), and maximum drawdown (the biggest loss from a peak). It also breaks down the trading activity with the total number of trades, win/loss counts, and win rate.

Detailed insights into average profit and loss per trade, volatility (standard deviation), and profit factor are also available. It even tracks streaks of wins and losses, expectancy, and several other risk-adjusted ratios like Sortino and Calmar ratios to give a holistic view of the trading pair’s performance. You can use this data to understand how each trading pair performed and to compare the effectiveness of different trading strategies.

## Interface IFrameSchema

The `IFrameSchema` lets you define specific periods and intervals for your backtesting simulations. Think of it as a blueprint for creating a "frame" of data – a slice of time you want to analyze. Each frame has a unique name to identify it, and you can add a note for yourself to document its purpose.

You’ll specify the interval (like daily, hourly, or weekly) that your timestamps should be generated with, along with the start and end dates that define the backtest window.  

You also have the option to set callbacks—special functions that can be triggered at different points in the frame’s lifecycle. This allows you to perform custom actions or calculations during your backtest.

## Interface IFrameParams

The `IFramesParams` object is used when setting up a ClientFrame – think of it as the initial configuration for your trading environment. It builds upon the `IFramesSchema` and crucially includes a logger. The logger is your tool for keeping an eye on what’s happening under the hood, allowing you to debug and understand how your trading strategies are performing. It lets you output diagnostic messages to help spot any issues.

## Interface IFrameCallbacks

This function gets called whenever a new set of timeframes is created. Think of it as a notification that the framework has figured out the dates and intervals for your backtest. You can use it to check if the timeframes look right, log them for debugging, or perform other actions after the timeframe generation process completes. The timeframe array, the start date, the end date, and the interval used to create them are all provided to you.


## Interface IFrame

The `IFrames` interface helps manage the timing of your backtests. It’s essentially the system for figuring out when each data point should be considered during a simulation.

The `getTimeframe` function is the key part – it allows you to retrieve a list of specific timestamps for a given trading symbol and a named timeframe (like "daily" or "hourly"). This function is what ensures your backtest runs consistently across data, spacing out the iterations according to a predefined interval. It promises to return an array of dates representing those timestamps.

## Interface IExecutionContext

The IExecutionContext object provides essential information about the current trading environment. Think of it as a shared container of details passed around during strategy execution and exchange interactions.

It holds the trading symbol, like "BTCUSDT," which specifies the asset being traded.

It also keeps track of the current time, represented as a date, which is vital for order placement and analysis.

Finally, it indicates whether the system is running in backtest mode, allowing you to test strategies against historical data, or in live trading mode.

## Interface IExchangeSchema

This schema defines how backtest-kit interacts with different exchanges, ensuring data is retrieved and formatted correctly. Think of it as a blueprint for connecting to a specific exchange. 

It includes a unique identifier for the exchange and an optional note for developers. 

The most important part is `getCandles`, which tells backtest-kit how to fetch historical price data—where to look and how to handle requests.  There's also `formatQuantity` and `formatPrice` to handle the exchange's specific rules for dealing with trade sizes and prices. If these aren't specified, defaults are used.

You can also define how to retrieve order books (`getOrderBook`) and aggregated trades (`getAggregatedTrades`), but these are optional – if you don't need them, backtest-kit will alert you. Finally, `callbacks` provide a way to respond to certain events during the backtesting process.

## Interface IExchangeParams

The `IExchangeParams` interface defines the essential configuration needed for a trading exchange to operate within the backtest-kit framework. Think of it as a set of instructions telling the framework how to interact with a specific exchange. 

It requires you to provide functions for retrieving candles (historical price data), formatting quantities and prices to match the exchange's rules, fetching order books, and obtaining aggregated trade data. Each of these functions is critical for accurate backtesting and simulation. 

The `logger` allows for debugging and monitoring, while the `execution` context provides information like the trading symbol and the current backtesting status. You’ll need to supply implementations for all the provided methods, although sensible defaults are applied during initialization.

## Interface IExchangeCallbacks

The `IExchangeCallbacks` interface lets you hook into events happening when the exchange is providing data. Specifically, the `onCandleData` callback gets triggered whenever the system pulls in new candlestick data. 

You'll receive information about which symbol the data relates to, the time interval of the candles, the timestamp indicating when the data collection started, the requested number of candles, and the actual array of candlestick data itself. This allows you to react to incoming data as it arrives.


## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It allows you to retrieve historical and future price data (candles) for a specific trading pair and time period, which is essential for simulating trading strategies. You can also fetch real-time order book data and aggregated trade history.

The framework automatically handles formatting trade quantities and prices to match the exchange's precision requirements. The `getAveragePrice` function calculates the VWAP (Volume Weighted Average Price) using recent trade data.

To accurately simulate trading, these functions prevent "look-ahead bias" – ensuring that your backtest only uses data that would have been available at the time of the trade.

Retrieving historical candles is very flexible; you can specify a start and end date, or just a number of candles to retrieve, and the framework will handle the date calculations automatically.

## Interface IEntity

This interface serves as the foundation for all data objects that are stored persistently within the backtest-kit framework. Think of it as a common starting point – if a data object needs to be saved or retrieved from storage, it likely implements this interface. It provides a basic structure that ensures consistency across different types of entities.

## Interface IDumpInstance

The IDumpInstance interface defines how to save different types of data related to a backtest run. Think of it as a way to collect snapshots of the process, like conversation histories, structured data, tables of information, raw text logs, error reports, and even complex JSON objects. Each data piece gets saved with a unique identifier and a short description to explain what it represents.  When you're done, the `dispose` method allows you to clean up and release any resources this component might be using. The `dumpAgentAnswer` method specifically handles saving complete conversation histories.

## Interface IDumpContext

The `IDumpContext` helps organize and identify data dumps within the backtest-kit system. Think of it as a set of labels attached to each dump, making it easier to find and understand its purpose.

Each dump receives a unique signal identifier, a bucket name to categorize it, and a special ID.

There's also a descriptive label to help explain what the dump contains.

Finally, a flag indicates whether the data dump originates from a backtest scenario or a live trading environment.

## Interface ICommitRowBase

The `ICommitRowBase` interface defines the fundamental information included when a trading action is queued for processing. Think of it as the basic building block for recording what happened during a trade. 

It includes the `symbol`, which is simply the ticker of the trading pair (like BTC/USDT), and a boolean value `backtest` that indicates whether the action occurred during a simulated backtest rather than a live trade. This base interface ensures that all commit events have this essential context.

## Interface ICheckCandlesParams

This interface defines the information needed to check the timestamps of your historical candle data. It essentially tells the system which trading pair, exchange, and time period you're interested in, and where to find the data on your system.  You'll provide things like the symbol (like "BTCUSDT"), the exchange's name, the timeframe for the candles (e.g., 1-minute, 4-hour), and a date range to examine. Finally, you can specify the main folder where your candle data is stored, though there’s a default location if you don’t.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard unit of time-based price data in trading. Each candlestick holds information about the price activity over a specific period.  It includes the `timestamp` indicating when the candle began, the `open` price at the start, the `high` and `low` prices reached, the `close` price at the end, and the `volume` of trades that occurred during that time. This data is essential for backtesting trading strategies and calculating technical indicators like VWAP.

## Interface ICacheCandlesParams

This interface defines the information needed to prepare historical data for backtesting. Think of it as a blueprint for fetching and storing past candlestick data. It specifies what trading pair (like BTCUSDT), which exchange, the time interval of the candles (like hourly or daily), and the start and end dates for the data you want to retrieve.  Essentially, you provide these details to download and save historical data, so your backtest can run smoothly without constantly fetching it live.

## Interface IBroker

The `IBroker` interface is how backtest-kit connects to a real brokerage for live trading. Think of it as a translator between the framework's internal logic and the specific instructions your broker needs.

You'll need to create a class that implements this interface.

This class is responsible for tasks like establishing a connection, loading authentication details, and ultimately sending orders to the exchange.

Importantly, these calls happen *before* the framework makes any changes to its internal state, so errors will prevent those changes and maintain consistency.

During backtesting, these calls are ignored—the broker adapter won't be involved in the simulated trading.

Here's a breakdown of the individual methods:

`waitForInit`: This is called once at the very beginning to get everything set up.

`onSignalCloseCommit`:  Notifies the broker when a trade is closed, whether it's because of a take-profit, stop-loss, or manual intervention.

`onSignalOpenCommit`:  Sends the confirmation that a new trade has been opened.

`onPartialProfitCommit`: Handles orders to take a portion of your profits.

`onPartialLossCommit`: Deals with orders to cut losses on a portion of your position.

`onTrailingStopCommit`:  Manages updates to trailing stop-loss orders.

`onTrailingTakeCommit`:  Handles updates to trailing take-profit orders.

`onBreakevenCommit`:  Sends instructions to move a stop-loss to the entry price.

`onAverageBuyCommit`:  Handles orders for a dollar-cost averaging (DCA) strategy.

## Interface IBreakevenData

This interface, `IBreakevenData`, is all about saving and loading information about whether a breakeven point has been achieved in your trading strategy. Think of it as a simplified snapshot of more detailed breakeven information, designed specifically to be easily stored and transmitted, often as JSON data. It's used to keep track of breakeven status for each trading signal, allowing your backtesting system to remember the progress between sessions. The `reached` property is the key piece here – it's a simple `true` or `false` value indicating if the breakeven goal has been met.


## Interface IBreakevenCommitRow

This object represents a queued action related to breakeven points during a backtest. Specifically, it indicates an action to adjust or re-evaluate breakeven levels. The `action` property confirms that this entry deals with breakeven calculations. The `currentPrice` field stores the price value that was in effect when the breakeven was originally determined, which can be useful for later analysis or adjustments.

## Interface IBreakeven

The IBreakeven interface helps manage a feature where a trading strategy can automatically adjust a stop-loss to the entry price, essentially achieving a breakeven point.

It's used by systems that monitor trading signals and handle the logic for this breakeven adjustment.

The `check` method determines if the conditions for moving the stop-loss to breakeven have been met – ensuring the price has moved favorably enough to cover any transaction costs and that breakeven hasn’t already been triggered. If so, it records that breakeven has been achieved and notifies connected systems.

The `clear` method resets the breakeven status when a trading signal is closed, effectively cleaning up the state and persisting changes. This ensures a clean slate for future signals.

## Interface IBidData

This describes a single bid or ask that's part of an order book. It has two key pieces of information: the price at which the order is placed, and the quantity of the asset being offered at that price. Both the price and quantity are represented as strings.

## Interface IAverageBuyCommitRow

This interface describes a single step within a strategy that uses a dollar-cost averaging (DCA) approach to buying assets. 

It represents a "commit" - a moment where the strategy buys a specific amount of the asset. 

The `action` property confirms this is an average-buy commit. 

You’ll find the `currentPrice` to know the price at the time of the buy, the `cost` to track the total USD spent for this particular purchase, and the `totalEntries` to keep a running tally of the overall number of DCA entries made so far.


## Interface IAggregatedTradeData

IAggregatedTradeData holds information about a single trade. Think of it as a record of what happened when a transaction took place. 

It provides key details like the trade price, the amount of the asset exchanged, and the exact time of the trade.  

A crucial piece of information is `isBuyerMaker`, which tells you whether the buyer initiated the trade or if the seller did – this can be valuable for understanding market dynamics.  Each trade has a unique `id` for reference.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a scheduled commit, essentially triggering a pre-planned action. It's used when the backtest kit needs to execute something that was previously scheduled. 

The `action` property always specifies that this is an activation request. 

Each request includes a `signalId`, which identifies the specific signal the activation relates to.  You'll also find an optional `activateId` that lets you tie the activation to a particular user action if needed.

## Interface IActionStrategy

The `IActionStrategy` interface gives action handlers a way to peek at the current signal status. Think of it as a read-only window into what the strategy is expecting – whether there’s a pending signal or a scheduled signal.

This helps action handlers avoid unnecessary actions. For example, it allows checks to make sure there's a signal before trying to adjust a stop-loss or ping the system.

Specifically, the `hasPendingSignal` method tells you if there’s a currently open position signal, and the `hasScheduledSignal` method tells you if a signal is waiting to be triggered. You'll pass in information like whether it’s a backtest, the symbol in question, and details about the strategy and exchange. Both methods return a promise that resolves to `true` or `false`.

## Interface IActionSchema

The `IActionSchema` lets you extend your backtesting strategies with custom logic. Think of it as a way to hook into your strategy's execution and do things like log events, update external state (like Redux), or send out notifications.

Each action is essentially a little piece of code that gets run within each step of your backtest, giving it access to all the data generated at that point.

You define actions by giving them a unique name, an optional note for documentation, and a handler—this is the code that actually does what you want.

Finally, you can also include optional callbacks to control when the action runs, like before or after a trading decision. This flexibility lets you tailor actions to a wide range of needs, from simple logging to complex integrations.

## Interface IActionParams

The `IActionParams` interface defines the information passed when creating an action within the backtest-kit framework. Think of it as a bundle of essential details that help your action understand its surroundings. 

It builds upon a base schema and includes things like a logger for tracking what your action is doing, the names of the strategy and timeframe it belongs to, and whether it's running as a backtest. Importantly, it also provides access to the current signal and position information through the `strategy` property, giving your action a view of the overall trading context. This lets you make decisions based on what's happening in the strategy and market.

## Interface IActionCallbacks

This interface, `IActionCallbacks`, lets you plug into different points in the lifecycle of your trading actions. Think of it as a series of hooks you can use to customize how your trading strategies behave. 

You can use these callbacks for things like setting up database connections when your action handler starts (`onInit`), or cleaning up resources when it stops (`onDispose`).

There are also a bunch of event-driven callbacks. For example, `onSignal` gets called every time a signal is generated, whether you're backtesting or trading live.  There are even separate callbacks for live trading (`onSignalLive`) and backtesting (`onSignalBacktest`) alone.

You can be notified when certain events like breakeven is reached (`onBreakevenAvailable`), partial profits or losses are triggered (`onPartialProfitAvailable`, `onPartialLossAvailable`), or when pings are scheduled and active (`onPingScheduled`, `onPingActive`, `onPingIdle`).  

If your signal is blocked by risk management, `onRiskRejection` will be called. And finally, `onSignalSync` lets you control whether a limit order is placed, which is a critical area for custom logic - and any errors here will halt the process and retry the action.



Essentially, this provides a flexible way to extend the core functionality of the trading framework.

## Interface IAction

The `IAction` interface is your central hub for responding to events generated by different parts of the backtest-kit framework. Think of it as a customizable listener that allows you to react to what's happening during a backtest or live trade.

It provides methods like `signal`, `signalLive`, and `signalBacktest` which are triggered every time your strategy evaluates a tick or candle, depending on whether you're in live or backtest mode.  You can use these to log activity, update dashboards, or feed data to external analytics tools.

Beyond the main `signal`, there are specialized handlers for things like breakeven adjustments, partial profit/loss levels, and ping events related to pending signals.  The `riskRejection` handler is specifically for when your signals fail a risk check.

Crucially, the `signalSync` method allows you to influence order execution when the framework tries to use limit orders.  If you need to reject an order, you can throw an error here.  Finally, the `dispose` method is vital for cleaning up subscriptions and releasing resources when you're finished with this handler.  It ensures a clean shutdown of your custom logic.

## Interface HighestProfitStatisticsModel

This model keeps track of the best profit-making moments in a backtest. 

It stores a list of individual events that resulted in profit, presented in chronological order with the most recent ones first. 

You'll also find a count of how many of these profitable events occurred during the backtest. Essentially, it provides a summarized view of the peaks in profitability.

## Interface HighestProfitEvent

This data represents the single most profitable moment observed for a particular trading position. It holds important details about when that peak profit occurred, including the trading pair involved and the name of the strategy that generated the trade. You'll find information about the unique signal that triggered the position, whether it was a long or short trade, and the overall profit and loss (PNL) realized from the trade.

The record also captures the highest profit achieved during the position's lifespan, alongside the maximum drawdown experienced. Key price points are recorded too, such as the price at which the record profit was reached, the entry price, and the defined take profit and stop-loss levels. Finally, a flag indicates whether this event occurred during a backtesting simulation.

## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading position reaches a new peak profit level. It gives you details like the trading symbol, the current price at that moment, and the exact time the profit was achieved. You'll also get context about which strategy, exchange, and timeframe were involved, along with the signal data that triggered the trade.  A key feature is the `backtest` flag, which tells you whether this profit update came from a historical simulation or a live trading situation, allowing you to handle backtest results differently. This contract helps you build custom responses to profit milestones, like adjusting stop-loss orders or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds the overall statistics for your portfolio's performance, providing a high-level view of how your investments are doing. It organizes data for each individual symbol within the portfolio into an array called `symbols`, allowing for detailed analysis. 

You’ll also find key metrics like the total number of symbols tracked (`totalSymbols`), the overall profit and loss (`portfolioTotalPnl`), and a measure of risk-adjusted return (`portfolioSharpeRatio`).  It also includes the total number of trades executed (`portfolioTotalTrades`).

To give you a sense of typical performance, it calculates weighted averages of the highest profit achieved (`portfolioAvgPeakPnl`) and the largest loss incurred (`portfolioAvgFallPnl`) for each symbol – these give you a feel for the potential upside and downside risks within your portfolio.

## Interface DoneContract

This interface represents the information you receive when a background task, like a backtest or a live trading process, finishes running. It provides details about what just completed, including which exchange was used, the name of the strategy that ran, and whether the execution was a backtest or live trading. You’ll find the trading symbol involved, such as "BTCUSDT," which is crucial for understanding the context of the finished process. Essentially, it's a notification package giving you the key facts about a completed trading activity.

## Interface CriticalErrorNotification

This notification signals a critical, unrecoverable error has occurred within the system, requiring immediate shutdown. It's a way for the framework to alert you to serious problems.

Each notification has a unique ID to help track down the issue. You'll also get a human-friendly message explaining what went wrong, and a detailed error object including a stack trace—essential for debugging.  Notably, the `backtest` flag will always be false with these notifications because they originate from the live trading context, not a simulation.

## Interface ColumnModel

This defines a blueprint for how data columns are structured and displayed, particularly when creating tables. Think of it as a way to tell the system exactly what information to pull from your data, how to label it, and how to make it look. 

Each column has a unique identifier (`key`), a user-friendly display name (`label`), and a function (`format`) that converts the underlying data into a readable string. Finally, the `isVisible` function lets you control whether a column is shown or hidden based on certain conditions. This gives you a great deal of control over how your data is presented.


## Interface ClosePendingCommitNotification

This notification lets you know when a signal is closed before a position is fully activated. It's helpful for understanding why a signal didn't lead to a trade, especially in backtesting or when using features like signal averaging (DCA). The notification includes a unique ID, timestamp, and whether it's from a backtest or live environment.

You'll find key details about the signal itself – the symbol it was for, the strategy that generated it, and the exchange it was executed on. The notification also provides a wealth of performance data related to that signal, including total profit and loss, peak profit, maximum drawdown, and entry/exit prices. This information can be valuable for analyzing strategy performance and identifying areas for improvement. 

Additional details like the total number of entries and partial closes, a note describing the signal's reason, and creation timestamp are included to give a comprehensive view of the closed signal.

## Interface ClosePendingCommit

This signal indicates a pending order has been closed. 

It provides details about the closure, including a user-defined identifier for the reason behind it. 

You'll also find information about the position’s total profit and loss (PNL), the highest profit reached, and the greatest drawdown experienced during its lifespan, all up to the point the signal was generated. These figures offer a complete picture of the position's performance.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been cancelled before it could be activated. It provides a wealth of information about the cancelled signal, including its unique identifier, the time of cancellation, and whether it originated from backtest or live trading mode. You'll find details about the trading pair involved, the name of the strategy that generated the signal, and the exchange where it was intended to be executed.

The notification also includes key performance indicators (KPIs) related to the intended trade, such as the planned number of entries and partial closes, original entry price, and projected P&L metrics including peak profit and maximum drawdown figures.  A user-provided reason for the cancellation can be attached as well. Finally, a timestamp indicates when the notification itself was created.  All of this information allows for a complete audit trail and understanding of why a scheduled signal was ultimately not executed.

## Interface CancelScheduledCommit

This interface describes a request to cancel a previously scheduled signal event. It's essentially telling the system to disregard a planned action.

You can provide a `cancelId` to help track why the cancellation occurred – this is helpful for debugging or auditing. 

Along with the cancellation request, you'll also find information about the position being canceled, including its total profit and loss (`pnl`), the highest profit it reached (`peakProfit`), and the largest loss it experienced (`maxDrawdown`). This data gives you context for understanding the impact of the cancellation.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events, which are points in a trading strategy where costs are recouped. 

It allows you to understand how frequently your strategy reaches breakeven points.

You'll find a list of individual breakeven events, each with its own specific details, and a simple count of how many such events have occurred. This helps monitor the strategy's progress towards profitability.

## Interface BreakevenEvent

This data structure holds all the important details whenever a trading signal hits its breakeven point. It's designed to give you a complete picture of what happened, making it easier to analyze and understand your trading performance.

You'll find information like the exact time of the event, the trading pair involved, the name of the strategy used, and the unique identifier of the signal that triggered the trade. It also includes details about the position taken, the current price at breakeven, and the original entry, take profit, and stop-loss prices.

For strategies employing dollar-cost averaging, you'll also see the number of entries and partial closes executed, along with the original entry price before averaging. There's also the current unrealized profit and loss (PNL) at the time, a human-readable note explaining the signal's logic, and timestamps for when the position became active and when the signal was initially created. A flag indicates whether the event occurred during a backtest or live trading.

## Interface BreakevenContract

This interface represents a breakeven event, which happens when a trading signal's stop-loss is moved back to the entry price. It's a key milestone showing risk reduction as a trade becomes more profitable.

Think of it as a confirmation that the trade has made enough profit to cover its initial costs.

The event includes details like the trading pair (symbol), the strategy that generated the signal, the exchange and frame where the trade is happening, the full signal data, the price at which breakeven was reached, and whether the event occurred during a backtest or live trading. The timestamp marks when breakeven occurred, whether that’s during live trading or based on a historical candle.  This information is used for reporting and allowing users to track strategy performance and safety.

## Interface BreakevenCommitNotification

This notification tells you when a breakeven point has been reached for a trade, essentially marking a point where the trade has recovered its initial investment. It provides a wealth of information about the trade, including a unique ID, the exact time it happened, and whether it occurred during backtesting or live trading.

You'll find details about the trading pair, the strategy that generated the signal, and the exchange it was executed on. The notification also includes specifics about the trade itself: the entry price, take profit and stop-loss levels (both original and adjusted), and the direction of the trade (long or short).

Beyond the basics, you get a comprehensive view of the trade's performance. This includes the total profit and loss (pnl), peak profit achieved, maximum drawdown, and key price points at those moments, all expressed in both absolute and percentage terms.  You'll also find information on how many entries were involved (useful for DCA strategies) and details about any partial closes that occurred. Finally, there’s a field for an optional note to explain the reason behind the signal.

## Interface BreakevenCommit

This `BreakevenCommit` represents a breakeven event within the trading framework. It holds information about why a position is reaching breakeven, providing a snapshot of its state at that precise moment.

The `action` property clearly identifies this event as a breakeven.

You'll find details about the current market price (`currentPrice`) and the overall profit and loss (`pnl`) associated with the trade, including any prior entries or partial adjustments. The `peakProfit` and `maxDrawdown` values show the position's best performance and largest loss.

The trade's direction (`position`), entry price (`priceOpen`), and original take profit and stop loss prices (`priceTakeProfit`, `originalPriceTakeProfit`, `priceStopLoss`, `originalPriceStopLoss`) are all included.  Since it's a breakeven event, the stop loss is set to the entry price.

Finally, timestamps (`scheduledAt` and `pendingAt`) indicate when the signal was created and when the position was activated.

## Interface BreakevenAvailableNotification

This notification signals a potentially positive development for your trading position – your stop-loss can now be moved to breakeven, meaning you're no longer at risk of losing more than what you initially invested. It provides a wealth of details about the trade, including a unique identifier, the exact time it happened, and whether it's from a backtest or live trading environment.

You'll find specifics like the trading pair (e.g., BTCUSDT), the strategy used, and the exchange it ran on, along with the signal’s unique ID and the current market price. The notification details the entry price and the position type (long or short), along with the take profit and stop-loss prices – both current and their original values before any adjustments.

It also includes information related to dollar-cost averaging (DCA), like the number of entries and partial closes, as well as performance metrics like total profit & loss (PNL), peak profit, and maximum drawdown.  You can see how the position has performed, the prices used for PNL calculation and a human-readable note if one exists. Finally, the notification includes timestamps for the signal’s creation, pending state, and the notification itself.

## Interface BacktestStatisticsModel

The BacktestStatisticsModel provides a detailed breakdown of your trading strategy's performance after a backtest. It collects a wide range of metrics, all presented as percentages, to give you a comprehensive view of how your strategy has performed.

You'll find a list of every trade made, along with details like price and profit/loss. The model also tallies the total number of trades, separates them into wins and losses, and calculates the win rate.

It goes beyond simple profit and loss, offering insights into the strategy's risk profile through metrics like standard deviation and Sharpe Ratio— helping you assess how much risk you’re taking for the returns you're getting. 

You can also look at metrics like Sortino Ratio and Calmar Ratio to further refine your understanding of risk-adjusted performance. Finally, details on peak and fall profit percentages offer additional context on potential volatility and drawdown. Keep in mind that any value flagged as "unsafe" is likely NaN or Infinity and should be treated with caution.

## Interface AverageBuyCommitNotification

This notification signals that a new portion has been added to an ongoing average-buy (DCA) trading strategy. It provides a wealth of detail about the trade, including a unique identifier, the exact time it happened, and whether it occurred during a backtest or live trading. You'll find information about the trading pair, the strategy used, and the exchange involved.

The notification also breaks down the specifics of this particular averaging entry – its price, cost, and how it affects the overall averaged entry price and total number of entries. It also includes details on partial closes, position direction (long or short), and the original trade parameters.

Furthermore, it provides a comprehensive financial picture of the entire position, including profit and loss (both in USD and percentage), peak profit, and maximum drawdown figures, along with the relevant prices and costs at those points. Lastly, there’s a field for a human-readable note explaining the reasoning behind the signal. Timestamps track the signal’s creation, scheduling, and when the position became active.

## Interface AverageBuyCommit

This event, called `AverageBuyCommit`, is triggered whenever a new buy or sell order is executed as part of a dollar-cost averaging (DCA) strategy for an existing position. It provides detailed information about the averaging action itself, including the price at which the trade occurred and the total cost of that specific entry.

You’ll find information about the current realized and unrealized profit/loss (PNL) for the entire position, as well as the highest profit ever achieved and the largest drawdown experienced. The event also keeps track of the original entry price, as well as any adjustments made to the take profit and stop-loss levels.

Essentially, `AverageBuyCommit` is a snapshot of the position’s state directly after a DCA order is filled, giving you a complete picture of its performance and risk profile. It incorporates timestamps for when the trade was scheduled and activated, helping you track the progression of the strategy.

## Interface ActivePingContract

This describes what happens when a pending signal is actively being monitored – essentially, a regular heartbeat to let you know it's still alive. Every minute while a signal is pending, this event is triggered, providing details about the trading pair, the strategy managing it, and the exchange involved.

You’ll get all the data related to that pending signal, including details like the open price and stop-loss levels. Importantly, it includes the current market price at the time of the ping, allowing you to build custom logic based on price movements.

Finally, it tells you whether this ping is from a backtest (historical data) or live trading, and you can use the timestamp to understand exactly when the ping occurred. You can listen for these events to build your own dynamic signal management.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, letting you know a trade is about to happen, or has happened, based on a pre-defined schedule. It provides a wealth of details about the trade, including a unique identifier, the exact time it was triggered, and whether it's part of a backtest or live trading.

You'll find information about the specific symbol being traded (like BTCUSDT), the strategy that generated the signal, and the exchange where the action takes place. Crucially, it tells you the intended trade direction – whether it's a long (buy) or short (sell) position, the planned entry price, and the take profit and stop-loss levels. 

The notification also breaks down details about DCA (Dollar-Cost Averaging), including the number of entries, partial closes, and how the PNL (profit and loss) has evolved – from initial investment to peak profit and maximum drawdown, including prices and percentages. You can trace back to the original signal creation timestamp, when the position was set to pending and the current market price at the activation. Finally, there's a field for optional notes to explain the reasoning behind the signal.

## Interface ActivateScheduledCommit

This data represents an action taken to activate a previously scheduled trading signal. It provides a snapshot of the position at the time of activation, including details like the current market price and the trade direction (long or short).

You'll find information on the position's performance, such as realized profit and loss (pnl), peak profit achieved, and maximum drawdown experienced. 

It also includes information about how the position was managed, covering entry price, take profit and stop loss levels, both as they currently exist and as they were initially set. 

Finally, the record captures the timestamps associated with signal scheduling and actual activation, helping you track the timing of these events.  An optional identifier allows you to track why the activation took place.
