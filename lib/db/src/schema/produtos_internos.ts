import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PRODUTO_INTERNO_TIPOS = ["servico", "produto", "oferta", "etapa"] as const;
export type ProdutoInternoTipo = (typeof PRODUTO_INTERNO_TIPOS)[number];

export type ProdutoInternoDetalhes = Record<string, unknown>;
export type ProdutoInternoAnexo = {
  id: string;
  nome: string;
  url: string;
  type: "image" | "video" | "audio" | "document";
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
};

export type ProdutoUsoPolicy = {
  version?: string;
  enforcement?: "measure_only" | "warn" | "enforce";
  quotaMode?: string;
  [key: string]: unknown;
};

/**
 * Fonte comercial mestre do ecossistema VendorAI.
 *
 * A tabela continua servindo a Biblioteca da Empresa/marketing, mas os itens da
 * categoria "Produtos Comerciais VendorAI" também passam a concentrar a
 * definição comercial que alimenta catálogo, site, checkout, entitlements e
 * franquias. O acesso técnico continua materializado em tenant_nav_modules;
 * product/module/segment são conceitos diferentes.
 */
export const produtosInternosTable = pgTable("produtos_internos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoria: text("categoria").notNull(),
  nome: text("nome").notNull(),
  descricaoUso: text("descricao_uso").notNull(),
  tipo: text("tipo").$type<ProdutoInternoTipo>().notNull().default("produto"),
  nichosRelacionados: jsonb("nichos_relacionados").$type<string[]>().notNull().default([]),
  detalhes: jsonb("detalhes").$type<ProdutoInternoDetalhes>().notNull().default({}),
  anexos: jsonb("anexos").$type<ProdutoInternoAnexo[]>().notNull().default([]),

  // Contrato comercial estável. Nomes e textos podem mudar sem quebrar billing.
  commercialKey: text("commercial_key"),
  sku: text("sku"),
  billingModel: text("billing_model"),
  publicSlug: text("public_slug"),
  monthlyPriceCents: integer("monthly_price_cents"),
  oneTimePriceCents: integer("one_time_price_cents"),
  maxUsers: integer("max_users"),
  unlimitedUsers: boolean("unlimited_users").notNull().default(false),
  includedInGrowth: boolean("included_in_growth").notNull().default(false),
  standalonePurchase: boolean("standalone_purchase").notNull().default(true),
  publicVisible: boolean("public_visible").notNull().default(true),

  // Mapeia o produto comercial para os módulos técnicos. Não é a fonte de
  // navegação em runtime; serve ao provisionamento/diagnóstico do entitlement.
  moduleKeys: jsonb("module_keys").$type<string[]>().notNull().default([]),
  usagePolicy: jsonb("usage_policy").$type<ProdutoUsoPolicy>().notNull().default({}),
  commercialMetadata: jsonb("commercial_metadata").$type<Record<string, unknown>>().notNull().default({}),

  ordem: integer("ordem").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProdutoInternoSchema = createInsertSchema(produtosInternosTable, {
  tipo: z.enum(PRODUTO_INTERNO_TIPOS),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProdutoInternoSchema = createSelectSchema(produtosInternosTable, {
  tipo: z.enum(PRODUTO_INTERNO_TIPOS),
})
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type ProdutoInterno = typeof produtosInternosTable.$inferSelect;
export type InsertProdutoInterno = z.infer<typeof insertProdutoInternoSchema>;
