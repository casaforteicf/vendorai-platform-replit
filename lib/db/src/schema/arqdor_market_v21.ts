import { pgTable, text, timestamp, numeric, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const ARQDOR_MARKET_ORIGENS = [
  "manual",
  "pre_projeto",
  "projeto",
  "render",
  "orcamento",
  "orcamento_item",
  "obra",
  "atividade",
  "etapa",
] as const;

export const ARQDOR_MARKET_VISIBILIDADES = [
  "privada",
  "parceiros",
  "regional",
  "aberta",
] as const;

export const ARQDOR_MARKET_DEMANDA_STATUS = [
  "rascunho",
  "publicada",
  "encerrada",
  "cancelada",
  "adjudicada",
] as const;

export const ARQDOR_MARKET_CONVITE_STATUS = [
  "convidado",
  "visualizado",
  "respondido",
  "recusado",
] as const;

export const ARQDOR_MARKET_PROPOSTA_STATUS = [
  "rascunho",
  "enviada",
  "em_analise",
  "selecionada",
  "recusada",
  "cancelada",
] as const;

export type ArqdorMarketOrigem = typeof ARQDOR_MARKET_ORIGENS[number];
export type ArqdorMarketVisibilidade = typeof ARQDOR_MARKET_VISIBILIDADES[number];

export const arqdorMarketDemandasTable = pgTable("arqdor_market_demandas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  criadaPorUserId: text("criada_por_user_id"),
  origem: text("origem").$type<ArqdorMarketOrigem>().notNull().default("manual"),
  origemId: text("origem_id"),
  projetoId: text("projeto_id"),
  obraId: text("obra_id"),
  orcamentoId: text("orcamento_id"),
  orcamentoItemId: text("orcamento_item_id"),
  renderId: text("render_id"),
  atividadeId: text("atividade_id"),
  etapaId: text("etapa_id"),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  categoria: text("categoria"),
  subcategoria: text("subcategoria"),
  sistema: text("sistema"),
  produtoServico: text("produto_servico"),
  quantidade: numeric("quantidade", { precision: 16, scale: 4 }),
  unidade: text("unidade"),
  especificacoes: jsonb("especificacoes").$type<Record<string, unknown>>().notNull().default({}),
  anexos: jsonb("anexos").$type<Array<{ nome?: string; url: string; tipo?: string }>>().notNull().default([]),
  imagens: jsonb("imagens").$type<string[]>().notNull().default([]),
  localizacaoPublica: jsonb("localizacao_publica").$type<{
    cidade?: string;
    estado?: string;
    regiao?: string;
    pais?: string;
  }>().notNull().default({}),
  dataNecessidade: timestamp("data_necessidade"),
  prazoResposta: timestamp("prazo_resposta"),
  visibilidade: text("visibilidade").$type<ArqdorMarketVisibilidade>().notNull().default("privada"),
  status: text("status").notNull().default("rascunho"),
  ocultarComprador: integer("ocultar_comprador").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  publicadaEm: timestamp("publicada_em"),
  encerradaEm: timestamp("encerrada_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantStatusIdx: index("arqdor_market_demandas_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
  categoriaStatusIdx: index("arqdor_market_demandas_categoria_status_idx").on(t.categoria, t.status, t.createdAt),
  origemIdx: index("arqdor_market_demandas_origem_idx").on(t.origem, t.origemId),
}));

export const arqdorMarketConvitesTable = pgTable("arqdor_market_convites", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  demandaId: text("demanda_id").notNull().references(() => arqdorMarketDemandasTable.id, { onDelete: "cascade" }),
  fornecedorTenantId: text("fornecedor_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("convidado"),
  convidadoEm: timestamp("convidado_em").notNull().defaultNow(),
  visualizadoEm: timestamp("visualizado_em"),
  respondidoEm: timestamp("respondido_em"),
  recusadoEm: timestamp("recusado_em"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
}, (t) => ({
  demandaFornecedorUnique: uniqueIndex("arqdor_market_convites_demanda_fornecedor_uidx").on(t.demandaId, t.fornecedorTenantId),
  fornecedorStatusIdx: index("arqdor_market_convites_fornecedor_status_idx").on(t.fornecedorTenantId, t.status),
}));

export const arqdorMarketPropostasTable = pgTable("arqdor_market_propostas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  demandaId: text("demanda_id").notNull().references(() => arqdorMarketDemandasTable.id, { onDelete: "cascade" }),
  fornecedorTenantId: text("fornecedor_tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("rascunho"),
  moeda: text("moeda").notNull().default("BRL"),
  valorProdutos: numeric("valor_produtos", { precision: 16, scale: 2 }),
  frete: numeric("frete", { precision: 16, scale: 2 }),
  desconto: numeric("desconto", { precision: 16, scale: 2 }),
  impostos: numeric("impostos", { precision: 16, scale: 2 }),
  valorTotal: numeric("valor_total", { precision: 16, scale: 2 }),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  validadeAte: timestamp("validade_ate"),
  condicaoPagamento: text("condicao_pagamento"),
  observacoes: text("observacoes"),
  itens: jsonb("itens").$type<Array<{
    produtoId?: string;
    descricao: string;
    quantidade?: number;
    unidade?: string;
    valorUnitario?: number;
    valorTotal?: number;
    marca?: string;
    modelo?: string;
    especificacoes?: Record<string, unknown>;
  }>>().notNull().default([]),
  anexos: jsonb("anexos").$type<Array<{ nome?: string; url: string; tipo?: string }>>().notNull().default([]),
  cotacaoPropostaId: text("cotacao_proposta_id"),
  enviadaEm: timestamp("enviada_em"),
  selecionadaEm: timestamp("selecionada_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  demandaFornecedorIdx: index("arqdor_market_propostas_demanda_fornecedor_idx").on(t.demandaId, t.fornecedorTenantId),
  demandaStatusIdx: index("arqdor_market_propostas_demanda_status_idx").on(t.demandaId, t.status),
}));

export const insertArqdorMarketDemandaSchema = createInsertSchema(arqdorMarketDemandasTable, {
  origem: z.enum(ARQDOR_MARKET_ORIGENS).optional(),
  visibilidade: z.enum(ARQDOR_MARKET_VISIBILIDADES).optional(),
  status: z.enum(ARQDOR_MARKET_DEMANDA_STATUS).optional(),
}).omit({
  id: true,
  tenantId: true,
  criadaPorUserId: true,
  publicadaEm: true,
  encerradaEm: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArqdorMarketPropostaSchema = createInsertSchema(arqdorMarketPropostasTable, {
  status: z.enum(ARQDOR_MARKET_PROPOSTA_STATUS).optional(),
}).omit({
  id: true,
  fornecedorTenantId: true,
  enviadaEm: true,
  selecionadaEm: true,
  createdAt: true,
  updatedAt: true,
});

export const selectArqdorMarketDemandaSchema = createSelectSchema(arqdorMarketDemandasTable);
export const selectArqdorMarketPropostaSchema = createSelectSchema(arqdorMarketPropostasTable);
