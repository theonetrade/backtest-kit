import { singleshot } from "functools-kit";
import { Redis } from "ioredis";
import {
  CC_REDIS_HOST,
  CC_REDIS_PASSWORD,
  CC_REDIS_PORT,
  CC_REDIS_USER,
} from "./params";

export const getRedis = singleshot(() => {
  const redis = new Redis({
    host: CC_REDIS_HOST,
    port: CC_REDIS_PORT,
    username: CC_REDIS_USER,
    password: CC_REDIS_PASSWORD,
  });

  setInterval(async () => {
    await redis.ping();
  }, 30000);

  process.on("SIGINT", async () => {
    await redis.disconnect(false);
  });

  return redis;
});
