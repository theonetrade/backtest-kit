import micro from "micro";
import Router from "router";
import { createRequire } from "node:module";
import { createContext, runInContext } from "vm";
import { errorData, getErrorMessage, isObject } from "functools-kit";
import * as BacktestKit from "backtest-kit";

import { ioc } from "../lib";

const require = createRequire(import.meta.url);

const router = Router({
  params: true,
});

const context = createContext({
  BacktestKitUi: ioc,
  BacktestKit,
  require,
});

interface EvalRequest {
  clientId: string;
  serviceName: string;
  userId: string;
  requestId: string;
  data: {
    command: string;
  };
}

router.post("/api/v1/repl/eval", async (req, res) => {
  const request = <EvalRequest>await micro.json(req);
  const { requestId, serviceName } = request;
  try {
    const output = await runInContext(request.data.command, context);
    const data = isObject(output) ? JSON.stringify(output, null, 2) : output;
    const result = {
      data,
      status: "ok",
      error: "",
      requestId,
      serviceName,
    };
    ioc.loggerService.log("/api/v1/repl/eval ok", {
      request,
      result,
    });
    return await micro.send(res, 200, result);
  } catch (error) {
    ioc.loggerService.log("/api/v1/repl/eval error", {
      request,
      error: errorData(error),
    });
    return await micro.send(res, 200, {
      status: "error",
      error: getErrorMessage(error),
      requestId,
      serviceName,
    });
  }
});

export default router;
