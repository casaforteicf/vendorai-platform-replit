import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export type ArqdorEngineeringScope = "universal" | "tenant";
export type ArqdorEngineeringComponentGroup =
  | "profile"
  | "glass"
  | "hardware"
  | "reinforcement"
  | "seal"
  | "finish"
  | "accessory"
  | "consumable"
  | "installation"
  | "logistics";

export const arqdorEngineeringSystemsTable = pgTable(
  "arqdor_engineering_systems",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    scope: text("scope").$type<ArqdorEngineeringScope>().notNull().default("universal"),
    manufacturer: text("manufacturer").notNull(),
    line: text("line").notNull(),
    material: text("material").notNull(),
    version: integer("version").notNull().default(1),
    source: text("source"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("arqdor_engineering_systems_scope_uidx").on(
      table.scope,
      table.tenantId,
      table.manufacturer,
      table.line,
      table.version,
    ),
    index("arqdor_engineering_systems_active_idx").on(table.isActive, table.material),
  ],
);

export const arqdorEngineeringComponentsTable = pgTable(
  "arqdor_engineering_components",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    systemId: text("system_id")
      .notNull()
      .references(() => arqdorEngineeringSystemsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    group: text("group").$type<ArqdorEngineeringComponentGroup>().notNull(),
    role: text("role").notNull(),
    unit: text("unit").notNull().default("un"),
    commercialLengthMm: numeric("commercial_length_mm", { precision: 12, scale: 3 }),
    weightKgPerM: numeric("weight_kg_per_m", { precision: 12, scale: 5 }),
    costValue: numeric("cost_value", { precision: 14, scale: 4 }),
    saleValue: numeric("sale_value", { precision: 14, scale: 4 }),
    pricingBasis: text("pricing_basis"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("arqdor_engineering_components_code_uidx").on(table.systemId, table.code),
    index("arqdor_engineering_components_group_idx").on(table.systemId, table.group, table.role),
  ],
);

export const arqdorEngineeringConfigurationsTable = pgTable(
  "arqdor_engineering_configurations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    systemId: text("system_id")
      .notNull()
      .references(() => arqdorEngineeringSystemsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    openingType: text("opening_type").notNull(),
    productKind: text("product_kind").notNull().default("window"),
    leafCount: integer("leaf_count"),
    frameCode: text("frame_code"),
    minWidthMm: numeric("min_width_mm", { precision: 12, scale: 3 }),
    maxWidthMm: numeric("max_width_mm", { precision: 12, scale: 3 }),
    minHeightMm: numeric("min_height_mm", { precision: 12, scale: 3 }),
    maxHeightMm: numeric("max_height_mm", { precision: 12, scale: 3 }),
    maxLeafWeightKg: numeric("max_leaf_weight_kg", { precision: 12, scale: 3 }),
    allowedGlassThicknessMm: jsonb("allowed_glass_thickness_mm")
      .$type<number[]>()
      .notNull()
      .default([]),
    geometryRules: jsonb("geometry_rules").$type<Record<string, unknown>>().notNull().default({}),
    compatibilityRules: jsonb("compatibility_rules").$type<Record<string, unknown>>().notNull().default({}),
    installationRules: jsonb("installation_rules").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("arqdor_engineering_configurations_code_uidx").on(table.systemId, table.code),
    index("arqdor_engineering_configurations_lookup_idx").on(
      table.systemId,
      table.productKind,
      table.openingType,
      table.leafCount,
      table.isActive,
    ),
  ],
);

export const arqdorEngineeringConfigurationComponentsTable = pgTable(
  "arqdor_engineering_configuration_components",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    configurationId: text("configuration_id")
      .notNull()
      .references(() => arqdorEngineeringConfigurationsTable.id, { onDelete: "cascade" }),
    componentId: text("component_id")
      .notNull()
      .references(() => arqdorEngineeringComponentsTable.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull().default(0),
    required: boolean("required").notNull().default(true),
    quantityRule: jsonb("quantity_rule").$type<Record<string, unknown>>().notNull().default({}),
    dimensionRule: jsonb("dimension_rule").$type<Record<string, unknown>>().notNull().default({}),
    conditionRule: jsonb("condition_rule").$type<Record<string, unknown>>().notNull().default({}),
    cuttingRule: jsonb("cutting_rule").$type<Record<string, unknown>>().notNull().default({}),
    wasteRule: jsonb("waste_rule").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("arqdor_engineering_configuration_components_uidx").on(
      table.configurationId,
      table.componentId,
      table.sequence,
    ),
    index("arqdor_engineering_configuration_components_cfg_idx").on(table.configurationId, table.sequence),
  ],
);

export const arqdorEngineeringPerformanceTestsTable = pgTable(
  "arqdor_engineering_performance_tests",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    configurationId: text("configuration_id")
      .notNull()
      .references(() => arqdorEngineeringConfigurationsTable.id, { onDelete: "cascade" }),
    reportNumber: text("report_number"),
    testType: text("test_type").notNull(),
    acousticDb: numeric("acoustic_db", { precision: 8, scale: 3 }),
    watertightnessPa: numeric("watertightness_pa", { precision: 12, scale: 3 }),
    windPressurePa: numeric("wind_pressure_pa", { precision: 12, scale: 3 }),
    airPermeability: numeric("air_permeability", { precision: 12, scale: 5 }),
    measuredDeflectionMm: numeric("measured_deflection_mm", { precision: 12, scale: 4 }),
    allowedDeflectionMm: numeric("allowed_deflection_mm", { precision: 12, scale: 4 }),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    sourceFile: text("source_file"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("arqdor_engineering_performance_tests_cfg_idx").on(table.configurationId, table.testType),
  ],
);

export const arqdorEngineeringQuoteSnapshotsTable = pgTable(
  "arqdor_engineering_quote_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    budgetId: text("budget_id"),
    configurationId: text("configuration_id").references(
      () => arqdorEngineeringConfigurationsTable.id,
      { onDelete: "set null" },
    ),
    engineVersion: text("engine_version").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    resolvedBom: jsonb("resolved_bom").$type<Array<Record<string, unknown>>>().notNull().default([]),
    validation: jsonb("validation").$type<Record<string, unknown>>().notNull().default({}),
    costSummary: jsonb("cost_summary").$type<Record<string, unknown>>().notNull().default({}),
    priceSummary: jsonb("price_summary").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("arqdor_engineering_quote_snapshots_budget_idx").on(table.tenantId, table.budgetId, table.createdAt),
    index("arqdor_engineering_quote_snapshots_project_idx").on(table.tenantId, table.projectId, table.createdAt),
  ],
);

export type ArqdorEngineeringSystem = typeof arqdorEngineeringSystemsTable.$inferSelect;
export type ArqdorEngineeringComponent = typeof arqdorEngineeringComponentsTable.$inferSelect;
export type ArqdorEngineeringConfiguration = typeof arqdorEngineeringConfigurationsTable.$inferSelect;
export type ArqdorEngineeringPerformanceTest = typeof arqdorEngineeringPerformanceTestsTable.$inferSelect;
export type ArqdorEngineeringQuoteSnapshot = typeof arqdorEngineeringQuoteSnapshotsTable.$inferSelect;
