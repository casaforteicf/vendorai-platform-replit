import { pgTable, text, timestamp, numeric, boolean, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const TAXONOMY_LEVELS = [
  "categoria",
  "subcategoria",
  "nicho",
  "linha",
  "aplicacao",
  "sublinha",
  "utilidade",
  "familia",
] as const;
export type TaxonomyLevel = (typeof TAXONOMY_LEVELS)[number];

export const categoriasProdutoTable = pgTable("categorias_produto", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  slug: text("slug"),
  parentId: text("parent_id").references((): AnyPgColumn => categoriasProdutoTable.id, { onDelete: "restrict" }),
  nivel: text("nivel").$type<TaxonomyLevel>().notNull().default("categoria"),
  oficial: boolean("oficial").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  descontoMaximoPercentual: numeric("desconto_maximo_percentual", { precision: 5, scale: 2 })
    .notNull()
    .default("0"),
  // Fluxo de aprovação pra categorias criadas automaticamente na
  // importação (sem correspondência exata com nenhuma existente).
  precisaAprovacao: boolean("precisa_aprovacao").notNull().default(false),
  aprovadoPor: text("aprovado_por").references(() => usersTable.id),
  aprovadoEm: timestamp("aprovado_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const percentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"));

export const insertCategoriaProdutoSchema = createInsertSchema(categoriasProdutoTable, {
  descontoMaximoPercentual: percentualSchema.optional(),
  nivel: z.enum(TAXONOMY_LEVELS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCategoriaProdutoSchema = createSelectSchema(categoriasProdutoTable, {
  descontoMaximoPercentual: percentualSchema.optional(),
  nivel: z.enum(TAXONOMY_LEVELS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCategoriaProduto = z.infer<typeof insertCategoriaProdutoSchema>;
export type UpdateCategoriaProduto = z.infer<typeof updateCategoriaProdutoSchema>;
export type CategoriaProduto = typeof categoriasProdutoTable.$inferSelect;
