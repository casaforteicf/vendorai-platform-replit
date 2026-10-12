import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { agendasTable } from "./agendas";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const calendarOauthStatesTable = pgTable("calendar_oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  agendaId: text("agenda_id").notNull().references(() => agendasTable.id, { onDelete: "cascade" }),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  initiatedBy: text("initiated_by").notNull().references(() => usersTable.id),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [index("calendar_oauth_states_expiry_idx").on(table.expiresAt)]);
