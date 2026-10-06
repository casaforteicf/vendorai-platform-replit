import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type TenantCustomIntegrationKind = "api" | "webhook" | "n8n";
export type TenantCustomIntegrationStatus = "connected" | "attention" | "error" | "disabled" | "not_configured";

export const tenantCustomIntegrationsTable = pgTable(
  "tenant_custom_integrations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").$type<TenantCustomIntegrationKind>().notNull(),
    status: text("status").$type<TenantCustomIntegrationStatus>().notNull().default("not_configured"),
    baseUrl: text("base_url"),
    authType: text("auth_type").notNull().default("none"),
    credentialEncrypted: text("credential_encrypted"),
    webhookSecretEncrypted: text("webhook_secret_encrypted"),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    lastTestAt: timestamp("last_test_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tenant_custom_integrations_tenant_idx").on(table.tenantId),
    index("tenant_custom_integrations_status_idx").on(table.status),
  ],
);
