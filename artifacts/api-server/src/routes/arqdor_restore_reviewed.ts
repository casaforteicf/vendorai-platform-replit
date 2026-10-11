import { Router } from "express";
import { restoreConceptPayloadSchema } from "../lib/arqdor-recovery-validation.js";
import { restoreConceptWithAudit } from "../lib/arqdor-recovery-transaction.js";
import { authenticate } from "../middlewares/auth.js";

/** MULTI-04.3 staged router. Requires explicit flag and isolated DB validation. */
export const arqdorRestoreRouter = Router();
arqdorRestoreRouter.post("/arch/concept-projects/:id/restore-reviewed", authenticate, async (req, res) => {
  if (process.env.ARQDOR_RESTORE_ENABLED !== "true") {
    res.status(404).json({ error: "RESOURCE_NOT_FOUND" });
    return;
  }
  // A public preproject guest token must never authorize restoration.
  // Only explicit full-account platform sessions are considered.
  if (!req.user?.sub || !req.user?.tenantId ||
      !req.user?.platformRole || req.user.platformRole === "guest") {
    res.status(403).json({ error: "RESTORE_FULL_SESSION_REQUIRED" });
    return;
  }
  const payloadLength = Number(req.headers["content-length"] || "0");
  if (payloadLength > 2_000_000) {
    res.status(413).json({ error: "RESTORE_TOO_LARGE" });
    return;
  }
  const parsed = restoreConceptPayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "RESTORE_INVALID_REQUEST" });
    return;
  }
  const revision = new Date(parsed.data.expectedUpdatedAt);
  if (!Number.isFinite(revision.getTime())) {
    res.status(400).json({ error: "RESTORE_INVALID_REVISION" });
    return;
  }
  try {
    const result = await restoreConceptWithAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.sub,
      conceptId: String(req.params.id),
      operationId: parsed.data.operationId,
      expectedUpdatedAt: revision,
      rooms: parsed.data.rooms as any,
      openingOverrides: parsed.data.openingOverrides as any,
    });
    switch (result.status) {
      case "restored": res.status(200).json({ status: result.status, updatedAt: result.updatedAt }); return;
      case "already_applied": res.status(200).json({ status: result.status, updatedAt: result.updatedAt }); return;
      case "conflict": res.status(409).json({ error: "RESTORE_REVISION_CONFLICT" }); return;
      case "frozen": res.status(409).json({ error: "RESTORE_PROJECT_FROZEN" }); return;
      default: res.status(404).json({ error: "RESTORE_PROJECT_NOT_FOUND" }); return;
    }
  } catch {
    res.status(503).json({ error: "RESTORE_NOT_AVAILABLE" });
  }
});
