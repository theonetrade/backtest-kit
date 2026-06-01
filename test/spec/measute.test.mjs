import { test } from "worker-testbed";

import { lib } from "../../build/index.mjs";

// Real backtest output: 22 closed signals (TRXUSDT / jan_2026_strategy).
// Imported as a JSON module via import-assertion syntax.
import signals from "../data/backtest_1.json" with { type: "json" };

const SYMBOL = "TRXUSDT";
const STRATEGY = "jan_2026_strategy";
const EXCHANGE = "ccxt-exchange";
const FRAME = "jan_2026_frame";

/**
 * Maps a persisted ISignalRow (as stored in backtest_1.json) into the
 * IStrategyTickResultClosed shape that BacktestMarkdownService.tick() consumes.
 * The service only reads: action, signal, closeTimestamp, pnl, symbol,
 * strategyName, exchangeName, frameName. We supply updatedAt as the close time.
 */
const toClosedTick = (row) => ({
  action: "closed",
  signal: row,
  currentPrice: row.pnl?.priceClose ?? row.priceOpen,
  closeReason: "take_profit",
  closeTimestamp: row.updatedAt,
  pnl: row.pnl,
  strategyName: STRATEGY,
  exchangeName: EXCHANGE,
  frameName: FRAME,
  symbol: SYMBOL,
  backtest: true,
  createdAt: row.updatedAt,
});

// ---- Reference implementation of the metrics, computed independently here so
// ---- the test verifies the service's math against a second source of truth.
const computeReference = (rows) => {
  const valid = rows.filter(
    (r) =>
      typeof r.pendingAt === "number" && r.pendingAt > 0 &&
      typeof r.updatedAt === "number" && r.updatedAt > 0
  );
  const n = valid.length;
  const returns = valid.map((r) => r.pnl.pnlPercentage);
  const winCount = returns.filter((r) => r > 0).length;
  const lossCount = returns.filter((r) => r < 0).length;
  const avgPnl = returns.reduce((a, b) => a + b, 0) / n;
  const totalPnl = returns.reduce((a, b) => a + b, 0);
  const winRate = (winCount / (winCount + lossCount)) * 100;
  const stdDev = Math.sqrt(
    returns.reduce((s, r) => s + (r - avgPnl) ** 2, 0) / (n - 1)
  );
  const sharpe = stdDev > 0 ? avgPnl / stdDev : null;

  const firstPend = Math.min(...valid.map((r) => r.pendingAt));
  const lastClose = Math.max(...valid.map((r) => r.updatedAt));
  const spanDays = (lastClose - firstPend) / (1000 * 60 * 60 * 24);
  const tradesPerYear = (n / spanDays) * 365;
  const annualizedSharpe = sharpe * Math.sqrt(tradesPerYear);

  return { n, winCount, lossCount, avgPnl, totalPnl, winRate, stdDev, sharpe, annualizedSharpe, spanDays, tradesPerYear };
};

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test("Statistical metrics match independent reference (real backtest_1.json)", async ({ pass, fail }) => {
  const svc = lib.backtestMarkdownService;

  // getData() throws unless subscribed. Subscribe is singleshot + idempotent.
  svc.subscribe();

  // Emulate a backtest run: clear any prior state for this combo, then feed
  // every closed signal through tick() exactly as the live emitter would.
  await svc.clear({ symbol: SYMBOL, strategyName: STRATEGY, exchangeName: EXCHANGE, frameName: FRAME, backtest: true });
  for (const row of signals) {
    await svc.tick(toClosedTick(row));
  }

  const stats = await svc.getData(SYMBOL, STRATEGY, EXCHANGE, FRAME, true);
  const ref = computeReference(signals);

  // --- basic counts ---
  if (stats.totalSignals !== ref.n) {
    fail(`totalSignals: service=${stats.totalSignals} ref=${ref.n}`);
    return;
  }
  if (stats.winCount !== ref.winCount || stats.lossCount !== ref.lossCount) {
    fail(`win/loss: service=${stats.winCount}/${stats.lossCount} ref=${ref.winCount}/${ref.lossCount}`);
    return;
  }

  // --- win rate ---
  if (typeof stats.winRate !== "number" || !approx(stats.winRate, ref.winRate, 1e-9)) {
    fail(`winRate: service=${stats.winRate} ref=${ref.winRate}`);
    return;
  }

  // --- avg / total pnl ---
  if (!approx(stats.avgPnl, ref.avgPnl, 1e-9)) {
    fail(`avgPnl: service=${stats.avgPnl} ref=${ref.avgPnl}`);
    return;
  }
  if (!approx(stats.totalPnl, ref.totalPnl, 1e-9)) {
    fail(`totalPnl: service=${stats.totalPnl} ref=${ref.totalPnl}`);
    return;
  }

  // --- std dev (sample, N-1) ---
  if (stats.stdDev === null || stats.stdDev < 0 || !approx(stats.stdDev, ref.stdDev, 1e-9)) {
    fail(`stdDev: service=${stats.stdDev} ref=${ref.stdDev}`);
    return;
  }

  // --- Sharpe ratio = avgPnl / stdDev (rf=0) ---
  if (stats.sharpeRatio === null || !approx(stats.sharpeRatio, ref.sharpe, 1e-9)) {
    fail(`sharpeRatio: service=${stats.sharpeRatio} ref=${ref.sharpe}`);
    return;
  }

  // --- Annualized Sharpe = sharpe * sqrt(tradesPerYear) ---
  // 22 signals over ~26.7 days, ~301 trades/yr (< 365 cap) => annualization is gated ON.
  if (stats.annualizedSharpeRatio === null || !approx(stats.annualizedSharpeRatio, ref.annualizedSharpe, 1e-6)) {
    fail(`annualizedSharpe: service=${stats.annualizedSharpeRatio} ref=${ref.annualizedSharpe}`);
    return;
  }

  // --- Certainty ratio: avgWin / |avgLoss|, must be a positive finite number here ---
  if (stats.certaintyRatio === null || !(stats.certaintyRatio > 0)) {
    fail(`certaintyRatio should be positive finite, got ${stats.certaintyRatio}`);
    return;
  }

  pass(
    `Metrics verified vs reference: n=${stats.totalSignals}, ` +
    `winRate=${stats.winRate.toFixed(2)}% (${stats.winCount}W/${stats.lossCount}L), ` +
    `avgPnl=${stats.avgPnl.toFixed(3)}%, totalPnl=${stats.totalPnl.toFixed(2)}%, ` +
    `stdDev=${stats.stdDev.toFixed(3)}, sharpe=${stats.sharpeRatio.toFixed(4)}, ` +
    `annSharpe=${stats.annualizedSharpeRatio.toFixed(3)}, ` +
    `certainty=${stats.certaintyRatio.toFixed(3)} ` +
    `(span=${ref.spanDays.toFixed(1)}d, ~${ref.tradesPerYear.toFixed(0)} trades/yr)`
  );
});
