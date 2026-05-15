import { singleshot } from "functools-kit";
import ioc from "../lib";

export const waitForInfra = singleshot(
  async () => {
    await Promise.all([
      ioc.mongoService.waitForInit(),
      ioc.redisService.waitForInit(),
    ]);
  }
);
