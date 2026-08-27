import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  // Railway exposes the source revision at runtime. Returning it as a header
  // makes a healthy-but-stale deployment observable without changing the
  // public response schema consumed by existing clients.
  res.setHeader(
    "X-VendorAI-Revision",
    process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      "unknown",
  );
  res.setHeader("X-VendorAI-Site-Generator", "quality-v2");
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;
