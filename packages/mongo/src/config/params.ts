declare function parseInt(value: unknown): number;

export const CC_REDIS_HOST = process.env.CC_REDIS_HOST || "127.0.0.1";
export const CC_REDIS_PORT = parseInt(process.env.CC_REDIS_PORT) || 6379;
export const CC_REDIS_USER = process.env.CC_REDIS_USER || "default";
export const CC_REDIS_PASSWORD = process.env.CC_REDIS_PASSWORD || "mysecurepassword";

export const CC_MONGO_CONNECTION_STRING = process.env.CC_MONGO_CONNECTION_STRING || "mongodb://localhost:27017/backtest-pro?wtimeoutMS=15000";
