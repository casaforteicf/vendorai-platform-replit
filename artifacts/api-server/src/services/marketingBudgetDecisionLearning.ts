import { and, desc, inArray, lte } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignEventsTable, db } from "@workspace/db";
import { getAdsOverview, recordAdCampaignEvent } from "./adCampaignIntelligence.js";

const APPLIED_TYPES = ["budget_redistribution_applied", "budget_redistribution_auto_applied"] as const;
const EARLY_EVALUATION_HOURS = 24;
const FINAL_EVALUATION_HOURS = 72;
const MIN_EVALUATION_AGE_MS = EARLY_EVALUATION_HOURS * 60 * 60 * 1000;
const MAX_SOURCE_EVENTS = 200;

type OverviewRow = { campaignId?: string; spend?: number; leads?: number; sales?: number; revenue?: number; roas?: number | null };
type Verdict = "melhorou" | "piorou" | "inconclusivo";
type EvaluationStage = "24h" | "72h";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractOverviewRows(overview: unknown): OverviewRow[] {
  if (Array.isArray(overview)) return overview as OverviewRow[];
  if (!overview || typeof overview !== "object") return [];
  const record = overview as Record<string, unknown>;
  for (const key of ["campaigns", "rows", "items"]) {
    if (Array.isArray(record[key])) return record[key] as OverviewRow[];
  }
  return [];
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function classify(input: {
  baselineRoas: number | null;
  spendDelta: number;
  leadsDelta: number;
  salesDelta: number;
  revenueDelta: number;
}): { verdict: Verdict; postRoas: number | null; reason: string } {
  const postRoas = input.spendDelta > 0 ? input.revenueDelta / input.spendDelta : null;
  const hasSignal = input.spendDelta >= 20 || input.leadsDelta > 0 || input.salesDelta > 0;
  if (!hasSignal) return { verdict: "inconclusivo", postRoas, reason: "Ainda não há volume pós-decisão suficiente para avaliar com segurança." };

  if (input.salesDelta > 0) {
    if (input.baselineRoas === null || postRoas === null || postRoas >= input.baselineRoas * 0.9) {
      return { verdict: "melhorou", postRoas, reason: `A decisão gerou ${input.salesDelta} nova(s) venda(s) sem deterioração material do ROAS.` };
    }
  }

  if (input.baselineRoas !== null && postRoas !== null) {
    if (postRoas >= input.baselineRoas * 1.1) return { verdict: "melhorou", postRoas, reason: "O ROAS incremental pós-decisão ficou pelo menos 10% acima da referência anterior." };
    if (input.spendDelta >= 50 && input.salesDelta === 0 && postRoas <= input.baselineRoas * 0.8) {
      return { verdict: "piorou", postRoas, reason: "Houve gasto pós-decisão relevante, sem nova venda, e ROAS incremental pelo menos 20% abaixo da referência." };
    }
  }

  if (input.spendDelta >= 75 && input.salesDelta === 0 && input.leadsDelta === 0) {
    return { verdict: "piorou", postRoas, reason: "Houve gasto pós-decisão relevante sem novo lead ou venda atribuída." };
  }

  return { verdict: "inconclusivo", postRoas, reason: "Os sinais pós-decisão ainda são mistos; a IA mantém a decisão sob observação." };
}

function stageForAge(createdAt: Date): { stage: EvaluationStage; targetHours: number } {
  const ageHours = (Date.now() - createdAt.getTime()) / 3_600_000;
  return ageHours >= FINAL_EVALUATION_HOURS
    ? { stage: "72h", targetHours: FINAL_EVALUATION_HOURS }
    : { stage: "24h", targetHours: EARLY_EVALUATION_HOURS };
}

export async function runMarketingBudgetDecisionLearning(log: Logger): Promise<void> {
  const cutoff = new Date(Date.now() - MIN_EVALUATION_AGE_MS);
  const sources = await db.select({
    id: adCampaignEventsTable.id,
    tenantId: adCampaignEventsTable.tenantId,
    campaignId: adCampaignEventsTable.campaignId,
    metadata: adCampaignEventsTable.metadata,
    createdAt: adCampaignEventsTable.createdAt,
  }).from(adCampaignEventsTable).where(and(
    inArray(adCampaignEventsTable.eventType, [...APPLIED_TYPES]),
    lte(adCampaignEventsTable.createdAt, cutoff),
  )).orderBy(desc(adCampaignEventsTable.createdAt)).limit(MAX_SOURCE_EVENTS);

  const grouped = new Map<string, typeof sources>();
  for (const source of sources) {
    const list = grouped.get(source.tenantId) ?? [];
    list.push(source);
    grouped.set(source.tenantId, list);
  }

  let evaluated = 0;
  for (const [tenantId, tenantSources] of grouped) {
    let overviewRows: OverviewRow[] = [];
    try { overviewRows = extractOverviewRows(await getAdsOverview(tenantId)); }
    catch (err) { log.warn({ err, tenantId }, "marketing-learning: falha ao carregar overview"); continue; }
    const byCampaign = new Map(overviewRows.filter((row) => row.campaignId).map((row) => [String(row.campaignId), row]));

    for (const source of tenantSources) {
      const metadata = asRecord(source.metadata) ?? {};
      const decision = asRecord(metadata.decision) ?? {};
      const current = byCampaign.get(source.campaignId);
      if (!current) continue;

      const baseline = {
        spend: num(decision.spend), leads: num(decision.leads), sales: num(decision.sales), revenue: num(decision.revenue),
        roas: typeof decision.roas === "number" ? decision.roas : null,
      };
      const after = {
        spend: num(current.spend), leads: num(current.leads), sales: num(current.sales), revenue: num(current.revenue),
        roas: typeof current.roas === "number" ? current.roas : null,
      };
      const deltas = {
        spend: Math.max(0, after.spend - baseline.spend),
        leads: Math.max(0, after.leads - baseline.leads),
        sales: Math.max(0, after.sales - baseline.sales),
        revenue: Math.max(0, after.revenue - baseline.revenue),
      };
      const assessment = classify({
        baselineRoas: baseline.roas,
        spendDelta: deltas.spend, leadsDelta: deltas.leads, salesDelta: deltas.sales, revenueDelta: deltas.revenue,
      });
      const stage = stageForAge(source.createdAt);
      const evaluationWindowHours = Math.round((Date.now() - source.createdAt.getTime()) / 3_600_000);

      try {
        await recordAdCampaignEvent({
          tenantId,
          campaignId: source.campaignId,
          eventType: "budget_redistribution_learning_evaluated",
          severity: assessment.verdict === "melhorou" ? "success" : assessment.verdict === "piorou" ? "warning" : "info",
          message: `Aprendizado pós-decisão (${stage.stage}): ${assessment.verdict}. ${assessment.reason}`,
          dedupeKey: `budget-learning:${source.id}:${stage.stage}`,
          metadata: {
            sourceEventId: source.id,
            mediaPlanId: typeof metadata.mediaPlanId === "string" ? metadata.mediaPlanId : null,
            evaluationStage: stage.stage,
            targetWindowHours: stage.targetHours,
            isFinalEvaluation: stage.stage === "72h",
            verdict: assessment.verdict,
            reason: assessment.reason,
            evaluatedAt: new Date().toISOString(),
            evaluationWindowHours,
            before: baseline,
            after,
            deltas,
            postIncrementalRoas: assessment.postRoas,
          },
        });
        evaluated++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.toLowerCase().includes("unique")) log.warn({ err, tenantId, sourceEventId: source.id, stage: stage.stage }, "marketing-learning: falha ao registrar avaliação");
      }
    }
  }

  log.info({ evaluated, stages: ["24h", "72h"] }, "marketing-learning: ciclo pós-decisão concluído");
}
