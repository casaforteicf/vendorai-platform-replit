import { pgTable, text, timestamp, numeric, boolean, pgEnum, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const supermercadoCategoriaProdutoEnum = pgEnum("supermercado_categoria_produto", [
  "hortifruti", "carnes", "frios_laticinios", "padaria", "bebidas",
  "limpeza", "higiene", "mercearia", "congelados", "petshop", "outros",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const supermercadoProdutoTable = pgTable("supermercado_produtos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  erpId: text("erp_id"),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  categoria: supermercadoCategoriaProdutoEnum("categoria"),
  unidade: text("unidade").notNull().default("un"),
  precoVenda: numeric("preco_venda", { precision: 12, scale: 2 }).notNull(),
  precoPromocional: numeric("preco_promocional", { precision: 12, scale: 2 }),
  estoque: integer("estoque").notNull().default(0),
  imagemUrl: text("imagem_url"),
  ativo: boolean("ativo").notNull().default(true),
  destaqueWhatsapp: boolean("destaque_whatsapp").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSupermercadoProdutoSchema = createInsertSchema(supermercadoProdutoTable, {
  precoVenda: decimalField,
  precoPromocional: decimalField.optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSupermercadoProdutoSchema = createSelectSchema(supermercadoProdutoTable, {
  precoVenda: decimalField.optional(),
  precoPromocional: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type SupermercadoProduto = typeof supermercadoProdutoTable.$inferSelect;
export type InsertSupermercadoProduto = z.infer<typeof insertSupermercadoProdutoSchema>;
