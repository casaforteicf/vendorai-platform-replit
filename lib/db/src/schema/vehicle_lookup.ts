import { boolean, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const vehiclesTable = pgTable("vehicles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  plate: text("plate"),
  chassis: text("chassis"),
  renavam: text("renavam"),
  brand: text("brand"),
  model: text("model"),
  version: text("version"),
  rawDescription: text("raw_description"),
  fullName: text("full_name"),
  manufactureYear: integer("manufacture_year"),
  modelYear: integer("model_year"),
  fuel: text("fuel"),
  engine: text("engine"),
  transmission: text("transmission"),
  powerHp: integer("power_hp"),
  color: text("color"),
  vehicleType: text("vehicle_type"),
  fipeCode: text("fipe_code"),
  source: text("source").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  confidenceReasons: jsonb("confidence_reasons").$type<string[]>().notNull().default([]),
  possibleVersions: jsonb("possible_versions").$type<string[]>().notNull().default([]),
  providerData: jsonb("provider_data").$type<Record<string, unknown>>(),
  lastVerifiedAt: timestamp("last_verified_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("vehicles_tenant_plate_unique").on(table.tenantId, table.plate),
  uniqueIndex("vehicles_tenant_chassis_unique").on(table.tenantId, table.chassis),
]);

export const vehicleLookupCacheTable = pgTable("vehicle_lookup_cache", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  lookupType: text("lookup_type").notNull(),
  lookupHash: text("lookup_hash").notNull(),
  vehicleId: text("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [uniqueIndex("vehicle_lookup_cache_key_unique").on(table.tenantId, table.lookupType, table.lookupHash)]);

export const vehicleLookupHistoryTable = pgTable("vehicle_lookup_history", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  queryType: text("query_type").notNull(),
  queryMasked: text("query_masked").notNull(),
  vehicleId: text("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  success: boolean("success").notNull(),
  durationMs: integer("duration_ms").notNull(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [index("vehicle_lookup_history_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export type VehicleRecord = typeof vehiclesTable.$inferSelect;
