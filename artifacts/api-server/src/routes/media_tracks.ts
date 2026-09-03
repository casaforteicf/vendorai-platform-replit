import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import {
  assessMediaAudioUsage,
  normalizeMediaAudioRights,
  validateMediaAudioRightsInput,
} from "../services/media-rights.js";

const router: IRouter = Router();

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

router.use("/tenants/:tenantId/media/tracks", requireSameTenanOrSuperAdmin());

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

export default router;
