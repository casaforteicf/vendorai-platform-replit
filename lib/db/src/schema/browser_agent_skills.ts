import { pgTable, text, timestamp, jsonb, unique, integer, boolean } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { browserAgentConnectionsTable } from "./browser_agent_connections";

export const browserAgentSkillsTable = pgTable(
  "browser_agent_skills",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => browserAgentConnectionsTable.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    startUrl: text("start_url").notNull(),
    allowedHosts: jsonb("allowed_hosts").$type<string[]>().notNull().default([]),
    actions: jsonb("actions").$type<Array<Record<string, unknown>>>().notNull().default([]),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("ready"),
    repairCount: integer("repair_count").notNull().default(0),
    lastRunAt: timestamp("last_run_at"),
    lastSuccessAt: timestamp("last_success_at"),
    lastError: text("last_error"),
    watchEnabled: boolean("watch_enabled").notNull().default(false),
    watchFingerprint: text("watch_fingerprint"),
    watchLastChangedAt: timestamp("watch_last_changed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("browser_agent_skills_tenant_name_unique").on(t.tenantId, t.name)],
);

export type BrowserAgentSkill = typeof browserAgentSkillsTable.$inferSelect;

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]
