import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { tenantsTable } from "./tenants";
import { dealsTable } from "./deals";
import { usersTable } from "./users";

export type CommissionActorType = "seller" | "manager" | "representative" | "partner" | "affiliate" | "influencer" | "distributor";
export type CommissionTrigger = "sale_created" | "proposal_approved" | "contract_signed" | "payment_received" | "payment_reconciled" | "target_reached";
export type CommissionEventStatus = "forecast" | "validation" | "released" | "paid" | "reversed";

export const commissionRulesTable = pgTable("commission_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  actorType: text("actor_type").$type<CommissionActorType>().notNull().default("seller"),
  trigger: text("trigger").$type<CommissionTrigger>().notNull().default("payment_reconciled"),
  productId: text("product_id"),
  category: text("category"),
  channel: text("channel"),
  region: text("region"),
  minMarginPercent: numeric("min_margin_percent", { precision: 7, scale: 4 }),
  maxDiscountPercent: numeric("max_discount_percent", { precision: 7, scale: 4 }),
  commissionPercent: numeric("commission_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  capPercent: numeric("cap_percent", { precision: 7, scale: 4 }),
  recurring: boolean("recurring").notNull().default(false),
  proportionalByReceipt: boolean("proportional_by_receipt").notNull().default(true),
  splitConfig: jsonb("split_config").$type<Array<{ actorType: CommissionActorType; actorId?: string | null; percent: number }>>().notNull().default([]),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("commission_rules_tenant_idx").on(table.tenantId),
  index("commission_rules_active_priority_idx").on(table.tenantId, table.active, table.priority),
]);

export const commissionEventsTable = pgTable("commission_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").references(() => commissionRulesTable.id, { onDelete: "set null" }),
  dealId: text("deal_id").references(() => dealsTable.id, { onDelete: "set null" }),
  sellerUserId: text("seller_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorType: text("actor_type").$type<CommissionActorType>().notNull(),
  actorId: text("actor_id"),
  trigger: text("trigger").$type<CommissionTrigger>().notNull(),
  sourceType: text("source_type"),
  sourceId: text("source_id"),
  baseAmountCents: integer("base_amount_cents").notNull().default(0),
  eligiblePercent: numeric("eligible_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  commissionPercent: numeric("commission_percent", { precision: 7, scale: 4 }).notNull().default("0"),
  commissionCents: integer("commission_cents").notNull().default(0),
  status: text("status").$type<CommissionEventStatus>().notNull().default("forecast"),
  reason: text("reason"),
  correlationId: text("correlation_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  releasedAt: timestamp("released_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("commission_events_tenant_correlation_unique").on(table.tenantId, table.correlationId),
  index("commission_events_tenant_status_idx").on(table.tenantId, table.status),
  index("commission_events_deal_idx").on(table.dealId),
]);

export const insertCommissionRuleSchema = createInsertSchema(commissionRulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateCommissionRuleSchema = createSelectSchema(commissionRulesTable).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();
export const insertCommissionEventSchema = createInsertSchema(commissionEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
