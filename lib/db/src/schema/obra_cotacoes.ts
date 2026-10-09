import { pgTable, text, timestamp, numeric, boolean, integer, date, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { fornecedoresTable } from "./solicitacoes_compra";
import { insumosTable } from "./insumos";
import { obraOrcamentosTable, obraOrcamentoEtapasTable, obraOrcamentoItensTable } from "./obras";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^-?\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const COTACAO_STATUS = [
  "rascunho",
  "aberta",
  "recebendo_propostas",
  "em_analise",
  "parcialmente_coberta",
  "coberta",
  "selecionada",
  "encerrada",
  "cancelada",
] as const;

export const COTACAO_PROPOSTA_STATUS = [
  "importada",
  "extraida",
  "revisao",
  "valida",
  "selecionada",
  "descartada",
] as const;

export const COTACAO_COBERTURA_STATUS = [
  "nao_cotado",
  "parcial",
  "coberto",
  "ambigua",
  "incompativel",
] as const;

export const COTACAO_FORMATOS_ORIGEM = ["pdf","xls","xlsx","csv","imagem","doc","manual","api","email"] as const;

export const obraCotacoesTable = pgTable("obra_cotacoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  orcamentoId: text("orcamento_id").notNull().references(() => obraOrcamentosTable.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  status: text("status").notNull().default("rascunho"),
  dataNecessidade: date("data_necessidade", { mode: "string" }),
  prazoResposta: date("prazo_resposta", { mode: "string" }),
  observacoes: text("observacoes"),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantOrcamentoIdx: index("obra_cotacoes_tenant_orcamento_idx").on(t.tenantId, t.orcamentoId),
}));

export const obraCotacaoItensTable = pgTable("obra_cotacao_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cotacaoId: text("cotacao_id").notNull().references(() => obraCotacoesTable.id, { onDelete: "cascade" }),
  orcamentoItemId: text("orcamento_item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "set null" }),
  orcamentoEtapaId: text("orcamento_etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "set null" }),
  insumoId: text("insumo_id").references(() => insumosTable.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  codigo: text("codigo"),
  especificacao: text("especificacao"),
  marcaPreferencial: text("marca_preferencial"),
  modeloPreferencial: text("modelo_preferencial"),
  quantidadeTecnica: numeric("quantidade_tecnica", { precision: 15, scale: 4 }).notNull(),
  unidadeTecnica: text("unidade_tecnica").notNull(),
  quantidadeCompra: numeric("quantidade_compra", { precision: 15, scale: 4 }),
  unidadeCompra: text("unidade_compra"),
  quantidadeMinimaCompra: numeric("quantidade_minima_compra", { precision: 15, scale: 4 }),
  multiploCompra: numeric("multiplo_compra", { precision: 15, scale: 4 }),
  fatorCompraParaConsumo: numeric("fator_compra_para_consumo", { precision: 15, scale: 6 }),
  permiteEquivalente: boolean("permite_equivalente").notNull().default(false),
  coberturaStatus: text("cobertura_status").notNull().default("nao_cotado"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  cotacaoItemIdx: index("obra_cotacao_itens_cotacao_idx").on(t.cotacaoId),
  insumoIdx: index("obra_cotacao_itens_insumo_idx").on(t.insumoId),
}));

export const obraCotacaoPropostasTable = pgTable("obra_cotacao_propostas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cotacaoId: text("cotacao_id").notNull().references(() => obraCotacoesTable.id, { onDelete: "cascade" }),
  fornecedorId: text("fornecedor_id").references(() => fornecedoresTable.id, { onDelete: "set null" }),
  fornecedorNomeSnapshot: text("fornecedor_nome_snapshot").notNull(),
  numeroProposta: text("numero_proposta"),
  dataProposta: date("data_proposta", { mode: "string" }),
  validadeAte: date("validade_ate", { mode: "string" }),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  condicaoPagamento: text("condicao_pagamento"),
  freteValor: numeric("frete_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  impostosValor: numeric("impostos_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  descontoValor: numeric("desconto_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  valorTotalInformado: numeric("valor_total_informado", { precision: 15, scale: 4 }),
  origemFormato: text("origem_formato").notNull().default("manual"),
  arquivoNome: text("arquivo_nome"),
  arquivoUrl: text("arquivo_url"),
  extracaoConfianca: numeric("extracao_confianca", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("importada"),
  observacoes: text("observacoes"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  cotacaoFornecedorIdx: index("obra_cotacao_propostas_cotacao_fornecedor_idx").on(t.cotacaoId, t.fornecedorId),
}));

export const obraCotacaoPropostaItensTable = pgTable("obra_cotacao_proposta_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  propostaId: text("proposta_id").notNull().references(() => obraCotacaoPropostasTable.id, { onDelete: "cascade" }),
  cotacaoItemId: text("cotacao_item_id").references(() => obraCotacaoItensTable.id, { onDelete: "set null" }),
  linhaOrigem: integer("linha_origem"),
  codigoFornecedor: text("codigo_fornecedor"),
  descricaoFornecedor: text("descricao_fornecedor").notNull(),
  marca: text("marca"),
  modelo: text("modelo"),
  especificacao: text("especificacao"),
  quantidadeOfertada: numeric("quantidade_ofertada", { precision: 15, scale: 4 }).notNull(),
  unidadeFornecedor: text("unidade_fornecedor").notNull(),
  embalagemQuantidade: numeric("embalagem_quantidade", { precision: 15, scale: 4 }),
  quantidadeMinimaCompra: numeric("quantidade_minima_compra", { precision: 15, scale: 4 }),
  multiploCompra: numeric("multiplo_compra", { precision: 15, scale: 4 }),
  permiteFracionar: boolean("permite_fracionar").notNull().default(false),
  precoUnitarioFornecedor: numeric("preco_unitario_fornecedor", { precision: 15, scale: 4 }).notNull(),
  precoUnitarioNormalizado: numeric("preco_unitario_normalizado", { precision: 15, scale: 6 }),
  quantidadeCompraNormalizada: numeric("quantidade_compra_normalizada", { precision: 15, scale: 4 }),
  valorTotalLinha: numeric("valor_total_linha", { precision: 15, scale: 4 }).notNull(),
  impostoLinha: numeric("imposto_linha", { precision: 15, scale: 4 }).notNull().default("0"),
  freteRateado: numeric("frete_rateado", { precision: 15, scale: 4 }).notNull().default("0"),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  coberturaStatus: text("cobertura_status").notNull().default("ambigua"),
  reconciliacaoConfianca: numeric("reconciliacao_confianca", { precision: 5, scale: 2 }),
  selecionado: boolean("selecionado").notNull().default(false),
  motivoSelecao: text("motivo_selecao"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  propostaIdx: index("obra_cotacao_proposta_itens_proposta_idx").on(t.propostaId),
  cotacaoItemIdx: index("obra_cotacao_proposta_itens_cotacao_item_idx").on(t.cotacaoItemId),
}));

export const obraCotacaoSelecoesTable = pgTable("obra_cotacao_selecoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cotacaoItemId: text("cotacao_item_id").notNull().references(() => obraCotacaoItensTable.id, { onDelete: "cascade" }),
  propostaItemId: text("proposta_item_id").notNull().references(() => obraCotacaoPropostaItensTable.id, { onDelete: "cascade" }),
  quantidadeSelecionada: numeric("quantidade_selecionada", { precision: 15, scale: 4 }).notNull(),
  custoSelecionado: numeric("custo_selecionado", { precision: 15, scale: 4 }).notNull(),
  principal: boolean("principal").notNull().default(true),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cotacaoItemIdx: index("obra_cotacao_selecoes_item_idx").on(t.cotacaoItemId),
}));

export const insertObraCotacaoSchema = createInsertSchema(obraCotacoesTable, {
  status: z.enum(COTACAO_STATUS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraCotacaoItemSchema = createInsertSchema(obraCotacaoItensTable, {
  quantidadeTecnica: decimalOptional,
  quantidadeCompra: decimalOptional,
  quantidadeMinimaCompra: decimalOptional,
  multiploCompra: decimalOptional,
  fatorCompraParaConsumo: decimalOptional,
  coberturaStatus: z.enum(COTACAO_COBERTURA_STATUS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraCotacaoPropostaSchema = createInsertSchema(obraCotacaoPropostasTable, {
  freteValor: decimalOptional,
  impostosValor: decimalOptional,
  descontoValor: decimalOptional,
  valorTotalInformado: decimalOptional,
  extracaoConfianca: decimalOptional,
  origemFormato: z.enum(COTACAO_FORMATOS_ORIGEM),
  status: z.enum(COTACAO_PROPOSTA_STATUS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraCotacaoPropostaItemSchema = createInsertSchema(obraCotacaoPropostaItensTable, {
  quantidadeOfertada: decimalOptional,
  embalagemQuantidade: decimalOptional,
  quantidadeMinimaCompra: decimalOptional,
  multiploCompra: decimalOptional,
  precoUnitarioFornecedor: decimalOptional,
  precoUnitarioNormalizado: decimalOptional,
  quantidadeCompraNormalizada: decimalOptional,
  valorTotalLinha: decimalOptional,
  impostoLinha: decimalOptional,
  freteRateado: decimalOptional,
  reconciliacaoConfianca: decimalOptional,
  coberturaStatus: z.enum(COTACAO_COBERTURA_STATUS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraCotacaoSelecaoSchema = createInsertSchema(obraCotacaoSelecoesTable, {
  quantidadeSelecionada: decimalOptional,
  custoSelecionado: decimalOptional,
}).omit({ id: true, createdAt: true });
