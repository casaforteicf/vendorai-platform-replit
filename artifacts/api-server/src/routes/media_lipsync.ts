import { Router, type IRouter } from "express";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import {
  generateVendorAiLipSync,
  LipSyncConsentError,
  LipSyncEngineNotReadyError,
  LipSyncInputError,
} from "../services/vendorai-lipsync-engine.js";

const router: IRouter = Router();

router.use("/tenants/:tenantId/media-engine", requireSameTenanOrSuperAdmin());

router.post("/tenants/:tenantId/media-engine/identities/:identityId/lipsync", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const audioAssetId = typeof req.body?.audioAssetId === "string" ? req.body.audioAssetId.trim() : "";
  const title = typeof req.body?.title === "string" && req.body.title.trim()
    ? req.body.title.trim()
    : "Vídeo com pessoa autorizada";
  const bboxShift = Number(req.body?.bboxShift ?? 0);

  if (!audioAssetId) {
    res.status(422).json({ error: "audioAssetId é obrigatório" });
    return;
  }

  try {
    const result = await generateVendorAiLipSync({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId,
      audioAssetId,
      title,
      bboxShift,
    });
    res.status(201).json({ ...result, provider: "vendorai", operation: "avatar_lipsync" });
  } catch (error) {
    if (error instanceof LipSyncEngineNotReadyError) {
      res.status(503).json({ error: error.message, code: "LIPSYNC_WORKER_NOT_READY" });
      return;
    }
    if (error instanceof LipSyncConsentError) {
      res.status(403).json({
        error: error.message,
        code: "LIPSYNC_CONSENT_REQUIRED",
        missingScopes: error.missingScopes,
      });
      return;
    }
    if (error instanceof LipSyncInputError) {
      res.status(422).json({ error: error.message, code: "LIPSYNC_INPUT_INVALID" });
      return;
    }
    throw error;
  }
});

export default router;
