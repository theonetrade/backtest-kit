import {
  CandleInterval,
  CandleData,
  RiskData,
  PartialData,
  BreakevenData,
  StorageData,
  NotificationData,
  LogData,
  MeasureData,
  MemoryData,
  IntervalData,
  RecentData,
  StateData,
  SessionData,
  ISignalRow,
  IScheduledSignalRow,
  PersistCandleAdapter,
  IPersistCandleInstance,
  PersistSignalAdapter,
  IPersistSignalInstance,
  PersistRiskAdapter,
  IPersistRiskInstance,
  PersistScheduleAdapter,
  IPersistScheduleInstance,
  PersistPartialAdapter,
  IPersistPartialInstance,
  PersistBreakevenAdapter,
  IPersistBreakevenInstance,
  PersistStorageAdapter,
  IPersistStorageInstance,
  PersistNotificationAdapter,
  IPersistNotificationInstance,
  PersistLogAdapter,
  IPersistLogInstance,
  PersistMeasureAdapter,
  IPersistMeasureInstance,
  PersistIntervalAdapter,
  IPersistIntervalInstance,
  PersistMemoryAdapter,
  IPersistMemoryInstance,
  PersistRecentAdapter,
  IPersistRecentInstance,
  PersistStateAdapter,
  IPersistStateInstance,
  PersistSessionAdapter,
  IPersistSessionInstance,
} from "backtest-kit";
import ioc from "../lib";
import { singleshot } from "functools-kit";

const MS_PER_MINUTE = 60_000;

const INTERVAL_MINUTES: Record<CandleInterval, number> = {
  "1m": 1,
  "3m": 3,
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
  "4h": 240,
  "6h": 360,
  "8h": 480,
  "1d": 1440,
};

const waitForInfra = singleshot(
  async () => {
    await Promise.all([
      ioc.mongoService.waitForInit(),
      ioc.redisService.waitForInit(),
    ]);
  }
);

PersistCandleAdapter.usePersistCandleAdapter(class implements IPersistCandleInstance {
  constructor(
    readonly symbol: string,
    readonly interval: CandleInterval,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async writeCandlesData(candles: CandleData[]): Promise<void> {
    for (const candle of candles) {
      await ioc.candleDbService.create({
        symbol: this.symbol,
        interval: this.interval,
        close: candle.close,
        high: candle.high,
        low: candle.low,
        open: candle.open,
        timestamp: candle.timestamp,
        volume: candle.volume,
      });
    }
  }
  async readCandlesData(limit: number, sinceTimestamp: number) {
    const stepMs = INTERVAL_MINUTES[this.interval] * MS_PER_MINUTE;
    const result: CandleData[] = [];
    for (let i = 0; i < limit; i++) {
      const ts = sinceTimestamp + i * stepMs;
      const row = await ioc.candleDbService.findBySymbolIntervalTimestamp(this.symbol, this.interval, ts);
      if (!row) {
        return null;
      }
      result.push({ timestamp: row.timestamp, open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume });
    }
    return result;
  }
});

PersistSignalAdapter.usePersistSignalAdapter(class implements IPersistSignalInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readSignalData(): Promise<ISignalRow | null> {
    const row = await ioc.signalDbService.findByContext(this.symbol, this.strategyName, this.exchangeName);
    return row ? row.payload : null;
  }
  async writeSignalData(signalRow: ISignalRow | null): Promise<void> {
    await ioc.signalDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalRow);
  }
});

PersistRiskAdapter.usePersistRiskAdapter(class implements IPersistRiskInstance {
  constructor(
    readonly riskName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readPositionData(_when: Date): Promise<RiskData> {
    const row = await ioc.riskDbService.findByContext(this.riskName, this.exchangeName);
    return row ? row.positions : [];
  }
  async writePositionData(positions: RiskData, when: Date): Promise<void> {
    await ioc.riskDbService.upsert(this.riskName, this.exchangeName, positions, when);
  }
});

PersistScheduleAdapter.usePersistScheduleAdapter(class implements IPersistScheduleInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readScheduleData(): Promise<IScheduledSignalRow | null> {
    const row = await ioc.scheduleDbService.findByContext(this.symbol, this.strategyName, this.exchangeName);
    return row ? row.payload : null;
  }
  async writeScheduleData(scheduleRow: IScheduledSignalRow | null): Promise<void> {
    await ioc.scheduleDbService.upsert(this.symbol, this.strategyName, this.exchangeName, scheduleRow);
  }
});

PersistPartialAdapter.usePersistPartialAdapter(class implements IPersistPartialInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readPartialData(signalId: string, _when: Date): Promise<PartialData> {
    const row = await ioc.partialDbService.findByContext(this.symbol, this.strategyName, this.exchangeName, signalId);
    return row ? row.payload : {};
  }
  async writePartialData(data: PartialData, signalId: string, when: Date): Promise<void> {
    await ioc.partialDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalId, data, when);
  }
});

PersistBreakevenAdapter.usePersistBreakevenAdapter(class implements IPersistBreakevenInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readBreakevenData(signalId: string, _when: Date): Promise<BreakevenData> {
    const row = await ioc.breakevenDbService.findByContext(this.symbol, this.strategyName, this.exchangeName, signalId);
    return row ? row.payload : {};
  }
  async writeBreakevenData(data: BreakevenData, signalId: string, when: Date): Promise<void> {
    await ioc.breakevenDbService.upsert(this.symbol, this.strategyName, this.exchangeName, signalId, data, when);
  }
});

PersistStorageAdapter.usePersistStorageAdapter(class implements IPersistStorageInstance {
  constructor(readonly backtest: boolean) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readStorageData(): Promise<StorageData> {
    const rows = await ioc.storageDbService.listByMode(this.backtest);
    return rows.map((row) => row.payload);
  }
  async writeStorageData(signals: StorageData): Promise<void> {
    for (const signal of signals) {
      await ioc.storageDbService.upsert(this.backtest, signal.id, signal);
    }
  }
});

PersistNotificationAdapter.usePersistNotificationAdapter(class implements IPersistNotificationInstance {
  constructor(readonly backtest: boolean) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readNotificationData(): Promise<NotificationData> {
    const rows = await ioc.notificationDbService.listByMode(this.backtest);
    return rows.map((row) => row.payload).reverse();
  }
  async writeNotificationData(notifications: NotificationData): Promise<void> {
    for (const notification of notifications) {
      await ioc.notificationDbService.upsert(this.backtest, notification.id, notification);
    }
  }
});

PersistLogAdapter.usePersistLogAdapter(class implements IPersistLogInstance {
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readLogData(): Promise<LogData> {
    const rows = await ioc.logDbService.listAll();
    return rows.map((row) => row.payload).reverse();
  }
  async writeLogData(entries: LogData): Promise<void> {
    for (const entry of entries) {
      await ioc.logDbService.upsert(entry.id, entry);
    }
  }
});

PersistMeasureAdapter.usePersistMeasureAdapter(class implements IPersistMeasureInstance {
  constructor(readonly bucket: string) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readMeasureData(key: string): Promise<MeasureData | null> {
    const row = await ioc.measureDbService.findByKey(this.bucket, key);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async writeMeasureData(data: MeasureData, key: string, _when: Date): Promise<void> {
    await ioc.measureDbService.upsert(this.bucket, key, data);
  }
  async removeMeasureData(key: string): Promise<void> {
    await ioc.measureDbService.softRemove(this.bucket, key);
  }
  async *listMeasureData(): AsyncGenerator<string> {
    const keys = await ioc.measureDbService.listKeys(this.bucket);
    for (const key of keys) {
      yield key;
    }
  }
});

PersistIntervalAdapter.usePersistIntervalAdapter(class implements IPersistIntervalInstance {
  constructor(readonly bucket: string) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readIntervalData(key: string): Promise<IntervalData | null> {
    const row = await ioc.intervalDbService.findByKey(this.bucket, key);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async writeIntervalData(data: IntervalData, key: string, when: Date): Promise<void> {
    await ioc.intervalDbService.upsert(this.bucket, key, data, when);
  }
  async removeIntervalData(key: string): Promise<void> {
    await ioc.intervalDbService.softRemove(this.bucket, key);
  }
  async *listIntervalData(): AsyncGenerator<string> {
    const keys = await ioc.intervalDbService.listKeys(this.bucket);
    for (const key of keys) {
      yield key;
    }
  }
});

PersistMemoryAdapter.usePersistMemoryAdapter(class implements IPersistMemoryInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readMemoryData(memoryId: string): Promise<MemoryData | null> {
    const row = await ioc.memoryDbService.findByMemoryId(this.signalId, this.bucketName, memoryId);
    if (!row || row.removed) {
      return null;
    }
    return row.payload;
  }
  async hasMemoryData(memoryId: string): Promise<boolean> {
    return await ioc.memoryDbService.hasMemoryEntry(this.signalId, this.bucketName, memoryId);
  }
  async writeMemoryData(data: MemoryData, memoryId: string, when: Date): Promise<void> {
    await ioc.memoryDbService.upsert(this.signalId, this.bucketName, memoryId, data, when);
  }
  async removeMemoryData(memoryId: string): Promise<void> {
    await ioc.memoryDbService.softRemove(this.signalId, this.bucketName, memoryId);
  }
  async *listMemoryData(): AsyncGenerator<{ memoryId: string; data: MemoryData }> {
    const rows = await ioc.memoryDbService.listEntries(this.signalId, this.bucketName);
    for (const row of rows) {
      yield { memoryId: row.memoryId, data: row.payload };
    }
  }
  dispose(): void { void 0; }
});

PersistRecentAdapter.usePersistRecentAdapter(class implements IPersistRecentInstance {
  constructor(
    readonly symbol: string,
    readonly strategyName: string,
    readonly exchangeName: string,
    readonly frameName: string,
    readonly backtest: boolean,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readRecentData(): Promise<RecentData> {
    const row = await ioc.recentDbService.findByContext(
      this.symbol,
      this.strategyName,
      this.exchangeName,
      this.frameName,
      this.backtest,
    );
    return row ? row.payload : null;
  }
  async writeRecentData(signalRow: NonNullable<RecentData>, when: Date): Promise<void> {
    await ioc.recentDbService.upsert(
      this.symbol,
      this.strategyName,
      this.exchangeName,
      this.frameName,
      this.backtest,
      signalRow,
      when,
    );
  }
});

PersistStateAdapter.usePersistStateAdapter(class implements IPersistStateInstance {
  constructor(
    readonly signalId: string,
    readonly bucketName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readStateData(): Promise<StateData | null> {
    const row = await ioc.stateDbService.findByContext(this.signalId, this.bucketName);
    return row ? row.payload : null;
  }
  async writeStateData(data: StateData, when: Date): Promise<void> {
    await ioc.stateDbService.upsert(this.signalId, this.bucketName, data, when);
  }
  dispose(): void { void 0; }
});

PersistSessionAdapter.usePersistSessionAdapter(class implements IPersistSessionInstance {
  constructor(
    readonly strategyName: string,
    readonly exchangeName: string,
    readonly frameName: string,
  ) {}
  async waitForInit(initial: boolean) {
    if (!initial) {
      return;
    }
    await waitForInfra();
  }
  async readSessionData(): Promise<SessionData | null> {
    const row = await ioc.sessionDbService.findByContext(this.strategyName, this.exchangeName, this.frameName);
    return row ? row.payload : null;
  }
  async writeSessionData(data: SessionData, when: Date): Promise<void> {
    await ioc.sessionDbService.upsert(this.strategyName, this.exchangeName, this.frameName, data, when);
  }
  dispose(): void { void 0; }
});
