import { Router, type IRouter } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  partnersTable,
  tenantsTable,
  leadsTable,
  conversationsTable,
  dealsTable,
  activitiesTable,
  partnerCommissionsTable,
  partnerIndicatorsTable,
} from "@workspace/db";
import { requireRole, requirePartner } from "../middlewares/auth.js";
import { findLeadByDedup, storePhone } from "../lib/dedup.js";
import { leadRegistrationMetadata, normalizeLeadEmail, normalizeLeadName } from "../lib/lead-registration-standard.js";

const router: IRouter = Router();

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const createPartnerSchema = z.object({
  nomeFantasia: z.string().min(1),
  cnpj: z.string().optional(),
  email: z.email(),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().max(2).optional(),
  licencaExclusiva: z.boolean().optional().default(false),
  nivel: z.number().int().min(1).optional().default(1),
  status: z.string().optional().default("ativo"),
});

const indicateLeadSchema = z.object({
  tenantId: z.string().min(1),
  nome: z.string().min(1),
  telefone: z.string().optional(),
  email: z.string().optional(),
  empresa: z.string().optional(),
  objetivo: z.string().optional(),
});

// ─── Admin: criar parceiro ─────────────────────────────────────────────────

router.post("/partners", requireRole("super_admin"), async (req, res) => {
  const parsed = createPartnerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .insert(partnersTable)
    .values({
      nomeFantasia: parsed.data.nomeFantasia,
      cnpj: parsed.data.cnpj,
      email: parsed.data.email,
      telefone: parsed.data.telefone,
      cidade: parsed.data.cidade,
      uf: parsed.data.uf,
      licencaExclusiva: parsed.data.licencaExclusiva,
      nivel: parsed.data.nivel,
      status: parsed.data.status,
    })
    .returning();

  res.status(201).json(partner);
});

// ─── Parceiro: indicar lead ────────────────────────────────────────────────
// STATIC before /:id routes

router.post("/partners/indicate", requirePartner, async (req, res) => {
  const parsed = indicateLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { tenantId, nome, telefone, email, empresa, objetivo } = parsed.data;
  const partnerId = req.partnerId!;

  // Verify tenant belongs to this partner
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.id, tenantId),
        eq(tenantsTable.partnerId, partnerId),
      ),
    )
    .limit(1);

  if (!tenant) {
    res.status(403).json({ error: "Tenant not found or not associated with this partner" });
    return;
  }

  const dedup = await findLeadByDedup(tenantId, telefone, null, nome);
  if (dedup.found) {
    const [lead] = await db
      .update(leadsTable)
      .set({
        telefone: dedup.lead.telefone ?? storePhone(telefone),
        email: dedup.lead.email ?? normalizeLeadEmail(email),
        empresa: dedup.lead.empresa ?? empresa?.trim() || null,
        objetivo: dedup.lead.objetivo ?? objetivo?.trim() || null,
        indicadoPor: dedup.lead.indicadoPor ?? partnerId,
        partnerVisible: true,
        metadata: leadRegistrationMetadata(dedup.lead.metadata, {
          entryChannel: "parceiro",
          entrySource: "indicacao_parceiro",
          details: { partnerId },
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(leadsTable.id, dedup.lead.id), eq(leadsTable.tenantId, tenantId)))
      .returning();
    res.status(200).json({ ...lead, merged: true });
    return;
  }

  const [lead] = await db
    .insert(leadsTable)
    .values({
      tenantId,
      nome: normalizeLeadName(nome, "Lead indicado"),
      telefone: storePhone(telefone),
      email: normalizeLeadEmail(email),
      empresa: empresa?.trim() || null,
      objetivo: objetivo?.trim() || null,
      indicadoPor: partnerId,
      partnerVisible: true,
      source: "indicacao_parceiro",
      metadata: leadRegistrationMetadata(null, {
        entryChannel: "parceiro",
        entrySource: "indicacao_parceiro",
        details: { partnerId },
      }),
    })
    .returning();

  res.status(201).json(lead);
});

// ─── Parceiro: listar seus leads ─────────────────────────────────────────
// STATIC before /:id routes

router.get("/partners/leads", requirePartner, async (req, res) => {
  const partnerId = req.partnerId!;

  const leads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      telefone: leadsTable.telefone,
      email: leadsTable.email,
      empresa: leadsTable.empresa,
      status: leadsTable.status,
      tenantId: leadsTable.tenantId,
      source: leadsTable.source,
      createdAt: leadsTable.createdAt,
      updatedAt: leadsTable.updatedAt,
      tenantName: tenantsTable.name,
    })
    .from(leadsTable)
    .innerJoin(tenantsTable, eq(leadsTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(leadsTable.indicadoPor, partnerId),
        eq(leadsTable.partnerVisible, true),
      ),
    )
    .orderBy(desc(leadsTable.createdAt));

  res.json(leads);
});

// ─── Parceiro: resumo de comissões por status ────────────────────────────
// STATIC before /:id routes

router.get("/partners/commissions/summary", requirePartner, async (req, res) => {
  const partnerId = req.partnerId!;

  const rows = await db
    .select({
      status: partnerCommissionsTable.status,
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${partnerCommissionsTable.valor}), 0)::text`,
    })
    .from(partnerCommissionsTable)
    .where(eq(partnerCommissionsTable.partnerId, partnerId))
    .groupBy(partnerCommissionsTable.status);

  res.json(rows);
});

// ─── Parceiro: detalhe de lead (read-only) ───────────────────────────────

router.get("/partners/leads/:id", requirePartner, async (req, res) => {
  const partnerId = req.partnerId!;
  const leadId = String(req.params["id"]);

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(
      and(
        eq(leadsTable.id, leadId),
        eq(leadsTable.indicadoPor, partnerId),
        eq(leadsTable.partnerVisible, true),
      ),
    )
    .limit(1);

  if (!lead) {
    res.status(404).json({ error: "Lead not found or access denied" });
    return;
  }

  const [conversations, deals, activities] = await Promise.all([
    db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.leadId, leadId))
      .orderBy(desc(conversationsTable.updatedAt)),
    db
      .select()
      .from(dealsTable)
      .where(eq(dealsTable.leadId, leadId))
      .orderBy(desc(dealsTable.createdAt)),
    db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.leadId, leadId))
      .orderBy(desc(activitiesTable.createdAt)),
  ]);

  res.json({ lead, conversations, deals, activities });
});

// ─── Dashboard do parceiro ───────────────────────────────────────────────

router.get("/partners/:id/dashboard", requireRole("partner", "super_admin"), async (req, res) => {
  const partnerId = String(req.params["id"]);

  // Partners can only see their own dashboard
  if (
    req.user!.platformRole === "partner" &&
    req.user!.partnerId !== partnerId
  ) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [partner] = await db
    .select({
      id: partnersTable.id,
      nomeFantasia: partnersTable.nomeFantasia,
      nivel: partnersTable.nivel,
      status: partnersTable.status,
    })
    .from(partnersTable)
    .where(eq(partnersTable.id, partnerId))
    .limit(1);

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [
    totalClientesRow,
    comissaoMesRow,
    leadsEmNegociacaoRow,
    indicatorRows,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenantsTable)
      .where(
        and(
          eq(tenantsTable.partnerId, partnerId),
          eq(tenantsTable.status, "active"),
        ),
      ),
    db
      .select({
        total: sql<string>`coalesce(sum(${partnerCommissionsTable.valor}), 0)::text`,
      })
      .from(partnerCommissionsTable)
      .where(
        and(
          eq(partnerCommissionsTable.partnerId, partnerId),
          gte(partnerCommissionsTable.dataReferencia, startOfMonth.toISOString().slice(0, 10)),
          lte(partnerCommissionsTable.dataReferencia, endOfMonth.toISOString().slice(0, 10)),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.indicadoPor, partnerId),
          eq(leadsTable.status, "em_negociacao"),
          eq(leadsTable.partnerVisible, true),
        ),
      ),
    // Last 6 months of indicators
    db
      .select()
      .from(partnerIndicatorsTable)
      .where(eq(partnerIndicatorsTable.partnerId, partnerId))
      .orderBy(desc(partnerIndicatorsTable.mesReferencia))
      .limit(6),
  ]);

  res.json({
    partner,
    cards: {
      totalClientesAtivos: totalClientesRow[0]?.count ?? 0,
      comissaoMes: comissaoMesRow[0]?.total ?? "0",
      nivelAtual: partner.nivel,
      leadsEmNegociacao: leadsEmNegociacaoRow[0]?.count ?? 0,
    },
    grafico: indicatorRows.reverse(),
  });
});

// ─── Parceiro: listar comissões com filtros ──────────────────────────────

router.get("/partners/:id/commissions", requireRole("partner", "super_admin"), async (req, res) => {
  const partnerId = String(req.params["id"]);

  if (
    req.user!.platformRole === "partner" &&
    req.user!.partnerId !== partnerId
  ) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const mesFilter = req.query["mes"] as string | undefined;
  const statusFilter = req.query["status"] as string | undefined;

  const conditions = [eq(partnerCommissionsTable.partnerId, partnerId)];

  if (mesFilter) {
    // mes = "2025-06" → filter by month
    const start = `${mesFilter}-01`;
    const endDate = new Date(`${mesFilter}-01`);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = endDate.toISOString().slice(0, 10);
    conditions.push(gte(partnerCommissionsTable.dataReferencia, start));
    conditions.push(lte(partnerCommissionsTable.dataReferencia, end));
  }

  if (statusFilter) {
    conditions.push(eq(partnerCommissionsTable.status, statusFilter));
  }

  const commissions = await db
    .select()
    .from(partnerCommissionsTable)
    .where(and(...conditions))
    .orderBy(desc(partnerCommissionsTable.createdAt));

  res.json(commissions);
});

// ─── Admin: listar todos os parceiros ────────────────────────────────────

router.get("/admin/partners", requireRole("super_admin"), async (req, res) => {
  const partners = await db
    .select({
      id: partnersTable.id,
      nomeFantasia: partnersTable.nomeFantasia,
      email: partnersTable.email,
      cnpj: partnersTable.cnpj,
      telefone: partnersTable.telefone,
      cidade: partnersTable.cidade,
      uf: partnersTable.uf,
      licencaExclusiva: partnersTable.licencaExclusiva,
      status: partnersTable.status,
      nivel: partnersTable.nivel,
      dataCadastro: partnersTable.dataCadastro,
      // legacy
      name: partnersTable.name,
      asaasWalletId: partnersTable.asaasWalletId,
      userId: partnersTable.userId,
      createdAt: partnersTable.createdAt,
      // aggregates
      clientesAtivos: sql<number>`(
        SELECT COUNT(*)::int FROM tenants
        WHERE partner_id = ${partnersTable.id} AND status = 'active'
      )`,
      comissaoTotal: sql<string>`COALESCE((
        SELECT SUM(valor) FROM partner_commissions
        WHERE partner_id = ${partnersTable.id} AND status = 'paga'
      ), 0)::text`,
    })
    .from(partnersTable)
    .orderBy(desc(partnersTable.dataCadastro));

  res.json(partners);
});

// ─── Admin: listar comissões ──────────────────────────────────────────────

router.get("/admin/commissions", requireRole("super_admin"), async (req, res) => {
  const statusFilter = req.query["status"] as string | undefined;

  const conditions: ReturnType<typeof eq>[] = [];
  if (statusFilter) {
    conditions.push(eq(partnerCommissionsTable.status, statusFilter));
  }

  const commissions = await db
    .select({
      id: partnerCommissionsTable.id,
      partnerId: partnerCommissionsTable.partnerId,
      partnerName: partnersTable.nomeFantasia,
      tenantId: partnerCommissionsTable.tenantId,
      tenantName: tenantsTable.name,
      tipo: partnerCommissionsTable.tipo,
      valorBase: partnerCommissionsTable.valorBase,
      percentual: partnerCommissionsTable.percentual,
      valor: partnerCommissionsTable.valor,
      dataReferencia: partnerCommissionsTable.dataReferencia,
      status: partnerCommissionsTable.status,
      createdAt: partnerCommissionsTable.createdAt,
    })
    .from(partnerCommissionsTable)
    .leftJoin(partnersTable, eq(partnersTable.id, partnerCommissionsTable.partnerId))
    .leftJoin(tenantsTable, eq(tenantsTable.id, partnerCommissionsTable.tenantId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(partnerCommissionsTable.createdAt));

  res.json(commissions);
});

// ─── Admin: atualizar status do parceiro ─────────────────────────────────

router.patch("/admin/partners/:id/status", requireRole("super_admin"), async (req, res) => {
  const partnerId = String(req.params["id"]);

  const parsed = z.object({
    status: z.enum(["ativo", "suspenso", "cancelado"]),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [partner] = await db
    .update(partnersTable)
    .set({ status: parsed.data.status })
    .where(eq(partnersTable.id, partnerId))
    .returning({
      id: partnersTable.id,
      nomeFantasia: partnersTable.nomeFantasia,
      status: partnersTable.status,
    });

  if (!partner) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  res.json(partner);
});

// ─── Admin: atualizar status da comissão ──────────────────────────────────

router.patch("/admin/commissions/:id/status", requireRole("super_admin"), async (req, res) => {
  const commissionId = String(req.params["id"]);

  const parsed = z.object({
    status: z.enum(["pendente", "aprovada", "paga", "cancelada"]),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db
    .update(partnerCommissionsTable)
    .set({ status: parsed.data.status })
    .where(eq(partnerCommissionsTable.id, commissionId))
    .returning();

  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }

  res.json(commission);
});

export default router;
