import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const apiUsageTable = pgTable("api_usage", {
  id:           uuid("id").primaryKey().defaultRandom(),
  tenantId:     text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  apiName:      text("api_name").notNull(),
  month:        integer("month").notNull(),
  year:         integer("year").notNull(),
  requestsUsed:  integer("requests_used").notNull().default(0),
  requestsLimit: integer("requests_limit").notNull().default(1000),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export type ApiUsage = typeof apiUsageTable.$inferSelect;
export type InsertApiUsage = typeof apiUsageTable.$inferInsert;
