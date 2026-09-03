import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import {
  assessMediaAudioUsage,
  normalizeMediaAudioRights,
  validateMediaAudioRightsInput,
} from "../services/media-rights.js";
import {
  generateVendorAiMusic,
  MusicEngineNotReadyError,
  MusicGenerationInputError,
} from "../services/vendorai-music-engine.js";

const router: IRouter = Router();
const BRAND_CAPTION_PRESETS = new Set(["reels_bold", "clean", "highlight", "minimal"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clampLimit(value: unknown, fallback = 60, max = 150): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function optionalText(value: unknown, maxLength = 300): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function optionalAssetId(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

async function validateBrandAsset(
  tenantId: string,
  assetId: string | null | undefined,
  expectedType: "image" | "video" | "audio",
  expectedRole?: string,
): Promise<boolean> {
  if (!assetId) return true;
  const result = await pool.query(
    `SELECT 1
       FROM media_assets
      WHERE tenant_id = $1
        AND id = $2
        AND type = $3
        AND ($4::text IS NULL OR role = $4)
      LIMIT 1`,
    [tenantId, assetId, expectedType, expectedRole ?? null],
  );
  return result.rowCount === 1;
}

router.use("/tenants/:tenantId/media/tracks", requireSameTenanOrSuperAdmin());
router.use("/tenants/:tenantId/media-engine/brand-kit", requireSameTenanOrSuperAdmin());

router.get("/tenants/:tenantId/media/tracks", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const limit = clampLimit(req.query["limit"]);
  const result = await pool.query(
    `SELECT *
       FROM media_assets
      WHERE tenant_id = $1
        AND type = 'audio'
        AND role = 'music'
      ORDER BY created_at DESC
      LIMIT $2`,
    [tenantId, limit],
  );

  const tracks = result.rows.map((asset) => {
    const metadata = record(asset.metadata);
    const rights = normalizeMediaAudioRights(metadata["rights"]);
    return {
      ...asset,
      rights,
      usage: assessMediaAudioUsage(rights),
    };
  });

  res.json({ tracks });
});

router.post("/tenants/:tenantId/media/tracks/generate", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = record(req.body);
  const prompt = optionalText(body["prompt"], 1500);
  const durationSeconds = Number(body["durationSeconds"] ?? 30);
  if (!prompt) {
    res.status(422).json({ error: "prompt é obrigatório" });
    return;
  }

  try {
    const result = await generateVendorAiMusic({
      tenantId,
      userId: req.user?.sub ?? null,
      prompt,
      title: optionalText(body["title"], 200) ?? undefined,
      durationSeconds,
      style: optionalText(body["style"], 200),
      mood: optionalText(body["mood"], 120),
      energy: optionalText(body["energy"], 120),
      instrumental: body["instrumental"] !== false,
    });
    res.status(201).json({
      ...result,
      provider: "vendorai",
      operation: "music_generate",
      usage: assessMediaAudioUsage(result.rights),
    });
  } catch (error) {
    if (error instanceof MusicEngineNotReadyError) {
      res.status(503).json({ error: error.message, code: "MUSIC_WORKER_NOT_READY" });
      return;
    }
    if (error instanceof MusicGenerationInputError) {
      res.status(422).json({ error: error.message, code: "MUSIC_INPUT_INVALID" });
      return;
    }
    throw error;
  }
});

router.patch("/tenants/:tenantId/media/tracks/:assetId/rights", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const assetId = String(req.params["assetId"]);
  const input = record(req.body);
  const errors = validateMediaAudioRightsInput(input);
  if (errors.length) {
    res.status(422).json({ error: "Direitos da trilha inválidos", details: errors });
    return;
  }

  const assetResult = await pool.query(
    `SELECT *
       FROM media_assets
      WHERE tenant_id = $1
        AND id = $2
        AND type = 'audio'
        AND role = 'music'
      LIMIT 1`,
    [tenantId, assetId],
  );
  if (!assetResult.rowCount) {
    res.status(404).json({ error: "Trilha não encontrada" });
    return;
  }

  const evidenceAssetId = typeof input["evidenceAssetId"] === "string"
    ? input["evidenceAssetId"].trim() || null
    : null;
  if (evidenceAssetId) {
    const evidenceResult = await pool.query(
      `SELECT 1 FROM media_assets WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, evidenceAssetId],
    );
    if (!evidenceResult.rowCount) {
      res.status(422).json({ error: "Evidência de licença inválida para este tenant" });
      return;
    }
  }

  const existing = assetResult.rows[0];
  const metadata = record(existing.metadata);
  const rights = normalizeMediaAudioRights({
    ...input,
    evidenceAssetId,
    updatedAt: new Date().toISOString(),
    updatedByUserId: req.user?.sub ?? null,
  });
  const nextMetadata = { ...metadata, rights };

  const updated = await pool.query(
    `UPDATE media_assets
        SET metadata = $3::jsonb
      WHERE tenant_id = $1 AND id = $2
      RETURNING *`,
    [tenantId, assetId, JSON.stringify(nextMetadata)],
  );

  res.json({
    track: updated.rows[0],
    rights,
    usage: assessMediaAudioUsage(rights),
  });
});

router.get("/tenants/:tenantId/media/tracks/:assetId/usage", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const assetId = String(req.params["assetId"]);
  const result = await pool.query(
    `SELECT id, metadata
       FROM media_assets
      WHERE tenant_id = $1
        AND id = $2
        AND type = 'audio'
        AND role = 'music'
      LIMIT 1`,
    [tenantId, assetId],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Trilha não encontrada" });
    return;
  }

  const metadata = record(result.rows[0]?.metadata);
  const rights = normalizeMediaAudioRights(metadata["rights"]);
  res.json({ assetId, rights, usage: assessMediaAudioUsage(rights) });
});

router.get("/tenants/:tenantId/media-engine/brand-kit", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const result = await pool.query(
    `SELECT *
       FROM media_brand_video_kits
      WHERE tenant_id = $1 AND status = 'active'
      LIMIT 1`,
    [tenantId],
  );
  res.json({
    brandKit: result.rows[0] ?? null,
    captionPresets: ["reels_bold", "clean", "highlight", "minimal"],
  });
});

router.put("/tenants/:tenantId/media-engine/brand-kit", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = record(req.body);
  const name = body["name"] === undefined ? undefined : optionalText(body["name"], 160);
  const captionPreset = body["captionPreset"] === undefined ? undefined : optionalText(body["captionPreset"], 40);
  const logoAssetId = optionalAssetId(body["logoAssetId"]);
  const introAssetId = optionalAssetId(body["introAssetId"]);
  const outroAssetId = optionalAssetId(body["outroAssetId"]);
  const defaultMusicAssetId = optionalAssetId(body["defaultMusicAssetId"]);

  if (body["name"] !== undefined && !name) {
    res.status(422).json({ error: "name não pode ser vazio" });
    return;
  }
  if (captionPreset !== undefined && (!captionPreset || !BRAND_CAPTION_PRESETS.has(captionPreset))) {
    res.status(422).json({ error: "captionPreset inválido" });
    return;
  }

  const assetChecks = await Promise.all([
    validateBrandAsset(tenantId, logoAssetId, "image"),
    validateBrandAsset(tenantId, introAssetId, "video"),
    validateBrandAsset(tenantId, outroAssetId, "video"),
    validateBrandAsset(tenantId, defaultMusicAssetId, "audio", "music"),
  ]);
  if (!assetChecks[0]) {
    res.status(422).json({ error: "logoAssetId precisa ser uma imagem da Biblioteca deste tenant" });
    return;
  }
  if (!assetChecks[1]) {
    res.status(422).json({ error: "introAssetId precisa ser um vídeo da Biblioteca deste tenant" });
    return;
  }
  if (!assetChecks[2]) {
    res.status(422).json({ error: "outroAssetId precisa ser um vídeo da Biblioteca deste tenant" });
    return;
  }
  if (!assetChecks[3]) {
    res.status(422).json({ error: "defaultMusicAssetId precisa ser uma trilha da Biblioteca deste tenant" });
    return;
  }

  const visualConfig = body["visualConfig"] === undefined ? undefined : record(body["visualConfig"]);
  const audioConfig = body["audioConfig"] === undefined ? undefined : record(body["audioConfig"]);
  const brollConfig = body["brollConfig"] === undefined ? undefined : record(body["brollConfig"]);
  const metadata = body["metadata"] === undefined ? undefined : record(body["metadata"]);

  const current = await pool.query(
    `SELECT id FROM media_brand_video_kits WHERE tenant_id = $1 AND status = 'active' LIMIT 1`,
    [tenantId],
  );

  let saved;
  if (current.rowCount) {
    saved = await pool.query(
      `UPDATE media_brand_video_kits SET
         name = COALESCE($3, name),
         logo_asset_id = CASE WHEN $4::boolean THEN $5 ELSE logo_asset_id END,
         intro_asset_id = CASE WHEN $6::boolean THEN $7 ELSE intro_asset_id END,
         outro_asset_id = CASE WHEN $8::boolean THEN $9 ELSE outro_asset_id END,
         default_music_asset_id = CASE WHEN $10::boolean THEN $11 ELSE default_music_asset_id END,
         caption_preset = COALESCE($12, caption_preset),
         visual_config = CASE WHEN $13::boolean THEN $14::jsonb ELSE visual_config END,
         audio_config = CASE WHEN $15::boolean THEN $16::jsonb ELSE audio_config END,
         broll_config = CASE WHEN $17::boolean THEN $18::jsonb ELSE broll_config END,
         metadata = CASE WHEN $19::boolean THEN $20::jsonb ELSE metadata END,
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        String(current.rows[0]?.id),
        name ?? null,
        body["logoAssetId"] !== undefined,
        logoAssetId ?? null,
        body["introAssetId"] !== undefined,
        introAssetId ?? null,
        body["outroAssetId"] !== undefined,
        outroAssetId ?? null,
        body["defaultMusicAssetId"] !== undefined,
        defaultMusicAssetId ?? null,
        captionPreset ?? null,
        visualConfig !== undefined,
        JSON.stringify(visualConfig ?? {}),
        audioConfig !== undefined,
        JSON.stringify(audioConfig ?? {}),
        brollConfig !== undefined,
        JSON.stringify(brollConfig ?? {}),
        metadata !== undefined,
        JSON.stringify(metadata ?? {}),
      ],
    );
  } else {
    saved = await pool.query(
      `INSERT INTO media_brand_video_kits
        (id, tenant_id, created_by_user_id, name, status, logo_asset_id, intro_asset_id, outro_asset_id,
         default_music_asset_id, caption_preset, visual_config, audio_config, broll_config, metadata, created_at, updated_at)
       VALUES
        ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10::jsonb,
         COALESCE($11::jsonb, '{"musicVolume":0.22,"originalVolume":1,"ducking":true,"fadeIn":0.5,"fadeOut":1}'::jsonb),
         COALESCE($12::jsonb, '{"enabled":true,"maxInsertions":4,"preferOwnMedia":true}'::jsonb),
         $13::jsonb, NOW(), NOW())
       RETURNING *`,
      [
        randomUUID(),
        tenantId,
        req.user?.sub ?? null,
        name ?? "Kit principal",
        logoAssetId ?? null,
        introAssetId ?? null,
        outroAssetId ?? null,
        defaultMusicAssetId ?? null,
        captionPreset ?? "reels_bold",
        JSON.stringify(visualConfig ?? {}),
        audioConfig === undefined ? null : JSON.stringify(audioConfig),
        brollConfig === undefined ? null : JSON.stringify(brollConfig),
        JSON.stringify(metadata ?? {}),
      ],
    );
  }

  res.json({ brandKit: saved.rows[0] });
});

export default router;
