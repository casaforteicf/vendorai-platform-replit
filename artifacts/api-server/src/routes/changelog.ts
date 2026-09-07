import { Router, type IRouter } from "express";
import { eq, and, desc, isNotNull, gt, gte, lte, count } from "drizzle-orm";
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
      userId: req.user?.id ?? req.user?.sub ?? null,
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
