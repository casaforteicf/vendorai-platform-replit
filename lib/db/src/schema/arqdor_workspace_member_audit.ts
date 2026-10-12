import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/** MULTI-07 append-only record of tenant project access changes. */
export const arqdorWorkspaceMemberAuditTable = pgTable("arqdor_workspace_member_audit", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull(),
  actorUserId: text("actor_user_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  action: text("action").$type<"grant" | "change" | "revoke">().notNull(),
  previousPermission: text("previous_permission"),
  nextPermission: text("next_permission"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  index("arqdor_member_audit_project_idx").on(table.tenantId, table.projectId, table.createdAt),
]);
