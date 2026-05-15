import { LogData, IPersistLogInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInfra } from "../utils/waitForInfra";

export class PersistLogInstance implements IPersistLogInstance {
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
}

export default PersistLogInstance;
