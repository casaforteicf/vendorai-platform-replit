import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function healthcheck(_req: Request, res: Response) {
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
}

router.get("/healthz", healthcheck);

// Infra healthchecks do not carry a tenant or browser Authorization header.
// The app's tenant-domain resolver explicitly bypasses /auth/* before routing,
// so this alias lets Railway verify the API process itself instead of being
// mistaken for an unknown tenant. Keep /healthz for backward compatibility.
router.get("/auth/healthz", healthcheck);

export default router;
