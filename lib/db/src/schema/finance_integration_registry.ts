import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export type FinanceIntegrationStatus = "connected" | "partial" | "error" | "expired" | "disabled" | "not_configured";
export type FinanceSyncDirection = "in" | "out" | "bidirectional";
export type FinanceSourceAuthority = "vendorai" | "integration" | "bank" | "manual";

export const financeIntegrationRegistryTable = pgTable(
  "finance_integration_registry",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    providerKey: text("provider_key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    authType: text("auth_type").notNull(),
    apiVersion: text("api_version"),
    documentationUrl: text("documentation_url"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    webhookSupport: boolean("webhook_support").notNull().default(false),
    defaultDirection: text("default_direction").$type<FinanceSyncDirection>().notNull().default("bidirectional"),
    rateLimitDescription: text("rate_limit_description"),
    retryPolicy: jsonb("retry_policy").$type<{ maxAttempts?: number; backoffSeconds?: number[]; strategy?: string }>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("finance_integration_registry_provider_key_unique").on(table.providerKey),
    index("finance_integration_registry_category_idx").on(table.category),
  ],
);

export const financeIntegrationConnectionsTable = pgTable(
  "finance_integration_connections",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    integrationId: text("integration_id").notNull().references(() => financeIntegrationRegistryTable.id, { onDelete: "cascade" }),
    status: text("status").$type<FinanceIntegrationStatus>().notNull().default("not_configured"),
    syncDirection: text("sync_direction").$type<FinanceSyncDirection>().notNull().default("bidirectional"),
    authenticationHealthPercent: numeric("authentication_health_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    syncHealthPercent: numeric("sync_health_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    webhookHealthPercent: numeric("webhook_health_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    dataConsistencyPercent: numeric("data_consistency_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    overallHealthPercent: numeric("overall_health_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("finance_integration_connections_tenant_integration_unique").on(table.tenantId, table.integrationId),
    index("finance_integration_connections_tenant_idx").on(table.tenantId),
    index("finance_integration_connections_status_idx").on(table.status),
  ],
);

export const financeDataAuthorityTable = pgTable(
  "finance_data_authority",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    objectType: text("object_type").notNull(),
    authority: text("authority").$type<FinanceSourceAuthority>().notNull().default("vendorai"),
    integrationId: text("integration_id").references(() => financeIntegrationRegistryTable.id, { onDelete: "set null" }),
    syncDirection: text("sync_direction").$type<FinanceSyncDirection>().notNull().default("bidirectional"),
    conflictPolicy: text("conflict_policy").notNull().default("reject_and_review"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("finance_data_authority_tenant_object_unique").on(table.tenantId, table.objectType),
    index("finance_data_authority_tenant_idx").on(table.tenantId),
  ],
);

export const financeIntegrationSyncLogsTable = pgTable(
  "finance_integration_sync_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    integrationId: text("integration_id").notNull().references(() => financeIntegrationRegistryTable.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => financeIntegrationConnectionsTable.id, { onDelete: "set null" }),
    direction: text("direction").$type<FinanceSyncDirection>().notNull(),
    objectType: text("object_type"),
    status: text("status").notNull(),
    recordsProcessed: integer("records_processed").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    latencyMs: integer("latency_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("finance_integration_sync_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("finance_integration_sync_logs_integration_idx").on(table.integrationId),
    index("finance_integration_sync_logs_status_idx").on(table.status),
  ],
);

const percentage = z.union([z.string(), z.number()]).transform((value) => String(Math.max(0, Math.min(100, Number(value)))));

export const insertFinanceIntegrationRegistrySchema = createInsertSchema(financeIntegrationRegistryTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateFinanceIntegrationRegistrySchema = createSelectSchema(financeIntegrationRegistryTable).omit({ id: true, createdAt: true, updatedAt: true }).partial();
export const insertFinanceIntegrationConnectionSchema = createInsertSchema(financeIntegrationConnectionsTable, {
  authenticationHealthPercent: percentage.optional(),
  syncHealthPercent: percentage.optional(),
  webhookHealthPercent: percentage.optional(),
  dataConsistencyPercent: percentage.optional(),
  overallHealthPercent: percentage.optional(),
  lastHealthCheckAt: z.coerce.date().optional(),
  lastSyncAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const updateFinanceIntegrationConnectionSchema = createSelectSchema(financeIntegrationConnectionsTable, {
  authenticationHealthPercent: percentage.optional(),
  syncHealthPercent: percentage.optional(),
  webhookHealthPercent: percentage.optional(),
  dataConsistencyPercent: percentage.optional(),
  overallHealthPercent: percentage.optional(),
  lastHealthCheckAt: z.coerce.date().optional(),
  lastSyncAt: z.coerce.date().optional(),
}).omit({ id: true, tenantId: true, integrationId: true, createdAt: true, updatedAt: true }).partial();
export const insertFinanceDataAuthoritySchema = createInsertSchema(financeDataAuthorityTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateFinanceDataAuthoritySchema = createSelectSchema(financeDataAuthorityTable).omit({ id: true, tenantId: true, objectType: true, createdAt: true, updatedAt: true }).partial();
export const insertFinanceIntegrationSyncLogSchema = createInsertSchema(financeIntegrationSyncLogsTable).omit({ id: true, createdAt: true });
