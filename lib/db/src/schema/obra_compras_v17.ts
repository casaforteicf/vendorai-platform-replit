import { pgTable, text, timestamp, numeric, boolean, integer, date, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { obrasTable } from "./obras";
import { fornecedoresTable } from "./solicitacoes_compra";
import { insumosTable } from "./insumos";
import { obraCotacoesTable, obraCotacaoPropostasTable, obraCotacaoPropostaItensTable, obraCotacaoSelecoesTable } from "./obra_cotacoes";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^-?\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const COMPRA_PEDIDO_STATUS = [
  "rascunho",
  "aprovado",
  "enviado",
  "parcialmente_recebido",
  "recebido",
  "cancelado",
] as const;

export const COMPRA_RECEBIMENTO_STATUS = [
  "inspecao",
  "aprovado",
  "parcial",
  "rejeitado",
] as const;

export const obraPedidosCompraTable = pgTable("obra_pedidos_compra", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  cotacaoId: text("cotacao_id").references(() => obraCotacoesTable.id, { onDelete: "set null" }),
  propostaId: text("proposta_id").references(() => obraCotacaoPropostasTable.id, { onDelete: "set null" }),
  fornecedorId: text("fornecedor_id").references(() => fornecedoresTable.id, { onDelete: "set null" }),
  fornecedorNomeSnapshot: text("fornecedor_nome_snapshot").notNull(),
  numeroPedido: text("numero_pedido"),
  status: text("status").notNull().default("rascunho"),
  dataPedido: date("data_pedido", { mode: "string" }),
  dataNecessidade: date("data_necessidade", { mode: "string" }),
  dataPrevistaEntrega: date("data_prevista_entrega", { mode: "string" }),
  prazoFornecedorDias: integer("prazo_fornecedor_dias").notNull().default(0),
  bufferLogisticoDias: integer("buffer_logistico_dias").notNull().default(0),
  dataLimiteCompra: date("data_limite_compra", { mode: "string" }),
  condicaoPagamento: text("condicao_pagamento"),
  freteValor: numeric("frete_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  impostosValor: numeric("impostos_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  descontoValor: numeric("desconto_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  valorItens: numeric("valor_itens", { precision: 15, scale: 4 }).notNull().default("0"),
  valorTotal: numeric("valor_total", { precision: 15, scale: 4 }).notNull().default("0"),
  observacoes: text("observacoes"),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantObraIdx: index("obra_pedidos_compra_tenant_obra_idx").on(t.tenantId, t.obraId),
  fornecedorStatusIdx: index("obra_pedidos_compra_fornecedor_status_idx").on(t.fornecedorId, t.status),
}));

export const obraPedidoCompraItensTable = pgTable("obra_pedido_compra_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => obraPedidosCompraTable.id, { onDelete: "cascade" }),
  propostaItemId: text("proposta_item_id").references(() => obraCotacaoPropostaItensTable.id, { onDelete: "set null" }),
  selecaoId: text("selecao_id").references(() => obraCotacaoSelecoesTable.id, { onDelete: "set null" }),
  insumoId: text("insumo_id").references(() => insumosTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  codigoFornecedor: text("codigo_fornecedor"),
  marca: text("marca"),
  modelo: text("modelo"),
  quantidadePedida: numeric("quantidade_pedida", { precision: 15, scale: 4 }).notNull(),
  unidadeCompra: text("unidade_compra").notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 15, scale: 6 }).notNull(),
  valorTotal: numeric("valor_total", { precision: 15, scale: 4 }).notNull(),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeAprovada: numeric("quantidade_aprovada", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeRejeitada: numeric("quantidade_rejeitada", { precision: 15, scale: 4 }).notNull().default("0"),
  saldoReceber: numeric("saldo_receber", { precision: 15, scale: 4 }).notNull(),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pedidoIdx: index("obra_pedido_compra_itens_pedido_idx").on(t.pedidoId),
  insumoIdx: index("obra_pedido_compra_itens_insumo_idx").on(t.insumoId),
}));

export const obraPedidoRecebimentosTable = pgTable("obra_pedido_recebimentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => obraPedidosCompraTable.id, { onDelete: "cascade" }),
  dataRecebimento: timestamp("data_recebimento", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("inspecao"),
  documentoNumero: text("documento_numero"),
  documentoUrl: text("documento_url"),
  transportadora: text("transportadora"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacoes: text("observacoes"),
  fotos: jsonb("fotos").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pedidoDataIdx: index("obra_pedido_recebimentos_pedido_data_idx").on(t.pedidoId, t.dataRecebimento),
}));

export const obraPedidoRecebimentoItensTable = pgTable("obra_pedido_recebimento_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  recebimentoId: text("recebimento_id").notNull().references(() => obraPedidoRecebimentosTable.id, { onDelete: "cascade" }),
  pedidoItemId: text("pedido_item_id").notNull().references(() => obraPedidoCompraItensTable.id, { onDelete: "cascade" }),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 15, scale: 4 }).notNull(),
  quantidadeAprovada: numeric("quantidade_aprovada", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeRejeitada: numeric("quantidade_rejeitada", { precision: 15, scale: 4 }).notNull().default("0"),
  motivoRejeicao: text("motivo_rejeicao"),
  lote: text("lote"),
  validade: date("validade", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obraPedidoDevolucoesTable = pgTable("obra_pedido_devolucoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  pedidoId: text("pedido_id").notNull().references(() => obraPedidosCompraTable.id, { onDelete: "cascade" }),
  pedidoItemId: text("pedido_item_id").notNull().references(() => obraPedidoCompraItensTable.id, { onDelete: "cascade" }),
  recebimentoItemId: text("recebimento_item_id").references(() => obraPedidoRecebimentoItensTable.id, { onDelete: "set null" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
  motivo: text("motivo").notNull(),
  status: text("status").notNull().default("solicitada"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  concluidaEm: timestamp("concluida_em", { withTimezone: true }),
});

export const insertObraPedidoCompraSchema = createInsertSchema(obraPedidosCompraTable, {
  status: z.enum(COMPRA_PEDIDO_STATUS).optional(),
  freteValor: decimalOptional,
  impostosValor: decimalOptional,
  descontoValor: decimalOptional,
  valorItens: decimalOptional,
  valorTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPedidoCompraItemSchema = createInsertSchema(obraPedidoCompraItensTable, {
  quantidadePedida: decimalOptional,
  precoUnitario: decimalOptional,
  valorTotal: decimalOptional,
  quantidadeRecebida: decimalOptional,
  quantidadeAprovada: decimalOptional,
  quantidadeRejeitada: decimalOptional,
  saldoReceber: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPedidoRecebimentoSchema = createInsertSchema(obraPedidoRecebimentosTable, {
  status: z.enum(COMPRA_RECEBIMENTO_STATUS).optional(),
}).omit({ id: true, createdAt: true });

export const insertObraPedidoRecebimentoItemSchema = createInsertSchema(obraPedidoRecebimentoItensTable, {
  quantidadeRecebida: decimalOptional,
  quantidadeAprovada: decimalOptional,
  quantidadeRejeitada: decimalOptional,
}).omit({ id: true, createdAt: true });

export const insertObraPedidoDevolucaoSchema = createInsertSchema(obraPedidoDevolucoesTable, {
  quantidade: decimalOptional,
}).omit({ id: true, createdAt: true });
