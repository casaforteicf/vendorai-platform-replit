import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { leadsTable } from "./leads";

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  recipientUserId: text("recipient_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("warning"), // warning, error, info
  category: text("category").notNull().default("general"), // deal_closure, data_missing, billing, etc.
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});