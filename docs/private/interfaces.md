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

This interface defines the information shared when a walker is being stopped. 

Imagine you have multiple automated trading systems running at once; this tells you which specific system – including its name and the trading symbol it’s using – is being paused. 

It allows you to pinpoint exactly which walker and strategy are being halted. 

The details include the trading symbol, the name of the strategy, and the name of the walker itself, giving you a complete picture of the interruption.


## Interface WalkerStatisticsModel

The WalkerStatisticsModel helps organize and understand the results of backtesting different trading strategies. 

It builds upon the basic WalkerResults, adding information specifically for comparing how those strategies performed against each other.

Think of it as a container for all the results you get after running multiple strategies – it includes a list of individual strategy results that you can then analyze and contrast. This makes it easier to see which strategies did best and why.

## Interface WalkerContract

The WalkerContract represents updates as your backtesting strategies are being compared. Think of it as a notification that a particular strategy has finished running and its results are available.

Each notification includes details like the strategy's name, the exchange and symbol it was tested on, and key statistics about its performance.

You'll also get information on the metric being optimized (like Sharpe Ratio), the best performing strategy seen so far, and the progress of the overall testing process, indicating how many strategies have been evaluated and the total number that need to be tested. This data helps you track how different strategies stack up against each other throughout the backtest. 


## Interface WalkerCompleteContract

This object signals the completion of a backtesting process, indicating that all strategies have been evaluated and the results are ready. It bundles together a lot of important information about the backtest.

You’ll find details about which walker was run, the symbol being traded, the exchange and timeframe used for the test. 

It also includes the specific metric used to compare strategies, the total number of strategies tested, and the name of the strategy that performed best. 

Finally, it provides the actual best metric value achieved, along with detailed statistics for that top-performing strategy.

## Interface ValidationErrorNotification

This notification signals that a validation error occurred during the backtesting process. 

It's like a warning flag letting you know something went wrong with the rules or conditions you've set up to ensure your trading strategy is sound.

The notification includes a unique identifier, a detailed error message you can understand, and technical information (like a stack trace) within the `error` property to help pinpoint the problem. 

The `backtest` property will always be false because these errors arise from the live trading context, not the simulated environment.


## Interface ValidateArgs

This interface, ValidateArgs, acts as a central point for ensuring the names you use for things like exchanges, timeframes, strategies, risk profiles, actions, sizing methods, and parameter sweep configurations are all valid within your backtesting setup. Think of it as a way to double-check that your names are spelled correctly and that you’re referencing things that actually exist. 

Each property (ExchangeName, FrameName, StrategyName, etc.) represents a different category of component. 

For each of these categories, you'll provide an enum of allowed values. The system then uses this enum to confirm that the names you're using are legitimate and recognized. It's a way to prevent errors caused by typos or referencing non-existent components.


## Interface TrailingTakeCommitNotification

This notification lets you know when a trailing take profit order has been executed. It’s essentially a confirmation that your trailing stop has triggered and the position has been closed. 

The notification includes a unique identifier (`id`) and timestamp (`timestamp`) for tracking purposes, along with whether it happened during a backtest or live trading (`backtest`). It specifies the trading pair (`symbol`), the strategy involved (`strategyName`), and the exchange used (`exchangeName`).

You’ll find details about the trade itself, including the original and adjusted take profit and stop-loss prices, entry price (`priceOpen`), and the trade direction (`position`). It also provides information on DCA averaging if used (`totalEntries`, `totalPartials`), and a comprehensive breakdown of the trade’s profitability (`pnl`, `peakProfit`, `maxDrawdown`). 

Finally, several timestamps show the signal’s lifecycle (`scheduledAt`, `pendingAt`, `createdAt`) and a human-readable note may provide context.

## Interface TrailingTakeCommit

This object represents a trading event triggered when a trailing take profit is activated. It contains detailed information about the trade and the trailing take adjustment that occurred. 

You’ll find the action type is specifically "trailing-take," confirming the event's nature. Key to understanding the adjustment is `percentShift`, which indicates how much the take profit was moved. 

The `currentPrice` shows the market price when the trailing adjustment happened. The report includes performance data like `pnl` (profit and loss), `peakProfit`, and `maxDrawdown` for the entire position’s history.

Other useful fields describe the trade’s direction (`position`), entry price (`priceOpen`), and the new take profit price (`priceTakeProfit`) – along with the original, unchanged take profit (`originalPriceTakeProfit`). Similarly, you have access to stop-loss prices both adjusted (`priceStopLoss`) and original (`originalPriceStopLoss`). Timestamps (`scheduledAt` and `pendingAt`) pinpoint when the signal was created and when the position started.

## Interface TrailingStopCommitNotification

This notification tells you when a trailing stop order has been triggered and executed. It provides a detailed breakdown of what happened, including whether it was part of a backtest or a live trade. You’ll find key information like the trading symbol, strategy name, and the exact price at which the stop was hit.

The notification also offers comprehensive performance data, such as the position's profit and loss (both in USD and as a percentage), peak profit achieved, and maximum drawdown experienced. You can see how the take profit and stop loss prices have changed with the trailing mechanism. 

It breaks down the details of the trade, including the entry price, number of entries, partial closes, and the prices used for profit/loss calculations. Essentially, it's a complete report on the trailing stop event and the position's overall performance.

## Interface TrailingStopCommit

This describes a trailing stop event, which happens when a trading strategy adjusts a stop-loss order based on the price movement. The `action` property simply confirms that this is a trailing stop event. 

The `percentShift` indicates how much the stop-loss is adjusted as a percentage.

The `currentPrice` is the market price when the trailing stop adjustment occurred.

You’ll also find information about the position’s performance, like the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the biggest drawdown experienced (`maxDrawdown`).

The `position` property clarifies whether the trade is a long (buy) or short (sell) position.

Several price-related details are provided, including the initial entry price (`priceOpen`), the current take-profit and stop-loss prices (`priceTakeProfit`, `priceStopLoss`), and the original values before any trailing adjustments (`originalPriceTakeProfit`, `originalPriceStopLoss`).

Finally, timestamps (`scheduledAt`, `pendingAt`) record when the signal was created and when the position became active, respectively.

## Interface TickEvent

This describes the `TickEvent` object, which is a standardized way to represent all the different kinds of events that happen during trading. Think of it as a single container holding all the information you need to understand what just occurred, whether it's a trade being opened, closed, scheduled, or canceled. 

The `timestamp` tells you precisely when the event happened.  The `action` property defines the type of event—like `closed`, `opened`, or `scheduled`.

Many properties are specific to certain action types. For instance, if you’re looking at a `closed` event, you’ll find details about the `closeReason` and `duration`.  If it's a `scheduled` event, you'll see the `scheduledAt` timestamp.

You'll also find price-related information like `currentPrice`, `priceTakeProfit`, and `priceStopLoss`.  The object also keeps track of details related to averaging strategies, like `totalEntries` and `totalPartials`, and provides metrics on profit and loss, including unrealized and realized PNL percentages and peak/fall PNL. It provides many different data points to analyze trading performance.

## Interface SyncStatisticsModel

This model holds information about how signals are synced within your backtesting environment. Think of it as a report card on the signal synchronization process. 

It includes a complete list of all synchronization events that occurred, along with their details.

You’ll also find the total number of sync events, and specifically, how many times signals were opened and closed. This helps you understand the frequency and lifecycle of signal updates during your backtests.

## Interface SyncEvent

This data structure, called `SyncEvent`, collects all the key details about significant events during a trading signal’s lifecycle. Think of it as a comprehensive record of what happened during a trade, designed to create easy-to-understand reports. It includes information like the exact time of the event, the trading symbol involved, the strategy and exchange used, and a unique ID for the signal.

You'll find details about the trade itself, such as whether it was a long (buy) or short (sell) position, the entry price, and the take profit and stop-loss prices – both the original values and any adjusted ones. It also tracks information for strategies using dollar-cost averaging (DCA) like the total number of entries and partial closes. 

For closed trades, the `SyncEvent` explains why the signal was closed.  Plus, you can see performance metrics like peak profit and maximum drawdown, along with the overall profit and loss (PNL). There’s also an indication if the event is part of a backtest and a timestamp indicating when the event was recorded.

## Interface StrategyStatisticsModel

This model holds all the key statistics gathered during a backtest run related to your trading strategy. It gives you a detailed breakdown of the events your strategy triggered.

You’ll find a complete list of all strategy events with their specifics in the `eventList`. 

The `totalEvents` property simply tells you how many events occurred in total.

Individual counters track the occurrences of specific actions, such as canceling scheduled orders (`cancelScheduledCount`), closing pending orders (`closePendingCount`), taking partial profits (`partialProfitCount`), and managing losses (`partialLossCount`). 

It also breaks down how often your strategy used trailing stops (`trailingStopCount`), took trailing profits (`trailingTakeCount`), set breakeven points (`breakevenCount`), activated scheduled actions (`activateScheduledCount`), and executed average buy (dollar-cost averaging) orders (`averageBuyCount`).


## Interface StrategyEvent

This data structure holds all the key information about events happening within a trading strategy, like when a trade is opened, closed, or adjusted. It’s designed to make generating reports easy to understand, whether you’re reviewing past backtests or monitoring live trading. Each event includes details like the exact timestamp, the trading pair involved, and the strategy’s name.

You’ll find specifics about the trade itself: the signal that triggered it, the price at which the action occurred, and how much of the position is being adjusted. If you’re using trailing stops or take profits, the effective prices are also recorded, along with the original prices before any adjustments.

For strategies employing dollar-cost averaging (DCA), it tracks the cumulative entries and total partial closes. It also includes important financial information like the profit and loss (PNL) at the time of the action, as well as the total cost if it’s a DCA entry. Finally, there’s a space for an optional note to provide extra context to the event.

## Interface SignalSyncOpenNotification

This notification tells you when a scheduled trading signal has been activated and a position has been opened. It's like a confirmation that your automated trading strategy has taken action. The notification includes a unique ID, the time it happened, and whether it occurred during a backtest or live trading.

You'll find details about the trade, like the symbol being traded, the strategy that triggered it, the exchange used, and the entry price. It also provides a wealth of performance data for the position, including total profit/loss, peak profit achieved, maximum drawdown, and the prices associated with those events.

Beyond just the raw numbers, the notification also breaks down the cost of the trade, the trade direction (long or short), and details about any take profit or stop loss orders. You can track how many entries or partial exits were involved, and get a timestamp of when the signal was originally created and when the position actually started. Finally, there's a field for any notes you or the strategy might have added to explain the reasoning behind the signal.

## Interface SignalSyncCloseNotification

This notification tells you when a signal has been closed, whether it was due to a take profit or stop loss being hit, time expiring, or a manual closure. It provides a lot of detail about the closed position, including when it was created, the trading pair involved, and the strategy that generated the signal. You'll find key financial metrics like profit and loss (both absolute and percentage), peak profit, and maximum drawdown, along with the prices at which those levels were achieved. The notification also breaks down the specifics of the trade, such as entry and exit prices, take profit and stop loss levels, and even details about any averaging or partial closes.  Finally, it includes a reason why the signal was closed and a timestamp indicating when the notification itself was generated.

## Interface SignalSyncBase

This interface defines the common foundation for how signal events are structured within the backtest-kit framework. Every signal-related event will have these core properties.

You'll find details like the trading symbol ("BTCUSDT"), the name of the strategy generating the signal, and the exchange it's being executed on. 

It also specifies whether the signal originates from a backtest or live trading environment, along with a unique identifier and timestamp to pinpoint exactly when it occurred.

Finally, the complete public signal data itself is included, providing all the information available at the time the signal was generated.

## Interface SignalScheduledNotification

This notification tells you when a trading signal is set to be executed in the future. It's like a heads-up that a trade is going to happen, whether it’s during a test run or in real-time trading.

Each notification has a unique identifier, a timestamp showing when the signal was scheduled, and whether it's part of a backtest or a live trade. You’ll also find details like the trading pair (e.g., BTCUSDT), the strategy that generated the signal, the exchange it’s targeting, and the trade direction (long or short).

Beyond the basics, it provides crucial information about the trade itself, including the entry price, take profit and stop-loss levels, and details about any DCA averaging or partial closes that might have been applied.  It also offers a wealth of performance data related to the position, such as peak profit, maximum drawdown, profit/loss figures, and more, giving you a complete picture of the potential outcome. Finally, it includes a timestamp indicating when the notification was created and a current price at the scheduling moment, as well as an optional note to explain the signal’s reasoning.

## Interface SignalOpenedNotification

This notification signals the opening of a new trading position. It provides a wealth of information about the trade, including a unique identifier and timestamp to track its lifecycle. You'll find details like whether the trade occurred during a backtest or live execution, the symbol being traded, and the strategy responsible for the signal.

The notification also breaks down the specifics of the position itself, such as the trade direction (long or short), entry and exit prices (take profit and stop loss), and how DCA averaging might have impacted the entry price.  You'll also see metrics that help analyze performance – peak profit, maximum drawdown, and associated prices and costs. 

Further details give insight into the position’s history like the original prices before any adjustments, the number of entries and partial closes, and an optional note explaining the trade’s reasoning. Timestamps indicate when the signal was scheduled, when the position became pending, and when the notification was created. Essentially, it’s a comprehensive record of a trading signal’s inception and initial setup.

## Interface SignalOpenContract

This event, `SignalOpenContract`, signifies that a pre-planned trade has begun. Think of it as confirmation that your limit order has been filled on the exchange. It’s particularly useful for synchronizing your trading framework with external systems, like order management tools or audit logs.

The event provides a wealth of information about the trade, including the exact price at which the order was filled (`priceOpen`), the current market price (`currentPrice`), and key performance metrics like profit and loss (`pnl`), peak profit, and maximum drawdown. It also details the original and adjusted take profit and stop-loss prices, the initial entry price, and timestamps for when the signal was scheduled and when the position was activated.

Furthermore, it breaks down the complexity of any averaging strategies employed, showing you the number of initial entries and any partial closures that occurred. This allows you to precisely track how a trade unfolded from its inception, making it invaluable for performance analysis and reconciliation.

## Interface SignalInfoNotification

This notification type lets you receive informational messages from your trading strategies – think of it as a way for your strategy to "speak" to you about its actions. It’s particularly useful for strategies that want to provide extra context around their decisions, like explaining why a position was opened or what adjustments were made.

Each notification includes details like when it happened, which strategy generated it, and the specifics of the trade, such as the symbol, position direction (long or short), entry and stop-loss/take-profit prices, and the current market price. You'll also find comprehensive performance metrics for the trade, including profit/loss, peak profit, maximum drawdown, and various pricing details adjusted for slippage and fees.

Additionally, it gives you a snapshot of how many DCA entries and partial closes were involved, offering a more granular view of the trading process. The notification also contains information on when the signal was first created and when the position became pending or active. A custom note field allows your strategy to communicate its reasoning directly to you. Finally, there's a user-defined identifier to help you link notifications with external tracking or reporting systems.

## Interface SignalInfoContract

This component lets your strategies send out custom messages related to trading activity. Think of it as a way to broadcast information about what's happening with a specific trade.

When a strategy needs to share details—maybe for debugging, logging, or sending notifications elsewhere—it uses this mechanism. 

The messages contain lots of useful information, like the trading pair (e.g., BTCUSDT), the name of the strategy generating the signal, the exchange it's happening on, and the price at that moment. It also includes the full data row associated with the signal and a custom note you can provide to explain the message. You'll also see an identifier to link the message with external systems and a flag to tell if the activity happened during a backtest or live trade.  Finally, the timestamp indicates when the event occurred – either the exact moment in live trading or the time of the candle in backtest mode.


## Interface SignalData$1

This data structure holds the details of a completed trade, providing a snapshot of its performance. Each piece of data represents a single signal that has been closed. 

It includes information like which strategy created the signal, a unique identifier for that signal, and the trading symbol involved. 

You’ll also find details about the trade's direction (long or short), its profit and loss expressed as a percentage, and why the trade was closed. 

Finally, timestamps record when the trade was initiated and when it concluded, allowing for precise tracking of its lifespan.

## Interface SignalCommitBase

This defines the common information you'll find in events related to signals generated by your trading strategies. Every signal commit—essentially a record of a signal's action—will include details like the trading pair's symbol (e.g., BTCUSDT), the name of the strategy that created it, and the exchange it's being executed on. You'll also find information about whether the signal is from a backtest or live trading environment, a unique ID for the signal, and the precise timestamp of its action.

It also provides data regarding the DCA (Dollar-Cost Averaging) entries and partial closes that have occurred, so you can understand the progression of the trade.  The 'originalPriceOpen' field captures the initial entry price, unaffected by any subsequent averaging. A snapshot of the detailed signal data itself is also included along with an optional note to explain the reasoning behind the signal.

## Interface SignalClosedNotification

This notification lets you know when a trading position has been closed, whether it's due to a take profit or stop-loss trigger, or another reason. It provides a lot of detail about the closed trade, including when it happened, which strategy and exchange were involved, and what the entry and exit prices were. You'll find information about the original take profit and stop-loss levels, as well as details on any DCA averaging that occurred.

The notification also includes key performance metrics like profit/loss (both as a percentage and in USD), peak profit, and maximum drawdown, helping you analyze the trade's performance.  You can see how long the position was held, and a free-text note can provide additional context. The `scheduledAt` and `pendingAt` timestamps give a complete picture of the signal's lifecycle.  Finally, the `createdAt` timestamp indicates when the tick result was created, which is useful in backtesting or live trading scenarios.

## Interface SignalCloseContract

This event lets you know when a trading signal has been closed, whether it was because of a profit target, a stop-loss, time expiration, or manual intervention. It's designed to help external systems, like order management or accounting tools, stay in sync with the trading activity.

You'll receive details about the closing price, the overall profit and loss (including all entries and adjustments), the highest profit achieved and the largest drawdown during the trade's lifetime. 

The event also provides information about the original entry and exit prices, the dates and times of signal creation and activation, and the reason for the closure. It includes details about any averaging that occurred (how many entries or partial closes were involved) so you can track the trade’s history accurately.

## Interface SignalCancelledNotification

This notification type tells you when a previously scheduled trading signal was cancelled before it could be activated. It provides a wealth of details about the signal, including its unique identifier, the strategy that created it, and the exchange it was intended for. You’ll find information about the planned trade direction (long or short), take profit and stop loss prices, and the original entry price – all crucial for understanding the context of the cancellation.

The notification also includes the reason for the cancellation, such as a timeout or a user-initiated cancel. Details like the signal's creation timestamp, pending time, and duration help you analyze the timing of events leading up to the cancellation. Lastly, it contains details about DCA averages (total entries and partials), as well as a note providing additional context regarding the signal.

## Interface Signal

The `Signal` object tracks the details of an individual trade within a backtest. 

It holds the initial entry price, represented by `priceOpen`. 

You’ll also find a record of all entry events for the trade within the `_entry` array; each entry includes the price, cost, and timestamp.

Finally, `_partial` keeps track of any partial exits from the position, storing details such as the type of exit (profit or loss), percentage, price, cost basis, entry count, and the time of the event.


## Interface Signal$2

This section describes the `Signal$2` object, which represents a trading signal within the backtest-kit framework. 

It tracks the initial entry price of a position, providing the price at which the trade was initiated.

The `_entry` property maintains a history of entry events, recording the price, cost, and timestamp for each.

Finally, `_partial` stores information about any partial exits, including the type (profit or loss), percentage, current price, cost basis at the time of exit, number of shares/contracts exited, and the timestamp.

## Interface Signal$1

The `Signal` object represents a single trading signal, tracking key data points related to an order. It holds the `priceOpen`, which is simply the price at which the position was initially entered. 

Internally, it maintains a record of `_entry` events, noting the price, cost, and timestamp for each entry made.

Similarly, it stores information about partial exits with `_partial`, detailing the type (profit or loss), percentage, current price, cost basis, number of shares closed, and timestamp for each partial exit. This allows you to understand the complete lifecycle of a trade.

## Interface ScheduledEvent

This data structure represents a single event related to a trading signal, whether it was scheduled, opened, or cancelled. It combines all the important details about the event into one place, making it easier to create reports and analyze trading activity.

You'll find information like when the event happened (timestamp), what type of event it was (opened, scheduled, or cancelled), the trading pair involved (symbol), and a unique ID for the signal (signalId). 

It also includes details about the trade itself, such as the position type, note, current price, entry price, take profit levels, and stop loss levels, along with their original values before any modifications.

For signals using a DCA (Dollar Cost Averaging) strategy, you'll also see information about the total number of entries and partial closes. Further information like unrealized profit and loss (pnl), duration of the trade, and reasons for cancellations (if applicable) are included as well. Finally, there are timestamps for when the position became active or was scheduled, helping to track the entire lifecycle of a trading signal.

## Interface ScheduleStatisticsModel

This model helps you understand how your scheduled signals are performing over time. It provides a collection of key statistics related to signal scheduling, activation, and cancellation.

You'll find a complete list of all scheduled events, including their details. 

Beyond that, it aggregates data to show you the total number of signals scheduled, those that were activated, and those that were cancelled.

It also calculates important rates like the cancellation rate (how often signals are cancelled) and the activation rate (how often scheduled signals become active). A lower cancellation rate is generally preferable.

Finally, the model provides average waiting times – the average duration signals waited before being cancelled or activated, offering insights into potential delays or inefficiencies.

## Interface SchedulePingContract

This interface represents the data you receive when the backtest-kit framework sends out a periodic "ping" related to a scheduled signal. Think of it as a heartbeat indicating the signal is actively being monitored.

It's particularly useful when a signal is in a state where it’s active but not yet completed.

The ping includes information like the trading symbol, the strategy name, and the exchange involved. You’ll also find details about the timeframe being used (empty during live trading), the full signal data, the current price, whether it's a backtest or live execution, and the timestamp of the ping.

This allows you to build custom logic to monitor the signal’s lifecycle, maybe automatically canceling it under certain price conditions, for example.  You can subscribe to these pings to receive them continuously or just for a single occurrence.


## Interface RiskStatisticsModel

This model holds information about risk events, specifically the rejections that occurred during your backtesting or live trading.

It gives you a breakdown of how often risk rejections are happening.

You’ll find a complete list of individual risk rejection events, along with the total number of rejections.

The `bySymbol` property shows you how many rejections occurred for each trading symbol.

Finally, `byStrategy` shows you a count of rejections attributed to each trading strategy. This helps you identify potential issues with specific strategies or symbols.


## Interface RiskRejectionNotification

This notification informs you when a trading signal has been blocked by your risk management rules. It's triggered when the framework prevents a trade from happening.

Each notification includes a unique ID, the time it occurred, and whether it happened during a backtest or live trading. You’ll also find details about the strategy that tried to create the signal, the exchange involved, and a clear explanation of why the signal was rejected.

You'll get information on the trading symbol, the number of active positions at the time, and the current market price. If a signal identifier was associated with the rejected trade, that's included too. 

The notification provides details about the intended trade direction (long or short), planned take profit and stop loss prices, and the expected duration of the trade. There's also a field for any notes related to the signal itself, and a timestamp indicating when the notification was generated.

## Interface RiskEvent

The `RiskEvent` object holds information about signals that were blocked due to risk management rules. 

Think of it as a detailed record whenever a trading signal is rejected because it would have violated a risk limit.

Each `RiskEvent` includes things like the timestamp, the trading pair involved, the details of the rejected signal, the name of the strategy that generated it, and even the current market price at the time. 

It also specifies the exchange and timeframe, and importantly, provides a unique ID and a note explaining *why* the signal was rejected. 

Finally, it identifies if the event occurred during a backtest or in live trading.

## Interface RiskContract

This object describes a situation where a trading signal was blocked because it violated pre-defined risk limits. It's designed to help you monitor and understand when and why your trading strategies are being prevented from taking action.

Each time a signal is rejected, this information is created and includes details like the trading pair (symbol), the signal itself (including order details), the name of the strategy that tried to execute it, and the timeframe used. You'll also find the current market price, how many positions were already open, and a unique ID to help track the specific rejection.

A human-readable explanation of *why* the signal was rejected is also provided. Finally, a timestamp and a flag indicate when the event occurred and whether it happened during a backtest or live trading. This allows for targeted analysis of risk management performance.

## Interface ProgressWalkerContract

The `ProgressWalkerContract` helps you monitor the progress of long-running backtest processes. 

It's used when a `Walker` is running in the background, providing updates on how far along it is. 

You'll receive these updates with details like the walker's name, the exchange being used, and the frame it's operating within.

Each update includes the total number of strategies being evaluated, how many have already been processed, and a percentage representing the overall completion status (from 0% to 100%). This allows you to track the status of your backtest and get a sense of how much longer it will take.

## Interface ProgressBacktestContract

This interface provides updates on the backtest's progress as it runs. You'll receive these updates during a background backtest execution, giving you insight into how far along the process is. Each update includes details like the exchange and strategy being used, the trading symbol involved, the total number of data points (frames) the backtest will analyze, and how many have already been processed. Finally, it presents a percentage indicating how close the backtest is to completion.

## Interface PerformanceStatisticsModel

This model holds performance statistics collected from a trading strategy. It allows you to understand how a strategy performed over time. 

You’ll find the strategy’s name clearly labeled, along with the total number of performance events that were tracked. It also includes the overall execution time for the strategy.

The `metricStats` property breaks down the performance data further, organizing it by different metric types. Finally, the `events` array provides access to the complete, raw data of each individual performance event that occurred.

## Interface PerformanceContract

This interface, `PerformanceContract`, is all about keeping track of how long different parts of your trading system take to run. It's like a detailed log, recording things like how long it takes to execute a strategy, connect to an exchange, or process a frame of data. Each entry includes the exact time the event happened, the time of the event before it, the type of operation being measured, how long it took (in milliseconds), and which strategy, exchange, and trading symbol it relates to. 

A `frameName` helps identify the specific point in time within a backtest, and it's left blank when running live. Finally, a flag tells you whether the metric originated from a backtest or a live trading session. Use this data to spot areas where your system is slow or inefficient.

## Interface PartialStatisticsModel

This model holds statistical information about partial profit and loss events during a trading backtest. It’s designed to give you a breakdown of how often profits and losses occurred.

You'll find a detailed list of all individual events, complete with their information, in the `eventList` property.  The `totalEvents` property simply tells you the total count of all profit and loss events recorded.  `totalProfit` and `totalLoss` provide clear numbers representing the number of times a profit or loss event occurred, respectively. These numbers help you analyze the distribution of outcomes in your backtest.

## Interface PartialProfitContract

The `PartialProfitContract` represents a signal reaching a profit milestone during trading. It’s used to track and monitor how a trading strategy performs as it achieves partial take-profit goals.

Think of it as a notification saying, "Hey, this trade has hit 20% profit!"

Key information included is the symbol being traded (like BTCUSDT), the strategy responsible for the signal, the exchange and frame involved (helpful for understanding the trading context), and the current price at which that profit level was reached.  You'll also find the original signal data, the specific profit level achieved (10%, 30%, etc.), and whether this is a backtest or a live trading event. A timestamp pinpoints exactly when this profit milestone occurred.

These events are essential for services like report generation and providing real-time updates to users who want to monitor their strategy's progress. The system avoids sending duplicate profit notifications even if price jumps significantly.

## Interface PartialProfitCommitNotification

This notification lets you know when a partial profit commitment has been executed within a trading strategy, whether it's a backtest or live trade. It provides a wealth of information about the trade, including a unique ID, the timestamp of the event, and whether it occurred during a backtest. You'll see details like the trading pair, the strategy name, and the exchange used.

It also includes key pricing information like the entry price, take profit, and stop-loss levels, both original and adjusted for trailing.  The notification breaks down the position details, like whether it was a long or short trade, and gives you a complete picture of the position's performance, including profit and loss, peak profit, and maximum drawdown – all with associated prices and costs.

You’ll find data related to DCA averaging, like the total number of entries and partials, and even a note field for any additional context about why the partial profit was taken. The notification tracks the signal's journey from creation to execution, noting scheduling and pending times, and provides a detailed snapshot of the trade’s lifecycle.

## Interface PartialProfitCommit

This describes a partial profit event that occurs during a trading strategy's backtest. It tells you that a portion of a position has been closed, and provides details about the trade. You'll see the action type clearly identified as "partial-profit." 

The `percentToClose` property specifies exactly what percentage of the original position size was closed off.  Crucially, you’ll find the current market price (`currentPrice`) at the moment the partial profit was triggered. 

The event also includes historical performance data for that position, such as the total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest drawdown experienced (`maxDrawdown`).  Knowing the original and adjusted take profit and stop loss prices (`priceTakeProfit`, `originalPriceTakeProfit`, `priceStopLoss`, `originalPriceStopLoss`) gives a complete picture of the risk management employed. Finally, the `position` type, entry price (`priceOpen`), and timestamps (`scheduledAt`, `pendingAt`) provide context and allow you to pinpoint this event within the larger trading timeline.

## Interface PartialProfitAvailableNotification

This notification alerts you when your trading strategy hits a profit milestone, like reaching 10%, 20%, or another defined level. It's a way to track progress during backtesting or live trading. The notification includes details like a unique ID, when the milestone was hit, whether it's a backtest or live trade, and the trading pair involved.

You'll also find information about the strategy and exchange that triggered the signal, along with the original entry price, trade direction (long or short), and the take profit and stop loss prices at the time. It provides the original prices before any adjustments from trailing stops and details about any DCA averaging used.

The notification offers a comprehensive view of the position’s performance, including total profit and loss (P&L), peak profit achieved, and maximum drawdown experienced. It breaks down the P&L into different components like costs, invested capital, and percentages.  You'll also see key prices and timestamps related to the position’s lifecycle and performance metrics.  Finally, there's a place for a descriptive note to explain the reason for the signal.

## Interface PartialLossContract

The `PartialLossContract` is a notification that a trading strategy has hit a predefined loss level, such as a 10%, 20%, or 30% drawdown. It's a way to keep track of how much a strategy has lost during its operation.

This notification is sent whenever a signal crosses a loss threshold and includes a lot of helpful information.

You'll find details like the trading symbol, the strategy's name, the exchange and frame used, all the original data associated with the signal, the current price, and the specific loss level that was triggered.  The `backtest` flag tells you whether this event happened during a historical simulation or live trading.  It also contains a timestamp indicating when the event occurred.

This data is used by services to create reports and allows users to monitor strategy performance by reacting to these loss level events. These events are designed to be sent only once for each loss level and signal, even if prices move rapidly.

## Interface PartialLossCommitNotification

This notification tells you when a partial position closure has happened, like when you're selling off a bit of your holdings. It provides a ton of detail about what triggered the sale, when it occurred, and important information about the trade’s history. You'll find things like the unique ID of the notification, the exact time it happened, whether it was a backtest or live trade, and the trading pair involved.

The notification also dives deep into the position’s performance: you can see the entry and take profit/stop-loss prices, original prices, the total number of entries and partial closes, and crucial P&L metrics like peak profit, maximum drawdown, and overall percentage gain or loss. It even tracks prices and costs associated with peak profit and maximum drawdown events.  Finally, there’s an optional note field for adding a human-readable explanation of why the partial closure occurred, along with timestamps for when the signal was created, went pending, and this notification itself was generated.

## Interface PartialLossCommit

This data represents a partial loss event within a trading strategy. It essentially details a situation where a portion of an existing position is being closed. 

The `action` property confirms this is indeed a partial loss. 

You'll find the `percentToClose` indicates what percentage of the position is being reduced, and `currentPrice` reflects the market price at that time. 

The `pnl`, `peakProfit`, and `maxDrawdown` properties offer insights into the performance of the position leading up to this action, showing total profit/loss, the highest profit reached, and the largest loss experienced. 

Information about the position itself, such as `position` (long or short), `priceOpen`, `priceTakeProfit`, `priceStopLoss`, and their original values before any adjustments are all included. Finally, `scheduledAt` and `pendingAt` give timestamps related to when the signal was generated and when the position was initially activated.


## Interface PartialLossAvailableNotification

This notification signals that a trading strategy has reached a predefined loss milestone, like a 10% or 20% drawdown. It’s essentially a heads-up that the position isn't performing as initially expected.

The notification includes a unique ID, the exact time it occurred, and whether it happened during a backtest or live trading. You'll also find details like the trading pair involved (e.g., BTCUSDT), the strategy's name, and the exchange used.

It provides a wealth of information about the trade itself – entry price, take profit and stop loss levels (both original and adjusted), and details about any averaging (DCA) or partial closures. You can see the total number of entries and partials involved, and comprehensive P&L data including peak profit, maximum drawdown, and associated prices and percentages.

Additional fields clarify the signal's creation and pending times and a note might explain the reasoning behind the signal. It's a comprehensive report on the position's performance up to the point of the loss milestone.

## Interface PartialEvent

This data structure holds all the important details about when your trading strategy hits profit or loss milestones during a backtest or live trade. It bundles information like the exact time of the event, whether it's a profit or a loss, and the trading pair involved. You'll also find details about the strategy used, the signal that triggered the trade, and specifics about the position itself – its current price, entry price, take profit levels, and stop-loss orders.

For strategies using dollar-cost averaging (DCA), it includes information about the total number of entries and the original open price before averaging. Partial closes are also tracked, showing the number of partials executed and the total percentage executed. The unrealized profit and loss (PNL) at that specific moment is included, along with a human-readable note explaining the reason behind the signal. Finally, timestamps for when the position became active and when the signal was initially created are provided, as well as an indicator if the trade is part of a backtest.

## Interface MetricStats

This object holds a collection of statistics related to a particular type of performance measurement. Think of it as a summary of how often something happened, how long it took, and how those times varied.

It includes the type of metric being tracked, the total number of times it was recorded, and details about the duration of each occurrence. You'll find the average, minimum, and maximum durations, along with measures of how spread out the durations are – like standard deviation and percentiles (p95 and p99). 

It also tracks wait times, providing insights into the gaps between events. This lets you understand not just how long individual events take, but also the overall rhythm of the system.

## Interface MessageModel

This framework defines a `MessageModel` to represent a single message within a conversational history, whether it's from the system providing instructions, a user's input, the assistant's response, or even the results of a tool being used. Each message has a `role` indicating who sent it, and `content` containing the actual text of the message. Some providers provide detailed reasoning, captured in the `reasoning_content` property.

Assistant messages can also include `tool_calls` if the assistant used a tool to generate the response, and may also have attached `images` in various formats, like base64 strings or binary data. Finally, when a message is a response to a tool call, it will have a `tool_call_id` to link it back to the original tool request.

## Interface MaxDrawdownStatisticsModel

This model holds information about maximum drawdown events that have occurred during a trading simulation. 

It essentially provides a detailed record of how much capital was lost from peak to trough.

The `eventList` property contains an array of `MaxDrawdownEvent` objects, each representing a specific drawdown instance, and is ordered with the most recent event appearing first.

You can also find the total count of drawdown events recorded in the `totalEvents` property.

## Interface MaxDrawdownEvent

This describes a single instance of a maximum drawdown experienced during a trading position. Each event contains details like the exact time it occurred, the trading symbol involved, and the name of the strategy or signal that generated the trade.

You’ll find information about whether the position was a long or short trade, as well as the overall profit and loss (PNL) for the position. It also records the highest profit achieved, the maximum drawdown amount, and the price at which the drawdown occurred.

Additionally, the event includes the entry price, take profit price, and stop-loss price set for the trade, along with a flag indicating whether this event happened during a backtest. It provides a comprehensive snapshot of a drawdown event’s key data points.

## Interface MaxDrawdownContract

This contract describes the information provided when a new maximum drawdown is detected in a trading position. It includes details like the trading symbol, the current price, and the exact time of the update.

You’ll also find information about the strategy, exchange, and timeframe involved, along with the specific signal that triggered the position. 

A key piece of information is whether the drawdown event occurred during a backtest or in live trading. 

This data is useful for monitoring risk, adjusting strategies in response to losses, and managing how positions perform. The framework sends these updates whenever a new drawdown level is reached, so you can react to changes in the market and position performance.

## Interface LiveStatisticsModel

This model provides a comprehensive snapshot of your trading performance by tracking a wide range of statistics from live trades. It gathers data from every event—idle, open, active, and closed—to calculate metrics that reveal your strategy's strengths and weaknesses.

You'll find details like the total number of trades, the number of wins and losses, and key profitability indicators such as average profit per trade, total profit, and win rate.  

Beyond simple profit, the model includes measures of risk, like standard deviation and the Sharpe Ratio, to assess your risk-adjusted returns.  You can also examine metrics like the expectancy and recovery factor to evaluate the expected profit per trade and potential recovery from losses.

The model also dives into trade durations, identifying average win and loss durations, and explores price movement patterns through buyer/seller pressure and trend analysis. It helps you understand not just *if* you're making money, but *how* and *why*. Remember that many of these values can be null, signifying that calculations are not reliable due to data issues.

## Interface InfoErrorNotification

This notification is a way for the backtest-kit framework to let you know about issues it encounters while running, but issues that aren't necessarily stopping the whole backtest process. 

Think of it as a heads-up about something that needs attention, like a problem with data or a minor configuration issue.

Each notification has a unique ID, a helpful error message, and details about the underlying error, including a stack trace to help pinpoint the source. You'll also find a flag confirming the notification originates from a live context, not the backtest itself. These notifications aren't critical enough to halt the backtest, but they’re important to review and address.


## Interface IdlePingContract

The `IdlePingContract` represents events that occur when a trading strategy isn't actively responding to any signals. Think of it as a heartbeat indicating the strategy is in a passive or "idle" state.

These events are generated when there's no pending or scheduled signal being monitored.

The contract contains information about the trading pair, the name of the strategy in idle mode, the exchange it's running on, and whether it’s a backtest or live trading event.  It also includes the current market price and a timestamp indicating when the event occurred, with the timing differing slightly between backtest (candle timestamp) and live trading (real-time).

You can subscribe to these idle ping events using functions like `listenIdlePing` or `listenIdlePingOnce` to track and react to periods of inactivity in your trading strategies.

## Interface IWarmCandlesParams

This object defines the information needed to fetch and store historical candle data. It’s used to prepare your data before running a backtest, ensuring the backtest has access to the necessary historical price information.

You'll specify the trading pair’s symbol, like "BTCUSDT," along with the name of the exchange providing the data.  You also tell it the timeframe for the candles, such as a 1-minute or 4-hour interval. 

Finally, it lets you specify the start and end dates for the data you want to pre-cache.

## Interface IWalkerStrategyResult

This interface describes the result you get back when running a strategy within a backtest comparison. It holds essential information about the strategy itself, like its name. 

You'll also find detailed statistics about the strategy's performance, calculated during the backtest.

Crucially, it includes a metric value—think of it as a score—that's used to compare the strategy against others. Finally, a rank is assigned, clearly showing where the strategy stands in the overall comparison, with the highest rank being the best.

## Interface IWalkerSchema

The IWalkerSchema lets you set up A/B tests for different trading strategies within backtest-kit. Think of it as defining a container for your experiment.

You give it a unique name (walkerName) and can add a note (note) to explain what the test is for. 

It specifies which exchange and timeframe (exchangeName, frameName) all your strategies will use, ensuring a level playing field.

Crucially, you list the names of the strategies you want to compare (strategies). These strategies must already be registered in the system.

You can also choose which metric (metric) – like Sharpe Ratio – you want to optimize for, or provide custom callbacks (callbacks) to monitor and react to the testing process.

## Interface IWalkerResults

The `IWalkerResults` object holds all the information gathered after a complete backtest run, essentially summarizing the outcome of comparing different strategies. It tells you which financial instrument, or "symbol," was being tested. You'll also find the name of the exchange used for the trading data, along with the name of the specific backtesting "walker" process and the "frame" – this describes the time period or data frequency used in the backtest. Think of it as a report card for a backtesting experiment.

## Interface IWalkerCallbacks

The `IWalkerCallbacks` interface lets you hook into the backtest process, allowing you to get notified at key moments. 

You'll receive a notification when a new strategy begins testing, so you can log it or display progress to the user. 

Once a strategy finishes running, you'll be informed and provided with statistics about its performance and a metric value.

If a strategy encounters a problem during its backtest and fails, you’ll be notified and given details about the error.

Finally, when the entire backtest process is finished, you'll get a notification with the complete results.

## Interface ITrailingTakeCommitRow

This interface describes a queued action related to trailing stop-loss orders. 

Specifically, it represents a situation where a trailing stop-loss order needs to be adjusted.

The `action` property confirms this is a trailing take action. The `percentShift` value indicates how much the stop-loss price should be adjusted as a percentage. Finally, `currentPrice` holds the price at which the trailing order was initially established.

## Interface ITrailingStopCommitRow

This interface represents a queued action related to a trailing stop order. Think of it as a message waiting to be processed, specifically concerning a trailing stop.

It contains three key pieces of information: the type of action being requested ("trailing-stop"), the percentage shift that needs to be applied, and the price at which the trailing stop was initially established. Essentially, it's a snapshot of a trailing stop's adjustment request.


## Interface IStrategyTickResultWaiting

This interface describes a specific type of result you get when a trading strategy is waiting for a signal to become active. Imagine you've set up a signal – perhaps a rule that says "buy when the price crosses a certain level" – and the price hasn't reached that level yet. This result tells you the strategy is patiently observing, poised to act once the price hits the trigger point.

It includes details about the signal itself, the current price being monitored, and important identifying information like the strategy and exchange names, the timeframe being used, and the trading pair. You'll also see progress indicators – although these remain at zero since no actual trade has been executed yet. 

The result also captures unrealized profit and loss figures, which are theoretical calculations based on the potential position. Lastly, it notes whether this is a backtest simulation or a live trade. A timestamp is included to track when this specific waiting state began.

## Interface IStrategyTickResultScheduled

This data structure represents a tick result, specifically when a strategy has generated a scheduled signal – meaning it's waiting for the price to reach a specific entry point. It's triggered when the strategy's signal function returns a signal that includes the expected price.

The result includes important information for tracking and analysis: the strategy's name, the exchange and timeframe involved, the symbol being traded, the current price at the time the signal was scheduled, and whether the event occurred during a backtest or a live trading session. It also provides a timestamp showing when the tick result was generated, tying it to either a backtest candle or a live execution event. The `action` property clearly identifies this as a "scheduled" event, making it easy to distinguish from other types of tick results.


## Interface IStrategyTickResultOpened

This interface represents a notification that a new trading signal has been created. 

It's sent when a signal is successfully validated and saved, giving you information about the newly generated signal.

You'll receive this notification to understand exactly when a signal was created, including details like the strategy and exchange it came from, the symbol being traded, and the price at the time of creation. 

The `createdAt` timestamp connects the signal to the original candle data or the moment of live execution. A flag indicates whether this signal originated from a backtest or a live trading scenario.

## Interface IStrategyTickResultIdle

This interface represents a tick result indicating that a trading strategy is currently in an idle state, meaning no active trading signal is present. It provides key information about the context of this idle state, including the strategy's name, the exchange being used, the timeframe of the data, and the trading symbol involved. 

You’ll find details like the current price at the time of the idle state and whether the data originates from a backtest or a live trading environment. Importantly, the 'signal' property is null, explicitly confirming the absence of a signal, and a timestamp marks when this idle event occurred. This data helps in monitoring and analyzing strategy behavior during periods of inactivity.

## Interface IStrategyTickResultClosed

This interface describes the data you receive when a trading signal is closed, providing a complete picture of what happened. 

It includes all the original signal details, like the parameters used to initiate the trade.
You’ll also find the final price at which the trade closed, along with the reason for the closure, such as a stop-loss being hit or time expiration.

Critically, it calculates and returns the profit and loss (PNL) for the trade, factoring in fees and slippage.
The data also includes identifiers for the strategy, exchange, timeframe, and trading symbol, aiding in tracking and analysis.

Finally, it tells you if the closure occurred during a backtest or in a live trading environment and provides a unique ID for manually closed positions. The creation timestamp is also provided for correlating events.

## Interface IStrategyTickResultCancelled

This interface describes what happens when a trading signal you’ve planned doesn’t actually result in a trade – perhaps it was canceled or the signal expired before a position could be opened. It tells you exactly why the signal didn't execute.

You'll see details like the original signal that was planned, the final price at the time of cancellation, and the precise time it happened. It also includes helpful information for tracking like the strategy and exchange names, the timeframe used, and whether it's a backtest or live trade.

If you’ve specifically cancelled a signal using a cancellation ID, that's also included. Finally, there’s a timestamp indicating when the tick result was generated.

## Interface IStrategyTickResultActive

This interface represents a specific outcome during backtesting or live trading when a strategy is actively monitoring a signal and waiting for a target profit (take profit), a stop-loss, or a time expiration. It holds key details about the situation, including the name of the strategy, the exchange and symbol being traded, and the current price being monitored.

You'll find information about the signal itself, along with indicators showing progress toward take profit and stop-loss levels. The interface also captures unrealized profit and loss data, taking into account fees and slippage.

Furthermore, it flags whether the event originates from a backtest or live trading environment and provides timestamps for tracking and synchronization. A private timestamp tracks the last candle processed, mainly used for backtest chunk advancement.

## Interface IStrategySchema

The IStrategySchema defines the structure for strategies you register within the backtest-kit framework. It essentially describes how a trading strategy works and how it's configured.

Each strategy needs a unique name for identification. 
You can also add a note to provide extra details for other developers.

The `interval` property controls how often the strategy can generate signals, preventing it from overwhelming the system – a default of one minute is used.

The core of the strategy is the `getSignal` function; this is where the signal generation logic resides and it takes the symbol, timestamp, and current price as input. It can be configured to generate signals immediately or wait for a specific price level to be reached.

Lifecycle events, like when a position is opened or closed, can be handled through optional callbacks.

Furthermore, you can associate risk profiles or actions with the strategy to manage risk or track specific behaviors.

Finally, you can include custom data to track and report on the strategy's performance.

## Interface IStrategyResult

This interface represents the result of running a trading strategy in a backtest. It’s designed to hold all the information needed to compare different strategies against each other.

Each result includes the strategy's name so you know which strategy produced it. 

You'll also find a detailed set of backtest statistics, which provides a comprehensive overview of the strategy's performance. 

A key piece of information is the metric value, used for ranking – if a strategy isn't valid, this value will be null.

Finally, timestamps indicating when the strategy started and stopped generating signals are also included, allowing you to understand the timeline of the strategy’s activity.

## Interface IStrategyPnL

This interface represents the profit and loss (PnL) result for a trading strategy. It details the financial outcome of a trade, taking into account realistic market conditions. 

The `pnlPercentage` tells you how much the trade gained or lost, expressed as a percentage. 

The `priceOpen` and `priceClose` properties show the actual prices used for the trade, reflecting adjustments for both trading fees (0.1%) and slippage (0.1%).

Finally, `pnlCost` gives you the absolute dollar amount of the profit or loss, calculated based on your total investment. `pnlEntries` defines the total invested capital in USD.

## Interface IStrategyCallbacks

This interface lets you customize how your trading strategy reacts to different events during a backtest or live trading. Think of it as a set of optional notifications your strategy receives at key moments.

You can define functions to be executed when a new signal is opened, when it becomes active, when it's in an idle state (no signals are active), when it closes, or when it’s scheduled for later entry. There are also callbacks for scheduled signals that are cancelled, for partial profits or losses, and when the signal reaches breakeven.

A `onTick` function runs every time a new price tick arrives, giving you continuous updates. The `onWrite` callback handles writing signal data to storage, mainly for testing purposes. Finally, `onSchedulePing` and `onActivePing` provide periodic notifications for scheduled and active signals, respectively, allowing for custom monitoring and adjustments during those states. These callbacks allow you to build strategies that are highly responsive to market conditions and adapt to various scenarios.

## Interface IStrategy

The `IStrategy` interface defines how a trading strategy interacts with the backtest framework. Essentially, it's the blueprint for your trading logic.

The `tick` method is the core of the strategy—it's called for each price update. This method handles signal generation, checks for profit targets (TP) and stop-loss levels (SL), and performs crucial calculations.

To help you make decisions, the framework provides helper methods for fetching information. `getPendingSignal` and `getScheduledSignal` retrieve active signals, while `getBreakeven` determines if a signal has reached a breakeven point.  Other methods, like `getTotalPercentClosed`, `getTotalCostClosed`, and `getPositionPnlPercentage`, give you insights into the position's performance. `getPositionEntries` and `getPositionPartials` show the history of trades made.

For backtesting, the `backtest` method simulates trading using historical data. You can also control the strategy's lifecycle: `stopStrategy` halts new signal generation, `cancelScheduled` removes a scheduled signal, and `closePending` closes an existing position.  `createSignal` lets you inject custom signals.

Finally, there are methods for monitoring performance and managing risk, such as `trailingStop` and `breakeven`, which automatically adjust your strategy based on market conditions. The `validate...` methods let you check if actions would be successful *before* executing them, which is useful for validation. `dispose` cleans up resources when the strategy is no longer needed.


## Interface IStorageUtils

The `IStorageUtils` interface defines the essential functions that any storage adapter used within the backtest-kit framework must provide. It outlines how the adapter should react to various signal events—when a position is opened, closed, scheduled, or cancelled.

You’ll also use these functions to retrieve stored signals, either by a specific ID or to list all of them.

Finally, the interface includes mechanisms for handling "ping" events. These ping events are used to keep track of signals that are actively opened or scheduled, updating their timestamps to ensure accurate historical data.

## Interface IStorageSignalRowScheduled

This interface represents a signal in your trading strategy that’s been specifically scheduled for execution. It holds key information about that scheduled signal.

The `status` property confirms the signal is in a "scheduled" state. 

The `currentPrice` tells you the VWAP price at the exact moment the signal was scheduled, which helps maintain context and accuracy in your backtesting process, linking it to the `IStrategyTickResultScheduled` data.


## Interface IStorageSignalRowOpened

This interface describes a signal row specifically for when a trading position is opened. It holds essential information about that opening event.

The `status` property is always "opened," clearly indicating this represents an opening signal.

The `currentPrice` tells you the VWAP price that existed when the signal triggered the opening of the position. This price is the same one recorded in the `IStrategyTickResultOpened` data.

## Interface IStorageSignalRowClosed

This interface describes the data associated with a trading signal that has been closed. It’s used to store information about signals that have reached their end, including details about their performance and how they were closed.

Specifically, it includes the signal's status (which will always be "closed"), its profit and loss (PNL) at the time of closure, and the closing price. You’ll also find the reason for the signal’s closure and a timestamp indicating precisely when it closed. This data helps in analyzing the effectiveness of your trading strategies and understanding why signals ended as they did.

## Interface IStorageSignalRowCancelled

This interface represents a signal row that has been cancelled. 

It’s a simple way to mark a signal as no longer valid or in effect. 

The core of this is the `status` property, which is always set to "cancelled" to clearly indicate the signal's state.

## Interface IStorageSignalRowBase

This interface defines the core data structure for storing signals, ensuring they’re consistently saved across different strategies and environments. Every signal will have a `createdAt` timestamp, recording when it was initially generated.  There's also an `updatedAt` timestamp to track any modifications.  A `priority` field is included; this determines the order in which signals are processed when re-writing data, using the current time to establish a consistent order.

## Interface IStateParams

The `IStateParams` interface helps you define how your signals are organized and initialized. Think of it as setting up containers – `bucketName` lets you group related signals together, like all signals related to trade management versus metrics.  `initialValue` specifies the starting point for a signal when it doesn't have any saved data yet. It ensures your signals always have a known, predictable beginning.


## Interface IStateInstance

The `IStateInstance` interface provides a way to manage data related to individual trading signals. Think of it as a container for information that changes over time as a trade progresses, like the highest unrealized profit or how long the trade has been open.

It's designed to be used with LLM-driven trading strategies that need to track specific metrics throughout a trade's life.

The interface includes methods to:

*   **Initialize** the state at the start.
*   **Read** the current state at a specific time. This prevents looking into the future by only providing data up to the requested time.
*   **Update** the state. Importantly, updates with earlier timestamps overwrite older data, enabling backtests to reset data without disrupting live trading. An updater function can access the current state for calculations.
*   **Release** any resources used by the state instance when it's no longer needed.

## Interface ISizingSchemaKelly

This schema lets you size your trades using the Kelly Criterion, a method designed to maximize long-term growth. It requires you to specify the `method` as "kelly-criterion".  You'll also need to define a `kellyMultiplier`, which controls how aggressively the Kelly Criterion is applied – a smaller value like 0.25 (the default) represents a more conservative approach, while a higher value would risk larger bets. This multiplier essentially scales down the Kelly Criterion's calculated bet size.

## Interface ISizingSchemaFixedPercentage

This schema defines a straightforward way to size your trades – it always uses a fixed percentage of your capital for each trade. 

You'll specify the `method` as "fixed-percentage" to indicate you're using this approach.

The core of this sizing is the `riskPercentage`, which tells the system what portion of your available capital to risk on each trade.  For instance, a `riskPercentage` of 10 means 10% of your capital will be risked per trade.  This value needs to be between 0 and 100.

## Interface ISizingSchemaBase

This interface defines the foundational structure for sizing strategies within the backtest-kit framework. Each sizing strategy will have a unique identifier, which is the sizingName. 

You can also add a note to help explain the sizing strategy.

The sizing schema also specifies limits on position size: a percentage of the account (maxPositionPercentage), and minimum and maximum absolute sizes (minPositionSize and maxPositionSize). 

Finally, you have the option to define callbacks that trigger at different points in the sizing process.

## Interface ISizingSchemaATR

This schema defines how to size trades based on Average True Range (ATR). 

Essentially, it tells the backtest system to calculate the size of each trade using a specific method—in this case, an ATR-based approach. You'll also need to define a risk percentage, representing the maximum percentage of your capital you're willing to risk on any single trade, typically between 0 and 100. Finally, an ATR multiplier is used to determine the distance of your stop-loss order from the entry price, based on the current ATR value.

## Interface ISizingParamsKelly

The `ISizingParamsKelly` interface defines the settings needed for sizing trades using the Kelly Criterion within the backtest-kit framework.  It primarily focuses on providing a way to log information during the sizing process, which is helpful for debugging and understanding how trade sizes are being calculated.  Specifically, you'll supply an instance of an `ILogger` to handle any log messages generated while determining the appropriate trade size. This allows for increased transparency and control over the sizing strategy.

## Interface ISizingParamsFixedPercentage

This interface defines the parameters needed to control how much of your assets are used for each trade when using a fixed percentage sizing strategy. It's all about consistently risking a predetermined slice of your capital with every trade.

You'll find a `logger` property here – this is used to provide helpful messages during testing and debugging, allowing you to see what's happening behind the scenes.

## Interface ISizingParamsATR

This interface defines the settings you can use when determining how much of your capital to allocate to a trade based on the Average True Range (ATR). It's all about controlling your risk using ATR.

The `logger` property lets you specify a service for logging any debugging messages or information related to sizing calculations. This is useful for understanding how the sizing is working and troubleshooting any issues.

## Interface ISizingCallbacks

When your backtest kit strategy determines how much to trade, this callback function lets you step in after that calculation happens. You can use it to keep track of what sizes were chosen, or even double-check that the sizing makes sense based on your strategy's rules. It's like a post-calculation audit for your sizing decisions.

This function is triggered right before an order is sent to the broker. You can use this to log the order details, or potentially modify the order before it's submitted, though be very cautious about modifying orders directly – it's generally best to adjust sizing beforehand.

## Interface ISizingCalculateParamsKelly

This interface defines the information needed to calculate your trade size using the Kelly Criterion. 

Essentially, it's about figuring out how much to bet based on your historical performance.

You'll need to provide your win rate, which is the proportion of times you win a trade (expressed as a number between 0 and 1).  Also crucial is your average win/loss ratio – how much you gain on a winning trade compared to how much you lose on a losing one. 

Providing these two values allows the framework to apply the Kelly Criterion formula to determine an optimal bet size.


## Interface ISizingCalculateParamsFixedPercentage

This interface defines the data needed for calculating trade size using a fixed percentage approach. It essentially tells the backtesting system you want to size your trades based on a predetermined percentage of your available capital. The `method` property explicitly states that you're using the "fixed-percentage" sizing method.  You'll also need to specify the `priceStopLoss`, which represents the price at which a stop-loss order will be triggered. This is crucial for risk management.

## Interface ISizingCalculateParamsBase

This defines the core information needed to figure out how much to trade. 

Every sizing calculation needs to know which trading pair you're working with, represented by the `symbol` – like "BTCUSDT".  It also needs to understand your current financial situation, specifically your `accountBalance`. Finally, the planned price at which you intend to enter the trade, `priceOpen`, is also essential for sizing decisions.

## Interface ISizingCalculateParamsATR

To calculate trade sizes using an ATR-based method, you'll need to define these parameters. The `method` property must be set to "atr-based" to indicate this sizing strategy.  The `atr` property holds the current Average True Range value, which is crucial for determining the size of each trade based on market volatility. This value represents a key input for the sizing calculation.

## Interface ISizing

The `ISizing` interface defines how a strategy determines how much of an asset to trade. It's all about calculating position sizes.

The core of this interface is the `calculate` function.  This function takes parameters describing the trading conditions and returns a promise that resolves to the size of the position you should take – essentially, how much to buy or sell. This function is responsible for the core logic of determining your trading size based on your risk tolerance and other relevant factors.

## Interface ISignalRow

This `ISignalRow` interface defines the structure of a signal used throughout the backtest-kit framework. Think of it as a complete record of a trading signal, from its creation to its potential execution and beyond. Each signal is assigned a unique ID, and carries information about its cost, entry price, and expected duration.

It includes details about the exchange and strategy involved, the trading symbol, and when the signal was scheduled and went pending. 

Beyond the basics, the signal maintains a history of any partial profit or loss closures, allowing for accurate profit and loss calculations. It also tracks trailing stop-loss and take-profit prices, which dynamically adjust based on market movement.

A key feature is the DCA (Dollar Cost Averaging) entry history, recording each price point along the way. Finally, it keeps track of the highest profit and lowest loss points achieved during the trade’s lifespan, and it has a timestamp for auditing and historical tracking. This `ISignalRow` represents a full picture of a trading decision and its performance.

## Interface ISignalIntervalDto

The `ISignalIntervalDto` is a way to bundle multiple trading signals together and release them at specific intervals. Think of it like sending a group of instructions to your trading system, but delaying their execution until a certain amount of time has passed.  Each bundle has a unique ID, so you can keep track of them. It’s primarily used with the `IntervalUtils` functions to manage how often signals are processed.

## Interface ISignalDto

The `ISignalDto` represents a trading signal, containing all the necessary information to execute a trade. Think of it as a blueprint for a trade – it specifies what to buy or sell, in what direction, and at what prices.  Each signal includes a unique identifier, the ticker symbol involved, whether it's a long (buy) or short (sell) position, and a note explaining the reasoning behind the signal.

You'll also find price levels for entering the trade (entry price), taking profit (target price), and setting a stop-loss (to limit potential losses).  The signal also defines an estimated duration, or timeout, for the position. If no duration is specified, the position will remain active until a profit target or stop-loss is triggered, or until it is manually closed. Finally, the signal includes a cost associated with entering the trade.

## Interface ISignalCloseRow

This interface, `ISignalCloseRow`, builds upon the basic `ISignalRow` and adds details specifically for when a signal results in a trade being closed. It’s used when a user manually initiates a closure, allowing you to track things like a unique identifier for that closure (`closeId`) and any notes the user might have provided (`closeNote`) to explain the reasoning behind the closure. These properties aren't present in regular signal rows; they appear only when a closure is initiated by the user.

## Interface ISessionInstance

The `ISessionInstance` interface is like a shared, temporary workspace for your trading strategies. It lets you store and retrieve data specific to a particular symbol, strategy, exchange, and timeframe. Think of it as a place to keep things like the results of complex calculations, intermediate results from indicators, or any data that needs to be accessed repeatedly during a single trading run.

It provides a few key functions:

*   `waitForInit` allows you to signal when the session is ready to be used.
*   `setData` lets you write new information into that workspace, along with a timestamp to know when it was relevant.
*   `getData` allows you to retrieve the data associated with a specific timestamp.  It's designed to prevent looking too far into the future.
*   `dispose` cleans up everything when you're finished with the session.

Essentially, it’s a way to manage and reuse data efficiently within your backtesting environment, particularly useful for things that would be slow to recalculate.

## Interface IScheduledSignalRow

This interface, `IScheduledSignalRow`, describes a signal that isn't triggered immediately. Think of it as a signal that’s put on hold, waiting for the price to reach a specific level. It builds upon the standard `ISignalRow`, representing a signal that's essentially paused until the market conditions are right. Once the price hits the designated `priceOpen`, the signal transforms into a regular, active signal. Importantly, a timestamp tracks when the signal was scheduled and remains until the signal activates.

## Interface IScheduledSignalCancelRow

This interface represents a scheduled signal that might have been canceled by the user. It builds upon the basic scheduled signal information, adding details specifically for cancellations. If a user cancels a signal, this interface includes a `cancelId` to identify that specific cancellation and a `cancelNote` to record any explanation or reason given by the user. It's really just a way to track and understand cancellations when they happen.

## Interface IScheduledSignalActivateRow

This interface defines a row of data related to scheduled signals, specifically when those signals are being activated. It builds upon the standard signal information to include details about activations that are triggered directly by the user. If a user initiates the activation process, this row will contain an `activateId` to identify the specific activation and an `activateNote` to provide extra context or information from the user's request. Essentially, it adds a layer of tracking for manually triggered signals.

## Interface IRuntimeRange

This interface, `IRuntimeRange`, simply describes the period of time your backtest will cover. It tells the backtest system when it should start and when it should stop analyzing data and executing your trading strategy. Think of it as defining the "window" of historical data you want to use for testing. The `from` property specifies the very beginning date of that window, and the `to` property specifies the end date.

## Interface IRuntimeInfo

The `IRuntimeInfo` interface gives you important details about what's happening during a trading simulation or live trade. It tells you which symbol, like BTCUSDT, is being traded. You’ll also find the timeframe of the backtest – or that it's running live.

Strategies can also pass along custom data through the `info` property, which is really handy for your own monitoring and reporting. 

Along with that, you get context about the specific exchange, the strategy being used, and the frame it's operating on, helping you understand the environment. The `when` property provides the exact timestamp of the current candle or market tick, while `currentPrice` gives you the price at that moment. Lastly, `backtest` simply confirms whether you're running a simulation or a live trade.

## Interface IRunContext

The `IRunContext` acts as a central hub, providing everything a function needs to operate within the backtest-kit framework. It's a bundle of information, merging details about how your strategy interacts with the exchange and frame, alongside essential runtime data like the symbol being traded and the current timestamp. Think of it as a comprehensive package, neatly prepared and passed along so functions don't have to ask for pieces of data individually. It's designed to keep things organized and efficient by separating the context into specific services for management.

## Interface IRiskValidationPayload

This object holds the information needed when checking if a trade makes sense from a risk perspective. It builds upon the existing trade parameters and adds details about your current portfolio. 

Specifically, you’ll find the `currentSignal` – the signal that triggered the potential trade – which includes things like the price. 

You’ll also see the number of positions you currently hold (`activePositionCount`), and a complete list of those active positions (`activePositions`) for a full view of your portfolio. This data helps you assess how the new trade will affect your overall risk exposure.

## Interface IRiskValidationFn

This defines a function that's used to check if a trade meets certain risk criteria. Think of it as a gatekeeper for your trades – it decides whether a trade should proceed or be rejected. If the trade passes the check, the function does nothing. If it fails, it either returns a specific rejection message or throws an error, both of which are handled in a consistent way to signal the rejection. This ensures a standardized process for dealing with trades that don't meet your predefined risk rules.

## Interface IRiskValidation

This interface helps you define rules and explanations for validating your risk assessments. Think of it as a way to ensure your risk checks are sound and well-documented. 

You provide a `validate` function, which is the core logic that determines if a risk assessment passes or fails.  Alongside this, you can include a `note` to describe the purpose of the validation – this helps others understand why the rule exists and how it functions.

## Interface IRiskSignalRow

This interface, `IRiskSignalRow`, helps manage risk during trading. It builds upon the existing `ISignalDto` but adds crucial details like the entry price, the initial stop-loss price, and the original take-profit price. Think of it as a way to keep track of the initial risk parameters associated with a trade for validation purposes. It’s used internally to ensure that risk controls are properly applied and monitored throughout a trade's lifecycle.

## Interface IRiskSchema

This defines a way to create reusable risk profiles within your trading system. Think of it as a blueprint for how you want to manage risk at a portfolio level. 

Each risk profile has a unique identifier, a place for notes to explain its purpose, and optional callbacks that trigger when a trade is rejected or allowed.

The core of the risk profile is the `validations` array – this is where you specify the actual rules and checks that determine whether a trade is permissible. You can use pre-built validations or create your own custom functions to enforce specific risk constraints.

## Interface IRiskRejectionResult

This interface represents the result when a risk validation check fails. It provides details about why the validation didn’t pass, helping you understand and fix the underlying issue. The `id` property gives each rejection a unique identifier, useful for tracking and debugging.  The `note` property contains a clear, human-readable explanation of the reason for the rejection – what went wrong and why it was flagged.

## Interface IRiskParams

This interface defines the settings you provide when setting up the risk management system. It lets you specify the exchange you're working with, a way to log important events for debugging, and a time service to ensure accurate data handling, particularly important during backtesting to avoid unintended advantages. 

You'll also find options to indicate whether you're running a backtest or live trading and a special callback function. This callback gets triggered when a trading signal is blocked due to risk constraints, allowing you to log or further process these rejections before they're formally reported.

## Interface IRiskCheckOptions

The `IRiskCheckOptions` interface lets you control how risk checks behave, especially when multiple things are happening at once. It primarily focuses on ensuring that checks see the most up-to-date information about your positions.

The `reserve` property is a key setting; if you set it to `true`, the framework will temporarily mark a position as being used during the risk check. This helps prevent conflicts if other parts of your system are also trying to adjust positions simultaneously. Think of it as a brief reservation to avoid unexpected overlaps in calculations.

## Interface IRiskCheckArgs

This interface, `IRiskCheckArgs`, provides all the information needed to decide whether a trading signal should be allowed. Think of it as a gatekeeper, ensuring a trade is only executed if certain conditions are met before the trading logic even begins. It bundles together details like the trading pair's symbol, the signal itself, the strategy making the request, and important context such as the exchange, the defined risk profile, the timeframe being used, the current price, and the current timestamp. It's a way to pass along all the necessary data for a risk check to happen safely and effectively.

## Interface IRiskCallbacks

This interface defines optional functions that your trading strategy can use to respond to risk-related events. Think of them as notifications – you can choose to listen for them and react accordingly. Specifically, `onRejected` is called when a trading signal is blocked because it would violate your predefined risk limits, while `onAllowed` is triggered when a signal successfully passes all the risk checks and is considered safe to execute. These callbacks give you a way to monitor and understand why certain trades aren't happening and gain deeper insight into your risk management process.

## Interface IRiskActivePosition

This interface describes a single, active trading position that a strategy currently holds. Think of it as a snapshot of a trade – it contains key details like which strategy opened it, the exchange used, the symbol being traded (like BTCUSDT), whether it's a long or short position, and the entry price. You'll also find information about risk management elements such as the stop-loss and take-profit prices. Lastly, it includes timestamps and estimations to help track the position's lifecycle.

## Interface IRisk

The `IRisk` interface is your guardrail for safe trading. It's responsible for ensuring that your trading signals don't violate any pre-defined risk limits and for keeping track of your open positions.

The `checkSignal` method lets you see if a signal is okay to execute based on your risk rules.  There's a more powerful version, `checkSignalAndReserve`, that not only checks the signal but also temporarily "reserves" space for the new position. This is really important when multiple strategies are trading at once to prevent over-trading; it makes sure your positions are accounted for before anything is actually done. Think of it like putting a hold on something to make sure no one else grabs it.

`addSignal` is how you officially register a signal once you’re sure it’s a go, and `removeSignal` lets you clean up and clear a signal when it's closed or cancelled.  Make sure you always follow up on those "reserved" positions with either `addSignal` or `removeSignal` to keep your risk calculations accurate.

## Interface IReportTarget

This interface helps you fine-tune what data gets logged during your trading tests. Think of it as a checklist to enable or disable specific reporting features.

You can choose to log information about strategy commits, risk rejections, breakeven points, partial order closures, heatmap data, walker iterations, performance metrics, scheduled signals, live trading events, backtest closed signals, signal synchronization, highest profit milestones, or maximum drawdown events.

Each property (like `strategy`, `risk`, `breakeven`, etc.) represents a different type of event that can be recorded, and setting it to `true` activates that particular report service. This lets you control the verbosity of your reports and focus on the data most relevant to your analysis.

## Interface IReportDumpOptions

This interface, `IReportDumpOptions`, helps you organize and filter the data when you're creating reports about your trading strategies. Think of it as a set of labels you can apply to your data to easily search for specific scenarios. You'll find properties like the trading pair symbol (like "BTCUSDT"), the name of the strategy being used, the exchange where the trading happens, the timeframe being used, and a unique ID for any signals generated. There's also a field for the name of the optimization walker if you're using those. Using these options makes it much simpler to find and analyze exactly the data you’re looking for.

## Interface IRecentUtils

This interface defines how different systems can store and manage recent trading signals. It provides methods for processing incoming signals, specifically reacting to "active ping" events which trigger signal storage. You can also use it to retrieve the most recent signal for a particular trading setup, ensuring that you're not looking into the future by checking if the signal's timestamp is before a specified time. Finally, it helps calculate how long ago a signal was generated, which is useful for understanding the frequency of trading opportunities.

## Interface IPublicSignalRow

This interface, `IPublicSignalRow`, provides a clear view of a trading signal’s key details, especially focusing on the initial risk management settings. It builds upon a base signal row by adding the original stop-loss and take-profit prices, which remain constant even if those values are adjusted later using trailing stop-loss or take-profit strategies. This is designed for external APIs and user interfaces to offer transparency, allowing users to see the starting point of the risk management along with the current, potentially modified, values.

Here's a breakdown of the information included:

*   **cost:** Shows the initial investment for entering the position.
*   **originalPriceStopLoss:** Displays the initial stop-loss price when the signal was created.
*   **originalPriceTakeProfit:** Shows the initial take-profit price when the signal was created.
*   **partialExecuted:** Indicates the percentage of the position that has been closed through partial executions.
*   **totalEntries:**  Indicates how many times the position has been averaged or entered.
*   **totalPartials:**  Shows how many times the position has been partially closed.
*   **originalPriceOpen:** Represents the original entry price, unaffected by any averaging.
*   **pnl:** Shows the unrealized profit or loss at the time the signal was generated.
*   **peakProfit:** Records the highest profit achieved by the position.
*   **maxDrawdown:** Tracks the largest loss experienced by the position.

## Interface IPublicCandleData

This interface describes a single candlestick, representing price action over a specific time interval. 

Each candlestick has a timestamp indicating when it began, along with the opening price, the highest and lowest prices reached during that period, the closing price, and the volume of trades that occurred. Think of it as a snapshot of market activity – it packs a lot of information into one concise data point. This structure provides the fundamental building block for analyzing and backtesting trading strategies.

## Interface IPositionSizeKellyParams

To help calculate your position sizes using the Kelly Criterion, you'll need to define some key parameters. The `IPositionSizeKellyParams` interface holds these values. 

You’ll need to provide the `winRate`, which represents the probability of a winning trade – a value between 0 and 1.

Also crucial is the `winLossRatio`, reflecting your average profit compared to your average loss on a trade. These values together guide how much of your capital to allocate to each trade.

## Interface IPositionSizeFixedPercentageParams

This section describes the parameters used when determining position size based on a fixed percentage approach. It focuses on the `IPositionSizeFixedPercentageParams` interface.

The `priceStopLoss` property defines the price at which a stop-loss order will be triggered. This is a key factor in risk management when sizing positions.

## Interface IPositionSizeATRParams

To help determine how much to trade, this parameter provides the current Average True Range (ATR) value. Think of it as a measure of volatility – a higher ATR suggests more price fluctuation. This value is essential for calculating appropriate position sizes based on ATR strategies.


## Interface IPositionOverlapLadder

This defines how to detect overlapping positions when using dollar-cost averaging (DCA). Think of it as setting up a safety net around each DCA price point.

The `upperPercent` property lets you specify a percentage above each DCA level; any price above this threshold will be considered an overlap.  Similarly, `lowerPercent` defines a percentage below each DCA level; prices below this are also flagged as overlaps.  These percentages are expressed as values from 0 to 100, so 5 represents 5%. By adjusting these values, you can fine-tune the sensitivity of the overlap detection mechanism.

## Interface IPersistStrategyInstance

This interface defines how to manage saved strategy data for a specific trading setup—think of it as a way to remember where a strategy left off, even after it’s stopped running. It's designed so you can create your own custom methods of saving and loading this information, instead of relying on the default file-based approach.

The `waitForInit` method sets up the storage, telling it whether to start fresh or load existing data. `readStrategyData` retrieves the saved data, letting you pick up where you left off. Finally, `writeStrategyData` saves the current state, and you can even clear the data by sending `null`. This ensures that the strategy’s progress is preserved across sessions.


## Interface IPersistStorageInstance

This interface defines how trading strategies can save and load their historical signal data. Think of it as a way to persist the information about what signals were generated during a backtest or live trading session. It’s designed so you can create your own custom storage solutions – maybe you want to use a database instead of a file.

The `waitForInit` method prepares the storage to be used, essentially setting things up. `readStorageData` allows you to retrieve all previously saved signals, which are identified by a unique ID. Finally, `writeStorageData` handles saving the current signals to the storage, making sure the strategy’s history is preserved. This setup allows for a standardized approach to managing and retrieving signal data, regardless of the specific storage mechanism used.

## Interface IPersistStateInstance

This interface helps you manage persistent data specific to a particular trading signal and data bucket combination. Think of it as a way to store and retrieve information related to a strategy's state – like how much cash you have or what indicators you've calculated – so that it survives crashes or restarts.

If you want to customize how that state is stored (maybe using a database instead of a file), you can build your own adapter that implements this interface.

The methods you'll need to provide are:

*   `waitForInit`: A way to signal when the storage is ready.
*   `readStateData`:  Retrieves the previously saved state information.
*   `writeStateData`:  Saves the current state information, including a timestamp.
*   `dispose`:  Releases any resources the storage is using – though the default behavior does nothing.

## Interface IPersistSignalInstance

This interface defines how to manage and store signal data for a specific trading setup – think of it as a way to save and load the information about signals generated by a strategy for a particular asset, strategy name, and exchange.

If you want to customize how this data is saved (instead of using the default file method), you can build your own adapter that implements this interface.

The `waitForInit` method sets up the storage area for the signals. The `readSignalData` method retrieves previously saved signal information, while `writeSignalData` lets you save new signal data, and can be used to delete existing data by setting the signal row to null.


## Interface IPersistSessionInstance

This interface helps manage session data specifically for one trading setup – think of it as a dedicated space for a particular strategy, exchange, and timeframe. It's designed to keep your trading sessions safe, even if things go wrong, preventing data loss.

If you want to customize how session data is stored (maybe you don't want to use files), you can build your own adapter that follows this interface.

Here's what you'll need to do:

*   **waitForInit:** Set up the storage area when the session starts.
*   **readSessionData:** Load any existing saved data for this specific session.
*   **writeSessionData:** Save data whenever something important happens during the session.
*   **dispose:** Clean up any resources when the session is finished.

## Interface IPersistScheduleInstance

This interface helps manage how trading signals are saved and loaded for specific combinations of assets, strategies, and exchanges. Think of it as a way to customize where and how your backtest kit remembers the signals it's using.

If you want to use a different storage method, like a database instead of a file, you can create your own class that implements this interface.

The `waitForInit` method is called to set up the storage when it’s needed.
`readScheduleData` retrieves the saved signal information.
And `writeScheduleData` allows you to save new or updated signal information – you can even clear the stored data by sending null.

## Interface IPersistRiskInstance

This interface defines how backtest-kit stores and retrieves risk positions, essentially the active trades for a specific trading strategy and exchange combination. Think of it as a way to save and reload the state of your risk management, so you don't lose progress. 

If you want to customize how this data is stored—perhaps using a database instead of a file—you can create your own adapter that implements these methods.

The `waitForInit` method prepares the storage area when things start.
`readPositionData` loads the saved positions at a specific point in time.
And `writePositionData` saves the current positions to persist them for later use.

## Interface IPersistRecentInstance

This interface lets you manage how recent trading signals are saved and loaded, but specifically for a certain combination of factors like the symbol being traded, the strategy used, the exchange, and the timeframe. Think of it as a dedicated space to remember the last signal for a particular situation.

You can customize this behavior to store signals in ways other than the default file system approach.

The `waitForInit` method sets up the storage area, ensuring it's ready to go.

`readRecentData` retrieves the most recently saved signal for that specific context.

Finally, `writeRecentData` saves a new signal, along with the timestamp, so you can track what happened when.


## Interface IPersistPartialInstance

This interface helps you manage how trading data, specifically partial profit and loss information, is saved and retrieved for a particular trading setup. Think of it as a way to keep track of the progress of a trade, and save that information in a way that's specific to the asset being traded, the strategy used, and the exchange involved. 

It lets you create custom ways to store this information, overriding the default method of using files.

The `waitForInit` method prepares the storage space for your data.
`readPartialData` retrieves previously saved information about a trade.
`writePartialData` is used to save new or updated information about a trade.

## Interface IPersistNotificationInstance

This interface lets you customize how trading notifications are saved and loaded, providing a way to go beyond the default file storage. It’s designed to work separately for backtesting and live trading environments, ensuring notifications are handled appropriately in each situation.

Think of it as a place to plug in your own system for managing those important notifications – like order confirmations or trade updates – potentially storing them in a database or some other location.

The `waitForInit` method prepares the storage space for either backtesting or live mode.  `readNotificationData` retrieves all the stored notifications. Finally, `writeNotificationData` is used to save new notifications or update existing ones, associating each with a unique ID.

## Interface IPersistMemoryInstance

This interface defines how memory data is stored and retrieved for a specific context within the backtest-kit framework. Think of it as a way to handle long-term memory for language models, allowing them to remember information across different trading scenarios.

It provides methods for initializing storage, reading individual memory entries by their ID, and checking if a particular memory entry exists. You can also write new memory entries, softly delete existing ones (keeping the file but hiding it from normal searches), and list all the currently active memory entries.

Finally, there's a `dispose` method to release any resources that this storage instance might be using when it's no longer needed. This interface is designed to be customized, so you can build your own storage solutions that go beyond the default file-based approach.

## Interface IPersistMeasureInstance

This interface defines how to store and retrieve cached data related to backtesting measures. Think of it as a way to save responses from external APIs so you don't have to repeatedly request them.

The system allows for "soft deletes," meaning data can be removed from view without actually being erased from disk. This lets you keep historical data around for analysis even after it’s considered outdated.

If you want to customize how this caching works—maybe using a different storage mechanism than the default file system—you can create your own adapter that implements this interface.

Here’s a breakdown of what the methods do:

*   `waitForInit`: Prepares the storage area for a particular data set.
*   `readMeasureData`: Retrieves a cached data entry using a unique key.
*   `writeMeasureData`: Saves a new data entry into the cache, along with a timestamp.
*   `removeMeasureData`: Marks a data entry as deleted (but keeps the file around).
*   `listMeasureData`:  Provides a way to get a list of all the available, non-deleted data keys.

## Interface IPersistLogInstance

This interface defines how the backtest-kit framework handles persistent storage for log data. It's a global system, meaning there's only one log storage area running for the entire process, not tied to any specific trading context.

If you need to change how the framework stores and retrieves log entries, you can create your own adapter that implements this interface.

The `waitForInit` method lets you ensure that the log storage is ready before you start writing data. The `readLogData` method allows you to fetch all the persisted log entries, iterating through them based on their unique IDs. Finally, `writeLogData` is used to actually save log entries – and it’s important to avoid overwriting existing entries to maintain a clear, append-only log history.

## Interface IPersistIntervalInstance

This interface lets you customize how the backtest-kit framework remembers which intervals have already fired for a specific data bucket. Think of it as a way to keep track of what's been done.

If you're building a custom system that needs to handle interval persistence differently than the default file-based approach, you'll implement this interface. 

The `waitForInit` method prepares the storage for a new bucket.  `readIntervalData` fetches information about a past interval, `writeIntervalData` saves that a interval has already fired, and `removeIntervalData` essentially resets an interval marker, allowing it to fire again. Finally, `listIntervalData` helps you check which intervals have already been processed for the current bucket.

## Interface IPersistCandleInstance

This interface defines how your backtest kit can store and retrieve candle data for a specific trading symbol, timeframe, and exchange. Think of it as a way to keep track of historical price information without constantly pulling it from the source.

The `waitForInit` method lets you prepare the storage area for your data.

`readCandlesData` is crucial; it’s how you fetch a range of historical candles from your cache. Importantly, it returns `null` if *any* of the candles you request are missing, signaling a need to retrieve them from the original data source.

Finally, `writeCandlesData` allows you to save newly obtained candle data into your cache. When writing, you might choose to ignore candles that are still open or overwrite existing data, to maintain the integrity of your historical record. This gives you control over how you manage and persist your candle data.


## Interface IPersistBreakevenInstance

This interface helps manage where and how breakeven data – essential for knowing when a trade is profitable – is saved. It focuses on a particular combination of symbol, strategy, and exchange, keeping the data organized. Think of it as a dedicated storage space for each unique trading setup.

Each signal, representing a specific trading opportunity, has its own place to store its breakeven information.

If you want to change how this data is stored – perhaps to use a database instead of a file – you can create your own adapter that implements this interface.

The `waitForInit` method prepares the storage area.

`readBreakevenData` retrieves the stored breakeven data for a specific signal and date.

`writeBreakevenData` saves new or updated breakeven data for a signal.

## Interface IPersistBase

This interface provides a basic set of operations for any system that needs to save and load data, like a database adapter. Think of it as a contract that ensures different storage methods can be used interchangeably. 

It outlines how to initialize the storage, retrieve data, check if data exists, write data, and list all the available data identifiers. 

The `waitForInit` method ensures proper setup, `readValue` gets a specific piece of data, `hasValue` confirms its existence, `writeValue` saves data, and `keys` gives you a way to see everything stored. The order of those identifiers is guaranteed to be sorted.


## Interface IPartialProfitCommitRow

This describes a single step taken during a backtest to lock in some profits. It represents a partial profit commitment, meaning only a portion of your position was closed.

Each entry tells you how much of the position (defined by `percentToClose`) was closed, and at what price (`currentPrice`). The `action` property confirms this is indeed a partial profit taking action.


## Interface IPartialLossCommitRow

This interface represents a request to partially close a position, essentially selling a portion of your holdings. 

It’s used when your backtest strategy wants to reduce exposure without fully exiting a trade. 

The `action` field clearly states that this is a partial loss commitment. The `percentToClose` property specifies the percentage of the position to be closed, and `currentPrice` records the price at which the partial execution occurred.

## Interface IPartialData

IPartialData holds a snapshot of key information about a trading signal, designed to be saved and restored easily. Think of it as a simplified version of the full trading state, enough to pick up where you left off. It specifically includes details about the profit and loss levels that have been hit during trading. These levels are stored as arrays, which is necessary to make them compatible with systems that save data like JSON. This allows for persistence of trading progress, allowing a system to reload a trading session from a saved state.

## Interface IPartial

The `IPartial` interface is responsible for keeping track of how much profit or loss a trading signal has generated. It's used by components like `ClientPartial` and `PartialConnectionService`.

When a signal is actively trading, the `profit` method is called to assess if the signal has reached certain profit milestones (10%, 20%, 30%, and so on). It then sends out notifications for any new profit levels achieved, ensuring that you only get notified when a level is reached for the first time.

Similarly, the `loss` method works the same way but tracks loss levels. It's triggered when a signal is incurring losses and notifies you of any new loss milestones.

Finally, when a trading signal finishes – whether it hits a take-profit or stop-loss – the `clear` method is used to clean up all the associated data, effectively resetting the profit/loss tracking for that signal. This includes removing the signal's data from memory and saving any necessary changes.

## Interface IParseArgsResult

The `IParseArgsResult` interface holds the information after command-line arguments have been processed. It essentially combines the original input parameters with flags that tell the system how to run – whether it should be a backtest using historical data, a paper trade using live data, or a live trade with real money. Think of it as a container for the operational mode of your trading system. 

The `backtest` property indicates if the system should operate in backtesting mode. 
The `paper` property tells you if it's a paper trading simulation.
And the `live` property confirms if it's a live, real-money trading environment.

## Interface IParseArgsParams

The `IParseArgsParams` interface describes the information needed to run a trading strategy from the command line. Think of it as a set of defaults – it specifies what we expect to find when you provide instructions to the system.

It contains key details like the trading pair you're interested in (e.g., BTCUSDT), the name of the strategy you want to use, which exchange you're connecting to (like Binance or Bybit), and the timeframe for the historical data the strategy will use (such as 1-hour candles). Essentially, it's the blueprint for the initial setup of a backtest.

## Interface IOrderBookData

This interface, `IOrderBookData`, represents the information you get from an order book. It contains the trading symbol, like "BTCUSDT", along with lists of both buy orders (bids) and sell orders (asks).  Each bid and ask is structured as an `IBidData` object, which isn't defined here but likely contains details like price and quantity.  Essentially, this gives you a snapshot of the current market interest on both sides of a trade.

## Interface INotificationUtils

This interface outlines the fundamental methods any notification system needs to provide within the backtest-kit framework. Think of it as a contract that ensures different notification methods—like sending alerts or logging events—work consistently.

The `handleSignal` method is your go-to for reacting to core trading signals such as trade openings, closures, and scheduled actions.  There are also specific methods like `handleSignalNotify`, `handlePartialProfit`, `handlePartialLoss`, `handleBreakeven`, `handleStrategyCommit`, and `handleSync` to address more nuanced events arising from your trading strategy.

If something goes wrong, the `handleError` and `handleCriticalError` methods are called to catch those issues. `handleValidationError` provides a dedicated spot for dealing with data validation problems.

You can also use `getData` to retrieve a list of all notifications that have been generated and `dispose` to wipe them clean, essentially resetting the notification history.

## Interface INotificationTarget

The `INotificationTarget` interface helps you fine-tune what notifications your backtest receives. Instead of getting every possible notification, you can specify exactly which event types you’re interested in, like signal openings, partial profit triggers, or error messages. This allows you to focus on the most relevant information and potentially improve backtest performance by reducing unnecessary processing.

You can enable notifications for things like:

*   Signal lifecycle events (open, scheduled, closed, cancelled)
*   When partial profit or loss targets are reached
*   Reaching the breakeven point
*   Strategy commits (like taking partial profits or canceling orders)
*   Signal synchronization events (important for live trading)
*   Rejections from the risk manager
*   Informational messages from the strategy
*   Non-fatal and critical errors encountered during the backtest
*   Validation errors in your strategy configuration

If you don't provide an `INotificationTarget`, all notification types will be enabled by default.

## Interface IMethodContext

The `IMethodContext` object helps your backtesting code know which specific configurations to use for a trading simulation. Think of it as a little package containing the names of the strategy, exchange, and frame setups you're working with. This helps the system automatically find the right components without you having to specify them every time, making your code cleaner and easier to manage. The `exchangeName` identifies the exchange, `strategyName` identifies the trading strategy, and `frameName` identifies the time frame being used. If the `frameName` is empty, that means you're running in live mode rather than a historical simulation.


## Interface IMemoryInstance

The `IMemoryInstance` interface outlines how different memory storage systems – whether they're local, persistent, or just for testing – should behave.

It provides methods for interacting with memory, including initializing the memory system with `waitForInit`.

You can store data using `writeMemory`, searching for specific data using `searchMemory` which ranks results, and retrieving all data up to a certain time with `listMemory`.

`removeMemory` allows you to delete entries, and `readMemory` fetches a single entry, only providing it if the recorded time matches your request.

Finally, `dispose` is used to clean up any resources held by the memory instance when you're finished with it.

## Interface IMarkdownTarget

This interface lets you pick and choose which detailed reports you want to see when running a backtest. It’s all about controlling the level of information you get.

You can enable reports for things like strategy signals (entry and exit), risk rejections (signals blocked), or breakeven events. 

There are also options to track partial profits, analyze portfolio performance with heatmaps, compare strategies, investigate bottlenecks, monitor scheduled signals, and see live trading events. 

Finally, you can get reports focused on key milestones such as reaching the highest profit or experiencing the maximum drawdown. Essentially, this gives you fine-grained control over the data you receive.

## Interface IMarkdownDumpOptions

This interface defines options used when generating documentation in Markdown format. Think of it as a way to specify exactly *what* part of your backtesting system you want to document. It includes details like the directory path where the documentation should be saved, the name of the file, and essential information about the trading pair, strategy, exchange, and timeframe involved. It's all about pinpointing the exact component you're creating documentation for, using things like the strategy name and signal ID.

## Interface ILogger

The `ILogger` interface defines how different parts of the backtest-kit framework communicate about what's happening. It's a central tool for keeping track of events, errors, and important details as the system runs.

You can use the `log` method for general messages, like noting when something important happens.

`debug` is for very detailed information that helps you troubleshoot, often used when developing or investigating issues.

`info` allows you to record progress and successful actions—a way to understand the system’s overall activity.

Finally, `warn` is used for potential problems that don't stop the process, but still need to be looked into. It helps you catch issues before they become bigger problems.

## Interface ILogEntry

Each log entry keeps track of different pieces of information during a backtest. Every entry has a unique ID and a level, ranging from general "log" messages to more urgent "warn" notifications. 

A timestamp indicates precisely when the log was created, and another timestamp marks the moment in the backtest’s execution.  

The `methodContext` and `executionContext` properties add even more detail, like where in the code the log originated and what the system state was at that point. Finally, a `topic` identifies the method generating the log, and `args` holds any extra data passed along with the message.

## Interface ILog

The `ILog` interface provides a way to track and review what happened during your backtesting or trading simulations. It allows you to access a complete history of log entries, giving you valuable insight into the sequence of events and decisions made. You can retrieve the full list of logged events using the `getList` method, which returns an array of `ILogEntry` objects detailing each event. This is helpful for debugging, understanding performance, and auditing your strategies.

## Interface IHeatmapRow

This interface describes the data you'll find in a heatmap row when analyzing trading performance for a specific trading pair, like BTCUSDT. It provides a ton of metrics, giving you a comprehensive view of how a strategy performed. You'll see key statistics like total profit/loss, Sharpe ratio (measuring risk-adjusted return), maximum drawdown (the largest loss from a peak), and the number of winning and losing trades.

It also breaks down performance further, showing average profit/loss per trade, win rate, and streaks of consecutive wins or losses.  You’ll find advanced metrics like expectancy, which estimates profit potential, and Sortino/Calmar ratios that refine risk assessment.  

Beyond just raw numbers, it includes insights into trade durations, and even considers the "pressure" buyers and sellers exert during trading. Finally, it analyzes the overall trend—whether it's bullish, bearish, or sideways—and how confident that assessment is. Essentially, this interface packages up a wealth of information to help you deeply understand the performance of a trading strategy for a particular trading pair.


## Interface IFrameSchema

The IFrameSchema lets you define specific periods of time for your backtesting simulations. Think of it as setting up the boundaries of your historical data. 

You'll give each frame a unique name to identify it, and you can add a note to document why it’s structured this way.

The `interval` property determines how frequently timestamps will be generated within that period – for example, every minute ("1m") or every day ("1d").  If you skip this, it will default to "1m".

You also specify the `startDate` and `endDate` to clearly mark the beginning and end of the backtest window.

Finally, `callbacks` provide a way to plug in functions that will be executed at different points during the frame's lifecycle, giving you extra control and flexibility.


## Interface IFrameParams

The `IFrameParams` object holds the information needed to set up a frame within the backtest-kit system. Think of it as the blueprint for a specific part of your trading simulation. It builds upon a base schema and crucially includes a `logger` – a tool to help you track what's happening inside the frame for debugging and understanding its behavior.  You'll also define a unique `interval` name for each frame, allowing you to easily identify and manage them.

## Interface IFrameCallbacks

This lets you react when the timeframes for your backtest are created. 

Think of it as a notification that says, "Hey, these are the dates and intervals we'll be using for the backtest."

You can use this to check if the timeframe data looks right or to simply record when the timeframe generation happens. It receives the actual timeframe dates, the start and end dates for the timeframe, and the interval used.


## Interface IFrame

The `IFrames` interface is a core component that deals with creating the timeline for your backtesting. Think of it as the system responsible for generating the sequence of dates and times your trading strategy will be evaluated against.

Specifically, the `getTimeframe` function is how you request these dates and times. You tell it which asset you're trading (like "BTCUSDT") and what "frame" you're using (like "1h" for one-hour candles), and it returns an array of timestamps representing that timeframe. This function ensures the timestamps are spaced correctly, based on the interval you’ve set for your backtest.


## Interface IExecutionContext

The `IExecutionContext` interface holds important details about the current environment your trading strategy or exchange component is operating in. Think of it as a package of information passed along to help your code know what's happening. 

It includes the trading symbol, like "BTCUSDT", so you know what asset you're dealing with.

It also specifies the exact current timestamp, the "when," which is crucial for time-sensitive operations.

Finally, it tells you whether you're in a backtest scenario, simulating past data, or in a live trading environment. This lets your code behave differently depending on the mode.

## Interface IExchangeSchema

The `IExchangeSchema` defines how backtest-kit interacts with a specific cryptocurrency exchange. Think of it as a blueprint for connecting to and retrieving data from an exchange.

It requires a unique `exchangeName` to identify it and can include a helpful `note` for developers.

The core function is `getCandles`, which retrieves historical price data (candles) for a trading pair, specifying the time interval and how many candles you need.  You’ll also use it to specify if the data is intended for backtesting.

You can also customize how the framework handles trade quantities and prices with the optional `formatQuantity` and `formatPrice` functions, ensuring they comply with the exchange’s rules; otherwise, a default precision applies.

Fetching order book and aggregated trades are also possible with `getOrderBook` and `getAggregatedTrades` functions, which are optional but throw errors if not provided.

Finally, `callbacks` allow you to define functions that react to specific events, like when new candle data is available.

## Interface IExchangeParams

The `IExchangeParams` interface defines the necessary settings and functions needed to connect to and interact with a cryptocurrency exchange within the backtest-kit framework. It's essentially a blueprint for how your exchange connection will work.

You'll need to provide a logger for debugging purposes, and an execution context containing information like the trading symbol, timestamp, and whether the test is a backtest.

Crucially, you must implement several core functions:

*   `getCandles`:  This retrieves historical price data for a specific trading pair and timeframe.
*   `formatQuantity`:  This converts the amount of an asset you want to trade into the correct format the exchange expects.
*   `formatPrice`: This handles formatting the price you're setting for a trade to match the exchange's rules.
*   `getOrderBook`:  Allows you to fetch the current order book, showing the buy and sell orders at various price levels.
*   `getAggregatedTrades`: This function retrieves combined trade data for a specific trading pair over a given timeframe.

All of these functions need to be supplied when initializing the ClientExchange.

## Interface IExchangeCallbacks

This lets you react to new candlestick data arriving from the exchange. You can use it to get notified when data for a specific symbol and time interval is available, including the starting date and number of candles received. This callback provides the actual candle data, which you can then use for analysis or other purposes. It’s a way to stay updated with real-time price action.

## Interface IExchange

The `IExchange` interface defines how backtest-kit interacts with different cryptocurrency exchanges. It provides methods for retrieving historical and future price data (candles), calculating VWAP (volume-weighted average price), and formatting order quantities and prices to match the exchange's requirements. You can fetch candles going backward from the current time, or simulate future candles for backtesting purposes.

The framework also offers tools for getting the current average price, the closing price of the last candle, order book data, and aggregated trade history for a given trading pair. There’s even a flexible way to fetch raw candle data, allowing you to specify start and end dates or limits for the data you need, all while making sure the backtest doesn't accidentally peek into the future. This interface ensures consistent data access and formatting across various exchanges, simplifying the backtesting process.

## Interface IEntity

This interface, IEntity, serves as the foundation for all objects that are stored and managed within the backtest-kit framework. Think of it as a common starting point; anything that needs to be saved or retrieved will likely implement this interface. It ensures a consistent structure for entities, making it easier to work with them regardless of their specific type.

## Interface IDumpInstance

The `IDumpInstance` interface defines how to save different types of data during a backtesting process. Think of it as a way to record snapshots of what happened during a trade, allowing for detailed analysis and debugging later. 

You can use these methods to:

*   Save complete conversations between agents, which is useful for understanding decision-making.
*   Store simple key-value data records.
*   Save tabular data, like the output of calculations, organized into rows and columns.
*   Persist raw text or markdown content, such as explanations or summaries.
*   Record details about errors that occurred.
*   Save complex objects as formatted JSON.

Each of these methods receives the actual data to be saved and a unique identifier (dumpId) along with a brief description. The `dispose` method is used to clean up any resources this instance might be using when it’s no longer needed.

## Interface IDumpContext

The IDumpContext provides essential information for each data dump. It helps pinpoint where the data came from, associating it with a specific trading signal and a designated bucket, like a strategy or agent. Each dump gets a unique ID, and you can add a descriptive label to help understand its contents, especially useful for searching and documentation. Finally, a flag indicates whether the dump originates from a backtest or live trading environment.

## Interface ICommitRowBase

This interface, `ICommitRowBase`, acts as a foundation for events that need to be processed later, instead of immediately. Think of it as a way to hold onto information about a trade – like which asset was traded (`symbol`) – until the system is ready to fully handle it, especially when running a simulation (`backtest`). It’s essentially a placeholder to ensure things are done in the right order, regardless of whether you're live trading or running a test.

## Interface ICheckCandlesParams

This interface defines the information needed to check if candle data already exists in the system. It allows you to quickly verify if the framework has the required historical data for a specific trading pair, exchange, and time frame without having to read through all the files. You'll provide the symbol, exchange name, interval (like 1 minute or 4 hours), and a date range to specify what data you're looking for. Essentially, it's a way to see if your trading history is already stored before proceeding with a backtest.

## Interface ICandleData

The `ICandleData` interface represents a single candlestick, which is a standard building block for financial data. Each candlestick holds information about a specific time interval, including when it began (`timestamp`). 

You'll find the opening price (`open`), the highest price (`high`), the lowest price (`low`), and the closing price (`close`) all recorded within a candlestick. Volume (`volume`), representing the total trading activity during that timeframe, is also included. This data structure is essential for tasks like calculating Volume Weighted Average Prices (VWAP) and performing backtests of trading strategies.

## Interface ICacheCandlesParams

This interface defines the settings you can use when preparing cached historical data for backtesting. It lets you hook into key moments of the data preparation process – specifically, before the initial data validation and before the warm-up phase that follows if validation fails.

You can use `onWarmStart` to run code right before the system starts validating the initial data, and `onCheckStart` to run code before the warm-up process kicks in to fill any gaps found during validation. This allows you to log events, track progress, or perform other actions at these specific points in data loading.


## Interface IBroker

The `IBroker` interface defines how backtest-kit interacts with real-world brokers or exchanges. Think of it as a translator between the framework’s internal logic and the specific requirements of your trading platform.

This interface provides a set of methods that backtest-kit will call just before any trade-related action happens.  These actions include opening new positions, closing existing ones, setting take-profits, stop-losses, and more.  If anything goes wrong during these calls, the framework remains in its previous state, ensuring a reliable and predictable backtesting process.

Crucially, when running in backtest mode, these calls are ignored – the framework doesn't actually communicate with a live broker, preserving simulated trading conditions.

Here's a breakdown of what each method handles:

*   `waitForInit`:  This is the first method called, and it's your opportunity to establish the connection to the broker, load credentials, and prepare for trading.

*   `onSignalCloseCommit`: This method is invoked when a signal closes, whether through a take-profit, stop-loss, or manual intervention.

*   `onSignalOpenCommit`: Triggers when a new position is successfully entered.

*   `onPartialProfitCommit`: Handles the execution of a partial profit-taking order.

*   `onPartialLossCommit`: Handles the execution of a partial loss-taking order.

*   `onTrailingStopCommit`: Deals with adjustments to a trailing stop loss.

*   `onTrailingTakeCommit`: Handles changes to a trailing take-profit level.

*   `onBreakevenCommit`:  Manages updates to a breakeven stop-loss order.

*   `onAverageBuyCommit`: Handles entries related to a dollar-cost averaging (DCA) strategy.

By implementing this interface, you're essentially providing backtest-kit with the instructions to execute trades on your chosen platform.

## Interface IBreakevenData

This data structure holds simple information about whether a breakeven point has been achieved for a particular trading signal. It’s designed to be easily saved and loaded, particularly when dealing with persistent storage like a database. The `reached` property is a straightforward boolean value indicating if the breakeven target has been met, representing a simplified version of the more complex `IBreakevenState`. Think of it as a flag that gets saved to remember if a trade has already broken even.

## Interface IBreakevenCommitRow

This represents a single action taken during a backtest related to breakeven points. Specifically, it signifies a 'breakeven' action was triggered. It includes the price at which the breakeven level was established. Think of it as a record showing that a trade needed to reach a certain price to break even, and that price is what's recorded here.

## Interface IBreakeven

The `IBreakeven` interface helps keep track of when a trading signal’s stop-loss can be moved to the entry price, essentially breaking even on the trade. It’s used by different components within the system to manage this process.

The `check` method is how the system determines if breakeven has been achieved. It looks at the current price, transaction costs, and ensures breakeven hasn't already been triggered. If conditions are met, it records that breakeven is reached, sends out a notification, and saves that information. 

The `clear` method is used when a signal is finished – whether it hits a take profit, stop loss, or simply expires. It resets the breakeven tracking, updates any saved information, and cleans up resources.

## Interface IBidData

The `IBidData` interface represents a single bid or ask price point within the order book.  It describes what's happening at a particular price.  Each instance includes the `price` itself, which is stored as a string, and the `quantity` of assets available at that price, also represented as a string. This helps in understanding the depth and distribution of bids and asks.


## Interface IAverageBuyCommitRow

This interface represents a single step in a queued average-buy (also known as DCA) strategy. It tracks a purchase within a larger averaging process.

Each entry includes the action type, which will always be "average-buy" for this specific record.

It also records the price at which the purchase was made, the cost of that purchase in USD, and the total number of averaging entries accumulated up to that point. This information helps track the progress and cost of a DCA strategy.

## Interface IAggregatedTradeData

IAggregatedTradeData provides a snapshot of a single trade that happened. Think of it as a record detailing what happened during a transaction. 

Each record includes the trade’s unique identifier, the price at which it occurred, the amount of the asset that changed hands, and the exact time the trade took place. It also tells you whether the buyer was acting as a market maker, which helps understand the flow of the trade.

## Interface IActivityEntry

An ActivityEntry represents a single trading run, whether it's a backtest or a live trade. Think of it as a record keeping track of what's currently happening.

It's created when a trading process begins and automatically removed when it finishes, either successfully or with an error.

This entry includes the trading symbol (like BTCUSDT), details about the strategy being used (strategy and exchange names, and optionally the timeframe), and whether it's a backtest or a live trade.

The system uses these entries to manage and monitor ongoing tasks, and to help prevent multiple processes from running at the same time.

## Interface IActivateScheduledCommitRow

This interface represents a request to activate a previously scheduled commitment. Think of it as a signal that something that was planned to happen is now being triggered.

It includes a few key pieces of information:

*   `action`: This confirms that the action being requested is an activation of a scheduled commitment.
*   `signalId`: This identifies the specific signal associated with the activation.
*   `activateId`: This is an optional identifier that can be used when the activation is initiated by a user, providing additional context.

## Interface IActionStrategy

The `IActionStrategy` interface helps your action handlers (the parts of your code that execute trades) understand the current state of your trading signals. It gives them a way to check if a signal is currently active or if one is scheduled to appear in the future.

Think of it as a way for your actions to peek at the signal status before deciding whether to proceed.

Specifically, it provides two key checks:

*   `hasPendingSignal`: Determines if a trade is already open for a particular symbol.
*   `hasScheduledSignal`:  Checks if there’s a signal waiting to trigger in the future.

These checks help avoid unnecessary actions and ensure your system behaves as expected. The parameters passed to these methods include whether it’s a backtest, the symbol in question, and some identifying information about the strategy and exchange being used.

## Interface IActionSchema

The `IActionSchema` lets you extend your trading strategy with custom actions. Think of actions as hooks that allow you to react to specific events happening during a backtest or live trade. You can use them to log events, manage your strategy’s state, send notifications (like via Telegram), or even trigger other business logic.

Each action is created individually for each strategy and timeframe combination. This means every time your strategy runs, a fresh copy of the action is made, ensuring it has access to all the current event data.

To define an action, you’ll need to provide a unique name, a developer note (optional), a handler that defines the core logic, and potentially lifecycle callbacks to control when and how the action operates. This system gives you a lot of flexibility in tailoring your strategies.

## Interface IActionParams

This interface, IActionParams, defines the information passed to your actions when they're executed within the backtest-kit framework. Think of it as a package of data that gives your actions context about where and how they're running.

It includes essential details such as a logger for tracking what your action is doing, the name of the strategy and timeframe it belongs to, and whether it's running as a backtest.

Crucially, it provides the `strategy` object, which lets your actions access the current trading signals and positions. This allows actions to make decisions based on the state of the trading system.


## Interface IActionCallbacks

This section describes the lifecycle callbacks available for your action handlers, giving you fine-grained control over their behavior. Think of these callbacks as hooks that let you customize what happens during initialization, cleanup, and when certain events occur. All of these callbacks are optional, and can be implemented synchronously or asynchronously.

Here's a breakdown of what each one does:

*   **onInit:** This is called when your action handler is first set up.  Use it to set up resources like database connections, load initial data, or subscribe to any necessary services.
*   **onDispose:**  This callback fires when the action handler is being shut down. It’s perfect for cleaning up resources: closing connections, saving data, or unsubscribing from services.
*   **onSignal:** A general callback that receives signal events – it’s triggered during both backtesting and live trading.
*   **onSignalLive:** This specific callback is only triggered when the system is in live trading mode.
*   **onSignalBacktest:** Triggered only during backtesting runs.
*   **onBreakevenAvailable:**  Called when a breakeven point is reached (where your stop-loss moves to your entry price).
*   **onPartialProfitAvailable:**  This one triggers when a predefined partial profit level is achieved.
*   **onPartialLossAvailable:**  Similarly, this gets called when a predefined partial loss level is hit.
*   **onPingScheduled:**  This is a signal that a scheduled signal is being monitored.
*   **onPingActive:** Signals that a pending signal is active and being monitored.
*   **onPingIdle:**  Fires every tick when there's no pending signal activity.
*   **onRiskRejection:**  This callback informs you when a signal has been rejected by the risk management system.
*   **onSignalSync:** A special callback related to limit order execution. It allows you to approve or reject the framework's attempts to open or close a position. If you reject it, the framework will try again on the next tick. Crucially, any errors in this function are not swallowed – they'll be passed up, so handle them carefully.

## Interface IAction

The `IAction` interface is designed to help you manage and react to events happening within the backtest-kit framework. Think of it as a central hub for handling different types of updates – signals, profit/loss levels, risk assessments, and more – generated during both backtesting and live trading.

It provides a set of methods, each responding to a specific event type. You can implement custom logic to process these events, like updating a dashboard, logging activity, or even dispatching actions to a state management library like Redux.

There are separate methods for handling events during backtesting and live trading, allowing for tailored responses.  The `dispose` method is crucial for cleaning up and releasing resources when you’re finished with the action handler, making sure nothing hangs around unnecessarily.  The `signalSync` method offers a way to influence the framework's actions regarding limit orders – you can reject a trade, and the framework will attempt it again.

## Interface HighestProfitStatisticsModel

This model holds information about the events that resulted in the highest profits during a backtest. It keeps track of each individual event, listing them in chronological order with the most recent ones appearing first. You’ll also find the total number of these high-profit events recorded. This allows you to analyze and understand what factors contributed to those particularly successful trades.

## Interface HighestProfitEvent

This represents the single most profitable event observed for a specific trading position. It captures the key details surrounding that moment of peak profit.

You'll find information like the exact time (timestamp) it occurred, the trading pair involved (symbol), the strategy that generated the trade (strategyName), and a unique identifier for the signal (signalId). 

It also tells you whether the position was a long or short trade, along with detailed profit and loss data (pnl), including the highest profit (peakProfit) and maximum drawdown experienced. 

Additional data includes the price at which the peak profit was reached (currentPrice), the entry price (priceOpen), any configured take profit (priceTakeProfit) and stop loss (priceStopLoss) levels, and whether the event happened during a backtesting simulation (backtest).


## Interface HighestProfitContract

The `HighestProfitContract` provides information when a trading strategy reaches a new peak profit level. It gives you details like the trading symbol, the current price at that moment, and the exact time the highest profit was achieved. You'll also find context around the trade – including the strategy’s name, the exchange being used, the timeframe being analyzed (like 1-minute or 5-minute candles), and the signal that triggered the trade. A crucial flag lets you know if this profit update came from a historical backtest or a live trading session. This information allows you to build custom actions based on these profit milestones, such as automatically adjusting stop-loss orders or taking partial profits.

## Interface HeatmapStatisticsModel

This structure holds the overall performance statistics for your entire trading portfolio. It consolidates data from each individual symbol to give you a broad picture of how your portfolio is performing.

You'll find key metrics like total portfolio profit and loss, Sharpe Ratio, and total number of trades executed. It also provides insights into risk management, such as maximum drawdown and average peak profit.

The data also includes details about trade durations, win/loss streaks, and volatility, represented by the standard deviation. Several ratios like Sortino, Calmar, and Recovery Factor offer different perspectives on risk-adjusted returns. Finally, it summarizes expected yearly returns and a measure of trade frequency extrapolated over a year. Essentially, this provides a comprehensive summary of your portfolio’s behavior.

## Interface DoneContract

This interface describes what happens when a background process, either a backtest or a live trading session, finishes. It provides information about the execution, including which exchange was used, the name of the strategy that ran, and whether it was a backtest or live trade. You'll see this information when a background task is done, and it tells you details like the trading symbol involved (like BTCUSDT). Essentially, it’s a notification with key details about a completed trading run.

## Interface CronHandle

The CronHandle is like a little ticket you get when you set up a scheduled task (a cron job) within the backtest-kit framework. If you want to stop that task from running anymore, you simply discard this handle. Think of it as a way to easily cancel a recurring event. It's a quick and simple way to remove a scheduled task without needing to remember the exact details of how it was created.

## Interface CronEntry

A CronEntry lets you schedule code to run at specific times and intervals during a backtest.

Each entry needs a unique name to identify it, and that name can't contain a colon.

You also specify an interval, like "1m" for every minute, or leave it out to run the handler just once.

It's crucial to define which symbols the scheduled code will act upon using a symbol whitelist. An empty whitelist means the code runs globally for all symbols, while a list of symbols means it runs individually for each symbol in that list.

Finally, you provide a handler function – this is the code that actually gets executed when the conditions are met.

## Interface CriticalErrorNotification

This notification signals a critical error within the system that demands immediate attention and likely process termination. 

It’s a way to communicate serious problems that can't be ignored.

Each notification has a unique identifier, and includes a detailed error message to help understand what went wrong. 

You'll also find a serialized error object, complete with a stack trace and any relevant information attached. 

Importantly, these notifications always indicate that the error originated outside of a backtesting scenario.


## Interface ColumnModel

This interface helps you define how data is displayed in a table. Think of it as a blueprint for each column you want to show. 

You'll need to specify a unique `key` for each column, like its internal name.

A user-friendly `label` sets the text that appears as the column header.

The `format` function is where you customize how the actual data is converted into a readable string – this is super useful for dates, numbers, or any complex data.

Finally, `isVisible` lets you control whether a column is shown or hidden, potentially based on some dynamic condition.

## Interface ClosePendingCommitNotification

This notification signals that a pending trading signal has been closed before a full position was activated. It’s a way to understand why a signal didn’t result in a trade, and can be useful for debugging or understanding strategy behavior.

The notification contains detailed information about the closed signal, including a unique identifier, the time of the closure, and whether it occurred during backtesting or live trading. You’ll find details like the trading pair, strategy name, and the exchange involved.

Crucially, it provides a comprehensive breakdown of potential performance metrics, even though a full trade wasn't executed, like total profit & loss (pnl), peak profit, and maximum drawdown. It shows what *would have* been the case had the position been fully active. You can also see the entry and exit prices used in those calculations, and a textual note describing the reason for the closure. Lastly, timestamps for when the notification and signal were created are provided for context.

## Interface ClosePendingCommit

This event signals that a pending order has been closed. It includes details about the closure, such as a unique identifier for the reason behind it. You’ll also find comprehensive profit and loss information, including the total profit or loss for the entire trade, the highest profit achieved during the trade’s lifetime, and the largest drawdown experienced. This provides a clear picture of the trade's performance from initiation to closure.

## Interface CancelScheduledCommitNotification

This notification signals that a previously scheduled trading signal has been canceled before it was actually executed. It provides a wealth of information about the canceled signal, including a unique identifier, the timestamp of the cancellation, and whether it occurred in backtest or live mode. You’ll find details about the trading pair involved (like BTCUSDT), the strategy that generated the signal, and the exchange used.

The notification also includes a breakdown of the planned trade's parameters, like the number of entries and partial closes intended, and key performance indicators (KPIs) associated with the trade. These KPIs cover potential profit and loss, peak profit achieved, maximum drawdown experienced, and the relevant prices and costs for each.

Finally, a descriptive note field is available for adding custom information about the reason for the cancellation, alongside a timestamp marking the notification's creation time. This comprehensive data allows for detailed analysis of why signals were canceled and helps refine trading strategies.

## Interface CancelScheduledCommit

This interface defines a message used to cancel a previously scheduled signal event. Think of it as a way to retract a planned action. 

It includes a mandatory identifier, "cancel-scheduled," to specify the action being taken.

You can also provide an optional `cancelId` to give a reason for the cancellation, helpful for tracking and debugging.

The message also carries performance data related to the position that was being managed, including total profit and loss (`pnl`), the highest profit achieved (`peakProfit`), and the largest loss experienced (`maxDrawdown`). This gives context to why the cancellation might be happening.

## Interface BreakevenStatisticsModel

This model holds information about breakeven events encountered during a backtest.

It keeps track of every individual breakeven event, giving you access to all the details associated with each one.

You can also easily see the total number of breakeven events that occurred during the backtest using the `totalEvents` property. Essentially, it’s a way to monitor how often breakeven points are hit and analyze the specifics of each occurrence.


## Interface BreakevenEvent

This data structure represents a breakeven event, which is a key milestone in a trading strategy. It holds all the important details about when a trade reached its breakeven point – essentially, when it started to show a profit.

You'll find information like the exact time and date of the event, the trading symbol involved, the name of the strategy that generated the trade, and a unique identifier for the signal. 

It also includes crucial price points like the entry price, take profit target, stop loss levels, and even the original prices set when the signal was first created. If the strategy uses dollar-cost averaging (DCA), you’ll see details about the number of entries.  Furthermore, it tracks the profit and loss (PNL) at the breakeven point and any notes about the signal's rationale. Finally, it indicates whether the event occurred during a backtest or a live trading session, and the timestamps of when the position became active and the signal was scheduled.

## Interface BreakevenContract

This interface represents a breakeven event, which occurs when a trading signal's stop-loss is moved back to the entry price, indicating a reduction in risk. It's a way to track when a strategy has recovered its initial investment and potentially covered transaction costs.

You'll find details about the trading symbol, the strategy that generated the signal, the exchange used, and the timeframe involved. The event also includes the complete signal data, the current price at the time of breakeven, whether it's a backtest or live event, and a timestamp marking when it happened. This information is valuable for creating reports, setting up callbacks to notify you when breakeven events occur, and ensuring your trading strategy is behaving as expected.


## Interface BreakevenCommitNotification

This notification signals that a breakeven point has been reached and a commitment action has been executed, letting you know when a trade has broken even. It provides a wealth of information about the trade, including a unique identifier, the exact timestamp of the event, and whether it occurred during backtesting or live trading.

You'll find details about the trading symbol, the strategy involved, and the exchange used. The notification breaks down key prices like entry price, take profit, stop loss, and their original values before any trailing adjustments.

It also provides a comprehensive view of the trade's financial performance. You'll see the total profit and loss (pnl), peak profit, maximum drawdown, and performance metrics expressed both in absolute values and as percentages.  Details on the number of entries and partial closes are also provided.

Finally, the notification includes optional notes for context, plus timestamps related to the signal's scheduling and pending periods. This allows for a very detailed understanding of how the trade performed and the context around the breakeven commitment.

## Interface BreakevenCommit

This event signifies that a trade has reached a breakeven point, meaning it's now at the initial entry price.  It provides a snapshot of the trade's performance at that moment, including the current market price and overall profit and loss (PNL). You'll find information on how high the trade went (peak profit) and how much it lost at its worst point (max drawdown).

The event also details essential price information: the original entry price, the current take profit and stop loss prices (which may have been adjusted due to trailing), and the original values before any adjustments. Finally, it records when this signal was generated and when the trade was initially activated. This data allows for a comprehensive understanding of the trade’s journey up to the breakeven point.

## Interface BreakevenAvailableNotification

This notification signals that your trading position has reached a point where the stop-loss can be moved to breakeven – essentially, your initial entry price. It provides a wealth of information about the position, including its unique identifier, the exact time this event occurred, and whether it's from a backtest or live trading.

You'll find details on the trading pair involved (like BTCUSDT), the strategy that generated the signal, and the exchange where it was executed. It includes the current market price and the original entry price, along with all the important details of the position itself – direction (long or short), take profit and stop-loss prices, and information about any averaging or partial closes that occurred.

Beyond the immediate position details, you also receive a complete performance snapshot: total profit and loss (pnl), peak profit, maximum drawdown, percentages, and associated prices – all helping you understand the position's journey. Finally, there's a space for an optional note to provide context or explanation for the signal, along with timestamps for when the signal was created, pending, and this notification generated.

## Interface BeforeStartContract

This event lets you set up things that need to happen just once at the very beginning of each trading run, before any actual trading happens. Think of it as a preparation stage. You can use it for tasks like initializing log files, resetting counters that track performance, or even notifying someone that a new trading session has begun. 

Crucially, this event is always paired with an `AfterEndContract` event later on, ensuring that cleanup or finalization steps can always be triggered, even if the trading run is interrupted. Any errors that occur during this setup phase won't crash the entire run; instead, they'll be handled separately.

During backtesting, the `when` value represents the intended start time of the historical data you're replaying, while in live trading, it reflects the current time. You'll also have access to information like the trading symbol, the strategy's name, the exchange providing the data, and the current price, all readily available within this event.

## Interface BacktestStatisticsModel

This model provides a detailed breakdown of your backtest results, giving you a comprehensive view of your strategy's performance. It organizes key metrics, from the individual signal details to overall profitability and risk characteristics. You'll find information like the total number of trades, win/loss counts, and win rate, allowing you to quickly assess basic performance.

Deeper analysis is possible with metrics like average and total profit, standard deviation (measuring volatility), and Sharpe Ratio (a measure of risk-adjusted return). It also calculates annualized versions of these ratios for better comparison against benchmarks.

Beyond simple profit and loss, the model includes measurements of trade duration, drawdown characteristics (peak and fall PNL), and expectancy – an estimate of average profit per trade. 

Finally, it provides a breakdown of market pressure and trends, assessing not only whether your strategy is profitable but also how it behaves in different market conditions.  Many of these values can be null if the calculation is unreliable, so be mindful when interpreting them.

## Interface AverageBuyCommitNotification

This notification signals that a new averaging (DCA) entry has been added to an existing position. It provides a wealth of information about this specific averaging action, including a unique ID, when it happened, and whether it occurred during a backtest or in live trading. 

You’ll find details like the trading pair, the strategy that generated the signal, and the current price at which the new entry was executed. It also gives you the effective, or averaged, entry price after the new DCA purchase, along with the total number of DCA entries made so far. 

Beyond the immediate transaction, the notification includes performance data for the entire position, like total profit/loss (both in USD and as a percentage), peak profit, and maximum drawdown, along with the prices and costs associated with those events. You'll also find the original entry details, and several signals related to profit and loss calculations. Finally, there's an optional note field for a brief explanation of the signal's reasoning.

## Interface AverageBuyCommit

This describes an "average-buy" event, which happens when a new averaging buy is added to an existing position. It provides a snapshot of the position's state at the moment of this averaging buy.

The event tells you the price at which the averaging buy occurred, along with the cost of that particular buy. You'll also find the new, averaged entry price after incorporating this buy.

It includes important performance metrics: the unrealized profit and loss (pnl), the peak profit the position has ever achieved, and the maximum drawdown experienced.

You can also see details about the original trade, like the initial entry price and the original take profit and stop-loss levels, along with any adjustments made to those levels. Finally, timestamps are provided to indicate when the signal was created and when the position became active.


## Interface AfterEndContract

This interface, `AfterEndContract`, is a signal that's sent when a trading strategy has finished running. Think of it as a "job done" notification from the engine. It’s designed to let you perform cleanup tasks – like flushing data, closing files, or sending completion reports – that absolutely need to happen once per strategy execution.

You're guaranteed to receive this event exactly once for each start event, ensuring reliable teardown. If anything goes wrong during the cleanup process, any errors are handled internally, preventing disruption to your main application.

The `when` property, which indicates the time of the strategy’s completion, behaves differently depending on whether you’re running a backtest or live trading. During backtesting, it reflects the time of the last candle processed or the frame's start time if no candles were processed. In live trading, it's the current time, rounded down to the nearest minute.

The event also provides key details about the run, like the trading symbol (`symbol`), the name of the strategy used (`strategyName`), the exchange providing the data (`exchangeName`), the timeframe used (`frameName`), and whether it was a backtest (`backtest`). You’ll also find the average price observed at the end of the run (`currentPrice`) and its representation in milliseconds (`timestamp`).

## Interface ActivePingContract

The ActivePingContract represents updates happening while a pending signal is actively being monitored. Think of it as a heartbeat signal confirming the system is still tracking that signal.

These events are sent out every minute while a pending signal remains active, providing a consistent stream of information. They're specifically designed to help you build custom logic around how your trading system manages these pending signals.

Each ping contains a lot of details: the trading pair (symbol), the name of the strategy involved, the exchange being used, the timeframe of the data, and the complete signal data itself.  You'll also get the current price and a flag indicating whether the event is coming from a backtest or live trading environment.  The timestamp tells you precisely when the ping occurred, relevant to either live or historical candle data.  You can use these pings to react to conditions, like price changes, and dynamically adjust your trading strategy.

## Interface ActivateScheduledCommitNotification

This notification signals that a scheduled trading signal has been activated, meaning it's been put into action by the user. It contains a wealth of information about the trade, like a detailed report card for the potential position. You’ll find details like a unique ID for the notification, when it was triggered, and whether it's from a backtest or a live trading scenario.

It breaks down the specifics of the trade – the symbol being traded, the strategy that generated the signal, and the direction (long or short). You can see details about the entry price, take profit, and stop-loss levels, as well as how they might have been adjusted.  

The notification also provides a snapshot of the potential performance, including expected profit and loss, peak profit, and maximum drawdown, along with information on slippage and fees. It tracks DCA entries, partial closes, and even the original signal creation data. A final timestamp indicates when the notification was created for record-keeping.

## Interface ActivateScheduledCommit

This data structure represents an event triggered when a scheduled trading signal is activated. It contains a lot of information about the trade that's about to happen, or just happened. You’ll find details like the trade direction (long or short) and the prices involved - the entry price, take profit, stop loss, and their original values before any adjustments were made. 

It also includes performance metrics for the position, such as total profit and loss (PNL), peak profit, and maximum drawdown, reflecting how the trade has performed so far. A timestamp indicates when the signal was initially created and when the position was activated. A user-provided identifier, `activateId`, can be included for tracking and referencing specific activations. Finally, it includes the current market price at the moment of activation.

