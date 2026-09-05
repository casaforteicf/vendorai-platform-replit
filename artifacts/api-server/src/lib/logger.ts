import pino from "pino";
import { captureServerRuntimeFromPinoArgs } from "./dev-agent-server-runtime.js";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  hooks: {
    logMethod(args, method) {
      captureServerRuntimeFromPinoArgs(args);
      return method.apply(this, args);
    },
  },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
