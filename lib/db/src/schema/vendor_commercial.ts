import { pgTable, text, integer, numeric, boolean, timestamp, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const vendorCommercialOffersTable = pgTable("vendor_commercial_offers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  offerType: text("offer_type").notNull(),
  description: text("description"),
  monthlyPriceCents: integer("monthly_price_cents"),
  oneTimePriceCents: integer("one_time_price_cents"),
  billingCycle: text("billing_cycle"),
  maxUsers: integer("max_users"),
  unlimitedUsers: boolean("unlimited_users").notNull().default(false),
  includesAllSegmentModules: boolean("includes_all_segment_modules").notNull().default(false),
  active: boolean("active").notNull().default(true),
  publicVisible: boolean("public_visible").notNull().default(true),
  growthIncluded: boolean("growth_included").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vendorOfferModuleMapTable = pgTable("vendor_offer_module_map", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  offerCode: text("offer_code").notNull().references(() => vendorCommercialOffersTable.code, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  entitlementMode: text("entitlement_mode").notNull().default("included"),
  segmentScope: jsonb("segment_scope").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  offerModuleUnique: uniqueIndex("vendor_offer_module_map_offer_module_uidx").on(table.offerCode, table.moduleKey),
}));

export const vendorUsageMetricsTable = pgTable("vendor_usage_metrics", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  metricKey: text("metric_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  unitName: text("unit_name").notNull(),
  category: text("category").notNull(),
  vendorCreditsPerUnit: numeric("vendor_credits_per_unit", { precision: 14, scale: 4 }).notNull().default("0"),
  customerMetered: boolean("customer_metered").notNull().default(true),
  chargeOnlyOnSuccess: boolean("charge_only_on_success").notNull().default(true),
  description: text("description"),
  metadata: jsonb("metadata").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vendorOfferQuotasTable = pgTable("vendor_offer_quotas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  offerCode: text("offer_code").notNull().references(() => vendorCommercialOffersTable.code, { onDelete: "cascade" }),
  metricKey: text("metric_key").notNull().references(() => vendorUsageMetricsTable.metricKey, { onDelete: "cascade" }),
  includedQuantity: numeric("included_quantity", { precision: 14, scale: 4 }),
  period: text("period").notNull().default("month"),
  hardLimit: boolean("hard_limit").notNull().default(false),
  warningThresholdPercent: integer("warning_threshold_percent").notNull().default(80),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  offerMetricPeriodUnique: uniqueIndex("vendor_offer_quotas_offer_metric_period_uidx").on(table.offerCode, table.metricKey, table.period),
}));

export const vendorUsageLedgerTable = pgTable("vendor_usage_ledger", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id"),
  offerCode: text("offer_code").references(() => vendorCommercialOffersTable.code, { onDelete: "set null" }),
  productCode: text("product_code"),
  metricKey: text("metric_key").notNull().references(() => vendorUsageMetricsTable.metricKey),
  featureKey: text("feature_key"),
  sourceSystem: text("source_system"),
  sourceRecordId: text("source_record_id"),
  requestId: text("request_id"),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull().default("1"),
  vendorCredits: numeric("vendor_credits", { precision: 16, scale: 4 }).notNull().default("0"),
  provider: text("provider"),
  model: text("model"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  providerCostUsd: numeric("provider_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
  externalApiCostUsd: numeric("external_api_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
  infrastructureCostUsd: numeric("infrastructure_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
  totalCostUsd: numeric("total_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
  fxUsdBrl: numeric("fx_usd_brl", { precision: 10, scale: 6 }),
  totalCostBrl: numeric("total_cost_brl", { precision: 14, scale: 6 }),
  success: boolean("success").notNull().default(true),
  customerBillable: boolean("customer_billable").notNull().default(true),
  chargedToQuota: boolean("charged_to_quota").notNull().default(true),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata").notNull().default({}),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantOccurredIdx: index("vendor_usage_ledger_tenant_occurred_idx").on(table.tenantId, table.occurredAt),
  tenantMetricIdx: index("vendor_usage_ledger_tenant_metric_idx").on(table.tenantId, table.metricKey, table.occurredAt),
  requestIdx: index("vendor_usage_ledger_request_idx").on(table.requestId),
}));

export const vendorTenantEntitlementsTable = pgTable("vendor_tenant_entitlements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  offerCode: text("offer_code").notNull().references(() => vendorCommercialOffersTable.code, { onDelete: "cascade" }),
  source: text("source").notNull().default("subscription"),
  status: text("status").notNull().default("active"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantStatusIdx: index("vendor_tenant_entitlements_active_idx").on(table.tenantId, table.status, table.startsAt, table.endsAt),
}));

export const vendorConsumptionPacksTable = pgTable("vendor_consumption_packs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  metricKey: text("metric_key").notNull().references(() => vendorUsageMetricsTable.metricKey),
  quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
  bonusVendorCredits: numeric("bonus_vendor_credits", { precision: 16, scale: 4 }).notNull().default("0"),
  priceCents: integer("price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type VendorCommercialOffer = typeof vendorCommercialOffersTable.$inferSelect;
export type VendorUsageMetric = typeof vendorUsageMetricsTable.$inferSelect;
export type VendorOfferQuota = typeof vendorOfferQuotasTable.$inferSelect;
export type VendorUsageLedgerEntry = typeof vendorUsageLedgerTable.$inferSelect;
