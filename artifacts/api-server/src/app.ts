import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use("/api", router);

// Global error handler — catches any unhandled async errors (Express 5 auto-forwards them)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? (err as { status: number }).status
      : typeof err === "object" && err !== null && "statusCode" in err
      ? (err as { statusCode: number }).statusCode
      : 500;

  const message =
    err instanceof Error ? err.message : "Erro interno no servidor";

  logger.error({ err }, "Unhandled route error");

  // Always return a safe 5xx for auth/permission errors that bubble up from SDKs
  const safeStatus = status === 401 || status === 403 ? 502 : Math.min(status, 599);

  res.status(safeStatus).json({ error: message });
});

export default app;
