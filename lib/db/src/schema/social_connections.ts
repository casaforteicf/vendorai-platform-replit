import { jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const socialConnectionsTable = pgTable("social_connections", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalAccountId: text("external_account_id"),
  accountName: text("account_name"),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  scopes: text("scopes").array().notNull().default([]),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  connectedAt: timestamp("connected_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
}, (table) => [uniqueIndex("social_connections_tenant_provider_uidx").on(table.tenantId, table.provider)]);

export type SocialConnection = typeof socialConnectionsTable.$inferSelect;

