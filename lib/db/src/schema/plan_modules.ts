import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { plansTable } from "./plans";

export const MODULE_KEYS = [
  "agent_sdr",
  "agent_closer",
  "agent_followup",
  "agent_reactivation",
  "agent_scheduler",
  "agent_service",
  "agent_onboarding",
  "customer_intelligence",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const planModulesTable = pgTable("plan_modules", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  planId: text("plan_id")
    .notNull()
    .references(() => plansTable.id, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlanModuleSchema = createInsertSchema(planModulesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPlanModule = z.infer<typeof insertPlanModuleSchema>;
export type PlanModule = typeof planModulesTable.$inferSelect;
