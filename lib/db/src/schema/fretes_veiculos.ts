import { pgTable, text, timestamp, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const fretesVeiculoTipoEnum = pgEnum("fretes_veiculo_tipo", [
  "utilitario", "van", "caminhao_toco", "caminhao_truck", "carreta",
]);

export const fretesVeiculosTable = pgTable("fretes_veiculos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  placa: text("placa").notNull(),
  tipo: fretesVeiculoTipoEnum("tipo").notNull(),
  capacidadeKg: numeric("capacidade_kg", { precision: 10, scale: 2 }),
  capacidadeM3: numeric("capacidade_m3", { precision: 10, scale: 2 }),
  motoristaId: text("motorista_id").references(() => usersTable.id, { onDelete: "set null" }),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFretesVeiculoSchema = createInsertSchema(fretesVeiculosTable, {
  capacidadeKg: z.coerce.number().nonnegative().optional().nullable(),
  capacidadeM3: z.coerce.number().nonnegative().optional().nullable(),
}).omit({ id: true, createdAt: true });

export const updateFretesVeiculoSchema = createSelectSchema(fretesVeiculosTable, {
  capacidadeKg: z.coerce.number().nonnegative().optional().nullable(),
  capacidadeM3: z.coerce.number().nonnegative().optional().nullable(),
}).omit({ id: true, tenantId: true, createdAt: true }).partial();

export type FretesVeiculo = typeof fretesVeiculosTable.$inferSelect;
export type InsertFretesVeiculo = z.infer<typeof insertFretesVeiculoSchema>;
