import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  numeric,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

export type CommercialOfferKind =
  | "free"
  | "subscription"
  | "module"
  | "prepaid_pass"
  | "consumption_pack"
  | "service";

export type EntitlementSource =
  | "free"
  | "subscription"
  | "module"
  | "prepaid_pass"
  | "manual"
  | "promotion";

export type UsageBillingStatus =
  | "measured"
  | "included"
  | "overage"
  | "non_billable"
  | "reversed";

/** Commercial layer above raw technical modules. */
export const commercialProductProfilesTable = pgTable(
  "commercial_product_profiles",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    commercialKey: text("commercial_key").notNull(),
    catalogProductId: text("catalog_product_id").references(() => produtosCatalogoTable.id, { onDelete: "set null" }),
    offerKind: text("offer_kind").$type<CommercialOfferKind>().notNull(),
    includedInGrowth: boolean("included_in_growth").notNull().default(false),
    maxUsers: integer("max_users"),
    moduleKeys: jsonb("module_keys").$type<string[]>().notNull().default([]),
    segmentKeys: jsonb("segment_keys").$type<string[]>().notNull().default([]),
    benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
    displayOrder: integer("display_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    commercialKeyUq: uniqueIndex("commercial_product_profiles_key_uq").on(table.commercialKey),
    catalogProductIdx: index("commercial_product_profiles_catalog_idx").on(table.catalogProductId),
  }),
);

/** Customer-facing business unit + internal Vendor Credit weight. */
export const usageMetricsTable = pgTable("usage_metrics", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  unitSingular: text("unit_singular").notNull(),
  unitPlural: text("unit_plural").notNull(),
  vendorCreditsPerUnit: integer("vendor_credits_per_unit").notNull(),
  customerVisible: boolean("customer_visible").notNull().default(true),
  onlyChargeOnSuccess: boolean("only_charge_on_success").notNull().default(true),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Quotas attach to sellable products, never to raw screens. */
export const productUsageQuotasTable = pgTable(
  "product_usage_quotas",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    commercialKey: text("commercial_key").notNull(),
    metricKey: text("metric_key").notNull().references(() => usageMetricsTable.key, { onDelete: "cascade" }),
    monthlyQuantity: numeric("monthly_quantity", { precision: 14, scale: 3 }),
    hardCapQuantity: numeric("hard_cap_quantity", { precision: 14, scale: 3 }),
    overageAllowed: boolean("overage_allowed").notNull().default(true),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    offerMetricUq: uniqueIndex("product_usage_quotas_offer_metric_uq").on(table.commercialKey, table.metricKey),
  }),
);

/** Human-readable packs such as +20 images or +500 prospects. */
export const consumptionPackDefinitionsTable = pgTable(
  "consumption_pack_definitions",
  {
    commercialKey: text("commercial_key").primaryKey(),
    metricKey: text("metric_key").notNull().references(() => usageMetricsTable.key, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    vendorCredits: integer("vendor_credits").notNull(),
    expiresAfterDays: integer("expires_after_days"),
    active: boolean("active").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    metricIdx: index("consumption_pack_definitions_metric_idx").on(table.metricKey),
  }),
);

/** Runtime entitlement produced by billing/access rules. */
export const tenantEntitlementsTable = pgTable(
  "tenant_entitlements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    commercialKey: text("commercial_key").notNull(),
    source: text("source").$type<EntitlementSource>().notNull(),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    active: boolean("active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantKeyIdx: index("tenant_entitlements_tenant_key_idx").on(table.tenantId, table.commercialKey),
    tenantActiveIdx: index("tenant_entitlements_tenant_active_idx").on(table.tenantId, table.active),
  }),
);

/** Universal append-only consumption/cost ledger. */
export const usageLedgerTable = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    commercialKey: text("commercial_key"),
    metricKey: text("metric_key").notNull().references(() => usageMetricsTable.key, { onDelete: "restrict" }),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    vendorCredits: integer("vendor_credits").notNull().default(0),
    billingStatus: text("billing_status").$type<UsageBillingStatus>().notNull().default("measured"),
    billable: boolean("billable").notNull().default(false),
    success: boolean("success").notNull().default(true),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    externalApiCostUsd: numeric("external_api_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    totalCostUsd: numeric("total_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    exchangeRateBrl: numeric("exchange_rate_brl", { precision: 12, scale: 6 }),
    totalCostBrl: numeric("total_cost_brl", { precision: 14, scale: 6 }),
    source: text("source").notNull(),
    sourceEventId: text("source_event_id"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantMetricCreatedIdx: index("usage_ledger_tenant_metric_created_idx").on(table.tenantId, table.metricKey, table.createdAt),
    tenantCreatedIdx: index("usage_ledger_tenant_created_idx").on(table.tenantId, table.createdAt),
    sourceEventUq: uniqueIndex("usage_ledger_source_event_uq")
      .on(table.source, table.sourceEventId)
      .where(sql`${table.sourceEventId} is not null`),
  }),
);

/** Append-only wallet for generic or metric-specific purchased/promotional capacity. */
export const vendorCreditTransactionsTable = pgTable(
  "vendor_credit_transactions",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    creditsDelta: integer("credits_delta").notNull(),
    metricKey: text("metric_key").references(() => usageMetricsTable.key, { onDelete: "restrict" }),
    quantityDelta: numeric("quantity_delta", { precision: 14, scale: 3 }),
    reason: text("reason").notNull(),
    commercialKey: text("commercial_key"),
    referenceId: text("reference_id"),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("vendor_credit_transactions_tenant_created_idx").on(table.tenantId, table.createdAt),
    tenantMetricIdx: index("vendor_credit_transactions_tenant_metric_idx").on(table.tenantId, table.metricKey),
    referenceUq: uniqueIndex("vendor_credit_transactions_reference_uq")
      .on(table.commercialKey, table.referenceId)
      .where(sql`${table.referenceId} is not null`),
  }),
);

export type CommercialProductProfile = typeof commercialProductProfilesTable.$inferSelect;
export type UsageMetric = typeof usageMetricsTable.$inferSelect;
export type ProductUsageQuota = typeof productUsageQuotasTable.$inferSelect;
export type ConsumptionPackDefinition = typeof consumptionPackDefinitionsTable.$inferSelect;
export type TenantEntitlement = typeof tenantEntitlementsTable.$inferSelect;
export type UsageLedgerEntry = typeof usageLedgerTable.$inferSelect;
export type VendorCreditTransaction = typeof vendorCreditTransactionsTable.$inferSelect;
