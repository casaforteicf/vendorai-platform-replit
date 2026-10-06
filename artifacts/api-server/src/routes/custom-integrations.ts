import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";
import { db, tenantCustomIntegrationsTable } from "@workspace/db";
import { decrypt, encrypt } from "../lib/crypto.js";
import { requireSameTenanOrSuperAdmin } from "../middlewares/auth.js";

const router: IRouter = Router();
export const customIntegrationsPublicRouter: IRouter = Router();

const authTypeSchema = z.enum(["none", "api_key", "bearer", "basic"]);
const kindSchema = z.enum(["api", "webhook", "n8n"]);

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: kindSchema,
  baseUrl: z.string().url().max(1000).optional().nullable(),
  authType: authTypeSchema.default("none"),
  credential: z.string().min(1).max(4096).optional().nullable(),
  apiKeyHeader: z.string().trim().regex(/^[A-Za-z0-9-]{1,80}$/).optional(),
  scopes: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  healthPath: z.string().trim().max(300).default("/"),
});


function safeRow(row: typeof tenantCustomIntegrationsTable.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    kind: row.kind,
    status: row.status,
    baseUrl: row.baseUrl,
    authType: row.authType,
    hasCredential: Boolean(row.credentialEncrypted),
    hasWebhookSecret: Boolean(row.webhookSecretEncrypted),
    scopes: row.scopes,
    config: row.config,
    lastTestAt: row.lastTestAt,
    lastSuccessAt: row.lastSuccessAt,
    lastEventAt: row.lastEventAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function privateIp(address: string) {
  if (address === "::1" || address === "0.0.0.0") return true;
  if (address.startsWith("10.") || address.startsWith("127.") || address.startsWith("169.254.") || address.startsWith("192.168.")) return true;
  const parts = address.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  const normalized = address.toLowerCase();
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) return true;
  return false;
}

async function validatePublicHttpsUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("A conexão personalizada exige HTTPS.");
  if (url.username || url.password) throw new Error("Não inclua usuário ou senha na URL.");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Host local não é permitido.");
  if (isIP(hostname) && privateIp(hostname)) throw new Error("Endereço de rede privada não é permitido.");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => privateIp(item.address))) throw new Error("O endpoint precisa resolver somente para endereços públicos.");
  return url;
}

function buildAuthHeaders(row: typeof tenantCustomIntegrationsTable.$inferSelect) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (!row.credentialEncrypted || row.authType === "none") return headers;
  const credential = decrypt(row.credentialEncrypted);
  if (row.authType === "bearer") headers.Authorization = `Bearer ${credential}`;
  if (row.authType === "basic") headers.Authorization = `Basic ${Buffer.from(credential).toString("base64")}`;
  if (row.authType === "api_key") {
    const header = typeof row.config?.["apiKeyHeader"] === "string" ? String(row.config["apiKeyHeader"]) : "X-API-Key";
    headers[header] = credential;
  }
  return headers;
}

router.get("/tenants/:tenantId/custom-integrations", requireSameTenanOrSuperAdmin(), async (req, res) => {
  // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
  const tenantId = String(req.params.tenantId);
  const rows = await db.select().from(tenantCustomIntegrationsTable)
    .where(eq(tenantCustomIntegrationsTable.tenantId, tenantId))
    .orderBy(desc(tenantCustomIntegrationsTable.updatedAt));
  res.json({ integrations: rows.map(safeRow) });
});

router.post("/tenants/:tenantId/custom-integrations", requireSameTenanOrSuperAdmin(), async (req, res) => {
  // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
  const tenantId = String(req.params.tenantId);
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ error: "invalid_custom_integration", issues: parsed.error.issues });

  if (parsed.data.kind !== "webhook" && !parsed.data.baseUrl) {
    return void res.status(422).json({ error: "base_url_required" });
  }
  if (parsed.data.authType !== "none" && !parsed.data.credential) {
    return void res.status(422).json({ error: "credential_required" });
  }
  if (parsed.data.baseUrl) {
    try {
      await validatePublicHttpsUrl(parsed.data.baseUrl);
    } catch (error) {
      return void res.status(422).json({ error: "unsafe_or_invalid_url", message: error instanceof Error ? error.message : "URL inválida" });
    }
  }

  const webhookSecret = parsed.data.kind === "webhook" ? randomBytes(24).toString("base64url") : null;
  const [row] = await db.insert(tenantCustomIntegrationsTable).values({
    tenantId,
    name: parsed.data.name,
    kind: parsed.data.kind,
    status: "not_configured",
    baseUrl: parsed.data.baseUrl || null,
    authType: parsed.data.authType,
    credentialEncrypted: parsed.data.credential ? encrypt(parsed.data.credential) : null,
    webhookSecretEncrypted: webhookSecret ? encrypt(webhookSecret) : null,
    scopes: parsed.data.scopes,
    config: {
      healthPath: parsed.data.healthPath || "/",
      apiKeyHeader: parsed.data.apiKeyHeader || "X-API-Key",
    },
    createdBy: req.user?.sub ?? null,
  }).returning();

  res.status(201).json({
    integration: safeRow(row),
    webhook: webhookSecret ? {
      path: `/api/webhooks/custom/${encodeURIComponent(tenantId)}/${row.id}`,
      secret: webhookSecret,
      secretHeader: "x-vendorai-webhook-secret",
      note: "O segredo é exibido apenas agora. Guarde-o no sistema que enviará o webhook.",
    } : null,
  });
});

router.post("/tenants/:tenantId/custom-integrations/:id/test", requireSameTenanOrSuperAdmin(), async (req, res) => {
  // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);

  const [row] = await db.select().from(tenantCustomIntegrationsTable).where(and(
    eq(tenantCustomIntegrationsTable.id, id),
    eq(tenantCustomIntegrationsTable.tenantId, tenantId),
  )).limit(1);
  if (!row) return void res.status(404).json({ error: "connection_not_found" });

  if (row.kind === "webhook") {
    return void res.json({
      ok: Boolean(row.lastEventAt),
      status: row.lastEventAt ? "connected" : "attention",
      message: row.lastEventAt ? "Webhook já recebeu evento assinado." : "Envie um evento de teste para a URL do webhook.",
      lastEventAt: row.lastEventAt,
    });
  }

  if (!row.baseUrl) return void res.status(422).json({ error: "base_url_missing" });
  const started = Date.now();
  const now = new Date();

  try {
    const base = await validatePublicHttpsUrl(row.baseUrl);
    const healthPath = typeof row.config?.["healthPath"] === "string" ? String(row.config["healthPath"]) : "/";
    const target = new URL(healthPath || "/", base);
    await validatePublicHttpsUrl(target.toString());

    const response = await fetch(target, {
      method: "GET",
      headers: buildAuthHeaders(row),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const ok = response.ok;
    const message = ok ? `Endpoint respondeu HTTP ${response.status}.` : `Endpoint respondeu HTTP ${response.status}.`;
    await db.update(tenantCustomIntegrationsTable).set({
      status: ok ? "connected" : "error",
      lastTestAt: now,
      lastSuccessAt: ok ? now : row.lastSuccessAt,
      lastError: ok ? null : message,
      updatedAt: now,
    }).where(eq(tenantCustomIntegrationsTable.id, row.id));
    return void res.status(ok ? 200 : 422).json({ ok, status: ok ? "connected" : "error", httpStatus: response.status, latencyMs: Date.now() - started, message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao testar a conexão.";
    await db.update(tenantCustomIntegrationsTable).set({
      status: "error",
      lastTestAt: now,
      lastError: message,
      updatedAt: now,
    }).where(eq(tenantCustomIntegrationsTable.id, row.id));
    return void res.status(422).json({ ok: false, status: "error", latencyMs: Date.now() - started, message });
  }
});

router.post("/tenants/:tenantId/custom-integrations/:id/rotate-webhook-secret", requireSameTenanOrSuperAdmin(), async (req, res) => {
  // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  const secret = randomBytes(24).toString("base64url");
  const [row] = await db.update(tenantCustomIntegrationsTable).set({
    webhookSecretEncrypted: encrypt(secret),
    status: "attention",
    lastError: "Webhook secret rotated; send a new signed test event.",
    updatedAt: new Date(),
  }).where(and(eq(tenantCustomIntegrationsTable.id, id), eq(tenantCustomIntegrationsTable.tenantId, tenantId))).returning();
  if (!row) return void res.status(404).json({ error: "connection_not_found" });
  res.json({ id: row.id, secret, secretHeader: "x-vendorai-webhook-secret" });
});

router.delete("/tenants/:tenantId/custom-integrations/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  // tenant-audit: reviewed protected by requireSameTenanOrSuperAdmin before tenant data access
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  const [row] = await db.delete(tenantCustomIntegrationsTable).where(and(
    eq(tenantCustomIntegrationsTable.id, id),
    eq(tenantCustomIntegrationsTable.tenantId, tenantId),
  )).returning({ id: tenantCustomIntegrationsTable.id });
  if (!row) return void res.status(404).json({ error: "connection_not_found" });
  res.json({ success: true });
});

customIntegrationsPublicRouter.post("/webhooks/custom/:tenantId/:connectionId", async (req, res) => {
  // tenant-audit: reviewed public webhook; tenant route value only establishes transaction-local RLS context and access still requires the per-connection secret.
  const tenantId = String(req.params.tenantId);
  const connectionId = String(req.params.connectionId);
  const provided = req.headers["x-vendorai-webhook-secret"];
  if (typeof provided !== "string" || !provided) return void res.status(401).json({ error: "missing_webhook_secret" });

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT app_security.set_tenant_context(${tenantId}, false)`);

      const [row] = await tx.select().from(tenantCustomIntegrationsTable).where(and(
        eq(tenantCustomIntegrationsTable.id, connectionId),
        eq(tenantCustomIntegrationsTable.tenantId, tenantId),
      )).limit(1);
      if (!row || row.kind !== "webhook" || !row.webhookSecretEncrypted) return { status: 404 as const, body: { error: "webhook_not_found" } };

      let expected = "";
      try {
        expected = decrypt(row.webhookSecretEncrypted);
      } catch {
        return { status: 500 as const, body: { error: "webhook_secret_unavailable" } };
      }

      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401 as const, body: { error: "invalid_webhook_secret" } };

      const now = new Date();
      const eventType = typeof req.headers["x-event-type"] === "string" ? req.headers["x-event-type"].slice(0, 120) : null;
      const bodyKeys = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? Object.keys(req.body).slice(0, 30) : [];

      await tx.update(tenantCustomIntegrationsTable).set({
        status: "connected",
        lastEventAt: now,
        lastSuccessAt: now,
        lastError: null,
        config: { ...(row.config || {}), lastEventType: eventType, lastPayloadKeys: bodyKeys },
        updatedAt: now,
      }).where(and(
        eq(tenantCustomIntegrationsTable.id, row.id),
        eq(tenantCustomIntegrationsTable.tenantId, tenantId),
      ));

      return { status: 202 as const, body: { accepted: true, connectionId: row.id } };
    });

    return void res.status(result.status).json(result.body);
  } catch (error) {
    req.log?.error?.({ error, tenantId, connectionId }, "custom webhook ingest failed");
    return void res.status(500).json({ error: "webhook_ingest_failed" });
  }
});

export default router;
