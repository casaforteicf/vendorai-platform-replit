import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const automationLogsTable = pgTable("automation_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  flow: text("flow"),
  dealId: text("deal_id"),
  step: text("step"),
  status: text("status"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAutomationLogSchema = createInsertSchema(automationLogsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;
export type AutomationLog = typeof automationLogsTable.$inferSelect;
