import { and, eq } from "drizzle-orm";
import {
  db,
  propostasTable,
  dealsTable,
  leadsTable,
  tenantsTable,
  activitiesTable,
  inventoryItemsTable,
  inventoryMovementsTable,
  produtosCatalogoTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { analyzeLeadIntelligence } from "./analyze-intelligence.js";
import { logger } from "./logger.js";

export type ProposalAcceptanceChannel = "link" | "whatsapp" | "manual";

export interface ProposalAcceptanceResult {
  ok: true;
  alreadyProcessed: boolean;
  propostaId: string;
  dealId: string | null;
  channel: ProposalAcceptanceChannel;
  closureTriggeredAt: Date | null;
  chargeCreated: boolean;
  inventoryDeducted: boolean;
  activityCreated: boolean;
  webhookDispatched: boolean;
}

export interface ProposalAcceptanceError {
  ok: false;
  error: string;
  propostaId: string;
}

/**
 * Idempotent proposal acceptance.
 * If the deal already has `closure_triggered_at`, the call is a no-op
 * (silently returns alreadyProcessed=true).
 *
 * This is the SINGLE funnel: all channels (link, WhatsApp, manual) must call
 * this function so the automation happens exactly once.
 */
export async function proposalAccepted(
  propostaId: string,
  channel: ProposalAcceptanceChannel,
  metadata?: {
    ip?: string;
    nome?: string;
    documento?: string;
  }
): Promise<ProposalAcceptanceResult | ProposalAcceptanceError> {
  const log = logger.child({ propostaId, channel });

  // 1. Resolve proposta
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.id, propostaId));

  if (!proposta) {
    return { ok: false, error: "Proposta not found", propostaId };
  }

  if (proposta.status === "aceita") {
    log.info("proposalAccepted: proposta already accepted, checking deal closure");
  }

  // 2. Mark proposta as accepted (idempotent — no-op if already aceita)
  const [updatedProposta] = await db
    .update(propostasTable)
    .set({
      status: "aceita" as typeof propostasTable.$inferInsert.status,
      acceptanceMetadata: {
        channel,
        acceptedAt: new Date().toISOString(),
        ...(metadata?.ip ? { ip: metadata.ip } : {}),
        ...(metadata?.nome ? { nome: metadata.nome } : {}),
        ...(metadata?.documento ? { documento: metadata.documento } : {}),
      },
      updatedAt: new Date(),
    })
    .where(eq(propostasTable.id, propostaId))
    .returning();

  // 3. Resolve deal & idempotency check
  if (!proposta.dealId) {
    log.warn("proposalAccepted: no deal linked to proposta");
    return {
      ok: true,
      alreadyProcessed: false,
      propostaId,
      dealId: null,
      channel,
      closureTriggeredAt: null,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
    };
  }

  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, proposta.dealId));

  if (!deal) {
    log.warn("proposalAccepted: linked deal not found");
    return {
      ok: true,
      alreadyProcessed: false,
      propostaId,
      dealId: null,
      channel,
      closureTriggeredAt: null,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
    };
  }

  // Idempotency gate: if deal already triggered closure, skip silently
  if (deal.closureTriggeredAt) {
    log.info(
      { dealId: deal.id, closureTriggeredAt: deal.closureTriggeredAt },
      "proposalAccepted: deal already closed, skipping automation"
    );
    return {
      ok: true,
      alreadyProcessed: true,
      propostaId,
      dealId: deal.id,
      channel,
      closureTriggeredAt: deal.closureTriggeredAt,
      chargeCreated: false,
      inventoryDeducted: false,
      activityCreated: false,
      webhookDispatched: false,
    };
  }

  // 4. Move deal to ganho — this triggers the full closure automation
  // (contract, onboarding, Asaas charge via the existing deal-etapa=ganho hook)
  await db
    .update(dealsTable)
    .set({
      etapa: "ganho" as typeof dealsTable.$inferInsert.etapa,
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, deal.id));

  // Update lead status to "convertido" so it leaves the "novo" pipeline
  if (proposta.leadId) {
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, proposta.leadId));
    log.info({ dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: lead status updated to convertido");
  }

  log.info({ dealId: deal.id }, "proposalAccepted: deal moved to ganho");

  // 4b. Trigger re-analysis of churn risk — non-blocking
  // A deal moving to ganho is a strong engagement signal; the churn score
  // should be recomputed immediately so the UI reflects the real state.
  Promise.resolve()
    .then(async () => {
      try {
        await analyzeLeadIntelligence({
          tenantId: proposta.tenantId,
          leadId:   proposta.leadId,
          log,
          triggeredBy: "auto",
        });
        log.info({ dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: churn re-analysis triggered");
      } catch (err) {
        log.warn({ err, dealId: deal.id, leadId: proposta.leadId }, "proposalAccepted: churn re-analysis failed (non-fatal)");
      }
    })
    .catch(() => { /* ignore */ });

  // 5. Create CRM activity
  let activityCreated = false;
  try {
    await db.insert(activitiesTable).values({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      tipo: "whatsapp" as typeof activitiesTable.$inferInsert.tipo,
      titulo: "Proposta aceita",
      descricao: `Proposta aceita via ${channel} em ${new Date().toLocaleString("pt-BR")}. Proposta: ${proposta.numero ?? proposta.titulo}`,
      status: "concluida" as typeof activitiesTable.$inferInsert.status,
      concluidaEm: new Date(),
      resultadoExecucao: "aceite",
      responsavelId: deal.assignedTo ?? null,
    });
    activityCreated = true;
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: failed to create activity");
  }

  // 6. Inventory deduction
  let inventoryDeducted = false;
  try {
    const itens = (proposta.itens ?? []) as Array<{ nome: string; quantidade: number }>;
    for (const item of itens) {
      // Best-effort lookup by product name
      const [produto] = await db
        .select({ id: produtosCatalogoTable.id })
        .from(produtosCatalogoTable)
        .where(
          and(
            eq(produtosCatalogoTable.tenantId, proposta.tenantId),
            eq(produtosCatalogoTable.nome, item.nome)
          )
        )
        .limit(1);

      if (!produto) continue;

      const [invItem] = await db
        .select({ id: inventoryItemsTable.id, quantidadeAtual: inventoryItemsTable.quantidadeAtual })
        .from(inventoryItemsTable)
        .where(
          and(
            eq(inventoryItemsTable.tenantId, proposta.tenantId),
            eq(inventoryItemsTable.produtoId, produto.id)
          )
        )
        .limit(1);

      if (invItem) {
        const novaQuantidade = Math.max(0, Number(invItem.quantidadeAtual) - item.quantidade);
        await db
          .update(inventoryItemsTable)
          .set({ quantidadeAtual: String(novaQuantidade), updatedAt: new Date() })
          .where(eq(inventoryItemsTable.id, invItem.id));

        await db.insert(inventoryMovementsTable).values({
          tenantId: proposta.tenantId,
          inventoryItemId: invItem.id,
          tipo: "saida" as typeof inventoryMovementsTable.$inferInsert.tipo,
          quantidade: String(item.quantidade),
          motivo: `Venda: proposta ${proposta.numero ?? proposta.titulo}`,
          referenciaId: proposta.id,
        });
      }
    }
    inventoryDeducted = true;
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: inventory deduction failed");
  }

  // 7. Dispatch ERP webhook (non-blocking)
  let webhookDispatched = false;
  try {
    const [tenant] = await db
      .select({ webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl, integrationType: tenantsTable.integrationType })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, proposta.tenantId));

    if (tenant?.webhookEstoqueUrl) {
      const itens = (proposta.itens ?? []) as Array<{
        nome: string;
        sku?: string | null;
        quantidade: number;
        precoUnitario?: number | null;
      }>;
      const valorTotal = itens.reduce(
        (acc, item) => acc + item.quantidade * (item.precoUnitario ?? 0),
        0
      );
      dispatchVendaWebhook(
        tenant.webhookEstoqueUrl,
        {
          event: "venda_realizada",
          tenantId: proposta.tenantId,
          vendaId: updatedProposta.id,
          tipo: "proposta",
          integrationType: (tenant.integrationType as "n8n" | "api" | undefined) ?? undefined,
          produtos: itens.map((item) => ({
            nome: item.nome,
            sku: item.sku ?? null,
            quantidade: item.quantidade,
          })),
          valorTotal,
          realizadaEm: new Date().toISOString(),
        },
        log
      );
      webhookDispatched = true;
    }
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: webhook dispatch failed");
  }

  // Re-fetch deal to get closureTriggeredAt (should be set by the deal-ganho hook)
  const [dealAfter] = await db
    .select({ closureTriggeredAt: dealsTable.closureTriggeredAt })
    .from(dealsTable)
    .where(eq(dealsTable.id, deal.id));

  return {
    ok: true,
    alreadyProcessed: false,
    propostaId,
    dealId: deal.id,
    channel,
    closureTriggeredAt: dealAfter?.closureTriggeredAt ?? null,
    chargeCreated: false, // Asaas charge is created by the deal-ganho hook
    inventoryDeducted,
    activityCreated,
    webhookDispatched,
  };
}
