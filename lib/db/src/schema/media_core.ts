import { pgTable, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const mediaProjectsTable = pgTable("media_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("video"),
  status: text("status").notNull().default("draft"),
  source: text("source").notNull().default("content_studio"),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantStatusIdx: index("media_projects_tenant_status_idx").on(table.tenantId, table.status),
}));

export const mediaAssetsTable = pgTable("media_assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => mediaProjectsTable.id, { onDelete: "set null" }),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  role: text("role").notNull().default("source"),
  storageUrl: text("storage_url").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  originalFilename: text("original_filename"),
  source: text("source").notNull().default("upload"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantTypeIdx: index("media_assets_tenant_type_idx").on(table.tenantId, table.type),
  projectIdx: index("media_assets_project_idx").on(table.projectId),
}));

export const mediaVersionsTable = pgTable("media_versions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => mediaProjectsTable.id, { onDelete: "cascade" }),
  assetId: text("asset_id").references(() => mediaAssetsTable.id, { onDelete: "set null" }),
  parentVersionId: text("parent_version_id"),
  operation: text("operation").notNull().default("original"),
  label: text("label"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  projectCreatedIdx: index("media_versions_project_created_idx").on(table.projectId, table.createdAt),
}));

export const mediaJobsTable = pgTable("media_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").references(() => mediaProjectsTable.id, { onDelete: "set null" }),
  operation: text("operation").notNull(),
  provider: text("provider").notNull().default("vendorai"),
  providerJobId: text("provider_job_id"),
  status: text("status").notNull().default("queued"),
  progress: integer("progress"),
  total: integer("total"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
  output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantStatusIdx: index("media_jobs_tenant_status_idx").on(table.tenantId, table.status),
  projectIdx: index("media_jobs_project_idx").on(table.projectId),
}));

export type MediaProject = typeof mediaProjectsTable.$inferSelect;
export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type MediaVersion = typeof mediaVersionsTable.$inferSelect;
export type MediaJob = typeof mediaJobsTable.$inferSelect;
