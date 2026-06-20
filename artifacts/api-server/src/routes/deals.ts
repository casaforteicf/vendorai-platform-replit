import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import multer from "multer";
import {
  db,
  dealsTable,
  insertDealSchema,
  updateDealSchema,
  tenantsTable,
  leadsTable,
  tenantInvitesTable,
  partnersTable,
  notificationsTable,
  propostasTable,
  plansTable,
  planAssignmentLogTable,
  dealClosingStatusTable,
} from "@workspace/db";
import { dispatchVendaWebhook } from "../services/erp-webhook.js";
import { sendDirectWhatsAppMessage, WhatsAppNotConnectedError } from "../services/omnichannel.js";
import { buildInviteUrl } from "./invites.js";
import { sendInviteEmail } from "../lib/email.js";
import {
  isAsaasConfigured,
  createOrGetCustomer,
  createCharge,
  formaPagamentoToBillingType,
  type AsaasBillingType,
} from "../lib/asaas.js";
import {
  isZapSignConfigured,
  createDocument,
} from "../lib/zapsign.js";
import { billingEventsTable } from "@workspace/db";
import { extractQuoteData } from "../lib/document-extraction.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { generateContractPDF } from "../lib/contract-generation.js";
import { requireRole, buildUserFunctionFilter, type UserFunction } from "../middlewares/auth.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const uploadQuote = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post("/deals", async (req, res) => {
  const parsed = insertDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [deal] = await db.insert(dealsTable).values(parsed.data).returning();
  res.status(201).json(deal);
});

router.get("/tenants/:tenantId/deals", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  const { etapa, funilId, leadId } = req.query as Record<string, string | undefined>;

  const conditions = [eq(dealsTable.tenantId, tenantId)];
  if (etapa) conditions.push(eq(dealsTable.etapa, etapa as typeof dealsTable.etapa._.data));
  if (funilId) conditions.push(eq(dealsTable.funilId, funilId));
  if (leadId) conditions.push(eq(dealsTable.leadId, leadId));

  conditions.push(...buildUserFunctionFilter(req, dealsTable));

  const deals = await db
    .select()
    .from(dealsTable)
    .where(and(...conditions))
    .orderBy(dealsTable.createdAt);

  res.json(deals);
});

router.get("/deals/:id", async (req, res) => {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && deal.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin && userFn === "vendedor" && deal.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }
  if (!isAdmin && userFn === "entrega" && deal.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  res.json(deal);
});

router.patch("/deals/:id", async (req, res) => {
  const parsed = updateDealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, etapa: dealsTable.etapa, assignedTo: dealsTable.assignedTo })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const isAdmin2 = req.user?.platformRole === "super_admin" || req.user?.platformRole === "tenant_admin";
  const userFn2 = req.user?.userFunction as UserFunction | undefined;
  if (!isAdmin2 && (userFn2 === "vendedor" || userFn2 === "entrega") && existing.assignedTo !== req.user?.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  const [deal] = await db
    .update(dealsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dealsTable.id, existing.id))
    .returning();

  let inviteSent = false;
  let inviteEmail: string | undefined;
  let inviteSkipReason: string | undefined;
  let whatsappSent = false;
  let whatsappSkipReason: string | undefined;
  let chargeId: string | null = null;
  let chargeLink: string | null = null;
  let chargeSkipReason: string | undefined;
  let contractSent = false;
  let contractSkipReason: string | undefined;
  let onboardingSent = false;
  let onboardingSkipReason: string | undefined;

  // ── Trigger ganho: idempotent closure (contract-only retry for failed/skipped) ─────
  if (parsed.data.etapa === "ganho" && existing.etapa !== "ganho") {
    // ── Validação: plano obrigatório antes de fechar ────────────────────────
    if (!deal.planoContratado) {
      res.status(400).json({
        error: "PLANO_OBRIGATORIO",
        message: "É necessário definir o plano comercial (planoContratado) antes de fechar este deal.",
      });
      return;
    }

    // Inicializar rastreamento de fechamento
    const tenantId = deal.tenantId ?? (req.user?.tenantId || "");
    const [closingStatus] = await db
      .select({ id: dealClosingStatusTable.id })
      .from(dealClosingStatusTable)
      .where(eq(dealClosingStatusTable.dealId, deal.id))
      .limit(1);
    if (!closingStatus) {
      await db.insert(dealClosingStatusTable).values({
        dealId: deal.id,
        tenantId,
        etapaAtual: "plano_atribuido",
      });
    } else {
      await db
        .update(dealClosingStatusTable)
        .set({ etapaAtual: "plano_atribuido", updatedAt: new Date(), tentativas: sql`${dealClosingStatusTable.tentativas} + 1` })
        .where(eq(dealClosingStatusTable.id, closingStatus.id));
    }

    const plano = await db
      .select({ id: plansTable.id })
      .from(plansTable)
      .where(eq(plansTable.slug, deal.planoContratado))
      .limit(1)
      .then((rows) => rows[0]);
    if (!plano) {
      res.status(400).json({
        error: "PLANO_INVALIDO",
        message: `Plano "${deal.planoContratado}" não encontrado.`,
      });
      return;
    }

    const isContractRetry = deal.closureTriggeredAt && (deal.contractStatus === "failed" || deal.contractStatus === "skipped");
    if (deal.closureTriggeredAt && !isContractRetry) {
      req.log.info({ dealId: deal.id }, "deal-ganho: already triggered and succeeded, skipping");
    } else {
      try {
        // Marcar início do fechamento (ou manter data no retry)
        await db
          .update(dealsTable)
          .set({
            closureTriggeredAt: isContractRetry ? deal.closureTriggeredAt : new Date(),
            contractStatus: isContractRetry ? deal.contractStatus : "pending",
            onboardingStatus: isContractRetry ? deal.onboardingStatus : "pending",
          })
          .where(eq(dealsTable.id, deal.id));

        // ── Resolve tenant: usar existing ou criar novo do lead ───────────────
        let tenantId = existing.tenantId;
        let tenant: { name: string; webhookEstoqueUrl: string | null; partnerId: string | null; tipoFechamentoDefault: string | null; integrationType: string | null } | undefined;
        if (tenantId) {
          tenant = await db
            .select({
              name: tenantsTable.name,
              webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
              partnerId: tenantsTable.partnerId,
              tipoFechamentoDefault: tenantsTable.tipoFechamentoDefault,
              integrationType: tenantsTable.integrationType,
            })
            .from(tenantsTable)
            .where(eq(tenantsTable.id, tenantId))
            .then((rows) => rows[0]);
        }
        if (!tenant) {
          const slugBase = (deal.titulo ?? deal.id).toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
          const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
          const [newTenant] = await db
            .insert(tenantsTable)
            .values({
              name: deal.titulo,
              slug,
              status: "active",
              partnerId: null,
            })
            .returning({
              id: tenantsTable.id,
              name: tenantsTable.name,
              webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
              partnerId: tenantsTable.partnerId,
              tipoFechamentoDefault: tenantsTable.tipoFechamentoDefault,
              integrationType: tenantsTable.integrationType,
            });
          tenantId = newTenant.id;
          tenant = newTenant;
          await db.update(dealsTable).set({ tenantId: newTenant.id }).where(eq(dealsTable.id, deal.id));
          req.log.info({ dealId: deal.id, tenantId: newTenant.id }, "deal-ganho: auto-created tenant");
        }

        // Atribuir plano ao tenant (obrigatório — nunca deixar em modo legacy)
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
          dealId: deal.id,
          planId: plano.id,
          assignedBy: "sistema_fechamento_deal",
        });
        req.log.info({ dealId: deal.id, tenantId, planId: plano.id }, "deal-ganho: plano atribuído ao tenant");

        // Atualizar deal_closing_status: plano_atribuido → concluido (ou travado em erro)
        await db
          .update(dealClosingStatusTable)
          .set({ etapaAtual: "concluido", updatedAt: new Date() })
          .where(eq(dealClosingStatusTable.dealId, deal.id));

        const lead = deal.leadId
          ? await db
              .select({ email: leadsTable.email, nome: leadsTable.nome, telefone: leadsTable.telefone, documento: leadsTable.documento, empresa: leadsTable.empresa })
              .from(leadsTable)
              .where(eq(leadsTable.id, deal.leadId))
              .then((rows) => rows[0])
          : undefined;

        // ── Notificações de dados faltantes ─────────────────────────────────
        const missingData: string[] = [];
        if (!lead?.email) missingData.push("email");
        if (!lead?.telefone) missingData.push("telefone");
        if (!lead?.documento) missingData.push("documento (CPF/CNPJ)");
        if (missingData.length > 0) {
          await db.insert(notificationsTable).values({
            tenantId,
            title: "Dados faltantes para fechamento",
            message: `Deal "${deal.titulo}" está faltando: ${missingData.join(", ")}. Complete o lead para enviar contrato e onboarding.`,
            type: "warning",
            category: "deal_closure",
          });
          req.log.warn({ dealId: deal.id, missing: missingData }, "deal-ganho: missing data notification created");
        }

        // ── Onboarding: email + WhatsApp (skip on contract retry) ──────────
        let inviteUrl: string | undefined;
        if (isContractRetry) {
          // Preservar estado anterior do onboarding no retry
          inviteSent = deal.onboardingStatus === "sent";
          onboardingSent = deal.onboardingStatus === "sent";
          whatsappSent = deal.onboardingStatus === "sent";
          req.log.info({ dealId: deal.id }, "deal-ganho: onboarding skipped on contract retry");
        } else {
          if (!lead?.email) {
            inviteSkipReason = "no_email";
            req.log.info({ dealId: deal.id }, "auto-invite skipped: lead has no email");
          } else {
            const email = lead.email;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            const [existing_invite] = await db
              .select({ id: tenantInvitesTable.id, token: tenantInvitesTable.token })
              .from(tenantInvitesTable)
              .where(
                and(
                  eq(tenantInvitesTable.email, email),
                  eq(tenantInvitesTable.tenantId, tenantId),
                  eq(tenantInvitesTable.role, "tenant_admin"),
                  isNull(tenantInvitesTable.usedAt),
                ),
              );

            let invite: { id: string; token: string };
            if (existing_invite) {
              [invite] = await db
                .update(tenantInvitesTable)
                .set({ expiresAt })
                .where(eq(tenantInvitesTable.id, existing_invite.id))
                .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
            } else {
              [invite] = await db
                .insert(tenantInvitesTable)
                .values({
                  tenantId,
                  email,
                  role: "tenant_admin",
                  expiresAt,
                  createdBy: req.user!.sub,
                })
                .returning({ id: tenantInvitesTable.id, token: tenantInvitesTable.token });
            }

            inviteUrl = buildInviteUrl(req, invite.token);
            inviteSent = await sendInviteEmail(email, inviteUrl, tenant?.name ?? "");
            inviteEmail = email;
            req.log.info({ dealId: deal.id, inviteId: invite.id, inviteSent }, "auto-invite processed");
          }

          // WhatsApp invite
          if (!lead?.telefone) {
            whatsappSkipReason = "no_phone";
            req.log.info({ dealId: deal.id }, "whatsapp invite skipped: lead has no phone");
          } else {
            try {
              const nome = lead.nome ?? "";
              const plataforma = tenant?.name ?? "VendorAI";
              const whatsappMessage = inviteUrl
                ? `Olá, ${nome}! 🎉\n\nSeu acesso à plataforma ${plataforma} foi liberado.\n\nClique no link abaixo para criar sua senha e acessar:\n${inviteUrl}`
                : `Olá, ${nome}! 🎉\n\nSeu negócio foi fechado com sucesso na plataforma ${plataforma}. Em breve nossa equipe entrará em contato com mais informações.`;
              await sendDirectWhatsAppMessage(tenantId, lead.telefone, whatsappMessage, req.log);
              whatsappSent = true;
              req.log.info({ dealId: deal.id }, "whatsapp invite sent");
            } catch (err) {
              whatsappSkipReason =
                err instanceof WhatsAppNotConnectedError ? "zapi_not_configured" : "send_error";
              req.log.warn({ dealId: deal.id, err }, "whatsapp invite failed");
            }
          }

          // Atualizar onboarding status
          const onboardingError = inviteSkipReason || whatsappSkipReason || undefined;
          onboardingSent = inviteSent || whatsappSent;
          onboardingSkipReason = onboardingError;
          await db
            .update(dealsTable)
            .set({
              onboardingStatus: onboardingSent ? "sent" : "failed",
              onboardingError: onboardingError ?? null,
              updatedAt: new Date(),
            })
            .where(eq(dealsTable.id, deal.id));
        }

        // ── Copiar valor → mensalidadeValor do tenant ─────────────────────────
        if (deal.valor) {
          await db
            .update(tenantsTable)
            .set({ mensalidadeValor: deal.valor, updatedAt: new Date() })
            .where(eq(tenantsTable.id, tenantId));
          req.log.info({ dealId: deal.id, valor: deal.valor }, "deal-ganho: mensalidadeValor updated");
        }

        // ── Criar billing_event initial (idempotente: verifica se já existe) ──────
        if (deal.valor && !isContractRetry) {
          const [existingBilling] = await db
            .select({ id: billingEventsTable.id })
            .from(billingEventsTable)
            .where(
              and(
                eq(billingEventsTable.tenantId, tenantId),
                eq(billingEventsTable.tipo, "initial"),
                eq(billingEventsTable.valor, deal.valor),
              ),
            )
            .limit(1);

          if (!existingBilling) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            await db.insert(billingEventsTable).values({
              tenantId,
              tipo: "initial",
              valor: deal.valor,
              status: "pending",
              dueDate,
            });
          } else {
            req.log.info({ dealId: deal.id }, "deal-ganho: billing_event already exists, skipping");
          }
        }

        // ── ZapSign: contrato 2 ou 3 partes com PDF ───────────────────────────
        const tipoFechamento = deal.tipoFechamento ?? tenant?.tipoFechamentoDefault ?? "pedido";
        req.log.info({ dealId: deal.id, tipoFechamento, dealTipoFechamento: deal.tipoFechamento, tenantDefault: tenant?.tipoFechamentoDefault }, "deal-ganho: resolved tipoFechamento");
        if (tipoFechamento === "contrato" || tipoFechamento === "pedido_e_contrato") {
          if (!isZapSignConfigured()) {
            contractSent = false;
            contractSkipReason = "zapsign_not_configured";
            await db
              .update(dealsTable)
              .set({ contractStatus: "skipped", contractError: "zapsign_not_configured", updatedAt: new Date() })
              .where(eq(dealsTable.id, deal.id));
            req.log.warn({ dealId: deal.id }, "deal-ganho: ZapSign não configurado (ZAPSIGN_API_KEY ausente)");
          } else {
            try {
              // Pré-requisito: lead precisa ter email para assinar contrato
              if (!lead?.email) {
                contractSent = false;
                contractSkipReason = "no_lead_email";
                await db
                  .update(dealsTable)
                  .set({ contractStatus: "failed", contractError: "no_lead_email", updatedAt: new Date() })
                  .where(eq(dealsTable.id, deal.id));
                req.log.warn({ dealId: deal.id }, "deal-ganho: contract skipped — lead has no email");
              } else {
                const signers: { name: string; email: string }[] = [];

                // 1. Cliente (obrigatório)
                signers.push({ name: lead.nome ?? "Cliente", email: lead.email });

                // 2. Parceiro (se tenant tem partner)
                let partnerName: string | undefined;
                let partnerEmail: string | undefined;
                if (tenant?.partnerId) {
                  const [partner] = await db
                    .select({ name: partnersTable.name, email: partnersTable.email })
                    .from(partnersTable)
                    .where(eq(partnersTable.id, tenant.partnerId));
                  if (partner) {
                    signers.push({ name: partner.name, email: partner.email });
                    partnerName = partner.name;
                    partnerEmail = partner.email;
                  }
                }

                // 3. Vendor.ai (sempre — CONTRATADA)
                const vendoraiEmail = process.env["VENDORAI_SIGNING_EMAIL"];
                if (vendoraiEmail) {
                  signers.push({ name: "Vendor.ai", email: vendoraiEmail });
                }
                const partes = tenant?.partnerId ? "3 partes" : "2 partes";

                // Gerar PDF do contrato
                let contentBase64: string | undefined;
                try {
                  const pdfBuffer = await generateContractPDF({
                    dealTitulo: deal.titulo,
                    dealValor: deal.valor ? `R$ ${Number(deal.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "Valor não especificado",
                    clienteNome: lead?.nome ?? "Cliente",
                    clienteEmail: lead?.email ?? "",
                    clienteTelefone: lead?.telefone ?? "",
                    clienteDocumento: lead?.documento ?? undefined,
                    clienteEmpresa: lead?.empresa ?? undefined,
                    tenantNome: tenant?.name ?? "Vendor.ai",
                    dataHoje: new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }),
                    produtosServicos: deal.titulo,
                    partnerName,
                    partnerEmail,
                  }, !!tenant?.partnerId);
                  contentBase64 = pdfBuffer.toString("base64");
                } catch (pdfErr) {
                  req.log.warn({ dealId: deal.id, err: pdfErr }, "deal-ganho: PDF generation failed, sending empty document");
                }

                const doc = await createDocument({
                  name: `Contrato ${deal.titulo} — ${partes}`,
                  lang: "pt-BR",
                  signers,
                  content_base64: contentBase64,
                });
                contractSent = true;

                await db
                  .update(dealsTable)
                  .set({
                    zapsignDocId: doc.token,
                    contractStatus: "sent",
                    contractError: null,
                    updatedAt: new Date(),
                  })
                  .where(eq(dealsTable.id, deal.id));

                req.log.info(
                  { dealId: deal.id, docToken: doc.token, signers: signers.length, partes },
                  "deal-ganho: contrato ZapSign criado",
                );
              }
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              contractSent = false;
              contractSkipReason = "send_error";
              await db
                .update(dealsTable)
                .set({ contractStatus: "failed", contractError: errMsg.slice(0, 500), updatedAt: new Date() })
                .where(eq(dealsTable.id, deal.id));
              req.log.warn({ err, dealId: deal.id }, "deal-ganho: ZapSign falhou (non-fatal)");
            }
          }
        } else {
          contractSent = false;
          contractSkipReason = "tipo_pedido";
          await db
            .update(dealsTable)
            .set({ contractStatus: "na", updatedAt: new Date() })
            .where(eq(dealsTable.id, deal.id));
          req.log.info({ dealId: deal.id }, "deal-ganho: tipo=pedido — confirmação simples");
        }

        // ── Cobrança Asaas (idempotente: verifica se já existe) ────────────
        if (!isAsaasConfigured()) {
          chargeSkipReason = "asaas_not_configured";
          req.log.warn({ dealId: deal.id }, "Asaas charge skipped: ASAAS_API_KEY not configured");
        } else if (!deal.valor) {
          chargeSkipReason = "no_valor";
          req.log.info({ dealId: deal.id }, "Asaas charge skipped: deal has no valor");
        } else if (deal.asaasChargeId) {
          chargeSkipReason = undefined;
          req.log.info({ dealId: deal.id, chargeId: deal.asaasChargeId }, "Asaas charge already exists, skipping");
        } else {
          try {
            // Descobrir walletId do parceiro (se tenant tiver parceiro com subconta)
            let partnerWalletId: string | null = null;
            if (tenant?.partnerId) {
              const [partner] = await db
                .select({ asaasWalletId: partnersTable.asaasWalletId })
                .from(partnersTable)
                .where(eq(partnersTable.id, tenant.partnerId));
              partnerWalletId = partner?.asaasWalletId ?? null;
            }

            // Criar ou recuperar cliente Asaas
            const customer = await createOrGetCustomer({
              name: lead?.nome ?? tenant?.name ?? "Cliente",
              email: lead?.email ?? undefined,
              phone: lead?.telefone ?? undefined,
            });

            // Vencimento: 3 dias úteis a partir de hoje
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            const dueDateStr = dueDate.toISOString().split("T")[0]!;

            // ── Resolve billingType + parcelamento a partir da proposta vinculada ─
            let billingType: AsaasBillingType = "PIX";
            let installmentCount: number | undefined;
            let installmentValue: number | undefined;
            const [proposta] = await db
              .select({ formaPagamento: propostasTable.formaPagamento, numParcelas: propostasTable.numParcelas })
              .from(propostasTable)
              .where(eq(propostasTable.dealId, deal.id))
              .orderBy(sql`${propostasTable.createdAt} desc`)
              .limit(1);
            if (proposta?.formaPagamento) {
              billingType = formaPagamentoToBillingType(proposta.formaPagamento);
            }
            if (proposta?.numParcelas && proposta.numParcelas > 1) {
              installmentCount = proposta.numParcelas;
              installmentValue = Math.round((Number(deal.valor) / proposta.numParcelas) * 100) / 100;
            }

            const charge = await createCharge({
              customer: customer.id,
              billingType,
              value: Number(deal.valor),
              dueDate: dueDateStr,
              description: `Proposta: ${deal.titulo}`,
              split: partnerWalletId
                ? [{ walletId: partnerWalletId, percentualValue: 50 }]
                : undefined,
              ...(installmentCount ? { installmentCount, installmentValue } : {}),
            });

            chargeId = charge.id;
            chargeLink = charge.invoiceUrl ?? charge.bankSlipUrl ?? null;

            // Persistir dados de cobrança no deal
            await db
              .update(dealsTable)
              .set({
                asaasChargeId: charge.id,
                chargeLink: charge.invoiceUrl,
                chargeStatus: charge.status,
                updatedAt: new Date(),
              })
              .where(eq(dealsTable.id, deal.id));

            req.log.info(
              { dealId: deal.id, chargeId: charge.id, split: !!partnerWalletId, partnerWalletId },
              "Asaas charge created",
            );
          } catch (err) {
            chargeSkipReason = "asaas_error";
            req.log.warn({ err, dealId: deal.id }, "Asaas charge creation failed");
          }
        }

        // ── Webhook ERP: venda realizada (idempotente via closureTriggeredAt) ──────
        if (tenant?.webhookEstoqueUrl && !isContractRetry) {
          void dispatchVendaWebhook(
            tenant.webhookEstoqueUrl,
            {
              event: "venda_realizada",
              tenantId,
              vendaId: deal.id,
              tipo: "deal",
              produtos: [],
              valorTotal: deal.valor ? Number(deal.valor) : null,
              realizadaEm: new Date().toISOString(),
              integrationType: (tenant.integrationType as "n8n" | "api" | undefined) ?? undefined,
            },
            req.log,
          );
        }
      } catch (err) {
        const errStr = err instanceof Error ? err.stack || err.message : String(err);
        console.error("=== deal-ganho: CRITICAL ERROR ===", errStr);
        req.log.warn({ err }, "deal-ganho: trigger processing failed");
        // Marcar deal_closing_status como travado para permitir retry manual
        await db
          .update(dealClosingStatusTable)
          .set({
            etapaAtual: "travado_erro",
            ultimoErro: errStr.slice(0, 500),
            updatedAt: new Date(),
          })
          .where(eq(dealClosingStatusTable.dealId, deal.id))
          .catch(() => { /* ignore */ });
      }
    }
  }

  // ── Trigger perda: capturar motivo e data ─────────────────────────────────
  if (parsed.data.etapa === "perdido" && existing.etapa !== "perdido") {
    try {
      const primaryReason = parsed.data.lostReason ?? parsed.data.categoriaPerda ?? null;
      const primaryDetail = parsed.data.lostReasonDetail ?? parsed.data.motivoPerda ?? null;
      await db
        .update(dealsTable)
        .set({
          lostAt: new Date(),
          lostReason: primaryReason,
          lostReasonDetail: primaryDetail,
          updatedAt: new Date(),
        })
        .where(eq(dealsTable.id, deal.id));
      req.log.info({ dealId: deal.id }, "deal marked as lost");
    } catch (err) {
      req.log.warn({ err, dealId: deal.id }, "deal-perdido: failed to update lost fields");
    }
  }

  // Re-fetch deal atualizado para retornar estado fresco
  const [finalDeal] = await db.select().from(dealsTable).where(eq(dealsTable.id, deal.id));

  res.json({
    ...finalDeal,
    inviteSent,
    inviteEmail,
    inviteSkipReason,
    whatsappSent,
    whatsappSkipReason,
    chargeId,
    chargeLink,
    chargeSkipReason,
    contractSent,
    contractSkipReason,
    onboardingSent,
    onboardingSkipReason,
  });
});

// ─── Quote extraction ─────────────────────────────────────────────────────────
router.post(
  "/tenants/:tenantId/deals/extract-quote",
  uploadQuote.single("file"),
  async (req, res) => {
    const tenantId = String(req.params.tenantId);

    if (
      req.user?.platformRole !== "super_admin" &&
      req.user?.tenantId !== tenantId
    ) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "Nenhum arquivo enviado" });
      return;
    }

    try {
      const [result, quoteFileUrl] = await Promise.all([
        extractQuoteData([
          {
            buffer: req.file.buffer,
            mimeType: req.file.mimetype,
            originalName: req.file.originalname,
          },
        ], tenantId),
        objectStorageService.savePrivateBuffer(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname
        ).catch((err) => {
          req.log.warn({ err }, "extract-quote: failed to save file to storage, continuing without it");
          return null;
        }),
      ]);
      res.json({ ...result, quoteFileUrl, originalName: req.file.originalname });
    } catch (err) {
      req.log.error({ err }, "Failed to extract quote data");
      res.status(500).json({ error: "Erro ao processar o arquivo" });
    }
  }
);

router.delete("/deals/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: dealsTable.id, tenantId: dealsTable.tenantId, assignedTo: dealsTable.assignedTo })
    .from(dealsTable)
    .where(eq(dealsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  if (req.user?.platformRole === "tenant_seller" && existing.assignedTo !== req.user.sub) {
    res.status(403).json({ error: "Access denied to this deal" });
    return;
  }

  await db.delete(dealsTable).where(eq(dealsTable.id, existing.id));

  res.status(204).send();
});

// ── GET /admin/deals/travados ───────────────────────────────────────────────
router.get("/admin/deals/travados", requireRole("super_admin"), async (req, res) => {
  const travados = await db
    .select({
      id: dealClosingStatusTable.id,
      dealId: dealClosingStatusTable.dealId,
      tenantId: dealClosingStatusTable.tenantId,
      etapaAtual: dealClosingStatusTable.etapaAtual,
      ultimoErro: dealClosingStatusTable.ultimoErro,
      tentativas: dealClosingStatusTable.tentativas,
      updatedAt: dealClosingStatusTable.updatedAt,
      titulo: dealsTable.titulo,
      valor: dealsTable.valor,
      nomeEmpresa: leadsTable.empresa,
    })
    .from(dealClosingStatusTable)
    .innerJoin(dealsTable, eq(dealClosingStatusTable.dealId, dealsTable.id))
    .leftJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .where(eq(dealClosingStatusTable.etapaAtual, "travado_erro"))
    .orderBy(dealClosingStatusTable.updatedAt);

  res.json(travados);
});

// ── POST /admin/deals/:id/retry ──────────────────────────────────────────────
router.post("/admin/deals/:id/retry", requireRole("super_admin"), async (req, res) => {
  const dealId = String(req.params.id);
  const [deal] = await db.select().from(dealsTable).where(eq(dealsTable.id, dealId)).limit(1);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }

  if (deal.etapa !== "ganho") {
    res.status(400).json({ error: "Deal não está na etapa ganho" });
    return;
  }

  // Resetar deal_closing_status para permitir reprocessamento
  await db
    .update(dealClosingStatusTable)
    .set({
      etapaAtual: "plano_atribuido",
      ultimoErro: null,
      updatedAt: new Date(),
    })
    .where(eq(dealClosingStatusTable.dealId, dealId));

  res.json({ success: true, message: "Deal marcado para reprocessamento. Refaça o PATCH /deals/:id com etapa=ganho." });
});

router.get("/tenants/:tenantId/payment-methods", async (req, res) => {
  const tenantId = String(req.params["tenantId"]);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const methods = [
    { code: "pix", label: "PIX", enabled: true },
    { code: "boleto", label: "Boleto Bancário", enabled: true },
    { code: "cartao_credito", label: "Cartão de Crédito", enabled: true },
    { code: "cartao_debito", label: "Cartão de Débito", enabled: true },
    { code: "transferencia", label: "Transferência Bancária", enabled: true },
    { code: "dinheiro", label: "Dinheiro", enabled: true },
    { code: "a_combinar", label: "A Combinar", enabled: true },
  ];

  res.json({ gateway: "asaas", methods });
});

export default router;
