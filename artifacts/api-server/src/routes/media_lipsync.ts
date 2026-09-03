import { Router, type IRouter, type NextFunction, type Response } from "express";
import { pool } from "@workspace/db";
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
import {
  assertMediaAudioRightsForUsage,
  MediaRightsEnforcementError,
} from "../services/media-rights-enforcement.js";

const router: IRouter = Router();

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function enforcePaidMetaMediaRights(req: Express.Request, res: Response, next: NextFunction) {
  const tenantId = String(req.params["tenantId"]);
  const campaignId = String(req.params["id"]);

  try {
    const campaignResult = await pool.query(
      `SELECT
         c.plataforma,
         c.content_generation_id AS "contentGenerationId",
         c.segmentacao,
         cg.type AS "contentType",
         cg.result
       FROM ad_campaigns c
       LEFT JOIN content_generations cg
         ON cg.id = c.content_generation_id
        AND cg.tenant_id = c.tenant_id
       WHERE c.tenant_id = $1 AND c.id = $2
       LIMIT 1`,
      [tenantId, campaignId],
    );

    const campaign = campaignResult.rows[0] as {
      plataforma?: string;
      contentGenerationId?: string | null;
      segmentacao?: unknown;
      contentType?: string | null;
      result?: unknown;
    } | undefined;

    if (
      !campaign ||
      campaign.plataforma !== "meta" ||
      !campaign.contentGenerationId ||
      campaign.contentType !== "reels"
    ) {
      next();
      return;
    }

    const segmentacao = asRecord(campaign.segmentacao);
    const origemInstagram = asRecord(segmentacao["origemInstagram"]);
    const instagramMediaId = nonEmptyString(origemInstagram["mediaId"]);

    // O guard de áudio pago só se aplica quando a campanha reutiliza uma
    // publicação/Reel real do Instagram. Campanhas Meta de imagem e criativos
    // reconstruídos continuam no fluxo atual.
    if (!instagramMediaId) {
      next();
      return;
    }

    const publishedResult = await pool.query(
      `SELECT variation_index AS "variationIndex"
       FROM content_published_posts
       WHERE tenant_id = $1
         AND content_generation_id = $2
         AND instagram_media_id = $3
       ORDER BY published_at DESC
       LIMIT 1`,
      [tenantId, campaign.contentGenerationId, instagramMediaId],
    );

    if (!publishedResult.rowCount) {
      res.status(422).json({
        error: "Não foi possível confirmar qual versão audiovisual originou este Reel. Vincule novamente a publicação antes de patrocinar.",
        code: "MEDIA_AUDIO_PAID_ADS_SOURCE_UNVERIFIED",
      });
      return;
    }

    const variationIndex = Number(publishedResult.rows[0]?.variationIndex ?? 0);
    const result = asRecord(campaign.result);
    const variations = Array.isArray(result["variations"]) ? result["variations"] : [];
    const variation = asRecord(variations[variationIndex]);
    const videoUrl = nonEmptyString(variation["videoUrl"]);

    if (!videoUrl) {
      res.status(422).json({
        error: "O Reel patrocinado não possui a mídia original vinculada para validar os direitos da trilha.",
        code: "MEDIA_AUDIO_PAID_ADS_SOURCE_UNVERIFIED",
      });
      return;
    }

    await assertMediaAudioRightsForUsage({
      tenantId,
      mediaUrl: videoUrl,
      usage: "paid_ads",
    });

    next();
  } catch (error) {
    if (error instanceof MediaRightsEnforcementError) {
      res.status(error.status).json({
        error: error.message,
        code: error.code,
        details: error.details,
      });
      return;
    }
    next(error);
  }
}

// Este roteador é montado antes do adsRouter. Revalidamos a licença tanto ao
// publicar (campanha ainda pausada) quanto ao ativar, porque uma licença pode
// expirar ou ser revogada entre as duas ações.
router.post(
  "/tenants/:tenantId/ads/campaigns/:id/publicar",
  requireSameTenanOrSuperAdmin(),
  enforcePaidMetaMediaRights,
);
router.post(
  "/tenants/:tenantId/ads/campaigns/:id/ativar",
  requireSameTenanOrSuperAdmin(),
  enforcePaidMetaMediaRights,
);

router.use("/tenants/:tenantId/media-engine", requireSameTenanOrSuperAdmin());

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