import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, db } from "@workspace/db";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { resolveMarketingAgentAutonomyPolicy } from "../services/marketingAgentAutonomyPolicy.js";
import { buildTenantPaidMediaBudgetRedistributionPlan } from "../services/paidMediaBudgetOptimizer.js";
import { executePaidMediaBudgetDecision } from "../services/paidMediaBudgetExecution.js";

const AUTOPILOT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_PLANS_PER_CYCLE = 100;
const MAX_DECISIONS_PER_PLAN = 8;

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

/**
 * Otimização autônoma de verba para tenants que escolheram nível 3 ou 4.
 *
 * Guardrails:
 * - só campanhas ativas Meta/Google já vinculadas a um Plano de Mídia;
 * - política de autonomia é sempre resolvida no servidor;
 * - usa o limite percentual configurado pelo tenant;
 * - respeita cooldown de 6h para evitar oscilação de orçamento;
 * - o executor recalcula a decisão no instante da aplicação e preserva o teto humano;
 * - falha em uma campanha não interrompe os demais tenants/planos.
 */
export async function runMarketingBudgetAutopilot(log: Logger): Promise<void> {
  const activeCampaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "ativo"))
    .limit(1000);

  const grouped = new Map<string, { tenantId: string; mediaPlanId: string; campaigns: CampaignRow[] }>();
  for (const campaign of activeCampaigns) {
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

      const plan = await buildTenantPaidMediaBudgetRedistributionPlan(group.tenantId, group.mediaPlanId, {
        maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
      });
      if (!plan.hasSufficientEvidence || !plan.humanCeilingRespected) continue;

      const candidates = plan.decisions
        .filter((decision) => decision.action !== "hold" && decision.delta !== 0)
        .slice(0, MAX_DECISIONS_PER_PLAN);
      if (candidates.length === 0) continue;

      for (const candidate of candidates) {
        try {
          const result = await executePaidMediaBudgetDecision({
            tenantId: group.tenantId,
            mediaPlanId: group.mediaPlanId,
            campaignId: candidate.campaignId,
            authorization: "agent-autonomous",
            maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
          });

          await recordAdCampaignEvent({
            tenantId: group.tenantId,
            campaignId: candidate.campaignId,
            eventType: result.applied ? "budget_redistribution_auto_applied" : "budget_redistribution_auto_hold",
            severity: result.applied ? "success" : "info",
            message: result.applied
              ? `Marketing IA aplicou ${result.decision.delta > 0 ? "+" : ""}R$ ${result.decision.delta.toFixed(2)} no orçamento total da campanha.`
              : `Marketing IA manteve a verba: ${result.reason}`,
            metadata: {
              mediaPlanId: group.mediaPlanId,
              autonomyLevel: policy.level,
              maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
              decision: result.decision,
              schedule: result.applied ? result.schedule : null,
              humanCeilingRespected: result.applied ? result.humanCeilingRespected : result.plan.humanCeilingRespected,
            },
          });

          if (result.applied) applied++;
        } catch (err) {
          log.error({ err, tenantId: group.tenantId, mediaPlanId: group.mediaPlanId, campaignId: candidate.campaignId }, "scheduler/marketing-budget-autopilot: campaign apply failed (non-fatal)");
          try {
            await recordAdCampaignEvent({
              tenantId: group.tenantId,
              campaignId: candidate.campaignId,
              eventType: "budget_redistribution_auto_failed",
              severity: "warning",
              message: err instanceof Error ? err.message : "Falha na redistribuição autônoma de orçamento.",
              metadata: {
                mediaPlanId: group.mediaPlanId,
                autonomyLevel: policy.level,
                maxTransferFractionPerCycle: policy.maxTransferFractionPerCycle,
              },
            });
          } catch {
            // O log operacional continua sendo a fonte da falha se o histórico também estiver indisponível.
          }
        }
      }
    } catch (err) {
      log.error({ err, tenantId: group.tenantId, mediaPlanId: group.mediaPlanId }, "scheduler/marketing-budget-autopilot: plan evaluation failed (non-fatal)");
    }
  }

  log.info({ evaluated, applied, skippedCooldown, skippedPolicy }, "scheduler/marketing-budget-autopilot: cycle complete");
}
