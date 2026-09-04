import {
  AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const appVerticalStatusValues = ["active", "inactive", "archived"] as const;
export const appTemplateStatusValues = ["draft", "active", "archived"] as const;
export const appVersionStatusValues = ["draft", "published", "archived"] as const;
export const appInstanceStatusValues = ["draft", "preview", "published", "archived"] as const;
export const appRegistryStatusValues = ["active", "deprecated", "archived"] as const;
export const appRiskLevelValues = ["low", "medium", "high", "critical"] as const;

export const appVerticalsTable = pgTable(
  "app_verticals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    familyKey: text("family_key"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_verticals_key_uidx").on(table.key),
    index("app_verticals_family_idx").on(table.familyKey),
    index("app_verticals_status_idx").on(table.status),
  ],
);

export const appTemplatesTable = pgTable(
  "app_templates",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    verticalId: text("vertical_id")
      .notNull()
      .references(() => appVerticalsTable.id, { onDelete: "restrict" }),
    parentTemplateId: text("parent_template_id").references(
      (): AnyPgColumn => appTemplatesTable.id,
      { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: text("status").notNull().default("draft"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_templates_vertical_slug_uidx").on(table.verticalId, table.slug),
    index("app_templates_vertical_status_idx").on(table.verticalId, table.status),
    index("app_templates_parent_idx").on(table.parentTemplateId),
  ],
);

export const appTemplateVersionsTable = pgTable(
  "app_template_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    templateId: text("template_id")
      .notNull()
      .references(() => appTemplatesTable.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
    changeLog: text("change_log"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_template_versions_template_version_uidx").on(
      table.templateId,
      table.version,
    ),
    index("app_template_versions_status_idx").on(table.status),
  ],
);

export const appInstancesTable = pgTable(
  "app_instances",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => appTemplatesTable.id, { onDelete: "restrict" }),
    templateVersionId: text("template_version_id")
      .notNull()
      .references(() => appTemplateVersionsTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").notNull().default("draft"),
    theme: jsonb("theme").$type<Record<string, unknown>>().notNull().default({}),
    navigation: jsonb("navigation").$type<unknown[]>().notNull().default([]),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    whiteLabel: jsonb("white_label").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_instances_tenant_slug_uidx").on(table.tenantId, table.slug),
    index("app_instances_tenant_status_idx").on(table.tenantId, table.status),
    index("app_instances_template_idx").on(table.templateId),
  ],
);

export const appInstanceVersionsTable = pgTable(
  "app_instance_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    appInstanceId: text("app_instance_id")
      .notNull()
      .references(() => appInstancesTable.id, { onDelete: "cascade" }),
    templateVersionId: text("template_version_id").references(
      () => appTemplateVersionsTable.id,
      { onDelete: "set null" },
    ),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull().default({}),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_instance_versions_instance_version_uidx").on(
      table.appInstanceId,
      table.version,
    ),
    index("app_instance_versions_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const appComponentRegistryTable = pgTable(
  "app_component_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category"),
    configSchema: jsonb("config_schema").$type<Record<string, unknown>>().notNull().default({}),
    defaultProps: jsonb("default_props").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_component_registry_key_uidx").on(table.key),
    index("app_component_registry_category_idx").on(table.category),
  ],
);

export const appFeatureRegistryTable = pgTable(
  "app_feature_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    configSchema: jsonb("config_schema").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_feature_registry_key_uidx").on(table.key),
    index("app_feature_registry_category_idx").on(table.category),
  ],
);

export const appActionRegistryTable = pgTable(
  "app_action_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    inputSchema: jsonb("input_schema").$type<Record<string, unknown>>().notNull().default({}),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>().notNull().default({}),
    executorKey: text("executor_key"),
    requiredPermissions: jsonb("required_permissions").$type<string[]>().notNull().default([]),
    riskLevel: text("risk_level").notNull().default("low"),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_action_registry_key_uidx").on(table.key),
    index("app_action_registry_category_idx").on(table.category),
    index("app_action_registry_risk_idx").on(table.riskLevel),
    index("app_action_registry_status_idx").on(table.status),
    index("app_action_registry_executor_idx").on(table.executorKey),
  ],
);

export const appWorkflowRegistryTable = pgTable(
  "app_workflow_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    triggerSchema: jsonb("trigger_schema").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("app_workflow_registry_key_uidx").on(table.key)],
);

export const appAiPoliciesTable = pgTable(
  "app_ai_policies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    verticalId: text("vertical_id").references(() => appVerticalsTable.id, {
      onDelete: "cascade",
    }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    riskLevel: text("risk_level").notNull().default("medium"),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_ai_policies_vertical_key_uidx").on(table.verticalId, table.key),
    index("app_ai_policies_risk_idx").on(table.riskLevel),
  ],
);

export const createAppVerticalSchema = z.object({
  key: z.string().trim().min(2).max(80),
  name: z.string().trim().min(2).max(120),
  familyKey: z.string().trim().min(2).max(80).nullable().optional(),
  status: z.enum(appVerticalStatusValues).default("active"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const createAppTemplateSchema = z.object({
  verticalId: z.string().min(1),
  parentTemplateId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(appTemplateStatusValues).default("draft"),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const createAppInstanceSchema = z.object({
  tenantId: z.string().min(1),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(100),
  status: z.enum(appInstanceStatusValues).default("draft"),
  theme: z.record(z.string(), z.unknown()).default({}),
  navigation: z.array(z.unknown()).default([]),
  settings: z.record(z.string(), z.unknown()).default({}),
  whiteLabel: z.record(z.string(), z.unknown()).default({}),
});

export type AppVertical = typeof appVerticalsTable.$inferSelect;
export type AppTemplate = typeof appTemplatesTable.$inferSelect;
export type AppTemplateVersion = typeof appTemplateVersionsTable.$inferSelect;
export type AppInstance = typeof appInstancesTable.$inferSelect;
export type AppInstanceVersion = typeof appInstanceVersionsTable.$inferSelect;
