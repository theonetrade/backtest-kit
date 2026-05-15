import { StateData, IPersistStateInstance } from "backtest-kit";
import ioc from "../lib";
import { waitForInfra } from "../utils/waitForInfra";

export class PersistStateInstance implements IPersistStateInstance {
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
}

export default PersistStateInstance;
