import { pgTable, text, timestamp, json, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const agentActionStatusEnum = pgEnum("agent_action_status", [
  "pending",
  "approved",
  "executed",
  "rejected",
  "blocked_by_plan",
]);

export const agentActionsLogTable = pgTable("agent_actions_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, {
    onDelete: "set null",
  }),
  agentName: text("agent_name").notNull(),
  actionType: text("action_type").notNull(),
  status: agentActionStatusEnum("status").notNull().default("pending"),
  payload: json("payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAgentActionLogSchema = createInsertSchema(
  agentActionsLogTable,
).omit({
  id: true,
  createdAt: true,
});

export const updateAgentActionLogSchema = insertAgentActionLogSchema
  .omit({ tenantId: true })
  .partial();

export type InsertAgentActionLog = z.infer<typeof insertAgentActionLogSchema>;
export type UpdateAgentActionLog = z.infer<typeof updateAgentActionLogSchema>;
export type AgentActionLog = typeof agentActionsLogTable.$inferSelect;
