import { pgTable, text, integer, boolean, jsonb, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const COMMERCIAL_PRODUCT_KINDS = ["free", "plan", "module", "pass", "service", "usage_pack"] as const;
export type CommercialProductKind = (typeof COMMERCIAL_PRODUCT_KINDS)[number];

export const GROWTH_INCLUSION_MODES = ["always", "when_applicable", "never"] as const;
export type GrowthInclusionMode = (typeof GROWTH_INCLUSION_MODES)[number];

export const ENTITLEMENT_SOURCE_TYPES = [
  "free",
  "subscription",
  "growth",
  "prepaid",
  "purchase",
  "admin_override",
  "migration",
] as const;
export type EntitlementSourceType = (typeof ENTITLEMENT_SOURCE_TYPES)[number];

export const ENTITLEMENT_STATUSES = ["active", "scheduled", "expired", "cancelled", "suspended"] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

export const commercialProductsTable = pgTable("commercial_products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sku: text("sku").notNull().unique(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  productKind: text("product_kind").$type<CommercialProductKind>().notNull(),
  description: text("description"),
  monthlyPriceCents: integer("monthly_price_cents"),
  oneTimePriceCents: integer("one_time_price_cents"),
  maxUsers: integer("max_users"),
  usersUnlimited: boolean("users_unlimited").notNull().default(false),
  standalonePurchase: boolean("standalone_purchase").notNull().default(true),
  includedInGrowth: boolean("included_in_growth").notNull().default(false),
  growthInclusionMode: text("growth_inclusion_mode").$type<GrowthInclusionMode>().notNull().default("when_applicable"),
  publicVisible: boolean("public_visible").notNull().default(true),
  active: boolean("active").notNull().default(true),
  commercialMetadata: jsonb("commercial_metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const commercialProductModulesTable = pgTable("commercial_product_modules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  productSku: text("product_sku").notNull().references(() => commercialProductsTable.sku, { onDelete: "cascade" }),
  moduleKey: text("module_key").notNull(),
  accessLevel: text("access_level").$type<"full" | "read_only" | "limited">().notNull().default("full"),
  required: boolean("required").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tenantProductEntitlementsTable = pgTable("tenant_product_entitlements", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  productSku: text("product_sku").notNull().references(() => commercialProductsTable.sku, { onDelete: "cascade" }),
  sourceType: text("source_type").$type<EntitlementSourceType>().notNull(),
  status: text("status").$type<EntitlementStatus>().notNull().default("active"),
  startsAt: timestamp("starts_at").notNull().defaultNow(),
  endsAt: timestamp("ends_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usageExtraPackagesTable = pgTable("usage_extra_packages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  featureKey: text("feature_key").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
  vendorCredits: numeric("vendor_credits", { precision: 14, scale: 3 }),
  priceCents: integer("price_cents"),
  validityDays: integer("validity_days"),
  active: boolean("active").notNull().default(true),
  publicVisible: boolean("public_visible").notNull().default(false),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCommercialProductSchema = createInsertSchema(commercialProductsTable, {
  productKind: z.enum(COMMERCIAL_PRODUCT_KINDS),
  growthInclusionMode: z.enum(GROWTH_INCLUSION_MODES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCommercialProductSchema = createSelectSchema(commercialProductsTable, {
  productKind: z.enum(COMMERCIAL_PRODUCT_KINDS),
  growthInclusionMode: z.enum(GROWTH_INCLUSION_MODES),
}).omit({ id: true, createdAt: true, updatedAt: true }).partial();

export type CommercialProduct = typeof commercialProductsTable.$inferSelect;
export type InsertCommercialProduct = z.infer<typeof insertCommercialProductSchema>;
export type TenantProductEntitlement = typeof tenantProductEntitlementsTable.$inferSelect;
