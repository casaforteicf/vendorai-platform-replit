import { pgTable, text, integer, timestamp, pgEnum, json } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "cancelled",
]);

export const tenantsTable = pgTable("tenants", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: tenantStatusEnum("status").notNull().default("active"),
  vertical: text("vertical"),
  agentsEnabled: json("agents_enabled")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  setupCompletedAt: timestamp("setup_completed_at"),
  autonomyEnabledAt: timestamp("autonomy_enabled_at"),
  monthlyTokenLimit: integer("monthly_token_limit"),
  tokensUsedCurrentMonth: integer("tokens_used_current_month")
    .notNull()
    .default(0),
  dailyMessageLimit: integer("daily_message_limit"),
  messagesSentToday: integer("messages_sent_today").notNull().default(0),
  analysisStalenessHours: integer("analysis_staleness_hours"),
  analysisMessageThreshold: integer("analysis_message_threshold"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({
  id: true,
  tokensUsedCurrentMonth: true,
  messagesSentToday: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTenantSchema = createSelectSchema(tenantsTable)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .partial();

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type UpdateTenant = z.infer<typeof updateTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
