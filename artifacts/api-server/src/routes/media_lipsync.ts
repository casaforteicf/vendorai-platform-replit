import { Router, type IRouter, type Request, type NextFunction, type Response } from "express";
import { pool } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { generateVendorAiLipSyncWithQualityGate as generateVendorAiLipSync } from "../services/vendorai-lipsync-quality.js";
import {
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
import {
  analyzeMediaImage,
  ImageAdvisorValidationError,
} from "../services/vendorai-image-advisor.js";
import { analyzeVendorAiIdentityReferencesWithVersion as analyzeVendorAiIdentityReferences } from "../services/vendorai-duble-versioning.js";
import { saveVendorAiDubleEvaluation } from "../services/vendorai-identity-quality.js";
import { createVendorAiDiverseStyleReference as createVendorAiDubleStyleReference } from "../services/vendorai-duble-diversity.js";
import {
  DubleStyleConsentError,
  DubleStyleValidationError,
  getDubleStyleCatalog,
  getVendorAiDubleStyleProfile,
  saveVendorAiDubleFavorite,
  type DubleStyleSelection,
  type DubleStyleSelectionInput,
} from "../services/vendorai-duble-style.js";

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

function parseDubleStyle(value: unknown): DubleStyleSelectionInput | null {
  const source = asRecord(value);
  if (!Object.keys(source).length) return null;
  const style: DubleStyleSelectionInput = {};
  const market = nonEmptyString(source["market"]);
  const scenario = nonEmptyString(source["scenario"]);
  const outfit = nonEmptyString(source["outfit"]);
  const framing = nonEmptyString(source["framing"]);
  const pose = nonEmptyString(source["pose"]);
  const lighting = nonEmptyString(source["lighting"]);
  if (market) style.market = market as DubleStyleSelectionInput["market"];
  if (scenario) style.scenario = scenario;
  if (outfit) style.outfit = outfit;
  if (framing) style.framing = framing;
  if (pose) style.pose = pose;
  if (lighting) style.lighting = lighting;
  if (typeof source["antiRepeat"] === "boolean") style.antiRepeat = source["antiRepeat"] as boolean;
  if (typeof source["useFavorite"] === "boolean") style.useFavorite = source["useFavorite"] as boolean;
  return style;
}

function parseFavoriteSelection(value: unknown): DubleStyleSelection {
  const source = asRecord(value);
  const market = nonEmptyString(source["market"]);
  const scenario = nonEmptyString(source["scenario"]);
  const outfit = nonEmptyString(source["outfit"]);
  const framing = nonEmptyString(source["framing"]);
  const pose = nonEmptyString(source["pose"]);
  const lighting = nonEmptyString(source["lighting"]);
  if (!market || !scenario || !outfit || !framing || !pose || !lighting) {
    throw new DubleStyleValidationError("Favorito exige mercado, cenário, vestimenta, enquadramento, pose e iluminação");
  }
  return { market: market as DubleStyleSelection["market"], scenario, outfit, framing, pose, lighting };
}

function sendDubleStyleError(res: Response, error: unknown): boolean {
  if (error instanceof DubleStyleConsentError) {
    res.status(403).json({
      error: error.message,
      code: "DUBLE_STYLE_CONSENT_REQUIRED",
      missingScopes: error.missingScopes,
    });
    return true;
  }
  if (error instanceof DubleStyleValidationError) {
    res.status(422).json({ error: error.message, code: "DUBLE_STYLE_INVALID" });
    return true;
  }
  return false;
}

async function enforcePaidMetaMediaRights(req: Request, res: Response, next: NextFunction) {
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

router.post("/tenants/:tenantId/media-engine/images/:assetId/analyze", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const assetId = String(req.params["assetId"]);
  const goal = nonEmptyString(req.body?.goal);
  try {
    const analysis = await analyzeMediaImage({ tenantId, assetId, goal });
    res.json({ provider: "vendorai", operation: "image_analyze", analysis });
  } catch (error) {
    if (error instanceof ImageAdvisorValidationError) {
      res.status(422).json({ error: error.message, code: "IMAGE_ADVISOR_INPUT_INVALID" });
      return;
    }
    throw error;
  }
});

router.get("/tenants/:tenantId/media-engine/duble-style/catalog", async (req, res) => {
  const market = nonEmptyString(req.query["market"]);
  res.json(getDubleStyleCatalog(market ?? undefined));
});

router.get("/tenants/:tenantId/media-engine/identities/:identityId/duble-style", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  try {
    const profile = await getVendorAiDubleStyleProfile({ tenantId, identityId });
    res.json({ provider: "vendorai", operation: "duble_style_profile", profile });
  } catch (error) {
    if (sendDubleStyleError(res, error)) return;
    throw error;
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/duble-style/preview", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  try {
    const reference = await createVendorAiDubleStyleReference({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId,
      style: parseDubleStyle(req.body?.style) ?? {},
      title: nonEmptyString(req.body?.title) ?? undefined,
    });
    res.status(201).json({ provider: "vendorai", operation: "duble_style_preview", reference });
  } catch (error) {
    if (sendDubleStyleError(res, error)) return;
    throw error;
  }
});

router.put("/tenants/:tenantId/media-engine/identities/:identityId/duble-style/favorite", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  try {
    const selection = parseFavoriteSelection(req.body?.selection);
    const favorite = await saveVendorAiDubleFavorite({ tenantId, identityId, selection });
    res.json({ provider: "vendorai", operation: "duble_style_favorite", favorite });
  } catch (error) {
    if (sendDubleStyleError(res, error)) return;
    throw error;
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/analyze-references", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  try {
    const analysis = await analyzeVendorAiIdentityReferences({ tenantId, identityId });
    res.json({ provider: "vendorai", operation: "identity_reference_analysis", analysis });
  } catch (error) {
    req.log.warn({ err: error, tenantId, identityId }, "identity-quality: reference analysis failed");
    const message = error instanceof Error ? error.message : "Não foi possível analisar as referências";
    const lower = message.toLowerCase();
    const status = lower.includes("não encontrada") || lower.includes("não encontrado") ? 404 : lower.includes("ffmpeg") || lower.includes("ffprobe") ? 503 : 422;
    res.status(status).json({ error: message, code: "IDENTITY_REFERENCE_ANALYSIS_FAILED" });
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/duble-evaluations", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const ratings = asRecord(req.body?.ratings);
  const testAssetId = nonEmptyString(req.body?.testAssetId);
  const notes = nonEmptyString(req.body?.notes);
  try {
    const evaluation = await saveVendorAiDubleEvaluation({
      tenantId,
      identityId,
      testAssetId,
      ratings: Object.fromEntries(Object.entries(ratings).map(([key, value]) => [key, Number(value)])),
      notes,
      userId: req.user?.sub ?? null,
    });
    res.status(201).json({ provider: "vendorai", operation: "duble_evaluation", evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a avaliação";
    res.status(message.toLowerCase().includes("não encontrada") ? 404 : 422).json({ error: message, code: "DUBLE_EVALUATION_INVALID" });
  }
});

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
  const faceAssetId = nonEmptyString(req.body?.faceAssetId);
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
      faceAssetId,
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
  const style = parseDubleStyle(req.body?.style);

  if (!voiceProfileId || !text) {
    res.status(422).json({ error: "voiceProfileId e text são obrigatórios" });
    return;
  }
  if (text.length > 5000) {
    res.status(422).json({ error: "text deve ter até 5000 caracteres" });
    return;
  }

  try {
    const styledReference = style
      ? await createVendorAiDubleStyleReference({
          tenantId,
          userId: req.user?.sub ?? null,
          identityId,
          style,
          title: `Referência visual — ${title}`,
        })
      : null;

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
      faceAssetId: styledReference?.assetId ?? null,
      title,
      bboxShift,
    });

    res.status(201).json({
      provider: "vendorai",
      operation: "talking_video",
      identityId,
      requestedVoiceProfileId: voiceResult.requestedVoiceProfileId,
      voiceProfileId: voiceResult.voiceProfileId,
      voiceSelection: voiceResult.voiceSelection,
      style: styledReference,
      voice: {
        projectId: voiceResult.projectId,
        jobId: voiceResult.jobId,
        assetId: voiceResult.assetId,
        versionId: voiceResult.versionId,
        audioUrl: voiceResult.audioUrl,
        requestedVoiceProfileId: voiceResult.requestedVoiceProfileId,
        voiceProfileId: voiceResult.voiceProfileId,
        selection: voiceResult.voiceSelection,
      },
      video: videoResult,
    });
  } catch (error) {
    if (sendDubleStyleError(res, error)) return;
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
