import { pgTable, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { AGENT_TYPES } from "./agent_configs";

export const agentTaskAgentNameEnum = pgEnum(
  "agent_task_agent_name",
  AGENT_TYPES
);

export const agentTaskStatusEnum = pgEnum("agent_task_status", [
  "pendente_aprovacao",
  "aprovado",
  "executando",
  "concluido",
  "rejeitado",
  "erro",
]);

export const agentTasksTable = pgTable("agent_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  agentName: agentTaskAgentNameEnum("agent_name").notNull(),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  status: agentTaskStatusEnum("status").notNull().default("pendente_aprovacao"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  scheduledFor: timestamp("scheduled_for"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAgentTaskSchema = createInsertSchema(agentTasksTable, {
  scheduledFor: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateAgentTaskSchema = createSelectSchema(agentTasksTable, {
  scheduledFor: z.coerce.date().optional(),
  executedAt: z.coerce.date().optional(),
})
  .omit({ id: true, tenantId: true, leadId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertAgentTask = z.infer<typeof insertAgentTaskSchema>;
export type UpdateAgentTask = z.infer<typeof updateAgentTaskSchema>;
export type AgentTask = typeof agentTasksTable.$inferSelect;
