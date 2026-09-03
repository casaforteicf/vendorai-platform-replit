import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import mediaVideoComposeRouter from "./media_video_compose.js";
import {
  createVendorAiMediaGenerationJob,
  vendorAiMediaEngineCapabilities,
  type VendorAiMediaCapability,
} from "../services/vendorai-media-engine.js";
import {
  MediaImageAssetNotFoundError,
  MediaImageToolValidationError,
  processVendorAiImageTool,
  type VendorAiNativeImageOperation,
} from "../services/vendorai-image-tools.js";
import {
  synthesizeVendorAiVoice,
  VoiceConsentError,
  VoiceEngineNotReadyError,
  VoiceProfileInvalidError,
} from "../services/vendorai-voice-engine.js";

const router: IRouter = Router();

const NATIVE_IMAGE_OPERATIONS = new Set<VendorAiNativeImageOperation>([
  "image_resize",
  "image_crop",
  "image_optimize",
  "image_enhance",
  "image_convert",
]);
const KNOWN_OPERATIONS = new Set<VendorAiMediaCapability>([
  "video_edit",
  "video_clips",
  "video_caption",
  "video_batch",
  "video_compose",
  "voice_profile",
  "voice_synthesize",
  "persona_profile",
  "avatar_lipsync",
  "video_generate",
  "image_resize",
  "image_crop",
  "image_optimize",
  "image_enhance",
  "image_convert",
  "image_remove_background",
  "image_variations",
  "photo_video",
  "media_batch",
]);
const IDENTITY_KINDS = new Set(["person", "persona"]);
const IDENTITY_STATUSES = new Set(["draft", "active", "blocked", "archived"]);
const VOICE_STATUSES = new Set(["draft", "ready", "blocked", "archived"]);
const CONSENT_SCOPES = new Set(["face_use", "voice_use", "ai_generation", "organic_publish", "paid_ads"]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

async function identityExists(tenantId: string, identityId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, identityId],
  );
  return result.rowCount === 1;
}

async function assetBelongsToTenant(tenantId: string, assetId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM media_assets WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [tenantId, assetId],
  );
  return result.rowCount === 1;
}

router.use("/tenants/:tenantId/media-engine", requireSameTenanOrSuperAdmin());

router.get("/tenants/:tenantId/media-engine/capabilities", (_req, res) => {
  res.json(vendorAiMediaEngineCapabilities);
});

router.get("/tenants/:tenantId/media-engine/identities", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const result = await pool.query(
    `SELECT i.*,
      (SELECT COUNT(*)::int FROM media_voice_profiles v WHERE v.tenant_id = i.tenant_id AND v.identity_id = i.id AND v.status <> 'archived') AS voice_profile_count,
      (SELECT COUNT(*)::int FROM media_identity_consents c WHERE c.tenant_id = i.tenant_id AND c.identity_id = i.id AND c.status = 'active' AND c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > NOW())) AS active_consent_count
     FROM media_identities i
     WHERE i.tenant_id = $1 AND i.status <> 'archived'
     ORDER BY i.updated_at DESC`,
    [tenantId],
  );
  res.json({ identities: result.rows });
});

router.post("/tenants/:tenantId/media-engine/identities", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const body = asRecord(req.body);
  const displayName = nonEmptyString(body["displayName"]);
  const kind = nonEmptyString(body["kind"]) ?? "person";
  const faceReferenceAssetId = nonEmptyString(body["faceReferenceAssetId"]);

  if (!displayName || !IDENTITY_KINDS.has(kind)) {
    res.status(422).json({ error: "displayName e kind válido são obrigatórios" });
    return;
  }
  if (faceReferenceAssetId && !(await assetBelongsToTenant(tenantId, faceReferenceAssetId))) {
    res.status(422).json({ error: "Ativo de referência facial inválido para este tenant" });
    return;
  }

  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO media_identities
      (id, tenant_id, created_by_user_id, display_name, kind, status, face_reference_asset_id, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7::jsonb, NOW(), NOW())
     RETURNING *`,
    [id, tenantId, req.user?.sub ?? null, displayName, kind, faceReferenceAssetId, JSON.stringify(asRecord(body["metadata"]))],
  );
  res.status(201).json({ identity: result.rows[0] });
});

router.get("/tenants/:tenantId/media-engine/identities/:identityId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const identityResult = await pool.query(`SELECT * FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`, [tenantId, identityId]);
  if (!identityResult.rowCount) {
    res.status(404).json({ error: "Identidade audiovisual não encontrada" });
    return;
  }

  const [voices, consents, events] = await Promise.all([
    pool.query(`SELECT * FROM media_voice_profiles WHERE tenant_id = $1 AND identity_id = $2 ORDER BY created_at DESC`, [tenantId, identityId]),
    pool.query(`SELECT * FROM media_identity_consents WHERE tenant_id = $1 AND identity_id = $2 ORDER BY created_at DESC`, [tenantId, identityId]),
    pool.query(`SELECT * FROM media_identity_consent_events WHERE tenant_id = $1 AND identity_id = $2 ORDER BY created_at DESC LIMIT 100`, [tenantId, identityId]),
  ]);
  res.json({ identity: identityResult.rows[0], voices: voices.rows, consents: consents.rows, consentEvents: events.rows });
});

router.patch("/tenants/:tenantId/media-engine/identities/:identityId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  if (!(await identityExists(tenantId, identityId))) {
    res.status(404).json({ error: "Identidade audiovisual não encontrada" });
    return;
  }

  const body = asRecord(req.body);
  const displayName = body["displayName"] === undefined ? undefined : nonEmptyString(body["displayName"]);
  const status = body["status"] === undefined ? undefined : nonEmptyString(body["status"]);
  const faceReferenceAssetId = body["faceReferenceAssetId"] === undefined ? undefined : nonEmptyString(body["faceReferenceAssetId"]);
  if (displayName === null || (status !== undefined && (!status || !IDENTITY_STATUSES.has(status)))) {
    res.status(422).json({ error: "Dados de identidade inválidos" });
    return;
  }
  if (faceReferenceAssetId && !(await assetBelongsToTenant(tenantId, faceReferenceAssetId))) {
    res.status(422).json({ error: "Ativo de referência facial inválido para este tenant" });
    return;
  }

  const result = await pool.query(
    `UPDATE media_identities SET
       display_name = COALESCE($3, display_name),
       status = COALESCE($4, status),
       face_reference_asset_id = CASE WHEN $5::boolean THEN $6 ELSE face_reference_asset_id END,
       metadata = CASE WHEN $7::boolean THEN $8::jsonb ELSE metadata END,
       updated_at = NOW()
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [tenantId, identityId, displayName ?? null, status ?? null, body["faceReferenceAssetId"] !== undefined, faceReferenceAssetId ?? null, body["metadata"] !== undefined, JSON.stringify(asRecord(body["metadata"]))],
  );
  res.json({ identity: result.rows[0] });
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/voices", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const body = asRecord(req.body);
  const name = nonEmptyString(body["name"]);
  const referenceAssetId = nonEmptyString(body["referenceAssetId"]);
  if (!name || !(await identityExists(tenantId, identityId))) {
    res.status(422).json({ error: "Identidade válida e name são obrigatórios" });
    return;
  }
  if (referenceAssetId && !(await assetBelongsToTenant(tenantId, referenceAssetId))) {
    res.status(422).json({ error: "Ativo de referência de voz inválido para este tenant" });
    return;
  }

  const id = crypto.randomUUID();
  const result = await pool.query(
    `INSERT INTO media_voice_profiles
      (id, tenant_id, identity_id, created_by_user_id, name, status, reference_asset_id, provider, model_config, metadata, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'draft', $6, 'vendorai', $7::jsonb, $8::jsonb, NOW(), NOW())
     RETURNING *`,
    [id, tenantId, identityId, req.user?.sub ?? null, name, referenceAssetId, JSON.stringify(asRecord(body["modelConfig"])), JSON.stringify(asRecord(body["metadata"]))],
  );
  res.status(201).json({ voiceProfile: result.rows[0] });
});

router.patch("/tenants/:tenantId/media-engine/identities/:identityId/voices/:voiceId", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const voiceId = String(req.params["voiceId"]);
  const body = asRecord(req.body);
  const name = body["name"] === undefined ? undefined : nonEmptyString(body["name"]);
  const status = body["status"] === undefined ? undefined : nonEmptyString(body["status"]);
  if (name === null || (status !== undefined && (!status || !VOICE_STATUSES.has(status)))) {
    res.status(422).json({ error: "Dados do perfil de voz inválidos" });
    return;
  }
  const result = await pool.query(
    `UPDATE media_voice_profiles SET
       name = COALESCE($4, name),
       status = COALESCE($5, status),
       model_config = CASE WHEN $6::boolean THEN $7::jsonb ELSE model_config END,
       metadata = CASE WHEN $8::boolean THEN $9::jsonb ELSE metadata END,
       updated_at = NOW()
     WHERE tenant_id = $1 AND identity_id = $2 AND id = $3
     RETURNING *`,
    [tenantId, identityId, voiceId, name ?? null, status ?? null, body["modelConfig"] !== undefined, JSON.stringify(asRecord(body["modelConfig"])), body["metadata"] !== undefined, JSON.stringify(asRecord(body["metadata"]))],
  );
  if (!result.rowCount) {
    res.status(404).json({ error: "Perfil de voz não encontrado" });
    return;
  }
  res.json({ voiceProfile: result.rows[0] });
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/voices/:voiceId/synthesize", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const voiceId = String(req.params["voiceId"]);
  const text = nonEmptyString(req.body?.text);
  const language = nonEmptyString(req.body?.language) ?? "pt-br";
  const title = nonEmptyString(req.body?.title) ?? "Síntese de voz";

  if (!text || text.length > 5000) {
    res.status(422).json({ error: "text é obrigatório e deve ter até 5000 caracteres" });
    return;
  }
  try {
    const result = await synthesizeVendorAiVoice({
      tenantId,
      userId: req.user?.sub ?? null,
      identityId,
      voiceProfileId: voiceId,
      text,
      language,
      title,
    });
    res.status(201).json({ ...result, provider: "vendorai", operation: "voice_synthesize" });
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
    throw error;
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/consents", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const body = asRecord(req.body);
  const scope = nonEmptyString(body["scope"]);
  const evidenceAssetId = nonEmptyString(body["evidenceAssetId"]);
  const expiresAt = parseDate(body["expiresAt"]);
  if (!scope || !CONSENT_SCOPES.has(scope) || expiresAt === "invalid" || !(await identityExists(tenantId, identityId))) {
    res.status(422).json({ error: "Identidade, scope e validade precisam ser válidos" });
    return;
  }
  if (evidenceAssetId && !(await assetBelongsToTenant(tenantId, evidenceAssetId))) {
    res.status(422).json({ error: "Evidência de consentimento inválida para este tenant" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE media_identity_consents
       SET status = 'revoked', revoked_at = NOW(), revocation_reason = 'superseded', updated_at = NOW()
       WHERE tenant_id = $1 AND identity_id = $2 AND scope = $3 AND status = 'active' AND revoked_at IS NULL`,
      [tenantId, identityId, scope],
    );
    const consentId = crypto.randomUUID();
    const consentResult = await client.query(
      `INSERT INTO media_identity_consents
        (id, tenant_id, identity_id, scope, status, granted_by_user_id, evidence_asset_id, consent_version, granted_at, expires_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, NOW(), $8, $9::jsonb, NOW(), NOW()) RETURNING *`,
      [consentId, tenantId, identityId, scope, req.user?.sub ?? null, evidenceAssetId, nonEmptyString(body["consentVersion"]) ?? "1", expiresAt, JSON.stringify(asRecord(body["metadata"]))],
    );
    await client.query(
      `INSERT INTO media_identity_consent_events
        (id, tenant_id, identity_id, consent_id, actor_user_id, event_type, scope, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'granted', $6, $7::jsonb, NOW())`,
      [crypto.randomUUID(), tenantId, identityId, consentId, req.user?.sub ?? null, scope, JSON.stringify(asRecord(body["metadata"]))],
    );
    await client.query("COMMIT");
    res.status(201).json({ consent: consentResult.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/consents/:consentId/revoke", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const consentId = String(req.params["consentId"]);
  const reason = nonEmptyString(req.body?.reason) ?? "revoked_by_user";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE media_identity_consents SET status = 'revoked', revoked_at = NOW(), revocation_reason = $4, updated_at = NOW()
       WHERE tenant_id = $1 AND identity_id = $2 AND id = $3 AND status = 'active' RETURNING *`,
      [tenantId, identityId, consentId, reason],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Consentimento ativo não encontrado" });
      return;
    }
    const scope = String(result.rows[0]?.scope);
    await client.query(
      `INSERT INTO media_identity_consent_events
        (id, tenant_id, identity_id, consent_id, actor_user_id, event_type, scope, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'revoked', $6, $7::jsonb, NOW())`,
      [crypto.randomUUID(), tenantId, identityId, consentId, req.user?.sub ?? null, scope, JSON.stringify({ reason })],
    );
    await client.query("COMMIT");
    res.json({ consent: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/tenants/:tenantId/media-engine/identities/:identityId/authorize", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const identityId = String(req.params["identityId"]);
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map(String) : [];
  if (!scopes.length || scopes.some((scope: string) => !CONSENT_SCOPES.has(scope))) {
    res.status(422).json({ error: "Informe ao menos um scope válido" });
    return;
  }
  const checks = await Promise.all(scopes.map(async (scope: string) => {
    const result = await pool.query(`SELECT media_identity_has_active_consent($1, $2, $3) AS authorized`, [tenantId, identityId, scope]);
    return { scope, authorized: result.rows[0]?.authorized === true };
  }));
  const missingScopes = checks.filter((check) => !check.authorized).map((check) => check.scope);
  res.json({ identityId, authorized: missingScopes.length === 0, scopes: checks, missingScopes });
});

router.post("/tenants/:tenantId/media-engine/image-tools", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const operation = String(req.body?.operation ?? "") as VendorAiNativeImageOperation;
  const assetId = nonEmptyString(req.body?.assetId);
  const title = nonEmptyString(req.body?.title) ?? "Tratamento de imagem";
  const options = asRecord(req.body?.options);

  if (!NATIVE_IMAGE_OPERATIONS.has(operation)) {
    res.status(422).json({ error: "Operação nativa de imagem inválida" });
    return;
  }
  if (!assetId) {
    res.status(422).json({ error: "assetId é obrigatório" });
    return;
  }

  try {
    const result = await processVendorAiImageTool({
      tenantId,
      userId: req.user?.sub ?? null,
      assetId,
      title,
      operation,
      options,
    });
    res.status(201).json({ ...result, provider: "vendorai" });
  } catch (error) {
    if (error instanceof MediaImageAssetNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof MediaImageToolValidationError) {
      res.status(422).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.post("/tenants/:tenantId/media-engine/jobs", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const operation = String(req.body?.operation ?? "") as VendorAiMediaCapability;
  const title = String(req.body?.title ?? "").trim();
  const context = req.body?.context && typeof req.body.context === "object" && !Array.isArray(req.body.context)
    ? req.body.context as Record<string, unknown>
    : {};

  if (!KNOWN_OPERATIONS.has(operation)) {
    res.status(422).json({ error: "Operação de mídia inválida" });
    return;
  }
  if (!title) {
    res.status(422).json({ error: "title é obrigatório" });
    return;
  }

  if (vendorAiMediaEngineCapabilities.capabilities[operation] !== "ready") {
    res.status(409).json({
      error: "Capacidade ainda em construção no VendorAI Media Engine",
      operation,
      provider: "vendorai",
    });
    return;
  }

  const result = await createVendorAiMediaGenerationJob({
    tenantId,
    userId: req.user?.sub ?? null,
    title,
    operation,
    context,
  });

  res.status(202).json({ ...result, provider: "vendorai", operation });
});

router.use(mediaVideoComposeRouter);

export default router;
