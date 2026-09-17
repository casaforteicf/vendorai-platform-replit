import {
  pgTable,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { produtosInternosTable } from "./produtos_internos";

export const usageMetricDefinitionsTable = pgTable("usage_metric_definitions", {
  metricKey: text("metric_key").primaryKey(),
  label: text("label").notNull(),
  unitLabel: text("unit_label").notNull(),
  vendorCreditWeight: numeric("vendor_credit_weight", { precision: 14, scale: 4 }).notNull().default("1"),
  customerVisible: boolean("customer_visible").notNull().default(true),
  chargeOnlyOnSuccess: boolean("charge_only_on_success").notNull().default(true),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const productUsageQuotasTable = pgTable(
  "product_usage_quotas",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text("product_id")
      .notNull()
      .references(() => produtosInternosTable.id, { onDelete: "cascade" }),
    metricKey: text("metric_key")
      .notNull()
      .references(() => usageMetricDefinitionsTable.metricKey, { onDelete: "cascade" }),
    period: text("period").notNull().default("monthly"),
    includedQuantity: numeric("included_quantity", { precision: 18, scale: 4 }).notNull(),
    hardCap: numeric("hard_cap", { precision: 18, scale: 4 }),
    overageAllowed: boolean("overage_allowed").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_usage_quotas_product_metric_period_uidx").on(t.productId, t.metricKey, t.period),
  ],
);

export const tenantProductEntitlementsTable = pgTable(
  "tenant_product_entitlements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => produtosInternosTable.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("manual"),
    status: text("status").notNull().default("active"),
    quantity: integer("quantity").notNull().default(1),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    autoRenew: boolean("auto_renew").notNull().default(false),
    priceSnapshotCents: integer("price_snapshot_cents"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tenant_product_entitlements_tenant_idx").on(t.tenantId, t.status, t.startsAt, t.endsAt),
    index("tenant_product_entitlements_product_idx").on(t.productId, t.status),
  ],
);

/**
 * Universal economic ledger. One row represents a measurable operation, while
 * ai_usage_logs remains the low-level provider/token audit. Vendor Credits are
 * internal economics; customer UI should prefer metric units such as images,
 * videos, renders, prospects and interactions.
 */
export const usageLedgerTable = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    productId: text("product_id").references(() => produtosInternosTable.id, { onDelete: "set null" }),
    metricKey: text("metric_key")
      .notNull()
      .references(() => usageMetricDefinitionsTable.metricKey, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull().default("1"),
    vendorCredits: numeric("vendor_credits", { precision: 18, scale: 4 }).notNull().default("0"),
    quotaConsumed: boolean("quota_consumed").notNull().default(false),
    customerBillable: boolean("customer_billable").notNull().default(false),
    status: text("status").notNull().default("success"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    externalApiCostUsd: numeric("external_api_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    totalCostUsd: numeric("total_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    fxRateBrl: numeric("fx_rate_brl", { precision: 12, scale: 6 }),
    totalCostBrl: numeric("total_cost_brl", { precision: 14, scale: 6 }),
    usedByok: boolean("used_byok").notNull().default(false),
    requestId: text("request_id"),
    sourceType: text("source_type"),
    sourceId: text("source_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("usage_ledger_tenant_period_idx").on(t.tenantId, t.occurredAt),
    index("usage_ledger_metric_period_idx").on(t.metricKey, t.occurredAt),
    index("usage_ledger_product_period_idx").on(t.productId, t.occurredAt),
    index("usage_ledger_request_idx").on(t.requestId),
  ],
);

export type UsageMetricDefinition = typeof usageMetricDefinitionsTable.$inferSelect;
export type ProductUsageQuota = typeof productUsageQuotasTable.$inferSelect;
export type TenantProductEntitlement = typeof tenantProductEntitlementsTable.$inferSelect;
export type UsageLedgerEntry = typeof usageLedgerTable.$inferSelect;
