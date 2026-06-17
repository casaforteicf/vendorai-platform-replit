import { pgTable, text, timestamp, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const varejoNivelFidelidadeEnum = pgEnum("varejo_nivel_fidelidade", [
  "bronze", "prata", "ouro", "diamante",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const varejoFidelidadeTable = pgTable("varejo_fidelidade", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").notNull().references(() => leadsTable.id, { onDelete: "cascade" }),
  pontos: integer("pontos").notNull().default(0),
  totalGasto: numeric("total_gasto", { precision: 12, scale: 2 }).notNull().default("0"),
  nivel: varejoNivelFidelidadeEnum("nivel").notNull().default("bronze"),
  ultimaCompra: text("ultima_compra"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoFidelidadeSchema = createInsertSchema(varejoFidelidadeTable, {
  totalGasto: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoFidelidadeSchema = createSelectSchema(varejoFidelidadeTable, {
  totalGasto: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoFidelidade = typeof varejoFidelidadeTable.$inferSelect;
export type InsertVarejoFidelidade = z.infer<typeof insertVarejoFidelidadeSchema>;
