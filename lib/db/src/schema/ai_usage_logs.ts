import { pgTable, text, integer, numeric, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const aiProviderEnum = pgEnum("ai_provider", ["openai", "anthropic"]);

export const AI_FEATURES = [
  "agent_runtime",
  "agent_sdr",
  "agent_closer",
  "agent_followup",
  "agent_reactivation",
  "agent_scheduler",
  "agent_service",
  "agent_onboarding",
  "agent_relacionamento",
  "agent_financeiro",
  "agent_cobranca",
  "agent_recepcao",
  "agent_expansao_conta",
  "proposal_generator",
  "briefing_generator",
  "site_generator",
  "content_generator",
  "image_generator",
  "audio_transcription",
  "intelligence_analysis",
  "document_extraction",
  "embedding",
  "web_search",
  "media_interpretation",
  "auto_quote",
  "spin_briefing",
  "churn_retention",
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];
export const aiFeatureEnum = pgEnum("ai_feature", AI_FEATURES);

export const aiUsageLogsTable = pgTable("ai_usage_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  provider: aiProviderEnum("provider").notNull(),
  model: text("model").notNull(),
  feature: aiFeatureEnum("feature").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costEstimateUsd: numeric("cost_estimate_usd", { precision: 12, scale: 6 }).notNull(),
  usedByok: boolean("used_byok").notNull().default(false),
  success: boolean("success").notNull().default(true),
  errorMessage: text("error_message"),
  requestId: text("request_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogsTable).omit({
  id: true,
  createdAt: true,
});

export const updateAiUsageLogSchema = createSelectSchema(aiUsageLogsTable)
  .omit({ id: true, tenantId: true, createdAt: true })
  .partial();

export type AiUsageLog = typeof aiUsageLogsTable.$inferSelect;
export type InsertAiUsageLog = z.infer<typeof insertAiUsageLogSchema>;
export type UpdateAiUsageLog = z.infer<typeof updateAiUsageLogSchema>;
