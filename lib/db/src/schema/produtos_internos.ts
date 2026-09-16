import { pgTable, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema, createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const PRODUTO_INTERNO_TIPOS = ["servico", "produto", "oferta"] as const;
export type ProdutoInternoTipo = (typeof PRODUTO_INTERNO_TIPOS)[number];

export type ProdutoInternoDetalhes = Record<string, string | boolean | string[] | null | undefined>;
export type ProdutoInternoAnexo = {
  id: string;
  nome: string;
  url: string;
  type: "image" | "video" | "audio" | "document";
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
};

// Catálogo interno de "produtos" (funcionalidades) do Vendor.ai -- pra uso
// de marketing/vendas do próprio time, não controla acesso de tenant
// (isso continua sendo tenant_nav_modules). Visível só pra super_admin.
export const produtosInternosTable = pgTable("produtos_internos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  categoria: text("categoria").notNull(),
  nome: text("nome").notNull(),
  descricaoUso: text("descricao_uso").notNull(),
  // Classifica o TIPO de oferta -- serviço (execução contínua, ex: Agente
  // SDR), produto (ferramenta/recurso, ex: Pipeline de Negócios) ou oferta
  // (arranjo comercial, ex: Pacotes, Compra de Créditos Avulsos).
  tipo: text("tipo").$type<ProdutoInternoTipo>().notNull().default("produto"),
  // Nichos/segmentos (nomes iguais aos de segment_templates) em que esse
  // produto faz mais sentido como oferta de marketing -- padrão pra
  // filtrar/relacionar ao gerar conteúdo voltado a um nicho específico.
  nichosRelacionados: jsonb("nichos_relacionados").$type<string[]>().notNull().default([]),
  // Complemento estruturado usado pela Biblioteca da Empresa, agentes e
  // geradores de materiais. Mantém o cadastro comercial principal enxuto.
  detalhes: jsonb("detalhes").$type<ProdutoInternoDetalhes>().notNull().default({}),
  // Referências enviadas pela Biblioteca (imagem, vídeo, áudio ou documento).
  // O arquivo continua no object storage; aqui ficam somente metadados/URL.
  anexos: jsonb("anexos").$type<ProdutoInternoAnexo[]>().notNull().default([]),
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
