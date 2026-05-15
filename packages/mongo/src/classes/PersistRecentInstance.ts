import { RecentData, IPersistRecentInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInfra } from "../utils/waitForInfra";

export class PersistRecentInstance implements IPersistRecentInstance {
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
}

export default PersistRecentInstance;
