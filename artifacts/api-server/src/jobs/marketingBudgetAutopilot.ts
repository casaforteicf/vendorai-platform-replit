import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, db, tenantsTable } from "@workspace/db";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { resolveMarketingAgentAutonomyPolicy } from "../services/marketingAgentAutonomyPolicy.js";
import { buildTenantPaidMediaBudgetRedistributionPlan } from "../services/paidMediaBudgetOptimizer.js";
import { executePaidMediaBudgetDecision } from "../services/paidMediaBudgetExecution.js";

const AUTOPILOT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_PLANS_PER_CYCLE = 100;

type CampaignRow = typeof adCampaignsTable.$inferSelect;
type MarketingContext = { mediaPlanId?: string };
type MediaPlanDraft = { budgetAdjustedAt?: string };

function readMediaPlanId(campaign: CampaignRow): string | null {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const context = segmentacao.marketingContext && typeof segmentacao.marketingContext === "object"
    ? segmentacao.marketingContext as MarketingContext
    : {};
  return typeof context.mediaPlanId === "string" && context.mediaPlanId.length > 0
    ? context.mediaPlanId
    : null;
}

function readLastBudgetAdjustment(campaign: CampaignRow): number | null {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const draft = segmentacao.mediaPlanDraft && typeof segmentacao.mediaPlanDraft === "object"
    ? segmentacao.mediaPlanDraft as MediaPlanDraft
    : {};
  if (!draft.budgetAdjustedAt) return null;
  const timestamp = Date.parse(draft.budgetAdjustedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function planIsCoolingDown(campaigns: CampaignRow[], now = Date.now()) {
  return campaigns.some((campaign) => {
    const last = readLastBudgetAdjustment(campaign);
    return last !== null && now - last < AUTOPILOT_COOLDOWN_MS;
  });
}

async function recordAutomaticResult(input: {
  tenantId: string;
  mediaPlanId: string;
  campaignId: string;
  autonomyLevel: number;
  maxTransferFractionPerCycle: number;
  result: Awaited<ReturnType<typeof executePaidMediaBudgetDecision>>;
}) {
  const { result } = input;
  await recordAdCampaignEvent({
    tenantId: input.tenantId,
    campaignId: input.campaignId,
    userId: null,
    eventType: result.applied ? "budget_redistribution_applied" : "budget_redistribution_hold",
    severity: result.applied ? "success" : "info",
    message: result.applied
      ? `Marketing IA aplicou redistribuição autônoma de ${result.decision.delta > 0 ? "+" : ""}R$ ${result.decision.delta.toFixed(2)}.`
      : `Marketing IA manteve a verba: ${result.reason}`,
    metadata: {
      mediaPlanId: input.mediaPlanId,
      authorization: "agent-autonomous",
      automaticCycle: true,
      autonomyLevel: input.autonomyLevel,
      maxTransferFractionPerCycle: input.maxTransferFractionPerCycle,
      decision: result.decision,
      schedule: result.applied ? result.schedule : null,
      humanCeilingRespected: result.applied ? result.humanCeilingRespected : result.plan.humanCeilingRespected,
    },
  });
}

async function applyAutomaticDecision(input: {
  tenantId: string;
  mediaPlanId: string;
  campaignId: string;
  autonomyLevel: number;
  maxTransferFractionPerCycle: number;
}) {
  const result = await executePaidMediaBudgetDecision({
    tenantId: input.tenantId,
    mediaPlanId: input.mediaPlanId,
    campaignId: input.campaignId,
    authorization: "agent-autonomous",
    maxTransferFractionPerCycle: input.maxTransferFractionPerCycle,
  });
  await recordAutomaticResult({ ...input, result });
  return result;
}

/**
 * Otimização autônoma de verba para tenants que escolheram nível 3 ou 4.
 *
 * O ciclo é deliberadamente conservador:
 * - só tenant ativo, campanha ativa Meta/Google e já publicada;
 * - política server-side precisa liberar canOptimizeBudget;
 * - cooldown de 6h por plano evita oscilação;
 * - primeiro reduz no máximo uma campanha doadora;
 * - depois recalcula com maxTransferFractionPerCycle=0 e aumenta no máximo uma
 *   vencedora usando SOMENTE verba já efetivamente desalocada;
 * - assim o estado persistido nunca depende de uma redução futura para respeitar
 *   o teto humano, inclusive quando uma API externa falha no meio do ciclo.
 */
export async function runMarketingBudgetAutopilot(log: Logger): Promise<void> {
  const [activeTenants, activeCampaigns] = await Promise.all([
    db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.status, "active")),
    db.select().from(adCampaignsTable).where(eq(adCampaignsTable.status, "ativo")).limit(1000),
  ]);
  const activeTenantIds = new Set(activeTenants.map((tenant) => tenant.id));

  const grouped = new Map<string, { tenantId: string; mediaPlanId: string; campaigns: CampaignRow[] }>();
  for (const campaign of activeCampaigns) {
    if (!activeTenantIds.has(campaign.tenantId)) continue;
    if (campaign.plataforma !== "meta" && campaign.plataforma !== "google") continue;
    if (!campaign.externalCampaignId) continue;
    const mediaPlanId = readMediaPlanId(campaign);
    if (!mediaPlanId) continue;
    const key = `${campaign.tenantId}:${mediaPlanId}`;
    const current = grouped.get(key) ?? { tenantId: campaign.tenantId, mediaPlanId, campaigns: [] };
    current.campaigns.push(campaign);
    grouped.set(key, current);
  }

  let evaluated = 0;
  let applied = 0;
  let skippedCooldown = 0;
  let skippedPolicy = 0;
  let failures = 0;

  for (const group of [...grouped.values()].slice(0, MAX_PLANS_PER_CYCLE)) {
    evaluated++;
    try {
      const policy = await resolveMarketingAgentAutonomyPolicy(group.tenantId);
      if (!policy.canOptimizeBudget) {
        skippedPolicy++;
        continue;
      }
      if (planIsCoolingDown(group.campaigns)) {
        skippedCooldown++;
        continue;
      }

      const initial = await buildTenantPaidMediaBudgetRedistributionPlan(group.tenantId, group.mediaPlanId, {
        maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
      });
      if (!initial.hasSufficientEvidence || !initial.humanCeilingRespected) continue;

      // 1) Libera verba real. Apenas uma doadora por ciclo mantém o comportamento previsível.
      const donor = initial.decisions
        .filter((decision) => decision.delta < 0)
        .sort((a, b) => a.delta - b.delta)[0];
      if (donor) {
        try {
          const result = await applyAutomaticDecision({
            tenantId: group.tenantId,
            mediaPlanId: group.mediaPlanId,
            campaignId: donor.campaignId,
            autonomyLevel: policy.level,
            maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
          });
          if (result.applied) applied++;
        } catch (err) {
          failures++;
          log.warn({ err, tenantId: group.tenantId, mediaPlanId: group.mediaPlanId, campaignId: donor.campaignId }, "scheduler/marketing-budget-autopilot: donor adjustment failed safely");
          // Sem redução confirmada, não tentamos financiar aumento com essa verba.
          continue;
        }
      }

      // 2) Recalcula sem permitir novas retiradas. Qualquer delta positivo agora
      // nasce apenas do saldo já desalocado no plano, nunca de verba futura.
      const funded = await buildTenantPaidMediaBudgetRedistributionPlan(group.tenantId, group.mediaPlanId, {
        maxTransferFractionPerCycle: 0,
      });
      if (!funded.humanCeilingRespected) continue;
      const winner = funded.decisions
        .filter((decision) => decision.delta > 0)
        .sort((a, b) => b.delta - a.delta)[0];
      if (!winner) continue;

      try {
        const result = await applyAutomaticDecision({
          tenantId: group.tenantId,
          mediaPlanId: group.mediaPlanId,
          campaignId: winner.campaignId,
          autonomyLevel: policy.level,
          maxTransferFractionPerCycle: 0,
        });
        if (result.applied) applied++;
      } catch (err) {
        failures++;
        log.warn({ err, tenantId: group.tenantId, mediaPlanId: group.mediaPlanId, campaignId: winner.campaignId }, "scheduler/marketing-budget-autopilot: winner adjustment failed safely");
      }
    } catch (err) {
      failures++;
      log.error({ err, tenantId: group.tenantId, mediaPlanId: group.mediaPlanId }, "scheduler/marketing-budget-autopilot: plan evaluation failed (non-fatal)");
    }
  }

  log.info({ evaluated, applied, skippedCooldown, skippedPolicy, failures }, "scheduler/marketing-budget-autopilot: cycle complete");
}
