import { Router } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { storeConvertedEmbedding, markFeedbackConverted } from "../lib/prospectorMemory.js";
import {
  db,
  dealsTable,
  leadsTable,
  contractsTable,
  propostasTable,
  agentTasksTable,
  notificationsTable,
  usersTable,
  tenantsTable,
} from "@workspace/db";
import { createDocument, isZapSignConfigured } from "../lib/zapsign.js";
import { createCharge, createOrGetCustomer, isAsaasConfigured } from "../lib/asaas.js";
import { decrypt } from "../lib/crypto.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { checkCatalogMatch, type CatalogCheckItem } from "../lib/catalog-price-check.js";
import { reconcileScoutOnDealWon } from "../services/revenueScout.js";
import { ensureTenantPlanAndCommission } from "../lib/deal-closure-commission.js";
import type { Logger } from "pino";
import { resolveCanonicalDealValue } from "../lib/deal-value.js";

const router = Router();

export interface ConfirmClosureBody {
  valor?: number;
  valorImplantacao?: number;
  valorMensalidade?: number;
  planoContratado?: string;
  condPagamento?: string;
  prazoEntrega?: string;
  observacoes?: string;
  numParcelas?: number;
  servicos?: string;
}

export interface ConfirmClosureOpts {
  vendedorNome?: string;
}

// ─── POST /deals/:dealId/confirm-closure ────────────────────────────────────
// Comprehensive deal closure:
//  1. Marks deal as ganho + lead as convertido
//  2. Generates contract PDF from tenant template + sends to ZapSign
//  3. Sends WhatsApp with sign link
//  4. Creates Asaas charge(s) if configured
//  5. Sends WhatsApp with payment link(s)
router.post("/deals/:dealId/confirm-closure", async (req, res) => {
  const dealId = String(req.params.dealId);
  const body = req.body as ConfirmClosureBody;

  if (!body.planoContratado) {
    res.status(400).json({ error: "planoContratado é obrigatório" });
    return;
  }

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) {
    res.status(404).json({ error: "Negócio não encontrado" });
    return;
  }

  const tenantId = deal.tenantId;
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Acesso negado" });
    return;
  }

  const valorImplantacaoNum = typeof body.valorImplantacao === "number" ? body.valorImplantacao : 0;
  const valorMensalidadeNum = typeof body.valorMensalidade === "number" ? body.valorMensalidade : 0;
  const canonicalValue = await resolveCanonicalDealValue(dealId, tenantId);
  const valorNum = canonicalValue > 0
    ? canonicalValue
    : typeof body.valor === "number" && body.valor > 0
      ? body.valor
      : (valorImplantacaoNum + valorMensalidadeNum) > 0
        ? valorImplantacaoNum + valorMensalidadeNum
        : 0;

  // ── Catalog-price divergence guard — mesma regra do proposalAccepted() ────
  const [proposta] = await db
    .select()
    .from(propostasTable)
    .where(eq(propostasTable.dealId, dealId))
    .orderBy(desc(propostasTable.createdAt))
    .limit(1);

  const itens: CatalogCheckItem[] =
    proposta && proposta.itens && proposta.itens.length > 0
      ? proposta.itens.map((i) => ({
          nome: i.nome,
          sku: i.sku ?? null,
          quantidade: i.quantidade,
          valorUnitario: i.valorUnitario,
        }))
      : [{ nome: body.planoContratado, quantidade: 1, valorUnitario: valorNum }];

  const valorTotalOverride =
    proposta?.valorTotal !== null && proposta?.valorTotal !== undefined
      ? Number(proposta.valorTotal)
      : valorNum;

  const catalogCheck = await checkCatalogMatch(tenantId, itens, valorTotalOverride);

  if (catalogCheck.hasCatalogBasis && !catalogCheck.matches) {
    if (!deal.leadId) {
      req.log.error(
        { dealId },
        "confirm-closure: catalog divergence but deal has no leadId — cannot create agent_task, blocking closure"
      );
      res.status(422).json({
        error: "Valor diverge do catálogo e não há lead vinculado para aprovação",
      });
      return;
    }

    const [task] = await db
      .insert(agentTasksTable)
      .values({
        tenantId,
        leadId: deal.leadId,
        agentName: "closer",
        actionType: "aprovacao_fechamento",
        payload: {
          origin: "confirm_closure",
          dealId,
          body,
          vendedorNome: (req.user as { name?: string } | undefined)?.name ?? null,
          valorProposta: catalogCheck.propostaTotal,
          valorCatalogo: catalogCheck.catalogTotal,
          diferenca: catalogCheck.diferenca,
          itens: catalogCheck.itemDetails,
        },
      })
      .returning();

    const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    await db.insert(notificationsTable).values({
      tenantId,
      title: "Fechamento pendente de aprovação — valor diverge do catálogo",
      message: `Fechamento do negócio "${deal.titulo}" (lead ${deal.leadId}) tem valor de ${fmt(catalogCheck.propostaTotal)}, mas o catálogo indica ${fmt(catalogCheck.catalogTotal)} (diferença: ${fmt(catalogCheck.diferenca)}). Aprovação manual necessária para fechar este negócio.`,
      type: "warning",
      category: "deal_closure_approval",
    });

    try {
      if (deal.assignedTo) {
        const [owner] = await db
          .select({ telefone: usersTable.telefone })
          .from(usersTable)
          .where(eq(usersTable.id, deal.assignedTo));
        if (owner?.telefone) {
          const msg = `⚠️ Fechamento pendente de aprovação\n\nNegócio "${deal.titulo}" tem valor de ${fmt(catalogCheck.propostaTotal)}, diferente do catálogo (${fmt(catalogCheck.catalogTotal)}). Diferença: ${fmt(catalogCheck.diferenca)}.\n\nAprove ou rejeite no painel para concluir o fechamento.`;
          await sendDirectWhatsAppMessage(tenantId, owner.telefone, msg, req.log);
        }
      }
    } catch (wErr) {
      req.log.warn({ err: wErr, dealId }, "confirm-closure: WhatsApp approval alert failed (non-fatal)");
    }

    req.log.warn(
      { dealId, taskId: task.id, ...catalogCheck },
      "confirm-closure: valor diverge do catálogo, fechamento bloqueado até aprovação"
    );

    res.status(202).json({
      pendingApproval: true,
      agentTaskId: task.id,
      divergence: {
        valorProposta: catalogCheck.propostaTotal,
        valorCatalogo: catalogCheck.catalogTotal,
        diferenca: catalogCheck.diferenca,
      },
    });
    return;
  }

  // ── Stock confirmation gate — tenant pode exigir confirmação de estoque
  // humana antes de disparar contrato/cobrança. Roda depois do guardrail de
  // valor do Bloco 1.
  const [tenantStockCfg] = await db
    .select({
      confirmarEstoqueAntesFinanceiro: tenantsTable.confirmarEstoqueAntesFinanceiro,
      usuarioConferenciaEstoqueId: tenantsTable.usuarioConferenciaEstoqueId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (tenantStockCfg?.confirmarEstoqueAntesFinanceiro) {
    if (!deal.leadId) {
      req.log.error(
        { dealId },
        "confirm-closure: confirmação de estoque exigida mas deal não tem leadId — não é possível criar agent_task"
      );
      res.status(422).json({
        error: "Confirmação de estoque exigida e não há lead vinculado para conferência",
      });
      return;
    }

    const etapaAnterior = deal.etapa;
    await db
      .update(dealsTable)
      .set({ etapa: "conferencia_estoque", updatedAt: new Date() })
      .where(eq(dealsTable.id, dealId));

    const [task] = await db
      .insert(agentTasksTable)
      .values({
        tenantId,
        leadId: deal.leadId,
        agentName: "closer",
        actionType: "conferencia_estoque",
        payload: {
          origin: "confirm_closure",
          dealId,
          body,
          vendedorNome: (req.user as { name?: string } | undefined)?.name ?? null,
          etapaAnterior,
          assignedUserId: tenantStockCfg.usuarioConferenciaEstoqueId ?? null,
          itens: catalogCheck.itemDetails,
        },
      })
      .returning();

    await db.insert(notificationsTable).values({
      tenantId,
      title: "Confirmação de estoque pendente antes do fechamento",
      message: `Fechamento do negócio "${deal.titulo}" (lead ${deal.leadId}) aguarda confirmação de disponibilidade em estoque antes de seguir para contrato e cobrança.`,
      type: "warning",
      category: "conferencia_estoque",
    });

    try {
      if (tenantStockCfg.usuarioConferenciaEstoqueId) {
        const [responsavel] = await db
          .select({ telefone: usersTable.telefone })
          .from(usersTable)
          .where(eq(usersTable.id, tenantStockCfg.usuarioConferenciaEstoqueId));
        if (responsavel?.telefone) {
          const msg = `📦 Confirmação de estoque pendente\n\nFechamento do negócio "${deal.titulo}" precisa de conferência de estoque antes de seguir para contrato/cobrança.\n\nAprove ou reprove no painel para continuar o fechamento.`;
          await sendDirectWhatsAppMessage(tenantId, responsavel.telefone, msg, req.log);
        }
      }
    } catch (wErr) {
      req.log.warn({ err: wErr, dealId }, "confirm-closure: WhatsApp de conferência de estoque falhou (non-fatal)");
    }

    req.log.warn({ dealId, taskId: task.id }, "confirm-closure: aguardando confirmação de estoque, fechamento pausado");

    res.status(202).json({
      pendingStockConfirmation: true,
      agentTaskId: task.id,
    });
    return;
  }

  const result = await runDealClosure(
    dealId,
    body,
    { vendedorNome: (req.user as { name?: string } | undefined)?.name },
    req.log
  );
  res.json(result);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function runDealClosure(
  dealId: string,
  body: ConfirmClosureBody,
  opts: ConfirmClosureOpts,
  log: Logger
): Promise<{
  ganho: boolean;
  signUrl?: string | null;
  chargeLinks?: string[];
  errors: string[];
}> {
  const {
    valor,
    valorImplantacao,
    valorMensalidade,
    planoContratado,
    condPagamento,
    prazoEntrega,
    servicos,
    numParcelas,
  } = body;

  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId));
  if (!deal) {
    throw new Error(`runDealClosure: deal ${dealId} não encontrado`);
  }
  const tenantId = deal.tenantId;

  const valorImplantacaoNum = typeof valorImplantacao === "number" ? valorImplantacao : 0;
  const valorMensalidadeNum = typeof valorMensalidade === "number" ? valorMensalidade : 0;
  const canonicalValue = await resolveCanonicalDealValue(dealId, tenantId);
  const valorNum = canonicalValue > 0
    ? canonicalValue
    : typeof valor === "number" && valor > 0
      ? valor
      : (valorImplantacaoNum + valorMensalidadeNum) > 0
        ? valorImplantacaoNum + valorMensalidadeNum
        : 0;

  // ── 1. Update deal to ganho ─────────────────────────────────────────────
  await db
    .update(dealsTable)
    .set({
      etapa: "ganho",
      valor: String(valorNum),
      planoContratado: planoContratado ?? deal.planoContratado,
      tipoFechamento: "contrato",
      wonAt: new Date(),
      dataFechamento: new Date(),
      skipAsaasBilling: "true", // prevent double-billing from PATCH hook
      ...(valorMensalidadeNum > 0 ? { mrr: String(valorMensalidadeNum) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(dealsTable.id, dealId));

  // Load lead for subsequent steps (moved earlier — era usado antes de ser
  // declarado logo abaixo, o que lançaria erro em runtime: "Cannot access
  // 'lead' before initialization").
  const [lead] = deal.leadId
    ? await db.select().from(leadsTable).where(eq(leadsTable.id, deal.leadId))
    : [null];

  // ── Tenant + plano + comissão de vendedor ───────────────────────────────
  // CORREÇÃO DE AUDITORIA: esse passo só existia no fluxo do Kanban (PATCH
  // /deals/:id) — o botão "Vendido" (esse arquivo) nunca chamava isso, então
  // negócios fechados por aqui nunca geravam tenant automático, plano
  // atribuído, nem comissão de vendedor registrada. Não trava o fechamento
  // se falhar — o negócio já está marcado 'ganho', isso é complementar.
  try {
    const result = await ensureTenantPlanAndCommission(dealId, log);
    log.info({ dealId, ...result }, "confirm-closure: tenant/plano/comissão verificados");
  } catch (tpcErr) {
    log.error({ err: tpcErr, dealId }, "confirm-closure: falha ao garantir tenant/plano/comissão (não trava o fechamento)");
  }

  // ── Programa de Embaixadores (Praça.ai): se esse tenant foi indicado por
  // um embaixador e essa é a PRIMEIRA venda dele, avisa o Praça.ai pra
  // creditar a comissão. Fire-and-forget — nunca deve travar o fechamento.
  try {
    const [tenantRow] = await db
      .select({ codigoIndicacaoPraca: tenantsTable.codigoIndicacaoPraca })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    if (tenantRow?.codigoIndicacaoPraca) {
      const [{ totalGanhos }] = await db
        .select({ totalGanhos: sql<number>`count(*)` })
        .from(dealsTable)
        .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho")));

      if (Number(totalGanhos) === 1) {
        const pracaBaseUrl = process.env.PRACA_API_BASE_URL || "https://praca.ai/api";
        fetch(`${pracaBaseUrl}/embaixadores/confirmar-conversao-lojista`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
          signal: AbortSignal.timeout(8000),
        }).catch((err) => {
          log.error({ err, tenantId }, "confirm-closure: falha ao confirmar conversão de embaixador (lojista) no Praça.ai");
        });
      }
    }
  } catch (err) {
    log.error({ err, tenantId }, "confirm-closure: erro ao checar indicação de embaixador (lojista)");
  }

  // ── 2. Update lead to convertido ────────────────────────────────────────
  if (deal.leadId) {
    await db
      .update(leadsTable)
      .set({ status: "convertido", updatedAt: new Date() })
      .where(eq(leadsTable.id, deal.leadId));

    // Store embedding of converted lead for future similarity scoring — non-blocking
    if (lead || deal.leadId) {
      const l = lead ?? { id: deal.leadId!, tenantId, nome: null, mercadoSegmento: null, websiteUrl: null, endereco: null, metadata: null };
      storeConvertedEmbedding({
        id: l.id,
        tenantId: l.tenantId,
        nome: (l as typeof l & { nome?: string | null }).nome ?? null,
        segmento: (l as typeof l & { mercadoSegmento?: string | null }).mercadoSegmento ?? null,
        websiteUrl: (l as typeof l & { websiteUrl?: string | null }).websiteUrl ?? null,
        endereco: (l as typeof l & { endereco?: string | null }).endereco ?? null,
        metadata: (l as typeof l & { metadata?: Record<string, unknown> | null }).metadata ?? null,
      }).catch(() => void 0);
      markFeedbackConverted(deal.leadId!).catch(() => void 0);
    }

    // Fecha o placar do Revenue Scout automaticamente, se essa venda veio de
    // uma oferta proativa recente — non-blocking, não deve atrapalhar o fechamento.
    reconcileScoutOnDealWon({
      tenantId,
      leadId: deal.leadId,
      dealId: deal.id,
      log,
    }).catch((err) => {
      log.warn({ err, dealId: deal.id }, "confirm-closure: scout reconciliation failed (non-fatal)");
    });
  }

  // Load tenant for subsequent steps
  const tenantResult = await db.execute(
    sql`SELECT id, name, nome_empresa, cnpj, contract_template_html, asaas_api_key FROM tenants WHERE id = ${tenantId}`
  );
  const tenant = tenantResult.rows?.[0] as Record<string, unknown> | undefined;

  const result: {
    ganho: boolean;
    signUrl?: string | null;
    chargeLinks?: string[];
    errors: string[];
  } = { ganho: true, errors: [] };

  // ── 3. ZapSign contract generation ──────────────────────────────────────
  if (isZapSignConfigured() && lead) {
    try {
      const customHtml = tenant?.contract_template_html as string | null;
      const valorFmt = valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const dataHoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
      const tenantNome = ((tenant?.nome_empresa as string) || (tenant?.name as string) || "").trim();

      const implFmt = valorImplantacaoNum > 0
        ? valorImplantacaoNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";
      const mrrFmt = valorMensalidadeNum > 0
        ? valorMensalidadeNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : "";

      const vars: Record<string, string> = {
        "{{cliente_nome}}": lead.nome ?? lead.empresa ?? "Cliente",
        "{{cliente_cnpj}}": lead.documento ?? "",
        "{{cliente_endereco}}": lead.endereco ?? "",
        "{{valor_total}}": valorFmt,
        "{{valor_implantacao}}": implFmt,
        "{{valor_mensalidade}}": mrrFmt,
        "{{condicao_pagamento}}": condPagamento ?? "",
        "{{prazo_entrega}}": prazoEntrega ?? "",
        "{{servicos}}": servicos ?? deal.titulo,
        "{{data_contrato}}": dataHoje,
        "{{vendedor_nome}}": opts.vendedorNome ?? "",
        "{{empresa_nome}}": tenantNome,
        "{{empresa_cnpj}}": (tenant?.cnpj as string) ?? "",
        // Legacy compat vars
        "{{cliente_razao_social}}": lead.empresa ?? lead.nome ?? "Cliente",
        "{{deal_valor}}": valorFmt,
        "{{valor_mensal}}": mrrFmt || valorFmt,
        "{{data_hoje}}": dataHoje,
      };

      const html = renderTemplate(customHtml ?? DEFAULT_MINIMAL_TEMPLATE, vars);

      let pdfB64: string | undefined;
      try {
        const buf = await renderHtmlToPdf(html);
        pdfB64 = buf.toString("base64");
      } catch (pdfErr) {
        log.warn({ err: pdfErr, dealId }, "confirm-closure: PDF render failed, sending without PDF");
      }

      const clientName = lead.nome ?? lead.empresa ?? "Cliente";
      if (!lead.email) throw new Error("Lead não tem e-mail para assinatura via ZapSign");

      const doc = await createDocument({
        name: `Contrato — ${clientName}`,
        lang: "pt-BR",
        signers: [{ name: clientName, email: lead.email }],
        content_base64: pdfB64,
      });

      const signUrl = doc.signers?.[0]?.sign_url ?? null;

      await db
        .update(dealsTable)
        .set({ zapsignDocId: doc.token, contractStatus: "sent", contractError: null, updatedAt: new Date() })
        .where(eq(dealsTable.id, dealId));

      await db
        .insert(contractsTable)
        .values({
          tenantId,
          dealId,
          contractType: "1 parte",
          status: "sent_for_signature",
          zapsignDocId: doc.token,
          zapsignSignUrl: signUrl,
          sentAt: new Date(),
        })
        .onConflictDoNothing();

      result.signUrl = signUrl;

      // WhatsApp — sign link notification
      if (lead.telefone && signUrl) {
        try {
          const msg = `Olá, ${clientName}! 👋\n\nSeu contrato está pronto para assinatura digital. 📄\n\nAcesse o link abaixo para assinar (leva menos de 1 minuto):\n${signUrl}\n\nQualquer dúvida estamos à disposição!`;
          await sendDirectWhatsAppMessage(tenantId, lead.telefone, msg, log);
          log.info({ dealId }, "confirm-closure: WhatsApp sign link sent");
        } catch (wErr) {
          log.warn({ err: wErr }, "confirm-closure: WhatsApp sign notification failed (non-fatal)");
        }
      }

      log.info({ dealId, docToken: doc.token }, "confirm-closure: ZapSign OK");
    } catch (zErr) {
      const msg = zErr instanceof Error ? zErr.message : String(zErr);
      log.error({ err: zErr, dealId }, "confirm-closure: ZapSign failed");
      result.errors.push(`Contrato: ${msg}`);
      await db
        .update(dealsTable)
        .set({ contractStatus: "failed", contractError: msg.slice(0, 500), updatedAt: new Date() })
        .where(eq(dealsTable.id, dealId));
    }
  }

  // ── 4. Asaas billing ────────────────────────────────────────────────────
  // Trial de lançamento é exceção: a mensalidade segue o lifecycle próprio
  // (5 dias grátis → 497 → 990 → preço regular). Cobrar o deal aqui geraria
  // uma cobrança imediata e depois outra no ciclo da assinatura.
  // Deals comuns preservam o fluxo financeiro legado abaixo.
  const rawTenantAsaasKey = (tenant?.asaas_api_key as string) || null;
  let tenantAsaasKey: string | null = null;
  if (rawTenantAsaasKey) {
    try {
      tenantAsaasKey = decrypt(rawTenantAsaasKey);
    } catch (err) {
      log.warn({ err, tenantId }, "confirm-closure: falha ao descriptografar chave Asaas do tenant");
    }
  }
  const asaasReady = tenantAsaasKey ? true : await isAsaasConfigured();
  const usesLaunchSubscriptionBilling = lead?.source === "trial_signup";

  if (asaasReady && valorNum > 0 && lead && !usesLaunchSubscriptionBilling) {
    try {
      const customer = await createOrGetCustomer({
        name: lead.nome ?? lead.empresa ?? "Cliente",
        email: lead.email ?? undefined,
        cpfCnpj: lead.documento?.replace(/\D/g, "") || undefined,
        phone: lead.telefone ?? undefined,
      }, tenantAsaasKey);

      const parcelas = numParcelas && numParcelas > 1 ? numParcelas : 1;
      const today = new Date();
      const dueDateStr = today.toISOString().split("T")[0]!;
      const chargeLinks: string[] = [];

      if (parcelas === 1) {
        // Single payment
        const charge = await createCharge({
          customer: customer.id,
          billingType: "BOLETO",
          value: Math.round(valorNum * 100) / 100,
          dueDate: dueDateStr,
          description: deal.titulo,
          externalReference: dealId,
        }, tenantAsaasKey);
        if (charge.invoiceUrl) chargeLinks.push(charge.invoiceUrl);
        else if (charge.bankSlipUrl) chargeLinks.push(charge.bankSlipUrl);
        await db
          .update(dealsTable)
          .set({ asaasChargeId: charge.id, chargeLink: chargeLinks[0] ?? null, chargeStatus: "pending", updatedAt: new Date() })
          .where(eq(dealsTable.id, dealId));
      } else {
        // Installment payments — create N separate charges with monthly due dates
        const valorParcela = Math.round((valorNum / parcelas) * 100) / 100;
        const firstChargeId = await (async () => {
          let firstId = "";
          for (let i = 0; i < parcelas; i++) {
            const due = new Date(today.getFullYear(), today.getMonth() + i, today.getDate());
            const charge = await createCharge({
              customer: customer.id,
              billingType: "BOLETO",
              value: valorParcela,
              dueDate: due.toISOString().split("T")[0]!,
              description: `${deal.titulo} — Parcela ${i + 1}/${parcelas}`,
              externalReference: `${dealId}-${i + 1}`,
            }, tenantAsaasKey);
            if (i === 0) firstId = charge.id;
            if (charge.invoiceUrl) chargeLinks.push(charge.invoiceUrl);
            else if (charge.bankSlipUrl) chargeLinks.push(charge.bankSlipUrl);
          }
          return firstId;
        })();
        await db
          .update(dealsTable)
          .set({ asaasChargeId: firstChargeId, chargeLink: chargeLinks[0] ?? null, chargeStatus: "pending", updatedAt: new Date() })
          .where(eq(dealsTable.id, dealId));
      }

      result.chargeLinks = chargeLinks;

      // WhatsApp — payment link notification
      if (lead.telefone && chargeLinks.length > 0) {
        try {
          const valorFmt = valorNum.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
          const nome = lead.nome ?? "";
          const msg = parcelas === 1
            ? `Olá, ${nome}! 💳\n\nSeu boleto de ${valorFmt} foi gerado:\n\n${chargeLinks[0]}\n\nAny questions, just ask!`
            : `Olá, ${nome}! 💳\n\nSeu parcelamento em ${parcelas}x foi criado!\n\nBoletos:\n${chargeLinks.map((l, i) => `${i + 1}ª parcela: ${l}`).join("\n")}\n\nVencimentos mensais a partir de hoje.`;
          await sendDirectWhatsAppMessage(tenantId, lead.telefone, msg, log);
          log.info({ dealId, parcelas }, "confirm-closure: WhatsApp charge links sent");
        } catch (wErr) {
          log.warn({ err: wErr }, "confirm-closure: WhatsApp charge notification failed (non-fatal)");
        }
      }

      log.info({ dealId, parcelas }, "confirm-closure: Asaas OK");
    } catch (asaasErr) {
      const msg = asaasErr instanceof Error ? asaasErr.message : String(asaasErr);
      log.error({ err: asaasErr, dealId }, "confirm-closure: Asaas failed");
      result.errors.push(`Cobrança: ${msg}`);
    }
  }

  return result;
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(key).join(value);
  }
  return result;
}

const DEFAULT_MINIMAL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><title>Contrato</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:40px;line-height:1.7;color:#222}
h1{text-align:center;font-size:20px;letter-spacing:1px}h2{font-size:15px;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:28px}
</style></head><body>
<h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<hr>
<p><strong>CONTRATANTE:</strong> {{cliente_nome}}, CNPJ/CPF: {{cliente_cnpj}}, endereço: {{cliente_endereco}}.</p>
<p><strong>CONTRATADA:</strong> {{empresa_nome}}, CNPJ: {{empresa_cnpj}}.</p>
<h2>1. OBJETO</h2><p>{{servicos}}</p>
<h2>2. VALOR E PAGAMENTO</h2><p>Valor total: <strong>{{valor_total}}</strong>. {{condicao_pagamento}}</p>
<h2>3. PRAZO</h2><p>{{prazo_entrega}}</p>
<h2>4. DISPOSIÇÕES GERAIS</h2>
<p>As partes concordam com os termos deste instrumento, elegendo o foro de domicílio do CONTRATANTE para dirimir controvérsias.</p>
<div style="margin-top:70px;display:flex;justify-content:space-between;gap:40px">
<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:8px"><strong>{{cliente_nome}}</strong><br><small>CONTRATANTE</small></div>
<div style="flex:1;text-align:center;border-top:1px solid #333;padding-top:8px"><strong>{{vendedor_nome}}</strong><br><small>{{empresa_nome}} — CONTRATADA</small></div>
</div>
<p style="text-align:center;margin-top:40px">{{data_contrato}}</p>
</body></html>`;

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env["PUPPETEER_EXECUTABLE_PATH"] ?? "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  const pdf = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "30px", bottom: "30px", left: "40px", right: "40px" },
  });
  await browser.close();
  return Buffer.from(pdf);
}

export default router;