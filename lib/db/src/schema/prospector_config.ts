import { pgTable, text, integer, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const prospectorConfigTable = pgTable("prospector_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  setor: text("setor"),
  cidade: text("cidade"),
  cnaeAlvo: text("cnae_alvo").array().notNull().default([]),
  raioKm: integer("raio_km"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  ritmoDiario: integer("ritmo_diario").notNull().default(10),
  autoDispatchThreshold: integer("auto_dispatch_threshold").notNull().default(80),
  ativo: boolean("ativo").notNull().default(false),
  horarioCron: text("horario_cron").notNull().default("09:00"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProspectorConfigSchema = createInsertSchema(prospectorConfigTable, {
  ritmoDiario: z.number().int().min(1).max(500),
  raioKm: z.number().int().min(1).max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProspectorConfigSchema = createSelectSchema(prospectorConfigTable, {
  ritmoDiario: z.number().int().min(1).max(500).optional(),
  raioKm: z.number().int().min(1).max(100).optional(),
}).partial().omit({ id: true, tenantId: true, createdAt: true, updatedAt: true });

export type ProspectorConfig = typeof prospectorConfigTable.$inferSelect;
export type InsertProspectorConfig = z.infer<typeof insertProspectorConfigSchema>;
export type UpdateProspectorConfig = z.infer<typeof updateProspectorConfigSchema>;
