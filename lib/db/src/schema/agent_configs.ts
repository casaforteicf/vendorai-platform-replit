import { pgTable, text, timestamp, integer, unique, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const AGENT_TYPES = [
  "sdr",
  "closer",
  "followup",
  "reactivation",
  "scheduler",
  "service",
  "onboarding",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export const agentEntrySchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.string().optional(),
});

export const agentsMapSchema = z.object({
  sdr: agentEntrySchema.optional(),
  closer: agentEntrySchema.optional(),
  followup: agentEntrySchema.optional(),
  reactivation: agentEntrySchema.optional(),
  scheduler: agentEntrySchema.optional(),
  service: agentEntrySchema.optional(),
  onboarding: agentEntrySchema.optional(),
});

export type AgentsMap = z.infer<typeof agentsMapSchema>;

export const agentConfigsTable = pgTable(
  "agent_configs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    agents: jsonb("agents").$type<AgentsMap>().notNull().default({}),
    dailyMessageLimit: integer("daily_message_limit").notNull().default(100),
    messagesSentToday: integer("messages_sent_today").notNull().default(0),
    monthlyTokenLimit: integer("monthly_token_limit").notNull().default(100000),
    tokensUsedCurrentMonth: integer("tokens_used_current_month").notNull().default(0),
    webhookSecret: text("webhook_secret"),
    setupCompletedAt: timestamp("setup_completed_at"),
    autonomyEnabledAt: timestamp("autonomy_enabled_at"),
    messagesSentTodayResetAt: timestamp("messages_sent_today_reset_at"),
    tokensResetAt: timestamp("tokens_reset_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("agent_configs_tenant_id_unique").on(t.tenantId)]
);

export const insertAgentConfigSchema = createInsertSchema(agentConfigsTable, {
  agents: agentsMapSchema.optional(),
  setupCompletedAt: z.coerce.date().optional(),
  autonomyEnabledAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateAgentConfigSchema = createSelectSchema(agentConfigsTable, {
  agents: agentsMapSchema.optional(),
  setupCompletedAt: z.coerce.date().optional(),
  autonomyEnabledAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertAgentConfig = z.infer<typeof insertAgentConfigSchema>;
export type UpdateAgentConfig = z.infer<typeof updateAgentConfigSchema>;
export type AgentConfig = typeof agentConfigsTable.$inferSelect;
