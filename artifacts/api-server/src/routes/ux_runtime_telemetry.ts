import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool } from "@workspace/db";

const router: IRouter = Router();
const reportSchema = z.object({
  routeKey: z.string().min(1).max(120).regex(/^\/[a-zA-Z0-9/_-]*$/),
  errorKind: z.literal("react_render"),
}).strict();

// Mounted after authenticate + enforceAccessScope. Never trust a tenant ID
// from request payload; all identity derives from the verified JWT.
router.post("/ux/runtime-error", async (req, res) => {
  if (!req.user?.tenantId || req.user.accessScope && req.user.accessScope !== "tenant" ||
      req.user.actorType === "ai" || req.user.actorType === "system") {
    return res.status(403).json({ error: "TENANT_SESSION_REQUIRED" });
  }
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "INVALID_UX_REPORT" });
  try {
    await pool.query(
      `INSERT INTO ux_runtime_errors (tenant_id,route_key,error_kind,bucket_start)
       VALUES ($1,$2,$3,date_trunc('hour', now()))
       ON CONFLICT (tenant_id,route_key,error_kind,bucket_start)
       DO UPDATE SET occurrences=ux_runtime_errors.occurrences+1,last_seen_at=now()`,
      [req.user.tenantId, parsed.data.routeKey, parsed.data.errorKind],
    );
    return res.status(202).json({ accepted: true });
  } catch {
    // Telemetry failure cannot affect normal application traffic.
    return res.status(503).json({ error: "UX_TELEMETRY_UNAVAILABLE" });
  }
});

export default router;
