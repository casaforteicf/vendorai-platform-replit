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
  agentTasksTable,
  notificationsTable,
  usersTable,
  erpTitulosTable,
  archProjetosTable,
  obrasTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { analyzeLeadIntelligence } from "./analyze-intelligence.js";
import { logger } from "./logger.js";
import { checkCatalogMatch } from "./catalog-price-check.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { triggerOnboardingHandoff } from "./agent-engine.js";
import { createEntregasFromProposta } from "./entregas.js";
import { reconcileScoutOnDealWon } from "../services/revenueScout.js";
import { exportLeadToCRM } from "./crm-export.js";

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
  /** true when the closure was blocked pending manual approval (valor ≠ catálogo) */
  pendingApproval?: boolean;
  /** true when the closure was paused pending manual stock confirmation */
  pendingStockConfirmation?: boolean;
  agentTaskId?: string;
  divergence?: { valorProposta: number; valorCatalogo: number; diferenca: number };
}

export interface ProposalAcceptanceError {
  ok: false;
  error: string;
  propostaId: string;
}

export interface ProposalAcceptedOptions {
  /**
   * Skips the catalog-price divergence check. Used when re-running the
   * closure after an "aprovacao_fechamento" agent_task has been approved —
   * the check already ran once and a human already signed off on it.
   */
  skipApprovalCheck?: boolean;
  /**
   * Skips the stock-confirmation gate. Used when re-running the closure
   * after a "conferencia_estoque" agent_task has been approved — the check
   * already ran once and the designated user already confirmed availability.
   */
  skipStockCheck?: boolean;
}

async function syncAcceptedProposalToArqdor(proposta: typeof propostasTable.$inferSelect) {
  try {
    let [project] = await db
      .select()
      .from(archProjetosTable)
      .where(and(
        eq(archProjetosTable.tenantId, proposta.tenantId),
        eq(archProjetosTable.propostaId, proposta.id),
      ))
      .limit(1);

    if (!project && proposta.dealId) {
      [project] = await db
        .select()
        .from(archProjetosTable)
        .where(and(
          eq(archProjetosTable.tenantId, proposta.tenantId),
          eq(archProjetosTable.dealId, proposta.dealId),
        ))
        .limit(1);
    }

    if (!project && proposta.leadId) {
      const leadProjects = await db
        .select()
        .from(archProjetosTable)
        .where(and(
          eq(archProjetosTable.tenantId, proposta.tenantId),
          eq(archProjetosTable.leadId, proposta.leadId),
        ))
        .limit(2);
      if (leadProjects.length === 1) project = leadProjects[0];
    }

    if (!project) return;

    let obraId = project.obraId;
    if (!obraId) {
      const [obra] = await db
        .insert(obrasTable)
        .values({
          tenantId: proposta.tenantId,
          nome: project.titulo,
          descricao: `[ARQDOR:${project.id}] Obra criada automaticamente após aprovação da proposta ${proposta.numero ?? proposta.id}.`,
          clienteNome: project.clienteNome,
          clienteContato: project.clienteTelefone ?? project.clienteEmail,
          status: "planejamento",
          orcamentoTotal: proposta.valorTotal ? String(proposta.valorTotal) : project.orcamentoTotal,
          custoRealizado: "0",
          linkCliente: project.portalToken ? `/arch/portal/${project.portalToken}` : null,
        })
        .returning({ id: obrasTable.id });
      obraId = obra?.id ?? null;
    } else {
      await db
        .update(obrasTable)
        .set({
          orcamentoTotal: proposta.valorTotal ? String(proposta.valorTotal) : project.orcamentoTotal,
          clienteNome: project.clienteNome,
          clienteContato: project.clienteTelefone ?? project.clienteEmail,
          linkCliente: project.portalToken ? `/arch/portal/${project.portalToken}` : null,
          updatedAt: new Date(),
        })
        .where(and(eq(obrasTable.id, obraId), eq(obrasTable.tenantId, proposta.tenantId)));
    }

    await db
      .update(archProjetosTable)
      .set({
        leadId: proposta.leadId ?? project.leadId,
        dealId: proposta.dealId ?? project.dealId,
        propostaId: proposta.id,
        obraId,
        status: "aprovado",
        portalAtivo: true,
        updatedAt: new Date(),
      })
      .where(eq(archProjetosTable.id, project.id));

    logger.info(
      { projectId: project.id, propostaId: proposta.id, obraId },
      "proposalAccepted: Arqdor project synced to accepted proposal and obra",
    );
  } catch (err) {
    logger.warn({ err, propostaId: proposta.id }, "proposalAccepted: failed to sync Arqdor project (non-fatal)");
  }
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
  },
  options?: ProposalAcceptedOptions
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

  const now = new Date();

  // 2. Mark proposta as accepted (idempotent — no-op if already aceita)
  const [updatedProposta] = await db
    .update(propostasTable)
    .set({
      status: "aceita" as typeof propostasTable.$inferInsert.status,
      acceptedAt: proposta.status === "aceita" ? proposta.acceptedAt : now,
      acceptedVia: proposta.status === "aceita" ? proposta.acceptedVia : channel,
      acceptedBy: proposta.status === "aceita" ? proposta.acceptedBy : (metadata?.nome ?? null),
      acceptanceMetadata: {
        channel,
        acceptedAt: now.toISOString(),
        ...(metadata?.ip ? { ip: metadata.ip } : {}),
        ...(metadata?.nome ? { nome: metadata.nome } : {}),
        ...(metadata?.documento ? { documento: metadata.documento } : {}),
      },
      updatedAt: now,
    })
    .where(eq(propostasTable.id, propostaId))
    .returning();

  await syncAcceptedProposalToArqdor(updatedProposta ?? proposta);

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

  // 3b. Catalog-price divergence guard — Closer não pode fechar sozinho se o
  // valor da proposta divergir do preço de catálogo (produtos_catalogo).
  if (!options?.skipApprovalCheck) {
    const itens = (proposta.itens ?? []).map((i) => ({
      nome: i.nome,
      sku: i.sku ?? null,
      quantidade: i.quantidade,
      valorUnitario: i.valorUnitario,
    }));
    const catalogCheck = await checkCatalogMatch(
      proposta.tenantId,
      itens,
      proposta.valorTotal !== null && proposta.valorTotal !== undefined
        ? Number(proposta.valorTotal)
        : undefined
    );

    if (catalogCheck.hasCatalogBasis && !catalogCheck.matches) {
      if (!proposta.leadId) {
        log.error(
          { dealId: deal.id },
          "proposalAccepted: catalog divergence but proposta has no leadId — cannot create agent_task, blocking closure"
        );
        return { ok: false, error: "Valor diverge do catálogo e não há lead vinculado para aprovação", propostaId };
      }

      const [task] = await db
        .insert(agentTasksTable)
        .values({
          tenantId: proposta.tenantId,
          leadId: proposta.leadId,
          agentName: "closer",
          actionType: "aprovacao_fechamento",
          payload: {
            origin: "proposal_accepted",
            propostaId,
            dealId: deal.id,
            channel,
            metadata: metadata ?? null,
            valorProposta: catalogCheck.propostaTotal,
            valorCatalogo: catalogCheck.catalogTotal,
            diferenca: catalogCheck.diferenca,
            itens: catalogCheck.itemDetails,
          },
        })
        .returning();

      const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await db.insert(notificationsTable).values({
        tenantId: proposta.tenantId,
        title: "Fechamento pendente de aprovação — valor diverge do catálogo",
        message: `Proposta "${proposta.numero ?? proposta.titulo}" (lead ${proposta.leadId}) tem valor de ${fmt(catalogCheck.propostaTotal)}, mas o catálogo indica ${fmt(catalogCheck.catalogTotal)} (diferença: ${fmt(catalogCheck.diferenca)}). Aprovação manual necessária para fechar este negócio.`,
        type: "warning",
        category: "deal_closure_approval",
      });

      // Best-effort WhatsApp to the deal owner
      try {
        if (deal.assignedTo) {
          const [owner] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, deal.assignedTo));
          if (owner?.telefone) {
            const msg = `⚠️ Fechamento pendente de aprovação\n\nProposta "${proposta.numero ?? proposta.titulo}" tem valor de ${fmt(catalogCheck.propostaTotal)}, diferente do catálogo (${fmt(catalogCheck.catalogTotal)}). Diferença: ${fmt(catalogCheck.diferenca)}.\n\nAprove ou rejeite no painel para concluir o fechamento.`;
            await sendDirectWhatsAppMessage(proposta.tenantId, owner.telefone, msg, log);
          }
        }
      } catch (wErr) {
        log.warn({ err: wErr, dealId: deal.id }, "proposalAccepted: WhatsApp approval alert failed (non-fatal)");
      }

      log.warn(
        { dealId: deal.id, taskId: task.id, ...catalogCheck },
        "proposalAccepted: valor diverge do catálogo, fechamento bloqueado até aprovação"
      );

      return {
        ok: true,
        alreadyProcessed: false,
        propostaId,
        dealId: deal.id,
        channel,
        closureTriggeredAt: null,
        chargeCreated: false,
        inventoryDeducted: false,
        activityCreated: false,
        webhookDispatched: false,
        pendingApproval: true,
        agentTaskId: task.id,
        divergence: {
          valorProposta: catalogCheck.propostaTotal,
          valorCatalogo: catalogCheck.catalogTotal,
          diferenca: catalogCheck.diferenca,
        },
      };
    }
  }

  // 3c. Stock confirmation gate — tenant pode exigir confirmação de estoque
  // humana antes de disparar contrato/cobrança, evitando vender item sem
  // disponibilidade real. Roda depois do guardrail de valor do Bloco 1.
  if (!options?.skipStockCheck) {
    const [tenantCfg] = await db
      .select({
        confirmarEstoqueAntesFinanceiro: tenantsTable.confirmarEstoqueAntesFinanceiro,
        usuarioConferenciaEstoqueId: tenantsTable.usuarioConferenciaEstoqueId,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, proposta.tenantId));

    if (tenantCfg?.confirmarEstoqueAntesFinanceiro) {
      if (!proposta.leadId) {
        log.error(
          { dealId: deal.id },
          "proposalAccepted: confirmação de estoque exigida mas proposta não tem leadId — não é possível criar agent_task"
        );
        return { ok: false, error: "Confirmação de estoque exigida e não há lead vinculado para conferência", propostaId };
      }

      const etapaAnterior = deal.etapa;
      await db
        .update(dealsTable)
        .set({
          etapa: "conferencia_estoque" as typeof dealsTable.$inferInsert.etapa,
          updatedAt: new Date(),
        })
        .where(eq(dealsTable.id, deal.id));

      const [task] = await db
        .insert(agentTasksTable)
        .values({
          tenantId: proposta.tenantId,
          leadId: proposta.leadId,
          agentName: "closer",
          actionType: "conferencia_estoque",
          payload: {
            origin: "proposal_accepted",
            propostaId,
            dealId: deal.id,
            channel,
            metadata: metadata ?? null,
            etapaAnterior,
            assignedUserId: tenantCfg.usuarioConferenciaEstoqueId ?? null,
            itens: (proposta.itens ?? []).map((i) => ({ nome: i.nome, sku: i.sku ?? null, quantidade: i.quantidade })),
          },
        })
        .returning();

      await db.insert(notificationsTable).values({
        tenantId: proposta.tenantId,
        title: "Confirmação de estoque pendente antes do fechamento",
        message: `Proposta "${proposta.numero ?? proposta.titulo}" (lead ${proposta.leadId}) aguarda confirmação de disponibilidade em estoque antes de seguir para contrato e cobrança.`,
        type: "warning",
        category: "conferencia_estoque",
      });

      try {
        if (tenantCfg.usuarioConferenciaEstoqueId) {
          const [responsavel] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, tenantCfg.usuarioConferenciaEstoqueId));
          if (responsavel?.telefone) {
            const msg = `📦 Confirmação de estoque pendente\n\nProposta "${proposta.numero ?? proposta.titulo}" precisa de conferência de estoque antes de seguir para contrato/cobrança.\n\nAprove ou reprove no painel para continuar o fechamento.`;
            await sendDirectWhatsAppMessage(proposta.tenantId, responsavel.telefone, msg, log);
          }
        }
      } catch (wErr) {
        log.warn({ err: wErr, dealId: deal.id }, "proposalAccepted: WhatsApp de conferência de estoque falhou (non-fatal)");
      }

      log.info(
        { dealId: deal.id, taskId: task.id },
        "proposalAccepted: aguardando confirmação de estoque, fechamento pausado"
      );

      return {
        ok: true,
        alreadyProcessed: false,
        propostaId,
        dealId: deal.id,
        channel,
        closureTriggeredAt: null,
        chargeCreated: false,
        inventoryDeducted: false,
        activityCreated: false,
        webhookDispatched: false,
        pendingStockConfirmation: true,
        agentTaskId: task.id,
      };
    }
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

    // Fecha o placar do Revenue Scout automaticamente, se essa venda veio de
    // uma oferta proativa recente — non-blocking, não deve atrapalhar o fechamento.
    reconcileScoutOnDealWon({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      log,
    }).catch((err) => {
      log.warn({ err, dealId: deal.id }, "proposalAccepted: scout reconciliation failed (non-fatal)");
    });

    // Exporta para CRM externo (HubSpot, RD Station etc.) se configurado — fire-and-forget.
    exportLeadToCRM({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      event: "deal_won",
      log,
    }).catch(() => undefined);
  }

  log.info({ dealId: deal.id }, "proposalAccepted: deal moved to ganho");

  // 4a. Handoff proativo: fechamento → onboarding. Em vez de esperar o cliente
  // escrever de novo, dispara a mensagem de boas-vindas imediatamente — non-blocking.
  if (proposta.leadId) {
    triggerOnboardingHandoff({
      tenantId: proposta.tenantId,
      leadId: proposta.leadId,
      dealId: deal.id,
      extraPayload: { propostaId },
      log,
    }).catch((err) => {
      log.warn({ err, dealId: deal.id }, "proposalAccepted: onboarding handoff failed (non-fatal)");
    });
  }

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

  // 6b. Create entregas (Agenda de entrega por motorista) — best-effort
  try {
    await createEntregasFromProposta(propostaId, log);
  } catch (err) {
    log.warn({ err, dealId: deal.id }, "proposalAccepted: entrega creation failed (non-fatal)");
  }

  // Financeiro integrado: toda venda aceita gera uma conta a receber.
  // Idempotente pela origem e não bloqueia o fechamento comercial.
  try {
    if (proposta.valorTotal) {
      await db.insert(erpTitulosTable).values({
        tenantId: proposta.tenantId,
        tipo: "receber",
        categoria: "receita",
        descricao: proposta.titulo,
        documento: proposta.numero,
        valorOriginal: proposta.valorTotal,
        vencimento: proposta.acceptedAt ?? new Date(),
        origemTipo: "proposta",
        origemId: proposta.id,
      }).onConflictDoNothing();
    }
  } catch (err) {
    log.warn({ err, propostaId }, "proposalAccepted: ERP receivable creation failed (non-fatal)");
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
