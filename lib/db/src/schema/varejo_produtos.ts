import { pgTable, text, timestamp, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { varejoFornecedorTable } from "./varejo_fornecedores";
import { varejoColecaoTable } from "./varejo_colecoes";

export const varejoCategoriaProdutoEnum = pgEnum("varejo_categoria_produto", [
  "camiseta", "calca", "vestido", "short", "jaqueta", "blazer",
  "saia", "acessorio", "calcado", "bolsa", "outro",
]);

export const varejoGeneroProdutoEnum = pgEnum("varejo_genero_produto", [
  "masculino", "feminino", "unissex", "infantil",
]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const varejoProdutoTable = pgTable("varejo_produtos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  fornecedorId: text("fornecedor_id").references(() => varejoFornecedorTable.id, { onDelete: "set null" }),
  colecaoId: text("colecao_id").references(() => varejoColecaoTable.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  codigo: text("codigo"),
  descricao: text("descricao"),
  categoria: varejoCategoriaProdutoEnum("categoria"),
  genero: varejoGeneroProdutoEnum("genero"),
  precoCompra: numeric("preco_compra", { precision: 12, scale: 2 }),
  precoVenda: numeric("preco_venda", { precision: 12, scale: 2 }).notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoProdutoSchema = createInsertSchema(varejoProdutoTable, {
  precoCompra: decimalField.optional(),
  precoVenda: decimalField,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoProdutoSchema = createSelectSchema(varejoProdutoTable, {
  precoCompra: decimalField.optional(),
  precoVenda: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoProduto = typeof varejoProdutoTable.$inferSelect;
export type InsertVarejoProduto = z.infer<typeof insertVarejoProdutoSchema>;
