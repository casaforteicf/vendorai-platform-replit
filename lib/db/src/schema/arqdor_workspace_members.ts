import { pgTable, text, timestamp, primaryKey, index } from "drizzle-orm/pg-core";
import { arqdorWorkspaceProjectsTable } from "./arqdor_workspace_projects";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/** MULTI-07: opt-in project-scoped ACL schema. Migration required before use. */
export const arqdorWorkspaceMembersTable = pgTable("arqdor_workspace_members", {
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  permission: text("permission").$type<"owner" | "editor" | "viewer">().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.tenantId, table.projectId, table.userId] }),
  index("arqdor_workspace_members_user_idx").on(table.tenantId, table.userId),
]);
// Composite project FK is defined in the SQL migration to preserve tenant scope.
void arqdorWorkspaceProjectsTable;
