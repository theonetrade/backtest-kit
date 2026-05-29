import { ISignalDto } from "../interfaces/Strategy.interface";
import validateCommonSignal from "./validateCommonSignal";
import { getErrorMessage } from "functools-kit";

/**
 * Validates ISignalDto returned by getSignal, branching on the same logic as ClientStrategy GET_SIGNAL_FN.
 *
 * When priceOpen is provided:
 *   - If currentPrice already reached priceOpen (shouldActivateImmediately) →
 *     validates as pending: currentPrice must be between SL and TP
 *   - Otherwise → validates as scheduled: priceOpen must be between SL and TP
 *
 * When priceOpen is absent:
 *   - Validates as pending: currentPrice must be between SL and TP
 *
 * Checks:
 * - currentPrice is a finite positive number
 * - Common signal fields via validateCommonSignal (position, prices, TP/SL relationships, minuteEstimatedTime)
 * - Position-specific immediate-close protection (pending) or activation-close protection (scheduled)
 *
 * @param signal - Signal DTO returned by getSignal
 * @param currentPrice - Current market price at the moment of signal creation
 * @returns true if signal is valid, false if validation errors were found (errors logged to console.error)
 */
export const validateSignal = (signal: ISignalDto, currentPrice: number): boolean => {
  const errors: string[] = [];

  // ЗАЩИТА ОТ NaN/Infinity: currentPrice должна быть конечным числом
  {
    if (typeof currentPrice !== "number") {
      errors.push(
        `currentPrice must be a number type, got ${currentPrice} (${typeof currentPrice})`
      );
    }
    if (!isFinite(currentPrice)) {
      errors.push(
        `currentPrice must be a finite number, got ${currentPrice} (${typeof currentPrice})`
      );
    }
    if (isFinite(currentPrice) && currentPrice <= 0) {
      errors.push(`currentPrice must be positive, got ${currentPrice}`);
    }
  }

  if (errors.length > 0) {
    console.error(`Invalid signal for ${signal.position} position (${signal.symbol || "empty symbol"}):\n${errors.join("\n")}`);
    return false;
  }

  try {
    validateCommonSignal(signal);
  } catch (error) {
    console.error(getErrorMessage(error));
    return false;
  }

  // Определяем режим валидации по той же логике что в GET_SIGNAL_FN:
  // - нет priceOpen → pending (открывается по currentPrice)
  // - priceOpen задан и уже достигнут (shouldActivateImmediately) → pending
  // - priceOpen задан и ещё не достигнут → scheduled
  const hasPriceOpen = signal.priceOpen !== undefined;

  const shouldActivateImmediately = hasPriceOpen && (
    (signal.position === "long" && currentPrice <= signal.priceOpen) ||
    (signal.position === "short" && currentPrice >= signal.priceOpen)
  );

  const isScheduled = hasPriceOpen && !shouldActivateImmediately;

  if (isScheduled) {
    // Scheduled: priceOpen должен быть между SL и TP (активация не даст моментального закрытия)
    if (signal.position === "long") {
      if (isFinite(signal.priceOpen)) {
        if (signal.priceOpen <= signal.priceStopLoss) {
          errors.push(
            `Long scheduled: priceOpen (${signal.priceOpen}) <= priceStopLoss (${signal.priceStopLoss}). ` +
              `Signal would be immediately cancelled on activation. Cannot activate position that is already stopped out.`
          );
        }
        if (signal.priceOpen >= signal.priceTakeProfit) {
          errors.push(
            `Long scheduled: priceOpen (${signal.priceOpen}) >= priceTakeProfit (${signal.priceTakeProfit}). ` +
              `Signal would close immediately on activation. This is logically impossible for LONG position.`
          );
        }
      }
    }

    if (signal.position === "short") {
      if (isFinite(signal.priceOpen)) {
        if (signal.priceOpen >= signal.priceStopLoss) {
          errors.push(
            `Short scheduled: priceOpen (${signal.priceOpen}) >= priceStopLoss (${signal.priceStopLoss}). ` +
              `Signal would be immediately cancelled on activation. Cannot activate position that is already stopped out.`
          );
        }
        if (signal.priceOpen <= signal.priceTakeProfit) {
          errors.push(
            `Short scheduled: priceOpen (${signal.priceOpen}) <= priceTakeProfit (${signal.priceTakeProfit}). ` +
              `Signal would close immediately on activation. This is logically impossible for SHORT position.`
          );
        }
      }
    }
  } else {
    // Pending: currentPrice должна быть между SL и TP (позиция не закроется сразу после открытия)
    if (signal.position === "long") {
      if (isFinite(currentPrice)) {
        if (currentPrice <= signal.priceStopLoss) {
          errors.push(
            `Long immediate: currentPrice (${currentPrice}) <= priceStopLoss (${signal.priceStopLoss}). ` +
              `Signal would be immediately closed by stop loss. Cannot open position that is already stopped out.`
          );
        }
        if (currentPrice >= signal.priceTakeProfit) {
          errors.push(
            `Long immediate: currentPrice (${currentPrice}) >= priceTakeProfit (${signal.priceTakeProfit}). ` +
              `Signal would be immediately closed by take profit. The profit opportunity has already passed.`
          );
        }
      }
    }

    if (signal.position === "short") {
      if (isFinite(currentPrice)) {
        if (currentPrice >= signal.priceStopLoss) {
          errors.push(
            `Short immediate: currentPrice (${currentPrice}) >= priceStopLoss (${signal.priceStopLoss}). ` +
              `Signal would be immediately closed by stop loss. Cannot open position that is already stopped out.`
          );
        }
        if (currentPrice <= signal.priceTakeProfit) {
          errors.push(
            `Short immediate: currentPrice (${currentPrice}) <= priceTakeProfit (${signal.priceTakeProfit}). ` +
              `Signal would be immediately closed by take profit. The profit opportunity has already passed.`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Invalid signal for ${signal.position} position (${signal.symbol || "empty symbol"}):\n${errors.join("\n")}`);
  }

  return !errors.length;
};

export default validateSignal;
