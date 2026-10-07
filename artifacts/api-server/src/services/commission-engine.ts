import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  commissionEventsTable,
  commissionRulesTable,
  arqdorOriginCommissionRulesTable,
  arqdorOriginCommissionEventsTable,
  db,
  dealsTable,
  leadsTable,
  partnersTable,
  propostasTable,
  sellerCommissionsTable,
  type CommissionActorType,
  type CommissionTrigger,
  type ParticipationType,
} from "@workspace/db";

export type CommissionEvaluationInput = {
  tenantId: string;
  trigger: CommissionTrigger;
  dealId?: string | null;
  sellerUserId?: string | null;
  actorType?: CommissionActorType;
  actorId?: string | null;
  participationType?: ParticipationType;
  projectId?: string | null;
  agreementAccepted?: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  baseAmountCents?: number;
  receiptPercent?: number;
  marginPercent?: number | null;
  discountPercent?: number | null;
  productId?: string | null;
  category?: string | null;
  channel?: string | null;
  region?: string | null;
  correlationId: string;
  metadata?: Record<string, unknown>;
};

function clampPercent(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

function matchesOptional(ruleValue: string | null, inputValue: string | null | undefined) {
  return !ruleValue || ruleValue === inputValue;
}

function ruleMatches(rule: typeof commissionRulesTable.$inferSelect, input: CommissionEvaluationInput) {
  if (!rule.active || rule.trigger !== input.trigger) return false;
  if (input.participationType && rule.participationType !== input.participationType) return false;
  if (!matchesOptional(rule.productId, input.productId)) return false;
  if (!matchesOptional(rule.category, input.category)) return false;
  if (!matchesOptional(rule.channel, input.channel)) return false;
  if (!matchesOptional(rule.region, input.region)) return false;
  if (rule.minMarginPercent != null && Number(input.marginPercent ?? -Infinity) < Number(rule.minMarginPercent)) return false;
  if (rule.maxDiscountPercent != null && Number(input.discountPercent ?? Infinity) > Number(rule.maxDiscountPercent)) return false;
  return true;
}

function partnerActorType(tipoParceiro: string | null | undefined): CommissionActorType {
  switch (tipoParceiro) {
    case "representante": return "representative";
    case "influenciador": return "influencer";
    case "afiliado": return "affiliate";
    case "distribuidor": return "distributor";
    case "arquiteto":
    case "architect":
    case "creator":
      return "architect_creator";
    default: return "partner";
  }
}

function isRecurringFinancialOrigin(metadata?: Record<string, unknown>) {
  const origin = String(metadata?.origemTipo ?? metadata?.originType ?? "").toLowerCase();
  return origin.includes("recorr") || origin.includes("subscription") || origin.includes("mensalidade");
}

export async function resolveDealIdFromFinancialOrigin(tenantId: string, origemTipo?: string | null, origemId?: string | null) {
  if (!origemId) return null;
  if (origemTipo === "deal" || origemTipo === "negocio") {
    const [deal] = await db.select({ id: dealsTable.id }).from(dealsTable).where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.id, origemId))).limit(1);
    return deal?.id ?? null;
  }
  if (origemTipo === "proposta" || origemTipo === "proposal") {
    const [proposal] = await db.select({ dealId: propostasTable.dealId }).from(propostasTable).where(and(eq(propostasTable.tenantId, tenantId), eq(propostasTable.id, origemId))).limit(1);
    return proposal?.dealId ?? null;
  }
  return null;
}

async function syncLegacySellerCommission(tenantId: string, dealId: string, sellerUserId: string, reason: string) {
  const [aggregate] = await db
    .select({
      commissionCents: sql<number>`COALESCE(SUM(${commissionEventsTable.commissionCents}), 0)`,
      weightedBaseCents: sql<number>`COALESCE(SUM(${commissionEventsTable.baseAmountCents}), 0)`,
    })
    .from(commissionEventsTable)
    .where(and(
      eq(commissionEventsTable.tenantId, tenantId),
      eq(commissionEventsTable.dealId, dealId),
      eq(commissionEventsTable.sellerUserId, sellerUserId),
      ne(commissionEventsTable.status, "reversed"),
      sql`${commissionEventsTable.status} IN ('released', 'paid')`,
    ));

  const totalCommissionCents = Number(aggregate?.commissionCents ?? 0);
  const totalBaseCents = Number(aggregate?.weightedBaseCents ?? 0);
  const effectivePercent = totalBaseCents > 0 ? (totalCommissionCents / totalBaseCents) * 100 : 0;

  await db.update(sellerCommissionsTable).set({
    status: totalCommissionCents > 0 ? "aprovado" : "pendente",
    percentual: String(effectivePercent),
    valorComissaoCents: totalCommissionCents,
    observacoes: reason,
    updatedAt: new Date(),
  }).where(and(
    eq(sellerCommissionsTable.tenantId, tenantId),
    eq(sellerCommissionsTable.dealId, dealId),
    eq(sellerCommissionsTable.sellerUserId, sellerUserId),
  ));
}

async function createReferralPartnerParticipation(input: CommissionEvaluationInput, baseAmountCents: number, eligiblePercent: number) {
  if (!input.dealId || !input.sourceId) return null;
  if (input.trigger !== "payment_received" && input.trigger !== "payment_reconciled") return null;

  const [attribution] = await db
    .select({
      leadId: dealsTable.leadId,
      partnerId: leadsTable.indicadoPor,
    })
    .from(dealsTable)
    .leftJoin(leadsTable, and(eq(leadsTable.id, dealsTable.leadId), eq(leadsTable.tenantId, input.tenantId)))
    .where(and(eq(dealsTable.id, input.dealId), eq(dealsTable.tenantId, input.tenantId)))
    .limit(1);

  if (!attribution?.partnerId) return null;

  const [partner] = await db
    .select({
      id: partnersTable.id,
      tenantId: partnersTable.tenantId,
      status: partnersTable.status,
      tipoParceiro: partnersTable.tipoParceiro,
      comissaoPercentual: partnersTable.comissaoPercentual,
      comissaoRecorrentePercentual: partnersTable.comissaoRecorrentePercentual,
      cupomCodigo: partnersTable.cupomCodigo,
    })
    .from(partnersTable)
    .where(eq(partnersTable.id, attribution.partnerId))
    .limit(1);

  if (!partner || partner.status !== "ativo") return null;
  if (partner.tenantId && partner.tenantId !== input.tenantId) return null;

  const recurring = isRecurringFinancialOrigin(input.metadata);
  const configuredPercent = recurring && partner.comissaoRecorrentePercentual != null
    ? Number(partner.comissaoRecorrentePercentual)
    : Number(partner.comissaoPercentual ?? 0);
  const participationPercent = clampPercent(configuredPercent);
  if (participationPercent <= 0) return null;

  const correlationId = `partner:payment:${input.sourceId}:${partner.id}`;
  const [existing] = await db
    .select()
    .from(commissionEventsTable)
    .where(and(eq(commissionEventsTable.tenantId, input.tenantId), eq(commissionEventsTable.correlationId, correlationId)))
    .limit(1);
  if (existing) return existing;

  const participationCents = Math.round(baseAmountCents * (participationPercent / 100) * (eligiblePercent / 100));
  const actorType = partnerActorType(partner.tipoParceiro);
  const reason = `${recurring ? "Participação recorrente de Aquisição" : "Participação de Aquisição"} liberada após recebimento financeiro.`;

  const [event] = await db.insert(commissionEventsTable).values({
    tenantId: input.tenantId,
    ruleId: null,
    dealId: input.dealId,
    sellerUserId: null,
    actorType,
    actorId: partner.id,
    participationType: "acquisition",
    projectId: input.projectId ?? null,
    trigger: input.trigger,
    sourceType: "partner_referral_payment",
    sourceId: input.sourceId,
    baseAmountCents,
    eligiblePercent: String(eligiblePercent),
    commissionPercent: String(participationPercent),
    commissionCents: participationCents,
    platformFeePercent: "0",
    platformFeeCents: 0,
    status: "released",
    reason,
    correlationId,
    metadata: {
      ...(input.metadata ?? {}),
      partnerId: partner.id,
      partnerType: partner.tipoParceiro,
      couponCode: partner.cupomCodigo,
      recurring,
      attribution: "lead_indicado_por",
      productLanguage: "participacao",
    },
    releasedAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return event ?? null;
}


export async function createSpecificationParticipation(input: {
  tenantId: string;
  projectId?: string | null;
  solicitationId: string;
  architectActorId: string;
  baseAmountCents: number;
  participationPercent: number;
  platformFeePercent: number;
  paymentId: string;
  receiptPercent?: number;
  metadata?: Record<string, unknown>;
}) {
  const eligiblePercent = clampPercent(input.receiptPercent ?? 100);
  const participationPercent = clampPercent(input.participationPercent);
  const platformFeePercent = clampPercent(input.platformFeePercent);
  const correlationId = `specification:payment:${input.paymentId}:${input.solicitationId}`;

  const [existing] = await db.select().from(commissionEventsTable)
    .where(and(eq(commissionEventsTable.tenantId, input.tenantId), eq(commissionEventsTable.correlationId, correlationId)))
    .limit(1);
  if (existing) return { event: existing, idempotent: true };

  const baseAmountCents = Math.max(0, Math.round(input.baseAmountCents));
  const participationCents = Math.round(baseAmountCents * (participationPercent / 100) * (eligiblePercent / 100));
  const platformFeeCents = Math.round(baseAmountCents * (platformFeePercent / 100) * (eligiblePercent / 100));

  const [event] = await db.insert(commissionEventsTable).values({
    tenantId: input.tenantId,
    ruleId: null,
    dealId: null,
    sellerUserId: null,
    actorType: "architect_creator",
    actorId: input.architectActorId,
    participationType: "specification",
    projectId: input.projectId ?? null,
    trigger: "payment_reconciled",
    sourceType: "arch_specification_sale",
    sourceId: input.solicitationId,
    baseAmountCents,
    eligiblePercent: String(eligiblePercent),
    commissionPercent: String(participationPercent),
    commissionCents: participationCents,
    platformFeePercent: String(platformFeePercent),
    platformFeeCents,
    status: "released",
    reason: "Participação de Especificação liberada após confirmação do pagamento da venda.",
    correlationId,
    metadata: {
      ...(input.metadata ?? {}),
      solicitationId: input.solicitationId,
      paymentId: input.paymentId,
      productLanguage: "participacao",
    },
    releasedAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return {
    event,
    participation: { participationPercent, participationCents, platformFeePercent, platformFeeCents, eligiblePercent },
    idempotent: false,
  };
}


async function resolveLeadOrigin(input: CommissionEvaluationInput) {
  const explicitOriginTenantId = typeof input.metadata?.originTenantId === "string" ? input.metadata.originTenantId : null;
  const explicitCampaignId = typeof input.metadata?.originCampaignId === "string" ? input.metadata.originCampaignId : null;
  const explicitSource = typeof input.metadata?.originSource === "string" ? input.metadata.originSource : null;

  if (!input.dealId) {
    return explicitOriginTenantId ? {
      leadId: null,
      originTenantId: explicitOriginTenantId,
      originCampaignId: explicitCampaignId,
      originSource: explicitSource,
    } : null;
  }

  const [row] = await db
    .select({
      leadId: dealsTable.leadId,
      originTenantId: leadsTable.originTenantId,
      originCampaignId: leadsTable.originCampaignId,
      originSource: leadsTable.originSource,
    })
    .from(dealsTable)
    .leftJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(and(eq(dealsTable.id, input.dealId), eq(dealsTable.tenantId, input.tenantId)))
    .limit(1);

  const originTenantId = explicitOriginTenantId ?? row?.originTenantId ?? null;
  if (!originTenantId) return null;

  return {
    leadId: row?.leadId ?? null,
    originTenantId,
    originCampaignId: explicitCampaignId ?? row?.originCampaignId ?? null,
    originSource: explicitSource ?? row?.originSource ?? null,
  };
}

async function resolveOriginSharePercent(originTenantId: string, category?: string | null, campaignId?: string | null) {
  const rules = await db
    .select()
    .from(arqdorOriginCommissionRulesTable)
    .where(and(
      eq(arqdorOriginCommissionRulesTable.originTenantId, originTenantId),
      eq(arqdorOriginCommissionRulesTable.active, true),
    ))
    .orderBy(asc(arqdorOriginCommissionRulesTable.priority));

  const rule = rules.find((candidate) =>
    (!candidate.category || candidate.category === category)
    && (!candidate.campaignId || candidate.campaignId === campaignId)
  ) ?? null;

  return {
    rule,
    sharePercent: clampPercent(rule ? Number(rule.sharePercent) : 25),
  };
}

async function createOriginTenantParticipation(
  input: CommissionEvaluationInput,
  parentEvent: typeof commissionEventsTable.$inferSelect | undefined,
) {
  if (!parentEvent || parentEvent.status !== "released" || parentEvent.commissionCents <= 0) return null;
  if (input.trigger !== "payment_received" && input.trigger !== "payment_reconciled") return null;

  const origin = await resolveLeadOrigin(input);
  if (!origin?.originTenantId) return null;
  if (origin.originTenantId === input.tenantId) return null;

  const { rule, sharePercent } = await resolveOriginSharePercent(
    origin.originTenantId,
    input.category ?? null,
    origin.originCampaignId,
  );
  if (sharePercent <= 0) return null;

  const correlationId = `origin-share:${parentEvent.id}:${origin.originTenantId}`;
  const [existing] = await db
    .select()
    .from(arqdorOriginCommissionEventsTable)
    .where(and(
      eq(arqdorOriginCommissionEventsTable.sellerTenantId, input.tenantId),
      eq(arqdorOriginCommissionEventsTable.correlationId, correlationId),
    ))
    .limit(1);
  if (existing) return existing;

  const grossCommissionCents = Math.max(0, Number(parentEvent.commissionCents ?? 0));
  const originShareCents = Math.round(grossCommissionCents * (sharePercent / 100));

  const [event] = await db.insert(arqdorOriginCommissionEventsTable).values({
    sellerTenantId: input.tenantId,
    originTenantId: origin.originTenantId,
    leadId: origin.leadId,
    dealId: input.dealId ?? null,
    parentCommissionEventId: parentEvent.id,
    sourceType: input.sourceType ?? "commission_event",
    sourceId: input.sourceId ?? parentEvent.id,
    category: input.category ?? null,
    campaignId: origin.originCampaignId,
    grossCommissionCents,
    sharePercent: String(sharePercent),
    originShareCents,
    status: "released",
    correlationId,
    metadata: JSON.stringify({
      originSource: origin.originSource,
      ruleId: rule?.id ?? null,
      defaultShareApplied: !rule,
      parentCommissionCorrelationId: parentEvent.correlationId,
      productLanguage: "participacao_origem",
    }),
    releasedAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return event ?? null;
}

export async function reverseOriginTenantParticipation(parentCommissionEventId: string, sellerTenantId: string, reason?: string) {
  const rows = await db
    .update(arqdorOriginCommissionEventsTable)
    .set({
      status: "reversed",
      reversedAt: new Date(),
      updatedAt: new Date(),
      metadata: sql`COALESCE(${arqdorOriginCommissionEventsTable.metadata}, '{}')`,
    } as any)
    .where(and(
      eq(arqdorOriginCommissionEventsTable.parentCommissionEventId, parentCommissionEventId),
      eq(arqdorOriginCommissionEventsTable.sellerTenantId, sellerTenantId),
      ne(arqdorOriginCommissionEventsTable.status, "reversed"),
    ))
    .returning();

  if (reason && rows.length > 0) {
    for (const row of rows) {
      let metadata: Record<string, unknown> = {};
      try { metadata = row.metadata ? JSON.parse(String(row.metadata)) : {}; } catch {}
      await db.update(arqdorOriginCommissionEventsTable)
        .set({ metadata: JSON.stringify({ ...metadata, reversalReason: reason }), updatedAt: new Date() })
        .where(eq(arqdorOriginCommissionEventsTable.id, row.id));
    }
  }
  return rows;
}

export async function evaluateCommission(input: CommissionEvaluationInput) {
  const [existing] = await db
    .select()
    .from(commissionEventsTable)
    .where(and(eq(commissionEventsTable.tenantId, input.tenantId), eq(commissionEventsTable.correlationId, input.correlationId)))
    .limit(1);
  if (existing) return { event: existing, idempotent: true };

  const rules = await db
    .select()
    .from(commissionRulesTable)
    .where(and(eq(commissionRulesTable.tenantId, input.tenantId), eq(commissionRulesTable.active, true)))
    .orderBy(asc(commissionRulesTable.priority));

  const rule = rules.find((candidate) => ruleMatches(candidate, input)) ?? null;
  const baseAmountCents = Math.max(0, Math.round(Number(input.baseAmountCents ?? 0)));
  const receiptPercent = clampPercent(input.receiptPercent ?? (input.trigger === "payment_reconciled" ? 100 : 0));
  const rawParticipationPercent = clampPercent(rule ? Number(rule.commissionPercent) : 0);
  const participationPercent = rule?.capPercent != null ? Math.min(rawParticipationPercent, clampPercent(Number(rule.capPercent))) : rawParticipationPercent;
  const eligiblePercent = rule?.proportionalByReceipt === false ? (receiptPercent > 0 ? 100 : 0) : receiptPercent;
  const participationCents = Math.round(baseAmountCents * (participationPercent / 100) * (eligiblePercent / 100));
  const platformFeePercent = clampPercent(rule ? Number(rule.platformFeePercent) : 0);
  const platformFeeCents = Math.round(baseAmountCents * (platformFeePercent / 100) * (eligiblePercent / 100));
  const agreementPending = Boolean(rule?.requiresMutualAcceptance && input.agreementAccepted !== true);
  const status = !rule || agreementPending ? "validation" : "released";
  const participationType = input.participationType ?? rule?.participationType ?? "sales";
  const reason = !rule
    ? "Nenhuma regra de participação compatível; revisão necessária."
    : agreementPending
      ? "Participação aguardando aceite das partes."
      : `Regra de participação ${rule.name} aplicada pelo gatilho ${input.trigger}.`;

  const actorType = input.actorType ?? rule?.actorType ?? "seller";
  const actorId = input.actorId ?? input.sellerUserId ?? null;

  const [event] = await db.insert(commissionEventsTable).values({
    tenantId: input.tenantId,
    ruleId: rule?.id ?? null,
    dealId: input.dealId ?? null,
    sellerUserId: input.sellerUserId ?? null,
    actorType,
    actorId,
    participationType,
    projectId: input.projectId ?? null,
    trigger: input.trigger,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    baseAmountCents,
    eligiblePercent: String(eligiblePercent),
    commissionPercent: String(participationPercent),
    commissionCents: participationCents,
    platformFeePercent: String(platformFeePercent),
    platformFeeCents,
    status,
    reason,
    correlationId: input.correlationId,
    metadata: {
      ...(input.metadata ?? {}),
      participationType,
      agreementAccepted: input.agreementAccepted ?? null,
      attributionWindowDays: rule?.attributionWindowDays ?? null,
      recurringMonths: rule?.recurringMonths ?? null,
      productLanguage: "participacao",
    },
    releasedAt: status === "released" ? new Date() : null,
    updatedAt: new Date(),
  }).returning();

  if (event?.dealId && event.sellerUserId && status === "released") {
    await syncLegacySellerCommission(input.tenantId, event.dealId, event.sellerUserId, reason);
  }

  const partnerEvent = await createReferralPartnerParticipation(input, baseAmountCents, eligiblePercent);
  const originTenantEvent = await createOriginTenantParticipation(input, event);
  return {
    event,
    rule,
    partnerEvent,
    originTenantEvent,
    participation: {
      type: participationType,
      percent: participationPercent,
      amountCents: participationCents,
      platformFeePercent,
      platformFeeCents,
      agreementPending,
    },
    idempotent: false,
  };
}
