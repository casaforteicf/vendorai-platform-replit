import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";
import { plansTable } from "./plans";
import { dealsTable } from "./deals";

export const planAssignmentLogTable = pgTable("plan_assignment_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  planId: text("plan_id")
    .notNull()
    .references(() => plansTable.id, { onDelete: "cascade" }),
  assignedBy: text("assigned_by").notNull(), // 'sistema_fechamento_deal' | 'admin_manual:<email>'
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlanAssignmentLogSchema = createInsertSchema(planAssignmentLogTable).omit({
  id: true,
  createdAt: true,
});
export const selectPlanAssignmentLogSchema = createSelectSchema(planAssignmentLogTable);

export type InsertPlanAssignmentLog = import("zod/v4").infer<typeof insertPlanAssignmentLogSchema>;
export type PlanAssignmentLog = typeof planAssignmentLogTable.$inferSelect;
