import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type CommercialProductType = "plan" | "module" | "pass" | "service" | "consumption_pack";
export type CommercialEntitlementSource = "free" | "subscription" | "module_purchase" | "growth_pass" | "manual" | "legacy";
export type CommercialEntitlementStatus = "active" | "scheduled" | "expired" | "cancelled" | "suspended";
export type UsageCostClass = "low" | "standard" | "high" | "external";

export const vendorCommercialProductsTable = pgTable(
  "vendor_commercial_products",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productKey: text("product_key").notNull(),
    sku: text("sku"),
    name: text("name").notNull(),
    family: text("family").notNull(),
    productType: text("product_type").$type<CommercialProductType>().notNull(),
    description: text("description"),
    monthlyPriceBrl: numeric("monthly_price_brl", { precision: 12, scale: 2 }),
    oneTimePriceBrl: numeric("one_time_price_brl", { precision: 12, scale: 2 }),
    active: boolean("active").notNull().default(true),
    freeForever: boolean("free_forever").notNull().default(false),
    userLimit: integer("user_limit"),
    usersUnlimited: boolean("users_unlimited").notNull().default(false),
    includedInGrowth: boolean("included_in_growth").notNull().default(false),
    standalonePurchase: boolean("standalone_purchase").notNull().default(true),
    grantsAllSegmentModules: boolean("grants_all_segment_modules").notNull().default(false),
    durationDays: integer("duration_days"),
    segmentScope: jsonb("segment_scope").$type<string[]>().notNull().default([]),
    benefits: jsonb("benefits").$type<string[]>().notNull().default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_commercial_products_product_key_uidx").on(table.productKey),
    uniqueIndex("vendor_commercial_products_sku_uidx").on(table.sku),
  ],
);

export const vendorCommercialProductModulesTable = pgTable(
  "vendor_commercial_product_modules",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productKey: text("product_key")
      .notNull()
      .references(() => vendorCommercialProductsTable.productKey, { onDelete: "cascade" }),
    moduleKey: text("module_key").notNull(),
    segmentSlug: text("segment_slug"),
    required: boolean("required").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendor_commercial_product_modules_product_idx").on(table.productKey),
    index("vendor_commercial_product_modules_module_idx").on(table.moduleKey),
  ],
);

export const vendorUsageFeaturesTable = pgTable("vendor_usage_features", {
  featureKey: text("feature_key").primaryKey(),
  label: text("label").notNull(),
  unitLabel: text("unit_label").notNull(),
  vendorCreditsPerUnit: numeric("vendor_credits_per_unit", { precision: 12, scale: 4 }).notNull().default("1"),
  customerVisible: boolean("customer_visible").notNull().default(true),
  chargeOnSuccessOnly: boolean("charge_on_success_only").notNull().default(true),
  costClass: text("cost_class").$type<UsageCostClass>().notNull().default("standard"),
  sourceFeatures: jsonb("source_features").$type<string[]>().notNull().default([]),
  active: boolean("active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vendorProductUsageQuotasTable = pgTable(
  "vendor_product_usage_quotas",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    productKey: text("product_key")
      .notNull()
      .references(() => vendorCommercialProductsTable.productKey, { onDelete: "cascade" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => vendorUsageFeaturesTable.featureKey, { onDelete: "cascade" }),
    includedQuantity: numeric("included_quantity", { precision: 14, scale: 3 }).notNull(),
    resetPeriod: text("reset_period").notNull().default("monthly"),
    hardLimit: boolean("hard_limit").notNull().default(false),
    overageAllowed: boolean("overage_allowed").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("vendor_product_usage_quotas_product_feature_uidx").on(table.productKey, table.featureKey),
  ],
);

export const vendorTenantEntitlementsTable = pgTable(
  "vendor_tenant_entitlements",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    productKey: text("product_key")
      .notNull()
      .references(() => vendorCommercialProductsTable.productKey, { onDelete: "cascade" }),
    source: text("source").$type<CommercialEntitlementSource>().notNull(),
    sourceReference: text("source_reference"),
    status: text("status").$type<CommercialEntitlementStatus>().notNull().default("active"),
    startsAt: timestamp("starts_at").notNull().defaultNow(),
    endsAt: timestamp("ends_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendor_tenant_entitlements_tenant_idx").on(table.tenantId, table.status),
    index("vendor_tenant_entitlements_product_idx").on(table.productKey, table.status),
  ],
);

export const vendorUsageLedgerTable = pgTable(
  "vendor_usage_ledger",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    productKey: text("product_key").references(() => vendorCommercialProductsTable.productKey, { onDelete: "set null" }),
    featureKey: text("feature_key")
      .notNull()
      .references(() => vendorUsageFeaturesTable.featureKey),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    vendorCredits: numeric("vendor_credits", { precision: 14, scale: 3 }).notNull().default("0"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    externalCostUsd: numeric("external_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    totalCostUsd: numeric("total_cost_usd", { precision: 14, scale: 6 }).notNull().default("0"),
    fxRateBrl: numeric("fx_rate_brl", { precision: 10, scale: 4 }),
    totalCostBrl: numeric("total_cost_brl", { precision: 14, scale: 6 }),
    successful: boolean("successful").notNull().default(true),
    billable: boolean("billable").notNull().default(true),
    quotaConsumed: numeric("quota_consumed", { precision: 14, scale: 3 }).notNull().default("0"),
    requestId: text("request_id"),
    sourceTable: text("source_table"),
    sourceId: text("source_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("vendor_usage_ledger_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("vendor_usage_ledger_feature_created_idx").on(table.featureKey, table.createdAt),
    index("vendor_usage_ledger_product_created_idx").on(table.productKey, table.createdAt),
  ],
);

export const vendorCommercialSettingsTable = pgTable("vendor_commercial_settings", {
  settingKey: text("setting_key").primaryKey(),
  settingValue: jsonb("setting_value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type VendorCommercialProduct = typeof vendorCommercialProductsTable.$inferSelect;
export type VendorUsageFeature = typeof vendorUsageFeaturesTable.$inferSelect;
export type VendorProductUsageQuota = typeof vendorProductUsageQuotasTable.$inferSelect;
export type VendorTenantEntitlement = typeof vendorTenantEntitlementsTable.$inferSelect;
export type VendorUsageLedgerEntry = typeof vendorUsageLedgerTable.$inferSelect;
