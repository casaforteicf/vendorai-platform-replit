import { integer, jsonb, pgTable, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

export const hotelEscalaConfigTable = pgTable(
  "hotel_escala_config",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    nome: text("nome").notNull().default("Escala A&B"),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    unique("hotel_escala_config_tenant_uq").on(table.tenantId),
    unique("hotel_escala_config_tenant_id_uq").on(table.tenantId, table.id),
  ],
);

export const hotelEscalaVersoesTable = pgTable(
  "hotel_escala_versoes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
    configId: text("config_id").notNull(),
    version: integer("version").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    savedBy: text("saved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("hotel_escala_versoes_tenant_id_uq").on(table.tenantId, table.id),
    unique("hotel_escala_versoes_config_version_uq").on(table.tenantId, table.configId, table.version),
    index("hotel_escala_versoes_tenant_created_idx").on(table.tenantId, table.createdAt.desc()),
  ],
);

export type HotelEscalaConfig = typeof hotelEscalaConfigTable.$inferSelect;
export type HotelEscalaVersao = typeof hotelEscalaVersoesTable.$inferSelect;
