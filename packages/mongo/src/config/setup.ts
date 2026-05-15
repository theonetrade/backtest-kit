import {
  CandleInterval,
  PersistCandleAdapter,
  PersistSignalAdapter,
  PersistRiskAdapter,
  PersistScheduleAdapter,
  PersistPartialAdapter,
  PersistBreakevenAdapter,
  PersistStorageAdapter,
  PersistNotificationAdapter,
  PersistLogAdapter,
  PersistMeasureAdapter,
  PersistIntervalAdapter,
  PersistMemoryAdapter,
  PersistRecentAdapter,
  PersistStateAdapter,
  PersistSessionAdapter,
} from "backtest-kit";
import PersistCandleInstance from "src/classes/PersistCandleInstance";
import PersistSignalInstance from "src/classes/PersistSignalInstance";
import PersistRiskInstance from "src/classes/PersistRiskInstance";
import PersistScheduleInstance from "src/classes/PersistScheduleInstance";
import PersistPartialInstance from "src/classes/PersistPartialInstance";
import PersistBreakevenInstance from "src/classes/PersistBreakevenInstance";
import PersistStorageInstance from "src/classes/PersistStorageInstance";
import PersistNotificationInstance from "src/classes/PersistNotificationInstance";
import PersistLogInstance from "src/classes/PersistLogInstance";
import PersistMeasureInstance from "src/classes/PersistMeasureInstance";
import PersistIntervalInstance from "src/classes/PersistIntervalInstance";
import PersistMemoryInstance from "src/classes/PersistMemoryInstance";
import PersistRecentInstance from "src/classes/PersistRecentInstance";
import PersistStateInstance from "src/classes/PersistStateInstance";
import PersistSessionInstance from "src/classes/PersistSessionInstance";

PersistCandleAdapter.usePersistCandleAdapter(PersistCandleInstance);
PersistSignalAdapter.usePersistSignalAdapter(PersistSignalInstance);
PersistRiskAdapter.usePersistRiskAdapter(PersistRiskInstance);
PersistScheduleAdapter.usePersistScheduleAdapter(PersistScheduleInstance);
PersistPartialAdapter.usePersistPartialAdapter(PersistPartialInstance);
PersistBreakevenAdapter.usePersistBreakevenAdapter(PersistBreakevenInstance);
PersistStorageAdapter.usePersistStorageAdapter(PersistStorageInstance);
PersistNotificationAdapter.usePersistNotificationAdapter(PersistNotificationInstance);
PersistLogAdapter.usePersistLogAdapter(PersistLogInstance);
PersistMeasureAdapter.usePersistMeasureAdapter(PersistMeasureInstance);
PersistIntervalAdapter.usePersistIntervalAdapter(PersistIntervalInstance);
PersistMemoryAdapter.usePersistMemoryAdapter(PersistMemoryInstance);
PersistRecentAdapter.usePersistRecentAdapter(PersistRecentInstance);
PersistStateAdapter.usePersistStateAdapter(PersistStateInstance);
PersistSessionAdapter.usePersistSessionAdapter(PersistSessionInstance);
