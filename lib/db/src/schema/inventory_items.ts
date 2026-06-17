import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { produtosCatalogoTable } from "./produtos_catalogo";

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal value"));

export const inventoryItemsTable = pgTable("inventory_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id")
    .notNull()
    .references(() => produtosCatalogoTable.id, { onDelete: "cascade" }),
  quantidadeAtual: numeric("quantidade_atual", { precision: 15, scale: 4 })
    .notNull()
    .default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 15, scale: 4 })
    .notNull()
    .default("0"),
  localizacao: text("localizacao"),
  unidade: text("unidade").notNull().default("un"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable, {
  quantidadeAtual: decimalField.optional(),
  quantidadeMinima: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInventoryItemSchema = createSelectSchema(inventoryItemsTable, {
  quantidadeAtual: decimalField.optional(),
  quantidadeMinima: decimalField.optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type UpdateInventoryItem = z.infer<typeof updateInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;
