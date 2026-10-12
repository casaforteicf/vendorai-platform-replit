import { pgTable, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { agendasTable } from "./agendas";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const agendaAccessGrantsTable = pgTable("agenda_access_grants", {
  agendaId: text("agenda_id").notNull().references(() => agendasTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  grantedBy: text("granted_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.agendaId, table.userId] }),
  index("agenda_access_grants_tenant_user_idx").on(table.tenantId, table.userId),
]);
