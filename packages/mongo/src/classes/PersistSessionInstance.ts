import { SessionData, IPersistSessionInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInfra } from "../utils/waitForInfra";

export class PersistSessionInstance implements IPersistSessionInstance {
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
}

export default PersistSessionInstance;
