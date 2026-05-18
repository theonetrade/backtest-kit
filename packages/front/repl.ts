import { errorData, getErrorMessage, isObject } from "functools-kit";
import { createLogger } from "pinolog";
import { app } from "../config/app";
import { createRequire } from "node:module";
import { createContext, runInContext } from "vm";
import signal from "../lib/signal";
import wallet from "../lib/wallet";

const require = createRequire(import.meta.url);
const logger = createLogger(`http_repl.log`);

const context = createContext({
    signal,
    wallet,
    require,
});

interface EvalRequest {
  requestId: string;
  serviceName: string;
  data: {
    command: string;
  };
}

app.post("/eval", async (ctx) => {
  const request = await ctx.req.json<EvalRequest>();
  console.time(`/eval ${request.requestId}`);
  try {
    const output = await runInContext(request.data.command, context)
    const data = isObject(output) ? JSON.stringify(output, null, 2) : output;
    const result = {
      data,
      status: "ok",
      error: "",
      requestId: request.requestId,
      serviceName: request.serviceName,
    };
    logger.log("/eval ok", {
      request,
      result,
    });
    if ("error" in result && result.error) {
      throw new Error(result.error);
    }
    return ctx.json(result, 200);
  } catch (error) {
    logger.log("/eval error", {
      request,
      error: errorData(error),
    });
    return ctx.json(
      {
        status: "error",
        error: getErrorMessage(error),
        requestId: request.requestId,
        serviceName: request.serviceName,
      },
      200
    );
  } finally {
    console.timeEnd(`/eval ${request.requestId}`);
  }
});
