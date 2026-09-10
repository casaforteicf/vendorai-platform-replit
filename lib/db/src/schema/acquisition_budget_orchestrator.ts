import { boolean, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type AcquisitionOrchestratorAutonomy = "recommend_only" | "approval_required" | "autonomous";

export type AcquisitionBudgetGuardrails = {
  minimumEvidenceStarts: number;
  maxShiftPercentPerCycle: number;
  reservePercent: number;
  minAllocationPercentPerBucket: number;
  maxAllocationPercentPerBucket: number;
};

export type AcquisitionBudgetAllocation = {
  dimension: "vertical" | "offer" | "landing_page" | "channel" | "creative" | "campaign";
  key: string;
  label: string;
  score: number;
  recommendation: "scale" | "maintain" | "test" | "reduce";
  evidenceStarts: number;
  paidActivations: number;
  conversionPercent: number;
  targetPercent: number;
  targetAmount: number;
};

export const acquisitionBudgetOrchestratorTable = pgTable("acquisition_budget_orchestrator", {
  id: text("id").primaryKey().default("global"),
  currency: text("currency").notNull().default("BRL"),
  totalBudget: numeric("total_budget", { precision: 14, scale: 2 }).notNull().default("0"),
  period: text("period").notNull().default("monthly"),
  autonomy: text("autonomy").$type<AcquisitionOrchestratorAutonomy>().notNull().default("approval_required"),
  active: boolean("active").notNull().default(false),
  guardrails: jsonb("guardrails").$type<AcquisitionBudgetGuardrails>().notNull().default({
    minimumEvidenceStarts: 5,
    maxShiftPercentPerCycle: 20,
    reservePercent: 10,
    minAllocationPercentPerBucket: 5,
    maxAllocationPercentPerBucket: 45,
  }),
  lastPlan: jsonb("last_plan").$type<{
    generatedAt: string;
    availableBudget: number;
    reserveAmount: number;
    allocations: AcquisitionBudgetAllocation[];
  } | null>(),
  lastPlanAt: timestamp("last_plan_at"),
  lastApprovedAt: timestamp("last_approved_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
