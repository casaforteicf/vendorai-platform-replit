import {
  pgTable,
  text,
  jsonb,
  timestamp,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const arqdorWorkspaceProjectsTable = pgTable(
  "arqdor_workspace_projects",
  {
    id: text("id").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    contextBlob: jsonb("context_blob").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.id, table.tenantId] })]
);

export const insertArqdorWorkspaceProjectSchema = createInsertSchema(
  arqdorWorkspaceProjectsTable,
  {
    contextBlob: z.record(z.string(), z.unknown()),
  }
).omit({ createdAt: true, updatedAt: true });

export type InsertArqdorWorkspaceProject = z.infer<
  typeof insertArqdorWorkspaceProjectSchema
>;
export type ArqdorWorkspaceProject =
  typeof arqdorWorkspaceProjectsTable.$inferSelect;
