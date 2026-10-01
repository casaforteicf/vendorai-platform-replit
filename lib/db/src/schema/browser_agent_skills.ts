import { pgTable, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("browser_agent_skills_tenant_name_unique").on(t.tenantId, t.name)],
);

export type BrowserAgentSkill = typeof browserAgentSkillsTable.$inferSelect;
