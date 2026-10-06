import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { leadsTable } from "./leads";
import { tenantsTable } from "./tenants";

export const attachmentFolderLocksTable = pgTable("attachment_folder_locks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  folderPath: text("folder_path").notNull(),
  passwordHash: text("password_hash").notNull(),
  unlockMinutes: integer("unlock_minutes").notNull().default(15),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  unique("attachment_folder_locks_tenant_lead_folder_unique").on(t.tenantId, t.leadId, t.folderPath),
]);

export const attachmentFolderAuditTable = pgTable("attachment_folder_audit", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  folderPath: text("folder_path").notNull(),
  actorUserId: text("actor_user_id"),
  action: text("action").$type<"locked" | "password_changed" | "unlocked" | "lock_removed" | "unlock_failed">().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AttachmentFolderLock = typeof attachmentFolderLocksTable.$inferSelect;
