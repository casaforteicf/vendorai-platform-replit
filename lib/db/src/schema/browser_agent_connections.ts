import { pgTable, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const browserAgentConnectionsTable = pgTable(
  "browser_agent_connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startUrl: text("start_url").notNull(),
    allowedHosts: jsonb("allowed_hosts").$type<string[]>().notNull().default([]),
    usernameEncrypted: text("username_encrypted"),
    passwordEncrypted: text("password_encrypted"),
    cookiesEncrypted: text("cookies_encrypted"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("browser_agent_connections_tenant_name_unique").on(t.tenantId, t.name)],
);

export const insertBrowserAgentConnectionSchema = createInsertSchema(browserAgentConnectionsTable, {
  allowedHosts: z.array(z.string()).optional(),
}).omit({
  id: true,
  usernameEncrypted: true,
  passwordEncrypted: true,
  cookiesEncrypted: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const updateBrowserAgentConnectionSchema = createSelectSchema(browserAgentConnectionsTable, {
  allowedHosts: z.array(z.string()).optional(),
}).omit({
  id: true,
  tenantId: true,
  usernameEncrypted: true,
  passwordEncrypted: true,
  cookiesEncrypted: true,
  lastUsedAt: true,
  createdAt: true,
  updatedAt: true,
}).partial();

export type BrowserAgentConnection = typeof browserAgentConnectionsTable.$inferSelect;
