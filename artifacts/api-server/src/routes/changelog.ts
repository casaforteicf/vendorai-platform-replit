import { Router, type IRouter } from "express";
import { eq, and, desc, isNotNull, gt, gte, lte, count, sql } from "drizzle-orm";
import {
  db,
  changelogEntriesTable,
  usersTable,
  erpAuditoriaTable,
  businessProfilesTable,
  tenantsTable,
  updateBusinessProfileSchema,
  insertChangelogEntrySchema,
  updateChangelogEntrySchema,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { automaticChangelogEntries } from "../data/automatic-changelog.js";
import { writeConfigurationAudit } from "../lib/configuration-audit.js";
import { getTenantAsaasApiKey } from "../lib/asaas.js";

const router: IRouter = Router();

const SAFE_BUSINESS_PROFILE_ROLLBACK_KEYS = [
  "razaoSocial",
  "nomeFantasia",
  "cnpj",
  "endereco",
  "telefone",
  "email",
  "vertical",
  "logoUrl",
  "faviconUrl",
  "urlLinhaProdutos",
  "instagramUrl",
  "diferenciais",
  "publicoAlvo",
  "concorrentes",
  "canaisVenda",
  "metodoVendas",
] as const;

function automaticEntries() {
  return automaticChangelogEntries.map((entry) => ({
    ...entry,
    publicadoEm: new Date(entry.publicadoEm),
    createdAt: new Date(entry.publicadoEm),
    updatedAt: new Date(entry.publicadoEm),
    automatico: true,
  }));
}

function canAccessTenant(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function safeBusinessProfileRollbackInput(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const source = snapshot as Record<string, unknown>;
  const selected = Object.fromEntries(
    SAFE_BUSINESS_PROFILE_ROLLBACK_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(source, key))
      .map((key) => [key, source[key]]),
  );
  return Object.keys(selected).length > 0 ? selected : null;
}

function validHttpUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

type ExternalHealth = {
  configured: boolean;
  reachable: boolean | null;
  status: "ok" | "warning" | "failed" | "not_configured";
  message: string;
};

async function checkAsaasHealth(tenantId: string, configured: boolean): Promise<ExternalHealth> {
  if (!configured) return { configured: false, reachable: null, status: "not_configured", message: "Asaas não configurado." };
  try {
    const apiKey = await getTenantAsaasApiKey(tenantId);
    if (!apiKey) return { configured: true, reachable: false, status: "failed", message: "Chave Asaas salva, mas não pôde ser descriptografada." };
    const response = await fetch("https://api.asaas.com/api/v3/myAccount", {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(6000),
    });
    return response.ok
      ? { configured: true, reachable: true, status: "ok", message: "Asaas autenticado e respondendo." }
      : { configured: true, reachable: false, status: "failed", message: `Asaas respondeu HTTP ${response.status}.` };
  } catch {
    return { configured: true, reachable: false, status: "failed", message: "Não foi possível validar a conexão com Asaas." };
  }
}

async function checkZapSignHealth(apiKey: string | null | undefined): Promise<ExternalHealth> {
  if (!apiKey) return { configured: false, reachable: null, status: "not_configured", message: "ZapSign não configurado." };
  try {
    const response = await fetch("https://api.zapsign.com.br/api/v1/users/me/", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    return response.ok
      ? { configured: true, reachable: true, status: "ok", message: "ZapSign autenticado e respondendo." }
      : { configured: true, reachable: false, status: "failed", message: `ZapSign respondeu HTTP ${response.status}.` };
  } catch {
    return { configured: true, reachable: false, status: "failed", message: "Não foi possível validar a conexão com ZapSign." };
  }
}

router.get("/changelog", async (_req, res) => {
  const rows = await db.select()
    .from(changelogEntriesTable)
    .where(isNotNull(changelogEntriesTable.publicadoEm))
    .orderBy(desc(changelogEntriesTable.publicadoEm));

  const combined = [
    ...rows.map((row) => ({ ...row, automatico: false })),
    ...automaticEntries(),
  ].sort((a, b) => (b.publicadoEm?.getTime() ?? 0) - (a.publicadoEm?.getTime() ?? 0));

  return res.json(combined);
});

router.get("/changelog/unread-count", async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const [user] = await db.select({ changelogLidoEm: usersTable.changelogLidoEm })
    .from(usersTable).where(eq(usersTable.id, userId));

  const cutoff = user?.changelogLidoEm ?? new Date(0);
  const [row] = await db.select({ total: count() })
    .from(changelogEntriesTable)
    .where(and(isNotNull(changelogEntriesTable.publicadoEm), gt(changelogEntriesTable.publicadoEm, cutoff)));

  const automaticUnread = automaticChangelogEntries.filter(
    (entry) => new Date(entry.publicadoEm) > cutoff,
  ).length;

  return res.json({ count: (row?.total ?? 0) + automaticUnread });
});

router.post("/changelog/marcar-lido", async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  await db.update(usersTable).set({ changelogLidoEm: new Date() }).where(eq(usersTable.id, userId));
  return res.json({ ok: true });
});

router.get("/tenants/:tenantId/configuration-health", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccessTenant before tenant data access
  const tenantId = String(req.params.tenantId || "");
  if (!tenantId || !canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [tenant] = await db.select({
    asaasApiKey: tenantsTable.asaasApiKey,
    zapsignApiKey: tenantsTable.zapsignApiKey,
    webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
    apiKeyEstoque: tenantsTable.apiKeyEstoque,
    integrationType: tenantsTable.integrationType,
    tipoFechamentoDefault: tenantsTable.tipoFechamentoDefault,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);

  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const contractResult = await db.execute(
    sql`SELECT contract_template_html, contract_template_name, contract_settings FROM tenants WHERE id = ${tenantId}`,
  );
  const contractRow = (contractResult as any).rows?.[0] ?? (contractResult as any)[0] ?? null;
  const contractTemplateConfigured = Boolean(contractRow?.contract_template_html || contractRow?.contract_template_name);
  const contractSettingsConfigured = Boolean(contractRow?.contract_settings && Object.keys(contractRow.contract_settings).length > 0);
  const closureType = tenant.tipoFechamentoDefault ?? "pedido";
  const contractRequired = closureType === "contrato" || closureType === "pedido_e_contrato";

  const stockUrlValid = validHttpUrl(tenant.webhookEstoqueUrl);
  const stockConfigured = Boolean(tenant.webhookEstoqueUrl || tenant.apiKeyEstoque);
  const stockReady = stockConfigured && stockUrlValid;

  const [asaas, zapsign] = await Promise.all([
    checkAsaasHealth(tenantId, Boolean(tenant.asaasApiKey)),
    checkZapSignHealth(tenant.zapsignApiKey),
  ]);

  const documentsStatus = contractRequired && !contractTemplateConfigured ? "failed" : contractTemplateConfigured ? "ok" : "warning";
  const commercialStatus = ["pedido", "contrato", "pedido_e_contrato"].includes(closureType) ? "ok" : "failed";
  const stockStatus = !stockConfigured ? "warning" : stockReady ? "ok" : "failed";

  const checks = {
    asaas,
    zapsign,
    stock: {
      configured: stockConfigured,
      ready: stockReady,
      status: stockStatus,
      integrationType: tenant.integrationType ?? "api",
      hasWebhookUrl: Boolean(tenant.webhookEstoqueUrl),
      webhookUrlValid: stockUrlValid,
      hasApiKey: Boolean(tenant.apiKeyEstoque),
      message: !stockConfigured
        ? "Integração de estoque não configurada."
        : stockReady
          ? "Webhook/API de estoque possui URL válida e configuração persistida."
          : "Integração de estoque está incompleta ou com URL inválida.",
    },
    documents: {
      status: documentsStatus,
      contractRequired,
      templateConfigured: contractTemplateConfigured,
      settingsConfigured: contractSettingsConfigured,
      message: contractRequired && !contractTemplateConfigured
        ? "O tipo de fechamento exige contrato, mas não há modelo de contrato configurado."
        : contractTemplateConfigured
          ? "Modelo de contrato disponível para o fluxo documental."
          : "Contrato não é obrigatório no fechamento atual; modelo continua opcional.",
    },
    commercial: {
      status: commercialStatus,
      closureType,
      message: commercialStatus === "ok"
        ? `Regra de fechamento ativa: ${closureType}.`
        : "Tipo de fechamento inválido; revise a configuração comercial.",
    },
  };

  const statuses = [asaas.status, zapsign.status, stockStatus, documentsStatus, commercialStatus];
  const overall = statuses.includes("failed") ? "failed" : statuses.includes("warning") || statuses.includes("not_configured") ? "warning" : "ok";

  return res.json({
    overall,
    checkedAt: new Date().toISOString(),
    checks,
  });
});

router.get("/tenants/:tenantId/configuration-history", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  const requestedTenantId = Reflect.get(req.params, "tenantId");
  const tenantId = typeof requestedTenantId === "string" ? requestedTenantId : "";
  if (!tenantId || !canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 50;
  const requestedPage = Number(req.query.page);
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;
  const offset = (page - 1) * limit;

  const action = typeof req.query.action === "string" && req.query.action.trim()
    ? req.query.action.trim()
    : null;
  const entity = typeof req.query.entity === "string" && req.query.entity.trim()
    ? req.query.entity.trim()
    : null;
  const from = parseOptionalDate(req.query.from);
  const to = parseOptionalDate(req.query.to);
  if (from === "invalid" || to === "invalid") {
    return res.status(400).json({ error: "Invalid date filter" });
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: "Invalid date range" });
  }

  const filters = [
    eq(erpAuditoriaTable.tenantId, tenantId),
    eq(erpAuditoriaTable.modulo, "configuracoes"),
  ];
  if (action) filters.push(eq(erpAuditoriaTable.acao, action));
  if (entity) filters.push(eq(erpAuditoriaTable.entidade, entity));
  if (from) filters.push(gte(erpAuditoriaTable.createdAt, from));
  if (to) filters.push(lte(erpAuditoriaTable.createdAt, to));
  const where = and(...filters);

  const [items, totalRows] = await Promise.all([
    db.select({
      id: erpAuditoriaTable.id,
      usuarioId: erpAuditoriaTable.usuarioId,
      actorName: usersTable.name,
      actorEmail: usersTable.email,
      acao: erpAuditoriaTable.acao,
      entidade: erpAuditoriaTable.entidade,
      entidadeId: erpAuditoriaTable.entidadeId,
      antes: erpAuditoriaTable.antes,
      depois: erpAuditoriaTable.depois,
      ip: erpAuditoriaTable.ip,
      createdAt: erpAuditoriaTable.createdAt,
    })
      .from(erpAuditoriaTable)
      .leftJoin(usersTable, eq(usersTable.id, erpAuditoriaTable.usuarioId))
      .where(where)
      .orderBy(desc(erpAuditoriaTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() })
      .from(erpAuditoriaTable)
      .where(where),
  ]);

  const total = totalRows[0]?.total ?? 0;
  return res.json({
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    filters: { action, entity, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null },
  });
});

router.post("/tenants/:tenantId/configuration-history/:auditId/rollback", requireRole("super_admin", "tenant_admin"), async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked by canAccessTenant before tenant data access
  const tenantId = String(req.params.tenantId || "");
  const auditId = String(req.params.auditId || "");
  if (!tenantId || !auditId || !canAccessTenant(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  if (req.body?.confirm !== "RESTAURAR") {
    return res.status(422).json({ error: "Confirmação explícita necessária" });
  }

  const [sourceAudit] = await db.select().from(erpAuditoriaTable).where(and(
    eq(erpAuditoriaTable.id, auditId),
    eq(erpAuditoriaTable.tenantId, tenantId),
    eq(erpAuditoriaTable.modulo, "configuracoes"),
  )).limit(1);

  if (!sourceAudit) return res.status(404).json({ error: "Alteração não encontrada" });
  if (sourceAudit.entidade !== "business_profile" || sourceAudit.acao !== "atualizar" || !sourceAudit.entidadeId) {
    return res.status(409).json({
      error: "Rollback automático não permitido para esta alteração",
      reason: "Nesta fase, apenas atualizações do Perfil da Empresa podem ser restauradas automaticamente.",
    });
  }

  const rollbackInput = safeBusinessProfileRollbackInput(sourceAudit.antes);
  if (!rollbackInput) {
    return res.status(409).json({ error: "Snapshot anterior não contém campos restauráveis" });
  }

  const parsed = updateBusinessProfileSchema.safeParse(rollbackInput);
  if (!parsed.success) {
    return res.status(422).json({ error: "Snapshot anterior não é compatível com o perfil atual" });
  }

  const [current] = await db.select().from(businessProfilesTable).where(and(
    eq(businessProfilesTable.id, sourceAudit.entidadeId),
    eq(businessProfilesTable.tenantId, tenantId),
  )).limit(1);
  if (!current) return res.status(404).json({ error: "Perfil da empresa atual não encontrado" });

  const [restored] = await db.update(businessProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(
      eq(businessProfilesTable.id, current.id),
      eq(businessProfilesTable.tenantId, tenantId),
    ))
    .returning();

  if (parsed.data.vertical !== undefined) {
    await db.update(tenantsTable)
      .set({ vertical: parsed.data.vertical || null, segmento: parsed.data.vertical || null, updatedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));
  }

  await writeConfigurationAudit({
    tenantId,
    action: "atualizar",
    entity: "business_profile",
    entityId: current.id,
    before: current,
    after: restored,
    actor: {
      userId: req.user?.sub ?? req.user?.sub ?? null,
      ip: req.ip ?? null,
    },
  });

  return res.json({
    ok: true,
    sourceAuditId: sourceAudit.id,
    entity: sourceAudit.entidade,
    entityId: current.id,
    restored,
  });
});

router.get("/admin/changelog", requireRole("super_admin"), async (_req, res) => {
  const rows = await db.select().from(changelogEntriesTable).orderBy(desc(changelogEntriesTable.createdAt));
  const combined = [
    ...rows.map((row) => ({ ...row, automatico: false })),
    ...automaticEntries(),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return res.json(combined);
});

router.post("/admin/changelog", requireRole("super_admin"), async (req, res) => {
  const parsed = insertChangelogEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.insert(changelogEntriesTable).values(parsed.data).returning();
  return res.status(201).json(row);
});

router.patch("/admin/changelog/:id", requireRole("super_admin"), async (req, res) => {
  const parsed = updateChangelogEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Validation error", details: parsed.error.issues });

  const [row] = await db.update(changelogEntriesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(changelogEntriesTable.id, req.params.id as string))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.post("/admin/changelog/:id/publicar", requireRole("super_admin"), async (req, res) => {
  const [row] = await db.update(changelogEntriesTable)
    .set({ publicadoEm: new Date(), updatedAt: new Date() })
    .where(eq(changelogEntriesTable.id, req.params.id as string))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

router.delete("/admin/changelog/:id", requireRole("super_admin"), async (req, res) => {
  await db.delete(changelogEntriesTable).where(eq(changelogEntriesTable.id, req.params.id as string));
  return res.status(204).send();
});

export default router;
