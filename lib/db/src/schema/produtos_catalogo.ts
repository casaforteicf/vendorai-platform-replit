import { pgTable, text, timestamp, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { categoriasProdutoTable } from "./categorias_produto";

export const PRODUCT_TYPES = ["physical", "service", "saas_plan", "saas_addon"] as const;
export type ProductType = typeof PRODUCT_TYPES[number];

export interface ProdutoDimensoes {
  largura?: number;
  altura?: number;
  profundidade?: number;
}

export const produtosCatalogoTable = pgTable("produtos_catalogo", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  sku: text("sku"),
  codigoBarras: text("codigo_barras"),
  productType: text("product_type").$type<ProductType>().notNull().default("physical"),
  descricao: text("descricao"),
  descricaoLonga: text("descricao_longa"),
  categoriaId: text("categoria_id").references(() => categoriasProdutoTable.id, { onDelete: "set null" }),
  descontoMaximoPercentual: numeric("desconto_maximo_percentual", { precision: 5, scale: 2 }),
  marca: text("marca"),
  tags: jsonb("tags").$type<string[]>(),
  precoBase: numeric("preco_base", { precision: 12, scale: 2 }).notNull(),
  precoImplantacao: numeric("preco_implantacao", { precision: 12, scale: 2 }),
  precoMensalidade: numeric("preco_mensalidade", { precision: 12, scale: 2 }),
  unidade: text("unidade").notNull().default("un"),
  ativo: boolean("ativo").notNull().default(true),
  destaque: boolean("destaque").notNull().default(false),
  imagemUrl: text("imagem_url"),
  imagens: jsonb("imagens").$type<string[]>(),
  peso: numeric("peso", { precision: 10, scale: 3 }),
  dimensoes: jsonb("dimensoes").$type<ProdutoDimensoes>(),
  recorrencia: text("recorrencia"),
  prazoContrato: integer("prazo_contrato"),
  exigeAgendamento: boolean("exige_agendamento").notNull().default(false),
  comissaoPercentual: numeric("comissao_percentual", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

const descontoMaximoPercentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"))
  .nullable();

const comissaoPercentualSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid percentage"))
  .nullable();

const precoDecimalSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal price"));

export const insertProdutoCatalogoSchema = createInsertSchema(
  produtosCatalogoTable,
  {
    precoBase: precoDecimalSchema,
    precoImplantacao: precoDecimalSchema.nullable().optional(),
    precoMensalidade: precoDecimalSchema.nullable().optional(),
    descontoMaximoPercentual: descontoMaximoPercentualSchema.optional(),
    comissaoPercentual: comissaoPercentualSchema.optional(),
  }
).omit({ id: true, createdAt: true, updatedAt: true });

export const updateProdutoCatalogoSchema = createSelectSchema(
  produtosCatalogoTable,
  {
    precoBase: precoDecimalSchema.optional(),
    precoImplantacao: precoDecimalSchema.nullable().optional(),
    precoMensalidade: precoDecimalSchema.nullable().optional(),
    descontoMaximoPercentual: descontoMaximoPercentualSchema.optional(),
    comissaoPercentual: comissaoPercentualSchema.optional(),
  }
)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertProdutoCatalogo = z.infer<typeof insertProdutoCatalogoSchema>;
export type UpdateProdutoCatalogo = z.infer<typeof updateProdutoCatalogoSchema>;
export type ProdutoCatalogo = typeof produtosCatalogoTable.$inferSelect;
