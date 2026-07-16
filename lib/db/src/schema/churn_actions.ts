import { pgTable, text, timestamp, real, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const churnActionsTable = pgTable("churn_actions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id")
    .notNull()
    .references(() => leadsTable.id, { onDelete: "cascade" }),
  actionType: text("action_type")
    .$type<"retention_message" | "escalation_sdr" | "monitor_only">()
    .notNull(),
  messageSent: text("message_sent"),
  churnRiskAtAction: real("churn_risk_at_action"),
  actionSuccessful: boolean("action_successful"),
  executedAt: timestamp("executed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChurnActionSchema = createInsertSchema(churnActionsTable).omit({
  id: true,
  createdAt: true,
});

export const selectChurnActionSchema = createSelectSchema(churnActionsTable);

export type InsertChurnAction = z.infer<typeof insertChurnActionSchema>;
export type ChurnAction = typeof churnActionsTable.$inferSelect;
