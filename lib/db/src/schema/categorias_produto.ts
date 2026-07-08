import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const categoriasProdutoTable = pgTable("categorias_produto", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descontoMaximoPercentual: numeric("desconto_maximo_percentual", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const percentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"));

export const insertCategoriaProdutoSchema = createInsertSchema(categoriasProdutoTable, {
  descontoMaximoPercentual: percentualSchema.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCategoriaProdutoSchema = createSelectSchema(categoriasProdutoTable, {
  descontoMaximoPercentual: percentualSchema.optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCategoriaProduto = z.infer<typeof insertCategoriaProdutoSchema>;
export type UpdateCategoriaProduto = z.infer<typeof updateCategoriaProdutoSchema>;
export type CategoriaProduto = typeof categoriasProdutoTable.$inferSelect;
