import type { RequestHandler } from "express";
import { db, businessProfilesTable, agentConfigsTable, tenantAgentConfigsTable, tenantsTable, usersTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { writeConfigurationAudit } from "../lib/configuration-audit";

function isSuccessfulWrite(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function actorFromRequest(req: any) {
  return {
    userId: req.user?.id ?? null,
    ip: req.ip ?? null,
  };
}

function auditTenantIdFromRequest(req: any): string | null {
  const authenticatedTenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (authenticatedTenantId) return authenticatedTenantId;
  if (req.user?.platformRole !== "super_admin") return null;

  const requestedTenantId = Reflect.get(req.body ?? {}, "tenantId");
  return typeof requestedTenantId === "string" ? requestedTenantId : null;
}

type ConfigurationPermission = "settings" | "agents";

async function hasConfigurationWriteAccess(req: any, permission: ConfigurationPermission): Promise<boolean> {
  const user = req.user;
  if (!user) return false;
  if (user.actorType === "ai" || user.actorType === "system") return true;
  if (user.platformRole === "super_admin" || user.platformRole === "tenant_admin" || user.userFunction === "administrador") return true;

  const userId = typeof user.sub === "string" ? user.sub : null;
  if (!userId) return false;

  const [row] = await db
    .select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  return Array.isArray(row?.permissions) && row.permissions.includes(permission);
}

async function requireConfigurationWriteAccess(
  req: any,
  res: any,
  permission: ConfigurationPermission,
  area: string,
): Promise<boolean> {
  try {
    if (await hasConfigurationWriteAccess(req, permission)) return true;
    res.status(403).json({
      error: "CONFIGURATION_ACCESS_DENIED",
      message: `Seu usuário não possui permissão para alterar ${area}.`,
      module: permission,
      area,
    });
    return false;
  } catch (error) {
    req.log?.warn({ error, permission, area }, "configuracoes: verificação de permissão indisponível");
    res.status(503).json({
      error: "CONFIGURATION_PERMISSION_UNAVAILABLE",
      message: "Não foi possível validar sua permissão para esta alteração agora.",
    });
    return false;
  }
}

async function tenantAgentSnapshot(tenantId: string, agentKey: string) {
  return db.select().from(tenantAgentConfigsTable)
    .where(and(eq(tenantAgentConfigsTable.tenantId, tenantId), eq(tenantAgentConfigsTable.agentKey, agentKey)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function agentConfigSnapshot(id: string) {
  return db.select().from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

async function documentConfigurationSnapshot(tenantId: string) {
  const result = await db.execute(
    sql`SELECT contract_template_html, contract_template_name, contract_settings FROM tenants WHERE id = ${tenantId}`,
  );
  const row = result.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    templateHtml: row.contract_template_html ?? null,
    templateName: row.contract_template_name ?? null,
    settings: row.contract_settings ?? null,
  };
}

const TENANT_INTEGRATION_SETTING_KEYS = [
  "asaasApiKey",
  "zapsignApiKey",
  "webhookEstoqueUrl",
  "apiKeyEstoque",
  "integrationType",
  "whatsappProvider",
  "instagramProvider",
  "googleAdsConversionId",
  "metaPixelId",
  "linkedinInsightTagId",
  "tiktokPixelId",
] as const;

type TenantIntegrationSettingKey = (typeof TENANT_INTEGRATION_SETTING_KEYS)[number];

async function tenantIntegrationSettingsSnapshot(tenantId: string) {
  return db.select({
    asaasApiKey: tenantsTable.asaasApiKey,
    zapsignApiKey: tenantsTable.zapsignApiKey,
    webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
    apiKeyEstoque: tenantsTable.apiKeyEstoque,
    integrationType: tenantsTable.integrationType,
    whatsappProvider: tenantsTable.whatsappProvider,
    instagramProvider: tenantsTable.instagramProvider,
    googleAdsConversionId: tenantsTable.googleAdsConversionId,
    metaPixelId: tenantsTable.metaPixelId,
    linkedinInsightTagId: tenantsTable.linkedinInsightTagId,
    tiktokPixelId: tenantsTable.tiktokPixelId,
  }).from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

function requestedTenantIntegrationKeys(body: unknown): TenantIntegrationSettingKey[] {
  if (!body || typeof body !== "object") return [];
  return TENANT_INTEGRATION_SETTING_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function selectTenantIntegrationFields(
  snapshot: Awaited<ReturnType<typeof tenantIntegrationSettingsSnapshot>>,
  keys: TenantIntegrationSettingKey[],
): Record<string, unknown> | null {
  if (!snapshot) return null;
  return Object.fromEntries(keys.map((key) => [key, snapshot[key]]));
}

async function auditBusinessProfile(req: any, res: any, next: () => void): Promise<boolean> {
  const method = req.method.toUpperCase();
  const isCreate = method === "POST" && req.path === "/business-profiles";
  const match = req.path.match(/^\/business-profiles\/([^/]+)$/);
  const isUpdate = method === "PATCH" && Boolean(match);
  const isDelete = method === "DELETE" && Boolean(match);

  if (!isCreate && !isUpdate && !isDelete) return false;
  if (!await requireConfigurationWriteAccess(req, res, "settings", "Empresa")) return true;

  const profileId = match?.[1] ? decodeURIComponent(match[1]) : null;
  const before = profileId
    ? await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.id, profileId)).limit(1).then((rows) => rows[0] ?? null)
    : null;

  res.once("finish", () => {
    if (!isSuccessfulWrite(res.statusCode)) return;

    void (async () => {
      if (isCreate) {
        const tenantId = auditTenantIdFromRequest(req);
        if (!tenantId) return;
        const after = await db.select().from(businessProfilesTable)
          .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1)
          .then((rows) => rows[0] ?? null);
        if (!after) return;
        const audited = await writeConfigurationAudit({
          tenantId,
          action: "criar",
          entity: "business_profile",
          entityId: after.id,
          after,
          actor: actorFromRequest(req),
        });
        if (!audited) req.log?.warn({ tenantId, entityId: after.id }, "configuracoes: falha ao auditar criação do perfil");
        return;
      }

      if (!before || !profileId) return;

      if (isDelete) {
        const audited = await writeConfigurationAudit({
          tenantId: before.tenantId,
          action: "excluir",
          entity: "business_profile",
          entityId: profileId,
          before,
          actor: actorFromRequest(req),
        });
        if (!audited) req.log?.warn({ tenantId: before.tenantId, entityId: profileId }, "configuracoes: falha ao auditar exclusão do perfil");
        return;
      }

      const after = await db.select().from(businessProfilesTable)
        .where(eq(businessProfilesTable.id, profileId)).limit(1)
        .then((rows) => rows[0] ?? null);
      if (!after) return;
      const audited = await writeConfigurationAudit({
        tenantId: before.tenantId,
        action: "atualizar",
        entity: "business_profile",
        entityId: profileId,
        before,
        after,
        actor: actorFromRequest(req),
      });
      if (!audited) req.log?.warn({ tenantId: before.tenantId, entityId: profileId }, "configuracoes: falha ao auditar atualização do perfil");
    })().catch((error) => {
      req.log?.warn({ error, profileId }, "configuracoes: auditoria do perfil indisponível");
    });
  });

  next();
  return true;
}

async function auditAgentConfiguration(req: any, res: any, next: () => void): Promise<boolean> {
  const method = req.method.toUpperCase();
  const tenantId = auditTenantIdFromRequest(req);
  const isCreate = method === "POST" && req.path === "/agent-configs";
  const direct = req.path.match(/^\/agent-configs\/([^/]+)$/);
  const action = req.path.match(/^\/agent-configs\/([^/]+)\/(activate|deactivate|reset|complete-setup|regenerate-webhook-secret)$/);

  const isDirectUpdate = method === "PATCH" && Boolean(direct);
  const isDirectDelete = method === "DELETE" && Boolean(direct);
  const isAgentAction = method === "POST" && Boolean(action);

  if (!isCreate && !isDirectUpdate && !isDirectDelete && !isAgentAction) return false;
  if (!await requireConfigurationWriteAccess(req, res, "agents", "IA e Agentes")) return true;

  const segment = decodeURIComponent((direct?.[1] ?? action?.[1] ?? "").trim());
  const actionName = action?.[2] ?? null;
  const isTenantAgentAction = actionName === "activate" || actionName === "deactivate" || actionName === "reset";

  let beforeGlobal = null;
  let beforeTenant = null;

  if (segment) {
    if (isTenantAgentAction) {
      if (tenantId) beforeTenant = await tenantAgentSnapshot(tenantId, segment);
    } else if (isDirectUpdate) {
      beforeGlobal = await agentConfigSnapshot(segment);
      if (!beforeGlobal && tenantId) beforeTenant = await tenantAgentSnapshot(tenantId, segment);
    } else {
      beforeGlobal = await agentConfigSnapshot(segment);
    }
  }

  res.once("finish", () => {
    if (!isSuccessfulWrite(res.statusCode)) return;

    void (async () => {
      if (isCreate) {
        if (!tenantId) return;
        const after = await db.select().from(agentConfigsTable)
          .where(eq(agentConfigsTable.tenantId, tenantId)).limit(1)
          .then((rows) => rows[0] ?? null);
        if (!after) return;
        await writeConfigurationAudit({
          tenantId,
          action: "criar",
          entity: "agent_config",
          entityId: after.id,
          after,
          actor: actorFromRequest(req),
        });
        return;
      }

      if (beforeTenant && tenantId) {
        const after = await tenantAgentSnapshot(tenantId, segment);
        if (!after) return;
        await writeConfigurationAudit({
          tenantId,
          action: "atualizar",
          entity: "tenant_agent_config",
          entityId: after.id,
          before: beforeTenant,
          after,
          actor: actorFromRequest(req),
        });
        return;
      }

      if (!beforeGlobal) {
        if (tenantId && (isDirectUpdate || isTenantAgentAction)) {
          const after = await tenantAgentSnapshot(tenantId, segment);
          if (!after) return;
          await writeConfigurationAudit({
            tenantId,
            action: "criar",
            entity: "tenant_agent_config",
            entityId: after.id,
            after,
            actor: actorFromRequest(req),
          });
        }
        return;
      }

      if (isDirectDelete) {
        await writeConfigurationAudit({
          tenantId: beforeGlobal.tenantId,
          action: "excluir",
          entity: "agent_config",
          entityId: beforeGlobal.id,
          before: beforeGlobal,
          actor: actorFromRequest(req),
        });
        return;
      }

      const after = await agentConfigSnapshot(beforeGlobal.id);
      if (!after) return;
      await writeConfigurationAudit({
        tenantId: beforeGlobal.tenantId,
        action: "atualizar",
        entity: "agent_config",
        entityId: beforeGlobal.id,
        before: beforeGlobal,
        after,
        actor: actorFromRequest(req),
      });
    })().catch((error) => {
      req.log?.warn({ error, segment }, "configuracoes: auditoria de IA e Agentes indisponível");
    });
  });

  next();
  return true;
}

async function auditDocumentConfiguration(req: any, res: any, next: () => void): Promise<boolean> {
  const method = req.method.toUpperCase();
  const match = req.path.match(/^\/tenants\/([^/]+)\/(contract-template(?:\/editor)?|contract-settings)$/);
  if (!match) return false;

  const tenantId = decodeURIComponent(match[1]);
  const resource = match[2];
  const isTemplateUpload = resource === "contract-template" && method === "POST";
  const isTemplateDelete = resource === "contract-template" && method === "DELETE";
  const isTemplateEditor = resource === "contract-template/editor" && method === "PUT";
  const isSettingsUpdate = resource === "contract-settings" && method === "PUT";

  if (!isTemplateUpload && !isTemplateDelete && !isTemplateEditor && !isSettingsUpdate) return false;
  if (!await requireConfigurationWriteAccess(req, res, "settings", "Documentos")) return true;

  let before;
  try {
    before = await documentConfigurationSnapshot(tenantId);
  } catch (error) {
    req.log?.warn({ error, tenantId }, "configuracoes: snapshot inicial de Documentos indisponível");
    next();
    return true;
  }

  res.once("finish", () => {
    if (!isSuccessfulWrite(res.statusCode)) return;

    void (async () => {
      const after = await documentConfigurationSnapshot(tenantId);
      const isSettings = resource === "contract-settings";
      const entity = isSettings ? "contract_settings" : "contract_template";
      const beforeValue = isSettings
        ? { settings: before?.settings ?? null }
        : { templateName: before?.templateName ?? null, templateHtml: before?.templateHtml ?? null };
      const afterValue = isSettings
        ? { settings: after?.settings ?? null }
        : { templateName: after?.templateName ?? null, templateHtml: after?.templateHtml ?? null };

      const audited = await writeConfigurationAudit({
        tenantId,
        action: isTemplateDelete
          ? "excluir"
          : (!isSettings && !before?.templateHtml ? "criar" : "atualizar"),
        entity,
        entityId: tenantId,
        before: beforeValue,
        after: isTemplateDelete ? undefined : afterValue,
        actor: actorFromRequest(req),
      });
      if (!audited) req.log?.warn({ tenantId, entity }, "configuracoes: falha ao auditar Documentos");
    })().catch((error) => {
      req.log?.warn({ error, tenantId }, "configuracoes: auditoria de Documentos indisponível");
    });
  });

  next();
  return true;
}

async function auditTenantIntegrationSettings(req: any, res: any, next: () => void): Promise<boolean> {
  const method = req.method.toUpperCase();
  const match = req.path.match(/^\/tenants\/([^/]+)$/);
  if (method !== "PATCH" || !match) return false;

  const keys = requestedTenantIntegrationKeys(req.body);
  if (keys.length === 0) return false;
  if (!await requireConfigurationWriteAccess(req, res, "settings", "Integrações")) return true;

  const tenantId = decodeURIComponent(match[1]);
  let beforeSnapshot;
  try {
    beforeSnapshot = await tenantIntegrationSettingsSnapshot(tenantId);
  } catch (error) {
    req.log?.warn({ error, tenantId }, "configuracoes: snapshot inicial de integrações do tenant indisponível");
    next();
    return true;
  }

  const before = selectTenantIntegrationFields(beforeSnapshot, keys);

  res.once("finish", () => {
    if (!isSuccessfulWrite(res.statusCode)) return;

    void (async () => {
      const afterSnapshot = await tenantIntegrationSettingsSnapshot(tenantId);
      const after = selectTenantIntegrationFields(afterSnapshot, keys);
      if (!after || JSON.stringify(before) === JSON.stringify(after)) return;

      const audited = await writeConfigurationAudit({
        tenantId,
        action: "atualizar",
        entity: "tenant_integrations",
        entityId: tenantId,
        before,
        after,
        actor: actorFromRequest(req),
      });
      if (!audited) req.log?.warn({ tenantId, keys }, "configuracoes: falha ao auditar integrações salvas no tenant");
    })().catch((error) => {
      req.log?.warn({ error, tenantId, keys }, "configuracoes: auditoria de integrações do tenant indisponível");
    });
  });

  next();
  return true;
}

/**
 * Middleware único da trilha de Configurações. É montado antes dos routers
 * canônicos e observa apenas mutações configuracionais, sem substituir nem
 * duplicar as regras de negócio desses routers.
 */
export const configurationBusinessProfileAudit: RequestHandler = async (req, res, next) => {
  if (await auditBusinessProfile(req, res, next)) return;
  if (await auditAgentConfiguration(req, res, next)) return;
  if (await auditDocumentConfiguration(req, res, next)) return;
  if (await auditTenantIntegrationSettings(req, res, next)) return;
  next();
};