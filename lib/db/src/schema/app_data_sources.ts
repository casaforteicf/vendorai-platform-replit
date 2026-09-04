import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const appDataSourceRegistryTable = pgTable(
  "app_data_source_registry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    executorKey: text("executor_key").notNull(),
    configSchema: jsonb("config_schema").$type<Record<string, unknown>>().notNull().default({}),
    outputSchema: jsonb("output_schema").$type<Record<string, unknown>>().notNull().default({}),
    requiredPermissions: jsonb("required_permissions").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("active"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("app_data_source_registry_key_uidx").on(table.key),
    index("app_data_source_registry_category_idx").on(table.category),
    index("app_data_source_registry_status_idx").on(table.status),
    index("app_data_source_registry_executor_idx").on(table.executorKey),
  ],
);

export type AppDataSourceRegistryEntry = typeof appDataSourceRegistryTable.$inferSelect;
