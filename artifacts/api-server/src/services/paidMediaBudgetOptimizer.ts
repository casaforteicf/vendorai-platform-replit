import { and, eq } from 'drizzle-orm';
import { adCampaignsTable, db, mediaPlansTable } from '@workspace/db';
import { getAdsOverview } from './adCampaignIntelligence';

export type BudgetOptimizationAction = 'increase' | 'decrease' | 'hold';

export type PaidCampaignBudgetEvidence = {
  campaignId: string;
  status?: string | null;
  currentAllocation: number;
  spend: number;
  leads: number;
  sales: number;
  revenue: number;
  roas: number | null;
};

export type PaidCampaignBudgetDecision = PaidCampaignBudgetEvidence & {
  remainingAllocation: number;
  targetAllocation: number;
  delta: number;
  action: BudgetOptimizationAction;
  reason: string;
};

export type PaidMediaBudgetRedistributionPlan = {
  planBudgetTotal: number;
  currentAllocatedTotal: number;
  unallocatedBudget: number;
  transferableBudget: number;
  targetAllocatedTotal: number;
  humanCeilingRespected: boolean;
  hasSufficientEvidence: boolean;
  decisions: PaidCampaignBudgetDecision[];
};

type BuildPlanInput = {
  planBudgetTotal: number;
  campaigns: PaidCampaignBudgetEvidence[];
  maxTransferFractionPerCycle?: number;
};

type AdsOverviewRow = {
  campaignId?: string;
  status?: string | null;
  spend?: number;
  leads?: number;
  sales?: number;
  revenue?: number;
  roas?: number | null;
};

type MediaPlanLink = { mediaPlanId?: string };
type MediaPlanDraftMeta = { allocatedTotalBudget?: number };

function floorCurrency(value: number): number {
  return Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function clampFraction(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0.2;
  return Math.min(1, Math.max(0, Number(value)));
}

function isWinner(row: PaidCampaignBudgetEvidence): boolean {
  return row.sales >= 2 && typeof row.roas === 'number' && row.roas >= 3;
}

function isDonorCandidate(row: PaidCampaignBudgetEvidence): boolean {
  if (row.spend <= 0) return false;
  if (row.leads === 0) return true;
  return row.leads >= 5 && row.sales === 0;
}

function evidenceWeight(row: PaidCampaignBudgetEvidence): number {
  if (!isWinner(row)) return 0;
  return Math.max(0, row.sales) * Math.max(0, Number(row.roas ?? 0));
}

function decisionReason(row: PaidCampaignBudgetEvidence, delta: number): string {
  if (delta > 0) {
    return `${row.sales} venda(s) e ROAS ${Number(row.roas ?? 0).toFixed(2)}x sustentam aumento somente com saldo já aprovado no plano.`;
  }
  if (delta < 0) {
    if (row.leads === 0) return `R$ ${row.spend.toFixed(2)} gastos sem lead atribuído; reduz somente verba ainda não consumida.`;
    return `${row.leads} lead(s) e nenhuma venda; reduz somente verba ainda não consumida até nova evidência.`;
  }
  return 'Sem evidência suficiente para mover orçamento nesta rodada.';
}

/**
 * Gera um plano determinístico de redistribuição sem tocar nas plataformas.
 * O algoritmo move apenas orçamento ainda não gasto e nunca ultrapassa o teto
 * total aprovado pelo humano no Plano de Mídia.
 */
export function buildPaidMediaBudgetRedistributionPlan(input: BuildPlanInput): PaidMediaBudgetRedistributionPlan {
  const planBudgetTotal = floorCurrency(input.planBudgetTotal);
  const maxTransferFraction = clampFraction(input.maxTransferFractionPerCycle);
  const campaigns = input.campaigns.map((row) => ({
    ...row,
    currentAllocation: floorCurrency(row.currentAllocation),
    spend: floorCurrency(row.spend),
    revenue: floorCurrency(row.revenue),
  }));

  const currentAllocatedTotal = floorCurrency(campaigns.reduce((sum, row) => sum + row.currentAllocation, 0));
  const unallocatedBudget = floorCurrency(Math.max(0, planBudgetTotal - currentAllocatedTotal));
  const winners = campaigns.filter(isWinner);
  const donors = campaigns.filter(isDonorCandidate);

  const donorCapacity = new Map<string, number>();
  let movableFromDonors = 0;
  for (const donor of donors) {
    const remaining = floorCurrency(Math.max(0, donor.currentAllocation - donor.spend));
    const cycleCap = floorCurrency(donor.currentAllocation * maxTransferFraction);
    const movable = floorCurrency(Math.min(remaining, cycleCap));
    donorCapacity.set(donor.campaignId, movable);
    movableFromDonors = floorCurrency(movableFromDonors + movable);
  }

  const transferableBudget = floorCurrency(unallocatedBudget + movableFromDonors);
  const winnerWeightTotal = winners.reduce((sum, row) => sum + evidenceWeight(row), 0);
  const hasSufficientEvidence = winners.length > 0 && transferableBudget > 0 && winnerWeightTotal > 0;

  const donorDelta = new Map<string, number>();
  for (const donor of donors) donorDelta.set(donor.campaignId, -Number(donorCapacity.get(donor.campaignId) ?? 0));

  const winnerDelta = new Map<string, number>();
  if (hasSufficientEvidence) {
    let assigned = 0;
    winners.forEach((winner, index) => {
      const isLast = index === winners.length - 1;
      const share = isLast
        ? floorCurrency(Math.max(0, transferableBudget - assigned))
        : floorCurrency(transferableBudget * (evidenceWeight(winner) / winnerWeightTotal));
      winnerDelta.set(winner.campaignId, share);
      assigned = floorCurrency(assigned + share);
    });
  }

  const decisions = campaigns.map((row) => {
    const remainingAllocation = floorCurrency(Math.max(0, row.currentAllocation - row.spend));
    const delta = hasSufficientEvidence
      ? roundCurrency((winnerDelta.get(row.campaignId) ?? 0) + (donorDelta.get(row.campaignId) ?? 0))
      : 0;
    const targetAllocation = floorCurrency(Math.max(row.spend, row.currentAllocation + delta));
    const action: BudgetOptimizationAction = delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'hold';
    return {
      ...row,
      remainingAllocation,
      targetAllocation,
      delta,
      action,
      reason: decisionReason(row, delta),
    };
  });

  const targetAllocatedTotal = floorCurrency(decisions.reduce((sum, row) => sum + row.targetAllocation, 0));
  const humanCeilingRespected = targetAllocatedTotal <= planBudgetTotal + 0.001;

  if (!humanCeilingRespected) {
    throw new Error('Plano de redistribuição inválido: alvo ultrapassa o teto humano do Plano de Mídia.');
  }

  return {
    planBudgetTotal,
    currentAllocatedTotal,
    unallocatedBudget,
    transferableBudget: hasSufficientEvidence ? transferableBudget : 0,
    targetAllocatedTotal,
    humanCeilingRespected,
    hasSufficientEvidence,
    decisions,
  };
}

function extractOverviewRows(overview: unknown): AdsOverviewRow[] {
  if (Array.isArray(overview)) return overview as AdsOverviewRow[];
  if (!overview || typeof overview !== 'object') return [];
  const record = overview as Record<string, unknown>;
  for (const key of ['campaigns', 'rows', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value as AdsOverviewRow[];
  }
  return [];
}

function readMediaPlanLink(campaign: typeof adCampaignsTable.$inferSelect): { link: MediaPlanLink; draft: MediaPlanDraftMeta } {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const marketingContext = segmentacao.marketingContext && typeof segmentacao.marketingContext === 'object'
    ? segmentacao.marketingContext as MediaPlanLink
    : {};
  const mediaPlanDraft = segmentacao.mediaPlanDraft && typeof segmentacao.mediaPlanDraft === 'object'
    ? segmentacao.mediaPlanDraft as MediaPlanDraftMeta
    : {};
  return { link: marketingContext, draft: mediaPlanDraft };
}

/**
 * Resolve o plano usando dados reais já consolidados pelo Ads Intelligence.
 * Não persiste mudanças e não chama APIs de Meta/Google.
 */
export async function buildTenantPaidMediaBudgetRedistributionPlan(
  tenantId: string,
  mediaPlanId: string,
  options?: { maxTransferFractionPerCycle?: number },
): Promise<PaidMediaBudgetRedistributionPlan> {
  const [plan] = await db.select().from(mediaPlansTable).where(and(
    eq(mediaPlansTable.id, mediaPlanId),
    eq(mediaPlansTable.tenantId, tenantId),
  )).limit(1);
  if (!plan) throw new Error('Plano de Mídia não encontrado para este tenant.');

  const budget = plan.conteudo.orcamento;
  if (!budget || budget.tipo !== 'total' || budget.limiteRigido !== true || Number(budget.valor) <= 0) {
    throw new Error('Plano de Mídia sem orçamento total rígido válido.');
  }

  const [campaigns, overview] = await Promise.all([
    db.select().from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId)),
    getAdsOverview(tenantId),
  ]);
  const overviewById = new Map(extractOverviewRows(overview)
    .filter((row) => row.campaignId)
    .map((row) => [String(row.campaignId), row]));

  const evidence = campaigns
    .filter((campaign) => {
      if (campaign.plataforma !== 'meta' && campaign.plataforma !== 'google') return false;
      return readMediaPlanLink(campaign).link.mediaPlanId === mediaPlanId;
    })
    .map((campaign): PaidCampaignBudgetEvidence => {
      const row = overviewById.get(campaign.id);
      const { draft } = readMediaPlanLink(campaign);
      const control = campaign.segmentacao?.campaignControl;
      return {
        campaignId: campaign.id,
        status: campaign.status,
        currentAllocation: Number(draft.allocatedTotalBudget ?? control?.totalBudget ?? 0),
        spend: Number(row?.spend ?? 0),
        leads: Number(row?.leads ?? 0),
        sales: Number(row?.sales ?? 0),
        revenue: Number(row?.revenue ?? 0),
        roas: typeof row?.roas === 'number' ? row.roas : null,
      };
    });

  return buildPaidMediaBudgetRedistributionPlan({
    planBudgetTotal: Number(budget.valor),
    campaigns: evidence,
    maxTransferFractionPerCycle: options?.maxTransferFractionPerCycle,
  });
}
