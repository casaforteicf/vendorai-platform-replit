import { eq } from "drizzle-orm";
import {
  acquisitionBudgetOrchestratorTable,
  type AcquisitionBudgetAllocation,
  db,
} from "@workspace/db";
import { getAcquisitionInvestmentIntelligence, type AcquisitionInvestmentRow } from "./acquisitionInvestmentIntelligence.js";

const DEFAULT_GUARDRAILS = {
  minimumEvidenceStarts: 5,
  maxShiftPercentPerCycle: 20,
  reservePercent: 10,
  minAllocationPercentPerBucket: 5,
  maxAllocationPercentPerBucket: 45,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function getAcquisitionOrchestratorConfig() {
  const [existing] = await db.select().from(acquisitionBudgetOrchestratorTable)
    .where(eq(acquisitionBudgetOrchestratorTable.id, "global")).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(acquisitionBudgetOrchestratorTable).values({ id: "global" }).returning();
  return created!;
}

export async function updateAcquisitionOrchestratorConfig(input: {
  totalBudget: number;
  period?: string;
  autonomy?: "recommend_only" | "approval_required" | "autonomous";
  active?: boolean;
  guardrails?: Partial<typeof DEFAULT_GUARDRAILS>;
}) {
  const current = await getAcquisitionOrchestratorConfig();
  const guardrails = {
    ...DEFAULT_GUARDRAILS,
    ...(current.guardrails ?? {}),
    ...(input.guardrails ?? {}),
  };
  guardrails.minimumEvidenceStarts = clamp(Math.round(guardrails.minimumEvidenceStarts), 1, 1000);
  guardrails.maxShiftPercentPerCycle = clamp(guardrails.maxShiftPercentPerCycle, 0, 100);
  guardrails.reservePercent = clamp(guardrails.reservePercent, 0, 80);
  guardrails.minAllocationPercentPerBucket = clamp(guardrails.minAllocationPercentPerBucket, 0, 50);
  guardrails.maxAllocationPercentPerBucket = clamp(guardrails.maxAllocationPercentPerBucket, guardrails.minAllocationPercentPerBucket, 100);

  const [updated] = await db.update(acquisitionBudgetOrchestratorTable).set({
    totalBudget: String(Math.max(0, input.totalBudget)),
    period: input.period ?? current.period,
    autonomy: input.autonomy ?? current.autonomy,
    active: input.active ?? current.active,
    guardrails,
    updatedAt: new Date(),
  }).where(eq(acquisitionBudgetOrchestratorTable.id, "global")).returning();
  return updated!;
}

function eligibleVerticalRows(rows: AcquisitionInvestmentRow[], minimumStarts: number) {
  return rows.filter((row) => row.started >= minimumStarts && row.key !== "sem_vertical");
}

function allocateVerticalBudget(
  rows: AcquisitionInvestmentRow[],
  availableBudget: number,
  minimumPercent: number,
  maximumPercent: number,
): AcquisitionBudgetAllocation[] {
  if (!rows.length || availableBudget <= 0) return [];

  const weights = rows.map((row) => {
    const recommendationMultiplier = row.recommendation === "scale" ? 1.25
      : row.recommendation === "maintain" ? 1
      : row.recommendation === "test" ? 0.65
      : 0.35;
    return Math.max(1, row.investmentScore) * recommendationMultiplier;
  });
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);

  let percentages = weights.map((weight) => clamp((weight / weightTotal) * 100, minimumPercent, maximumPercent));
  const normalizedTotal = percentages.reduce((sum, value) => sum + value, 0);
  percentages = percentages.map((value) => (value / normalizedTotal) * 100);

  return rows.map((row, index) => ({
    dimension: "vertical" as const,
    key: row.key,
    label: row.label,
    score: row.investmentScore,
    recommendation: row.recommendation,
    evidenceStarts: row.started,
    paidActivations: row.provisioned,
    conversionPercent: row.conversionPercent,
    targetPercent: Number(percentages[index]!.toFixed(2)),
    targetAmount: roundMoney(availableBudget * percentages[index]! / 100),
  })).sort((a, b) => b.targetAmount - a.targetAmount);
}

export async function generateAcquisitionMasterPlan() {
  const config = await getAcquisitionOrchestratorConfig();
  const intelligence = await getAcquisitionInvestmentIntelligence();
  const totalBudget = Math.max(0, Number(config.totalBudget));
  const guardrails = { ...DEFAULT_GUARDRAILS, ...(config.guardrails ?? {}) };
  const reserveAmount = roundMoney(totalBudget * guardrails.reservePercent / 100);
  const availableBudget = roundMoney(totalBudget - reserveAmount);
  const verticalDimension = intelligence.dimensions.find((item) => item.dimension === "vertical");
  const candidates = eligibleVerticalRows(verticalDimension?.rows ?? [], guardrails.minimumEvidenceStarts);
  const allocations = allocateVerticalBudget(
    candidates,
    availableBudget,
    guardrails.minAllocationPercentPerBucket,
    guardrails.maxAllocationPercentPerBucket,
  );

  const leaders = Object.fromEntries(intelligence.dimensions.map((dimension) => [
    dimension.dimension,
    dimension.rows.filter((row) => row.started >= guardrails.minimumEvidenceStarts).slice(0, 5),
  ]));
  const generatedAt = new Date().toISOString();
  const lastPlan = { generatedAt, availableBudget, reserveAmount, allocations };

  await db.update(acquisitionBudgetOrchestratorTable).set({
    lastPlan,
    lastPlanAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(acquisitionBudgetOrchestratorTable.id, "global"));

  return {
    config: { ...config, guardrails },
    plan: lastPlan,
    leaders,
    hasSufficientEvidence: allocations.length > 0,
    note: allocations.length > 0
      ? "Orçamento distribuído entre verticais com evidência suficiente; oferta, LP, canal, criativo e campanha orientam a execução dentro de cada vertical."
      : "Ainda não há volume mínimo de checkouts por vertical para redistribuição segura.",
  };
}

export async function approveAcquisitionMasterPlan() {
  const config = await getAcquisitionOrchestratorConfig();
  if (!config.lastPlan) throw new Error("Gere um plano antes de aprovar.");
  const [updated] = await db.update(acquisitionBudgetOrchestratorTable).set({
    lastApprovedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(acquisitionBudgetOrchestratorTable.id, "global")).returning();
  return updated!;
}
