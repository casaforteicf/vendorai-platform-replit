import { and, eq, desc } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  dealsTable,
  leadsTable,
  tenantsTable,
  propostasTable,
  plansTable,
  planAssignmentLogTable,
  usersTable,
  produtosCatalogoTable,
  sellerCommissionsTable,
} from "@workspace/db";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * Garante que, quando um negócio fecha "ganho", o cliente ganha tenant +
 * plano atribuído, e o vendedor tem a comissão gerada.
 *
 * Trial VendorAI é um caso especial importante: o deal comercial pertence ao
 * tenant vendedor "vendorai", enquanto a conta que deve receber o plano é o
 * tenant criado para o cliente testar. O `trialTenantId` persistido no lead é
 * a fonte de verdade para preservar exatamente a conta e os dados dos 5 dias.
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

  // ── Resolve tenant do CLIENTE ────────────────────────────────────────────
  // Deals comuns preservam o comportamento legado. Deals de trial usam o
  // tenant experimental indicado pelo lead e nunca o tenant vendedor.
  let trialTenantId: string | null = null;
  if (deal.leadId) {
    const [lead] = await db
      .select({ source: leadsTable.source, discoveryData: leadsTable.discoveryData })
      .from(leadsTable)
      .where(eq(leadsTable.id, deal.leadId))
      .limit(1);
    if (lead?.source === "trial_signup") {
      const candidate = asRecord(lead.discoveryData)["trialTenantId"];
      if (typeof candidate === "string" && candidate.trim()) trialTenantId = candidate.trim();
    }
  }

  let tenantId: string | null = trialTenantId ?? deal.tenantId;
  let tenantCreated = false;
  let tenant: { id: string } | undefined;
  if (tenantId) {
    tenant = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .then((rows) => rows[0]);
  }

  if (trialTenantId && !tenant) {
    // Não fazemos fallback para o tenant vendedor: isso poderia atribuir o
    // plano da venda ao próprio VendorAI. Falha segura e deixa o fechamento
    // comercial auditável para correção manual.
    log.error({ dealId, trialTenantId }, "ensureTenantPlanAndCommission: trialTenantId não encontrado — plano não atribuído");
    return { tenantId: null, tenantCreated: false, commissionCreated: false };
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

  // ── Atribuir plano ao tenant do cliente ─────────────────────────────────
  await db
    .update(tenantsTable)
    .set({
      planId: plano.id,
      billingCycle: "monthly",
      planStartedAt: new Date(),
      isDemo: false,
      demoExpiresAt: null,
      status: "active",
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, tenantId!));
  await db.insert(planAssignmentLogTable).values({
    tenantId: tenantId!,
    dealId,
    planId: plano.id,
    assignedBy: trialTenantId ? "conversao_trial_vendorai" : "sistema_fechamento_deal",
  });
  log.info({ dealId, tenantId, planId: plano.id, fromTrial: Boolean(trialTenantId) }, "ensureTenantPlanAndCommission: plano atribuído ao tenant");

  // ── Auto-gerar comissão do vendedor ──────────────────────────────────────
  // A comissão pertence ao vendedor do tenant e é calculada por item vendido.
  // valorUnitario representa o preço efetivamente fechado, inclusive promoções.
  let commissionCreated = false;
  if (deal.assignedTo) {
    try {
      const [sellerUser] = await db
        .select({ tenantId: usersTable.tenantId })
        .from(usersTable)
        .where(eq(usersTable.id, deal.assignedTo))
        .limit(1);
      if (!sellerUser?.tenantId) {
        log.warn({ dealId, sellerUserId: deal.assignedTo }, "ensureTenantPlanAndCommission: vendedor sem tenant");
        return { tenantId, tenantCreated, commissionCreated: false };
      }
      const commTenantId = sellerUser.tenantId;

      const [propComm] = await db
        .select({ valorTotal: propostasTable.valorTotal, itens: propostasTable.itens })
        .from(propostasTable)
        .where(eq(propostasTable.dealId, dealId))
        .orderBy(desc(propostasTable.createdAt))
        .limit(1);

      const [tenantComm] = await db
        .select({ comissaoPadraoPercentual: tenantsTable.comissaoPadraoPercentual })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, commTenantId))
        .limit(1);
      const percentualPadrao = Number(tenantComm?.comissaoPadraoPercentual ?? 0);
      const detalhes = [] as Array<{
        produtoId: string | null; sku: string | null; nome: string; quantidade: number;
        valorUnitarioCents: number; valorBaseCents: number; percentual: number;
        valorComissaoCents: number; promocional: boolean;
      }>;

      for (const item of propComm?.itens ?? []) {
        const selectProduto = () => db.select({
          id: produtosCatalogoTable.id,
          sku: produtosCatalogoTable.sku,
          comissaoPercentual: produtosCatalogoTable.comissaoPercentual,
          precoPromocional: produtosCatalogoTable.precoPromocional,
          promocaoAtivaAte: produtosCatalogoTable.promocaoAtivaAte,
        }).from(produtosCatalogoTable);
        const produto = item.produtoId
          ? await selectProduto().where(and(eq(produtosCatalogoTable.id, item.produtoId), eq(produtosCatalogoTable.tenantId, commTenantId))).limit(1).then(rows => rows[0])
          : item.sku
            ? await selectProduto().where(and(eq(produtosCatalogoTable.sku, item.sku), eq(produtosCatalogoTable.tenantId, commTenantId))).limit(1).then(rows => rows[0])
            : undefined;
        const percentual = produto?.comissaoPercentual != null ? Number(produto.comissaoPercentual) : percentualPadrao;
        const quantidade = Number(item.quantidade);
        const valorUnitarioCents = Math.round(Number(item.valorUnitario) * 100);
        const valorBaseCents = Math.round(valorUnitarioCents * quantidade);
        detalhes.push({
          produtoId: produto?.id ?? item.produtoId ?? null,
          sku: produto?.sku ?? item.sku ?? null,
          nome: item.nome,
          quantidade,
          valorUnitarioCents,
          valorBaseCents,
          percentual,
          valorComissaoCents: Math.round(valorBaseCents * percentual / 100),
          promocional: Boolean(produto?.precoPromocional && produto.promocaoAtivaAte && produto.promocaoAtivaAte >= new Date()),
        });
      }

      const valorBaseCents = detalhes.reduce((total, item) => total + item.valorBaseCents, 0);
      const comissaoCents = detalhes.reduce((total, item) => total + item.valorComissaoCents, 0);
      const comissaoPercentual = valorBaseCents > 0 ? (comissaoCents / valorBaseCents) * 100 : 0;

      if (detalhes.length > 0 && valorBaseCents > 0) {
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
            percentual: String(comissaoPercentual),
            valorComissaoCents: comissaoCents,
            detalhes,
            status: "pendente",
          });
          commissionCreated = true;
          log.info({ dealId, sellerUserId: deal.assignedTo, comissaoCents, itens: detalhes.length }, "ensureTenantPlanAndCommission: comissão por produto gerada");
        }
      }
    } catch (commErr) {
      log.warn({ commErr, dealId }, "ensureTenantPlanAndCommission: falha ao gerar comissão (não crítico)");
    }
  }

  return { tenantId, tenantCreated, commissionCreated };
}