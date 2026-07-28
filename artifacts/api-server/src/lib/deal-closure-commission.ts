import { eq, desc } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  dealsTable,
  tenantsTable,
  propostasTable,
  plansTable,
  planAssignmentLogTable,
  usersTable,
  produtosCatalogoTable,
  sellerCommissionsTable,
} from "@workspace/db";

/**
 * Garante que, quando um negócio fecha "ganho", o cliente ganha tenant +
 * plano atribuído, e o vendedor tem a comissão gerada.
 *
 * Extraído do handler PATCH /deals/:id (deals.ts) — até esse extract, essa
 * lógica só rodava quando o negócio era movido pra "Ganho" arrastando o
 * card no Kanban. O fluxo "oficial" de fechamento (botão Vendido →
 * POST /deals/:id/confirm-closure → runDealClosure) NUNCA chamava isso —
 * ou seja, negócios fechados pelo botão Vendido nunca geravam tenant
 * automático, plano atribuído, nem comissão de vendedor registrada.
 * Achado e corrigido numa auditoria do pipeline financeiro.
 *
 * Idempotente: se o deal já tem tenant com plano, não recria; se a
 * comissão já existe pro dealId, não duplica.
 */
export async function ensureTenantPlanAndCommission(
  dealId: string,
  log: Logger,
): Promise<{ tenantId: string | null; tenantCreated: boolean; commissionCreated: boolean }> {
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) {
    log.warn({ dealId }, "ensureTenantPlanAndCommission: deal não encontrado");
    return { tenantId: null, tenantCreated: false, commissionCreated: false };
  }

  if (!deal.planoContratado) {
    log.warn({ dealId }, "ensureTenantPlanAndCommission: deal sem planoContratado, pulando tenant/plano/comissão");
    return { tenantId: deal.tenantId, tenantCreated: false, commissionCreated: false };
  }

  const plano = await db
    .select({ id: plansTable.id, implantationPriceCents: plansTable.implantationPriceCents })
    .from(plansTable)
    .where(eq(plansTable.slug, deal.planoContratado))
    .limit(1)
    .then((rows) => rows[0]);

  if (!plano) {
    log.warn({ dealId, planoContratado: deal.planoContratado }, "ensureTenantPlanAndCommission: plano não encontrado");
    return { tenantId: deal.tenantId, tenantCreated: false, commissionCreated: false };
  }

  // ── Resolve tenant: usar existing ou criar novo do deal ─────────────────
  let tenantId = deal.tenantId;
  let tenantCreated = false;
  let tenant: { id: string } | undefined;
  if (tenantId) {
    tenant = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .then((rows) => rows[0]);
  }
  if (!tenant) {
    const slugBase = (deal.titulo ?? deal.id).toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
    const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
    const [newTenant] = await db
      .insert(tenantsTable)
      .values({ name: deal.titulo, slug, status: "active", partnerId: null })
      .returning({ id: tenantsTable.id });
    tenantId = newTenant.id;
    tenant = newTenant;
    tenantCreated = true;
    await db.update(dealsTable).set({ tenantId: newTenant.id }).where(eq(dealsTable.id, dealId));
    log.info({ dealId, tenantId: newTenant.id }, "ensureTenantPlanAndCommission: tenant criado automaticamente");
  }

  // ── Atribuir plano ao tenant ─────────────────────────────────────────────
  await db
    .update(tenantsTable)
    .set({
      planId: plano.id,
      billingCycle: "monthly",
      planStartedAt: new Date(),
      isDemo: false,
      demoExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId));
  await db.insert(planAssignmentLogTable).values({
    tenantId,
    dealId,
    planId: plano.id,
    assignedBy: "sistema_fechamento_deal",
  });
  log.info({ dealId, tenantId, planId: plano.id }, "ensureTenantPlanAndCommission: plano atribuído ao tenant");

  // ── Auto-gerar comissão do vendedor ──────────────────────────────────────
  // Hierarquia: produto.comissaoPercentual → tenant.comissaoPadraoPercentual → 20 (SaaS default)
  let commissionCreated = false;
  if (deal.assignedTo) {
    try {
      const [sellerUser] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, deal.assignedTo))
        .limit(1);
      const commTenantId = sellerUser?.tenantId ?? tenantId;

      const [propComm] = await db
        .select({ valorTotal: propostasTable.valorTotal, itens: propostasTable.itens })
        .from(propostasTable)
        .where(eq(propostasTable.dealId, dealId))
        .orderBy(desc(propostasTable.createdAt))
        .limit(1);

      let comissaoPercentual: number | null = null;
      if (propComm?.itens && propComm.itens.length > 0) {
        const firstProdutoId = propComm.itens.find((i: any) => i.produtoId)?.produtoId;
        if (firstProdutoId) {
          const [produto] = await db
            .select({ comissaoPercentual: produtosCatalogoTable.comissaoPercentual })
            .from(produtosCatalogoTable)
            .where(eq(produtosCatalogoTable.id, firstProdutoId))
            .limit(1);
          if (produto?.comissaoPercentual != null) {
            comissaoPercentual = parseFloat(String(produto.comissaoPercentual));
          }
        }
      }

      if (comissaoPercentual === null) {
        const [tenantComm] = await db
          .select({ comissaoPadraoPercentual: tenantsTable.comissaoPadraoPercentual })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, tenantId))
          .limit(1);
        if (tenantComm?.comissaoPadraoPercentual != null) {
          const parsed = parseFloat(String(tenantComm.comissaoPadraoPercentual));
          if (parsed > 0) comissaoPercentual = parsed;
        }
      }

      const useLegacySaaS = comissaoPercentual === null && plano.implantationPriceCents && plano.implantationPriceCents > 0;
      if (useLegacySaaS) comissaoPercentual = 20;

      const valorBaseCents = propComm?.valorTotal
        ? Math.round(Number(propComm.valorTotal) * 100)
        : (plano.implantationPriceCents ?? 0);

      if (deal.assignedTo && comissaoPercentual !== null && valorBaseCents > 0) {
        const comissaoCents = Math.round(valorBaseCents * comissaoPercentual / 100);
        const existingComm = await db
          .select({ id: sellerCommissionsTable.id })
          .from(sellerCommissionsTable)
          .where(eq(sellerCommissionsTable.dealId, dealId))
          .limit(1);
        if (existingComm.length === 0) {
          await db.insert(sellerCommissionsTable).values({
            tenantId: commTenantId,
            sellerUserId: deal.assignedTo,
            clienteTenantId: tenantId ?? null,
            dealId,
            planSlug: deal.planoContratado ?? null,
            clienteNome: deal.titulo ?? null,
            valorImplantacaoCents: valorBaseCents,
            percentual: comissaoPercentual,
            valorComissaoCents: comissaoCents,
            status: "pendente",
          });
          commissionCreated = true;
          log.info({ dealId, sellerUserId: deal.assignedTo, comissaoCents, comissaoPercentual }, "ensureTenantPlanAndCommission: comissão de vendedor gerada");
        }
      }
    } catch (commErr) {
      log.warn({ commErr, dealId }, "ensureTenantPlanAndCommission: falha ao gerar comissão (não crítico)");
    }
  }

  return { tenantId, tenantCreated, commissionCreated };
}
