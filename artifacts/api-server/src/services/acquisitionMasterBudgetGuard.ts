import { and, eq } from "drizzle-orm";
import {
  acquisitionBudgetOrchestratorTable,
  adCampaignsTable,
  commerceCheckoutSessionsTable,
  db,
  generatedSitesTable,
} from "@workspace/db";

export type MasterBudgetGuardResult = {
  enabled: boolean;
  approved: boolean;
  autonomy: "recommend_only" | "approval_required" | "autonomous" | null;
  vertical: string;
  targetAmount: number | null;
  currentAllocatedAmount: number;
  availableHeadroom: number | null;
  requestedIncrease: number;
  allowedIncrease: number;
  cappedTargetAllocation: number;
  reason: string;
};

type CampaignRow = typeof adCampaignsTable.$inferSelect;
type MediaPlanDraft = { allocatedTotalBudget?: number };

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function campaignAllocation(campaign: CampaignRow) {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const draft = segmentacao.mediaPlanDraft && typeof segmentacao.mediaPlanDraft === "object"
    ? segmentacao.mediaPlanDraft as MediaPlanDraft
    : {};
  const control = segmentacao.campaignControl && typeof segmentacao.campaignControl === "object"
    ? segmentacao.campaignControl as { totalBudget?: number }
    : {};
  return Math.max(0, Number(draft.allocatedTotalBudget ?? control.totalBudget ?? 0));
}

function currentPlanIsApproved(input: { lastPlanAt: Date | null; lastApprovedAt: Date | null }) {
  if (!input.lastPlanAt || !input.lastApprovedAt) return false;
  return input.lastApprovedAt.getTime() >= input.lastPlanAt.getTime();
}

async function tenantOwnsAcquisitionEvidence(tenantId: string, vertical: string) {
  const rows = await db
    .select({ offerSnapshot: commerceCheckoutSessionsTable.offerSnapshot })
    .from(commerceCheckoutSessionsTable)
    .innerJoin(generatedSitesTable, eq(generatedSitesTable.id, commerceCheckoutSessionsTable.siteId))
    .where(eq(generatedSitesTable.tenantId, tenantId))
    .limit(5000);
  return rows.some((row) => row.offerSnapshot.vertical?.trim() === vertical);
}

function disabledResult(input: {
  autonomy: MasterBudgetGuardResult["autonomy"];
  vertical: string;
  proposedAllocation: number;
  requestedIncrease: number;
  reason: string;
}): MasterBudgetGuardResult {
  return {
    enabled: false,
    approved: false,
    autonomy: input.autonomy,
    vertical: input.vertical,
    targetAmount: null,
    currentAllocatedAmount: 0,
    availableHeadroom: null,
    requestedIncrease: input.requestedIncrease,
    allowedIncrease: input.requestedIncrease,
    cappedTargetAllocation: input.proposedAllocation,
    reason: input.reason,
  };
}

/**
 * Aplica o teto mestre aprovado à alteração de uma campanha de aquisição.
 * Só entra em ação no tenant que efetivamente possui checkouts daquela vertical,
 * evitando que campanhas de clientes do VendorAI sejam limitadas pelo orçamento
 * global usado para vender o próprio aplicativo.
 */
export async function enforceMasterAcquisitionBudget(input: {
  tenantId: string;
  campaignId: string;
  vertical: string;
  currentCampaignAllocation: number;
  proposedCampaignAllocation: number;
  authorization: "human-approved" | "agent-autonomous";
}): Promise<MasterBudgetGuardResult> {
  const currentAllocation = Math.max(0, Number(input.currentCampaignAllocation));
  const proposedAllocation = Math.max(0, Number(input.proposedCampaignAllocation));
  const requestedIncrease = roundMoney(Math.max(0, proposedAllocation - currentAllocation));

  const [config] = await db.select().from(acquisitionBudgetOrchestratorTable)
    .where(eq(acquisitionBudgetOrchestratorTable.id, "global"))
    .limit(1);

  if (!config?.active) {
    return disabledResult({
      autonomy: config?.autonomy ?? null,
      vertical: input.vertical,
      proposedAllocation,
      requestedIncrease,
      reason: "Orquestrador Mestre inativo; permanece válido apenas o teto do Plano de Mídia.",
    });
  }

  const ownsEvidence = await tenantOwnsAcquisitionEvidence(input.tenantId, input.vertical);
  if (!ownsEvidence) {
    return disabledResult({
      autonomy: config.autonomy,
      vertical: input.vertical,
      proposedAllocation,
      requestedIncrease,
      reason: "Campanha fora do funil de aquisição do VendorAI; orçamento mestre não se aplica a este tenant.",
    });
  }

  const approved = currentPlanIsApproved(config);
  if (!approved || !config.lastPlan) {
    throw new Error("Execução bloqueada: o Orquestrador Mestre está ativo, mas o plano atual ainda não foi aprovado.");
  }

  if (input.authorization === "agent-autonomous" && config.autonomy !== "autonomous") {
    throw new Error("Execução autônoma bloqueada pelo Orquestrador Mestre: a distribuição exige aprovação humana.");
  }

  const allocation = config.lastPlan.allocations.find((row) => row.dimension === "vertical" && row.key === input.vertical);
  if (!allocation) {
    throw new Error(`Execução bloqueada: a vertical ${input.vertical} não possui verba no plano mestre aprovado.`);
  }

  const campaigns = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.tenantId, input.tenantId),
    eq(adCampaignsTable.vertical, input.vertical),
    eq(adCampaignsTable.status, "ativo"),
  )).limit(5000);

  const currentAllocatedAmount = roundMoney(campaigns.reduce((sum, campaign) => sum + campaignAllocation(campaign), 0));
  const targetAmount = roundMoney(Number(allocation.targetAmount));
  const availableHeadroom = roundMoney(Math.max(0, targetAmount - currentAllocatedAmount));

  if (requestedIncrease <= 0) {
    return {
      enabled: true,
      approved,
      autonomy: config.autonomy,
      vertical: input.vertical,
      targetAmount,
      currentAllocatedAmount,
      availableHeadroom,
      requestedIncrease: 0,
      allowedIncrease: 0,
      cappedTargetAllocation: proposedAllocation,
      reason: "Redução permitida: não aumenta o consumo da verba mestre da vertical.",
    };
  }

  const allowedIncrease = roundMoney(Math.min(requestedIncrease, availableHeadroom));
  if (allowedIncrease <= 0) {
    throw new Error(`Execução bloqueada: a vertical ${input.vertical} já atingiu o teto mestre aprovado.`);
  }

  const cappedTargetAllocation = roundMoney(currentAllocation + allowedIncrease);
  return {
    enabled: true,
    approved,
    autonomy: config.autonomy,
    vertical: input.vertical,
    targetAmount,
    currentAllocatedAmount,
    availableHeadroom,
    requestedIncrease,
    allowedIncrease,
    cappedTargetAllocation,
    reason: allowedIncrease < requestedIncrease
      ? `Aumento limitado ao saldo mestre disponível da vertical: R$ ${allowedIncrease.toFixed(2)}.`
      : "Aumento integralmente coberto pelo teto mestre aprovado da vertical.",
  };
}
