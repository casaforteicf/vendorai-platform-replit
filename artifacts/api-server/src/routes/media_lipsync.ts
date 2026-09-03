import { Router, type IRouter, type Response } from "express";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import {
  generateVendorAiLipSync,
  LipSyncConsentError,
  LipSyncEngineNotReadyError,
  LipSyncInputError,
} from "../services/vendorai-lipsync-engine.js";
import {
  synthesizeVendorAiVoice,
  VoiceConsentError,
  VoiceEngineNotReadyError,
  VoiceProfileInvalidError,
} from "../services/vendorai-voice-engine.js";

const router: IRouter = Router();

router.use("/tenants/:tenantId/media-engine", requireSameTenanOrSuperAdmin());

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sendLipSyncError(res: Response, error: unknown): boolean {
  if (error instanceof LipSyncEngineNotReadyError) {
    res.status(503).json({ error: error.message, code: "LIPSYNC_WORKER_NOT_READY" });
    return true;
  }
  if (error instanceof LipSyncConsentError) {
    res.status(403).json({
      error: error.message,
      code: "LIPSYNC_CONSENT_REQUIRED",
      missingScopes: error.missingScopes,
    });
    return true;
  }
  if (error instanceof LipSyncInputError) {
    res.status(422).json({ error: error.message, code: "LIPSYNC_INPUT_INVALID" });
    return true;
  }
  return false;
}

router.post("/tenants/:tenantId/media-engine/identities/:identityId/lipsync", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const audioAssetId = nonEmptyString(req.body?.audioAssetId) ?? "";
  const title = nonEmptyString(req.body?.title) ?? "Vídeo com pessoa autorizada";
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
    if (sendLipSyncError(res, error)) return;
    throw error;
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/talking-video", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const voiceProfileId = nonEmptyString(req.body?.voiceProfileId);
  const text = nonEmptyString(req.body?.text);
  const language = nonEmptyString(req.body?.language) ?? "pt-br";
  const title = nonEmptyString(req.body?.title) ?? "Vídeo com pessoa autorizada";
  const bboxShift = Number(req.body?.bboxShift ?? 0);

  if (!voiceProfileId || !text) {
    res.status(422).json({ error: "voiceProfileId e text são obrigatórios" });
    return;
  }
  if (text.length > 5000) {
    res.status(422).json({ error: "text deve ter até 5000 caracteres" });
    return;
  }

  try {
    const voiceResult = await synthesizeVendorAiVoice({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId,
      voiceProfileId,
      text,
      language,
      title: `Narração — ${title}`,
    });

    const videoResult = await generateVendorAiLipSync({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId,
      audioAssetId: voiceResult.assetId,
      title,
      bboxShift,
    });

    res.status(201).json({
      provider: "vendorai",
      operation: "talking_video",
      identityId,
      voiceProfileId,
      voice: {
        projectId: voiceResult.projectId,
        jobId: voiceResult.jobId,
        assetId: voiceResult.assetId,
        versionId: voiceResult.versionId,
        audioUrl: voiceResult.audioUrl,
      },
      video: videoResult,
    });
  } catch (error) {
    if (error instanceof VoiceEngineNotReadyError) {
      res.status(503).json({ error: error.message, code: "VOICE_WORKER_NOT_READY" });
      return;
    }
    if (error instanceof VoiceConsentError) {
      res.status(403).json({ error: error.message, code: "VOICE_CONSENT_REQUIRED", missingScopes: error.missingScopes });
      return;
    }
    if (error instanceof VoiceProfileInvalidError) {
      res.status(422).json({ error: error.message, code: "VOICE_PROFILE_INVALID" });
      return;
    }
    if (sendLipSyncError(res, error)) return;
    throw error;
  }
});

export default router;
