/**
 * BLOCO 14 — Painel Consolidado Multi-loja (Fase A)
 *
 * Rotas para gestão de organizações (redes de lojas) e painel consolidado.
 * Cada consulta de métricas é isolada por tenantId — sem joins cross-tenant no banco.
 * A agregação acontece na camada JS, nunca em SQL que cruze dados entre tenants.
 *
 * Isolamento de dados:
 * - Nenhuma query vaza registros individuais de uma loja para outra.
 * - O painel retorna apenas somas/contagens por tenant, nunca dados brutos.
 * - Login/sessão não é alterado (Fase B, escopo separado).
 */
import { Router, type IRouter } from "express";
import { and, eq, inArray, sql, gte } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  organizacoesTable,
  usuariosOrganizacaoTable,
  tenantsTable,
  leadsTable,
  dealsTable,
  messagesTable,
  aiUsageLogsTable,
} from "@workspace/db";
import { authenticate } from "../middlewares/auth.js";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function isMembro(organizacaoId: string, userId: string): Promise<boolean> {
  const [org] = await db
    .select({ id: organizacoesTable.id })
    .from(organizacoesTable)
    .where(eq(organizacoesTable.id, organizacaoId))
    .limit(1);
  if (!org) return false;

  // Owner always has access
  const [ownerRow] = await db
    .select({ id: organizacoesTable.id })
    .from(organizacoesTable)
    .where(and(eq(organizacoesTable.id, organizacaoId), eq(organizacoesTable.ownerId, userId)))
    .limit(1);
  if (ownerRow) return true;

  // Check membership table
  const [member] = await db
    .select({ id: usuariosOrganizacaoTable.id })
    .from(usuariosOrganizacaoTable)
    .where(
      and(
        eq(usuariosOrganizacaoTable.organizacaoId, organizacaoId),
        eq(usuariosOrganizacaoTable.userId, userId),
      ),
    )
    .limit(1);
  return !!member;
}

async function isOwner(organizacaoId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizacoesTable.id })
    .from(organizacoesTable)
    .where(and(eq(organizacoesTable.id, organizacaoId), eq(organizacoesTable.ownerId, userId)))
    .limit(1);
  return !!row;
}

// ── GET /organizacoes — listar organizações do usuário ───────────────────────
router.get("/organizacoes", authenticate, async (req, res) => {
  const userId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  let orgs;
  if (isSuperAdmin) {
    orgs = await db.select().from(organizacoesTable).orderBy(organizacoesTable.createdAt);
  } else {
    // Orgs where user is owner
    const owned = await db
      .select()
      .from(organizacoesTable)
      .where(eq(organizacoesTable.ownerId, userId));

    // Orgs where user is a member
    const memberships = await db
      .select({ organizacaoId: usuariosOrganizacaoTable.organizacaoId })
      .from(usuariosOrganizacaoTable)
      .where(eq(usuariosOrganizacaoTable.userId, userId));

    const memberIds = memberships.map((m) => m.organizacaoId).filter((id) => !owned.some((o) => o.id === id));
    const memberOrgs = memberIds.length > 0
      ? await db.select().from(organizacoesTable).where(inArray(organizacoesTable.id, memberIds))
      : [];

    orgs = [...owned, ...memberOrgs];
  }

  // Enrich with tenant count
  const enriched = await Promise.all(
    orgs.map(async (org) => {
      const tenants = await db
        .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
        .from(tenantsTable)
        .where(eq(tenantsTable.organizacaoId, org.id));
      return { ...org, tenantCount: tenants.length, tenants };
    }),
  );

  res.json(enriched);
});

// ── POST /organizacoes — criar organização ───────────────────────────────────
const createOrgSchema = z.object({
  nome: z.string().min(2).max(200),
});

router.post("/organizacoes", authenticate, async (req, res) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.sub;
  const [org] = await db
    .insert(organizacoesTable)
    .values({ nome: parsed.data.nome, ownerId: userId })
    .returning();
  res.status(201).json(org);
});

// ── PATCH /organizacoes/:id — atualizar nome ─────────────────────────────────
router.patch("/organizacoes/:id", authenticate, async (req, res) => {
  const id = req.params.id as string;
  const userId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isOwner(id, userId))) {
    res.status(403).json({ error: "Apenas o dono da organização pode editá-la" });
    return;
  }

  const parsed = z.object({ nome: z.string().min(2).max(200) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [updated] = await db
    .update(organizacoesTable)
    .set({ nome: parsed.data.nome, updatedAt: new Date() })
    .where(eq(organizacoesTable.id, id))
    .returning();

  res.json(updated);
});

// ── POST /organizacoes/:id/members — adicionar membro ────────────────────────
const addMemberSchema = z.object({
  userId: z.string().min(1),
  nivel: z.enum(["admin_organizacao"]).default("admin_organizacao"),
});

router.post("/organizacoes/:id/members", authenticate, async (req, res) => {
  const id = req.params.id as string;
  const requesterId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isOwner(id, requesterId))) {
    res.status(403).json({ error: "Apenas o dono pode adicionar membros" });
    return;
  }

  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // Upsert to avoid duplicates
  const existing = await db
    .select()
    .from(usuariosOrganizacaoTable)
    .where(
      and(
        eq(usuariosOrganizacaoTable.organizacaoId, id),
        eq(usuariosOrganizacaoTable.userId, parsed.data.userId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    res.json(existing[0]);
    return;
  }

  const [member] = await db
    .insert(usuariosOrganizacaoTable)
    .values({ organizacaoId: id, userId: parsed.data.userId, nivel: parsed.data.nivel })
    .returning();

  res.status(201).json(member);
});

// ── DELETE /organizacoes/:id/members/:userId — remover membro ────────────────
router.delete("/organizacoes/:id/members/:userId", authenticate, async (req, res) => {
  const id = req.params.id as string;
  const targetUserId = req.params.userId as string;
  const requesterId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isOwner(id, requesterId))) {
    res.status(403).json({ error: "Apenas o dono pode remover membros" });
    return;
  }

  await db
    .delete(usuariosOrganizacaoTable)
    .where(
      and(
        eq(usuariosOrganizacaoTable.organizacaoId, id),
        eq(usuariosOrganizacaoTable.userId, targetUserId),
      ),
    );

  res.json({ ok: true });
});

// ── POST /organizacoes/:id/tenants/:tenantId — vincular tenant ───────────────
router.post("/organizacoes/:id/tenants/:tenantId", authenticate, async (req, res) => {
  const orgId = req.params.id as string;
  const tenantId = req.params.tenantId as string;
  const requesterId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isOwner(orgId, requesterId))) {
    res.status(403).json({ error: "Apenas o dono pode vincular tenants" });
    return;
  }

  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) {
    res.status(404).json({ error: "Tenant não encontrado" });
    return;
  }

  await db
    .update(tenantsTable)
    .set({ organizacaoId: orgId })
    .where(eq(tenantsTable.id, tenantId));

  res.json({ ok: true, tenantId, organizacaoId: orgId });
});

// ── DELETE /organizacoes/:id/tenants/:tenantId — desvincular tenant ──────────
router.delete("/organizacoes/:id/tenants/:tenantId", authenticate, async (req, res) => {
  const orgId = req.params.id as string;
  const tenantId = req.params.tenantId as string;
  const requesterId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isOwner(orgId, requesterId))) {
    res.status(403).json({ error: "Apenas o dono pode desvincular tenants" });
    return;
  }

  await db
    .update(tenantsTable)
    .set({ organizacaoId: null })
    .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.organizacaoId, orgId)));

  res.json({ ok: true });
});

// ── GET /organizacoes/:id/painel — painel consolidado ────────────────────────
// ISOLAMENTO: cada query de métricas é scoped a um tenantId isolado.
// Nenhum join cross-tenant ocorre no banco. Apenas somas numéricas são retornadas.
// Registros individuais de uma loja nunca aparecem na resposta de outra.
router.get("/organizacoes/:id/painel", authenticate, async (req, res) => {
  const orgId = req.params.id as string;
  const requesterId = req.user!.sub;
  const isSuperAdmin = req.user!.platformRole === "super_admin";

  if (!isSuperAdmin && !(await isMembro(orgId, requesterId))) {
    res.status(403).json({ error: "Acesso negado à organização" });
    return;
  }

  const [org] = await db
    .select()
    .from(organizacoesTable)
    .where(eq(organizacoesTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "Organização não encontrada" });
    return;
  }

  // Listar todos os tenants vinculados a esta org
  const tenants = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      status: tenantsTable.status,
      mensalidadeValor: tenantsTable.mensalidadeValor,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.organizacaoId, orgId));

  if (tenants.length === 0) {
    res.json({
      organizacao: org,
      lojas: [],
      totais: {
        totalLeads: 0,
        totalDealsGanhos: 0,
        faturamentoTotalGanho: 0,
        totalMensagens30d: 0,
        mrrTotal: 0,
      },
    });
    return;
  }

  const now = new Date();
  const inicio30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Para cada tenant, buscar métricas de forma isolada (query separada por tenantId)
  const lojas = await Promise.all(
    tenants.map(async (tenant) => {
      // Leads: contagem isolada por tenant
      const [leadsRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenant.id));

      // Deals ganhos: contagem + receita, isolados por tenant
      const [dealsRow] = await db
        .select({
          count: sql<number>`count(*)`,
          receita: sql<number>`coalesce(sum(${canonicalDealValueSql}), 0)`,
        })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenant.id), eq(dealsTable.etapa, "ganho")));

      // Mensagens últimos 30 dias: contagem isolada por tenant
      const [msgRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messagesTable)
        .where(
          and(eq(messagesTable.tenantId, tenant.id), gte(messagesTable.createdAt, inicio30d)),
        );

      // AI cost este mês: isolado por tenant
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const [aiRow] = await db
        .select({ custo: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
        .from(aiUsageLogsTable)
        .where(
          and(
            eq(aiUsageLogsTable.tenantId, tenant.id),
            gte(aiUsageLogsTable.createdAt, startOfMonth),
          ),
        );

      const mrr = tenant.mensalidadeValor ? Number(tenant.mensalidadeValor) : 0;

      return {
        tenantId: tenant.id,
        nome: tenant.name,
        status: tenant.status,
        mrr,
        totalLeads: Number(leadsRow?.count ?? 0),
        dealsGanhos: Number(dealsRow?.count ?? 0),
        receitaGanha: Number(dealsRow?.receita ?? 0),
        mensagens30d: Number(msgRow?.count ?? 0),
        custoIaMes: Number(aiRow?.custo ?? 0),
        margemMes: mrr - Number(aiRow?.custo ?? 0),
      };
    }),
  );

  // Totais agregados (apenas na camada JS, nunca em SQL cross-tenant)
  const totais = lojas.reduce(
    (acc, l) => ({
      totalLeads: acc.totalLeads + l.totalLeads,
      totalDealsGanhos: acc.totalDealsGanhos + l.dealsGanhos,
      faturamentoTotalGanho: acc.faturamentoTotalGanho + l.receitaGanha,
      totalMensagens30d: acc.totalMensagens30d + l.mensagens30d,
      mrrTotal: acc.mrrTotal + l.mrr,
      custoIaTotalMes: acc.custoIaTotalMes + l.custoIaMes,
      margemTotalMes: acc.margemTotalMes + l.margemMes,
    }),
    {
      totalLeads: 0,
      totalDealsGanhos: 0,
      faturamentoTotalGanho: 0,
      totalMensagens30d: 0,
      mrrTotal: 0,
      custoIaTotalMes: 0,
      margemTotalMes: 0,
    },
  );

  res.json({ organizacao: org, lojas, totais });
});

export default router;
