import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Catálogo interno de "produtos" (funcionalidades) do Vendor.ai -- pra uso
// de marketing/vendas do próprio time, não controla acesso de tenant
// (isso continua sendo tenant_nav_modules). Visível só pra super_admin.
export const produtosInternosTable = pgTable("produtos_internos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoria: text("categoria").notNull(),
  nome: text("nome").notNull(),
  descricaoUso: text("descricao_uso").notNull(),
  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProdutoInternoSchema = createInsertSchema(produtosInternosTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const updateProdutoInternoSchema = createSelectSchema(produtosInternosTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type ProdutoInterno = typeof produtosInternosTable.$inferSelect;
export type InsertProdutoInterno = z.infer<typeof insertProdutoInternoSchema>;
