import { pgTable, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const varejoComboTable = pgTable("varejo_combos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  preco: numeric("preco", { precision: 12, scale: 2 }),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoComboSchema = createInsertSchema(varejoComboTable, {
  preco: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoComboSchema = createSelectSchema(varejoComboTable, {
  preco: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoCombo = typeof varejoComboTable.$inferSelect;
export type InsertVarejoCombo = z.infer<typeof insertVarejoComboSchema>;
