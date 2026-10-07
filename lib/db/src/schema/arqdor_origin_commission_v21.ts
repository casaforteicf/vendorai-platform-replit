import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";
import { dealsTable } from "./deals";
import { commissionEventsTable } from "./commission_engine";

export const arqdorOriginCommissionRulesTable = pgTable("arqdor_origin_commission_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  originTenantId: text("origin_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  category: text("category"),
  campaignId: text("campaign_id"),
  sharePercent: numeric("share_percent", { precision: 7, scale: 4 }).notNull().default("25"),
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("arqdor_origin_commission_rules_origin_idx").on(table.originTenantId, table.active, table.priority),
]);

export const arqdorOriginCommissionEventsTable = pgTable("arqdor_origin_commission_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sellerTenantId: text("seller_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  originTenantId: text("origin_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "restrict" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  parentCommissionEventId: text("parent_commission_event_id").references(() => commissionEventsTable.id, { onDelete: "set null" }),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  category: text("category"),
  campaignId: text("campaign_id"),
  grossCommissionCents: integer("gross_commission_cents").notNull().default(0),
  sharePercent: numeric("share_percent", { precision: 7, scale: 4 }).notNull().default("25"),
  originShareCents: integer("origin_share_cents").notNull().default(0),
  status: text("status").notNull().default("released"),
  correlationId: text("correlation_id").notNull(),
  metadata: text("metadata_json"),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("arqdor_origin_commission_events_correlation_uidx").on(table.sellerTenantId, table.correlationId),
  index("arqdor_origin_commission_events_origin_idx").on(table.originTenantId, table.status),
  index("arqdor_origin_commission_events_seller_idx").on(table.sellerTenantId, table.status),
  index("arqdor_origin_commission_events_deal_idx").on(table.dealId),
]);

const percentSchema = z.union([z.string(), z.number()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^\d+(\.\d{1,4})?$/));

export const insertArqdorOriginCommissionRuleSchema = createInsertSchema(arqdorOriginCommissionRulesTable, {
  sharePercent: percentSchema,
}).omit({ id: true, originTenantId: true, createdAt: true, updatedAt: true });

export const updateArqdorOriginCommissionRuleSchema = createSelectSchema(arqdorOriginCommissionRulesTable, {
  sharePercent: percentSchema,
}).omit({ id: true, originTenantId: true, createdAt: true, updatedAt: true }).partial();
