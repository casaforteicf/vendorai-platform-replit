import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

// A Studio project is a durable customer artifact, not a Vendi mission.
export const vendiStudioProjectsTable = pgTable("vendi_studio_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  ownerUserId: text("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("web_app"),
  brief: text("brief").notNull().default(""),
  status: text("status").notNull().default("draft"),
  templateId: text("template_id"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, table => ({
  tenantUpdatedIdx: index("vendi_studio_projects_tenant_updated_idx").on(table.tenantId, table.updatedAt),
  tenantOwnerIdx: index("vendi_studio_projects_tenant_owner_idx").on(table.tenantId, table.ownerUserId),
  tenantStatusIdx: index("vendi_studio_projects_tenant_status_idx").on(table.tenantId, table.status),
}));

export type VendiStudioProject = typeof vendiStudioProjectsTable.$inferSelect;
