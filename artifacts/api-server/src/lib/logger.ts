import pino from "pino";
import { captureServerRuntimeFromPinoArgs } from "./dev-agent-server-runtime.js";

const isProduction = process.env.NODE_ENV === "production";

// Production trust guard: vehicle lookup must never silently fall back to the
// deterministic mock provider. The service still keeps MockVehicleProvider for
// local development/tests, but a production process refuses to start unless
// the official provider is explicitly selected.
if (
  isProduction &&
  (process.env.VEHICLE_LOOKUP_PROVIDER ?? "").trim().toLowerCase() !== "senatran"
) {
  throw new Error(
    'Production requires VEHICLE_LOOKUP_PROVIDER="senatran"; mock vehicle lookup is forbidden.',
  );
}

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
