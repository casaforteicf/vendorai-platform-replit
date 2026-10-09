import { pgTable, text, timestamp, numeric, date, jsonb, uuid, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { obrasTable, obraEtapasTable } from "./obras";
import { usersTable } from "./users";
import { obraLancamentosTable } from "./obra_lancamentos";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

// ─── Insumos (central materials registry) ────────────────────────────────────

export const INSUMO_TIPOS = ["material", "mao_de_obra", "equipamento", "servico", "subempreitada", "consumivel", "frete", "outro_custo_direto"] as const;

export const insumosTable = pgTable("insumos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  // unidade legado continua representando a unidade técnica/consumo para
  // preservar compatibilidade. unidadeCompra e fatorCompraParaConsumo
  // permitem comprar em saco/caixa/barra/rolo/pallet etc.
  unidade: text("unidade").notNull(),
  unidadeCompra: text("unidade_compra"),
  fatorCompraParaConsumo: numeric("fator_compra_para_consumo", { precision: 15, scale: 6 }),
  embalagemQuantidade: numeric("embalagem_quantidade", { precision: 15, scale: 4 }),
  quantidadeMinimaCompra: numeric("quantidade_minima_compra", { precision: 15, scale: 4 }),
  multiploCompra: numeric("multiplo_compra", { precision: 15, scale: 4 }),
  permiteFracionarCompra: boolean("permite_fracionar_compra").notNull().default(false),
  perdaPadraoPercentual: numeric("perda_padrao_percentual", { precision: 7, scale: 3 }).notNull().default("0"),
  tipo: text("tipo").notNull().default("material"),
  precoUnitario: numeric("preco_unitario", { precision: 15, scale: 4 }),
  origemPreco: text("origem_preco").notNull().default("manual"),
  precoValidade: date("preco_validade", { mode: "string" }),
  precoAtualizadoEm: timestamp("preco_atualizado_em", { withTimezone: true }),
  regiaoPreco: text("regiao_preco"),
  fornecedorPreferencial: text("fornecedor_preferencial"),
  marca: text("marca"),
  modelo: text("modelo"),
  fabricante: text("fabricante"),
  especificacaoTecnica: jsonb("especificacao_tecnica").$type<Record<string, unknown> | null>(),
  categoria: text("categoria"),
  codigo: text("codigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInsumoSchema = createInsertSchema(insumosTable, {
  precoUnitario: decimalOptional,
  fatorCompraParaConsumo: decimalOptional,
  embalagemQuantidade: decimalOptional,
  quantidadeMinimaCompra: decimalOptional,
  multiploCompra: decimalOptional,
  perdaPadraoPercentual: decimalOptional,
  tipo: z.enum(INSUMO_TIPOS).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInsumoSchema = createSelectSchema(insumosTable, {
  precoUnitario: decimalOptional,
  fatorCompraParaConsumo: decimalOptional,
  embalagemQuantidade: decimalOptional,
  quantidadeMinimaCompra: decimalOptional,
  multiploCompra: decimalOptional,
  perdaPadraoPercentual: decimalOptional,
  tipo: z.enum(INSUMO_TIPOS).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertInsumo = z.infer<typeof insertInsumoSchema>;
export type UpdateInsumo = z.infer<typeof updateInsumoSchema>;
export type Insumo = typeof insumosTable.$inferSelect;

// ─── Estoque Central de Obras ─────────────────────────────────────────────────

export const estoqueCentralObrasTable = pgTable("estoque_central_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  quantidadeAtual: numeric("quantidade_atual", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 15, scale: 4 }).notNull().default("0"),
  localizacao: text("localizacao"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EstoqueCentralObra = typeof estoqueCentralObrasTable.$inferSelect;

export const insertEstoqueCentralObraSchema = createInsertSchema(estoqueCentralObrasTable, {
  quantidadeAtual: decimalOptional,
  quantidadeMinima: decimalOptional,
}).omit({ id: true, updatedAt: true });

// ─── Estoque por Obra ─────────────────────────────────────────────────────────

export const estoqueObrasTable = pgTable("estoque_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id")
    .notNull()
    .references(() => obrasTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  quantidadeAtual: numeric("quantidade_atual", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 15, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EstoqueObra = typeof estoqueObrasTable.$inferSelect;

export const insertEstoqueObraSchema = createInsertSchema(estoqueObrasTable, {
  quantidadeAtual: decimalOptional,
  quantidadeMinima: decimalOptional,
}).omit({ id: true, updatedAt: true });

// ─── Movimentações de Estoque ─────────────────────────────────────────────────

export const movimentacoesEstoqueObrasTable = pgTable("movimentacoes_estoque_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  tipo: text("tipo").notNull(),
  quantia: numeric("quantia", { precision: 15, scale: 4 }).notNull(),
  origemTipo: text("origem_tipo"),
  origemObraId: text("origem_obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  destinoTipo: text("destino_tipo"),
  destinoObraId: text("destino_obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MovimentacaoEstoqueObra = typeof movimentacoesEstoqueObrasTable.$inferSelect;

// ─── Compras por Obra ─────────────────────────────────────────────────────────

export const comprasObrasTable = pgTable("compras_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  insumoId: text("insumo_id").references(() => insumosTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  etapaId: text("etapa_id").references(() => obraEtapasTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  ambiente: text("ambiente"),
  disciplina: text("disciplina"),
  categoria: text("categoria"),
  fornecedor: text("fornecedor"),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }),
  unidade: text("unidade").notNull().default("un"),
  valorUnitario: numeric("valor_unitario", { precision: 15, scale: 4 }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }),
  prioridade: text("prioridade").notNull().default("media"),
  status: text("status").notNull().default("pendente"),
  dataPrevista: text("data_prevista"),
  dataEfetuada: text("data_efetuada"),
  dataNecessidade: date("data_necessidade", { mode: "string" }),
  prazoFornecedorDias: integer("prazo_fornecedor_dias").notNull().default(0),
  solicitanteId: text("solicitante_id"),
  solicitanteNome: text("solicitante_nome"),
  aprovadoPorId: text("aprovado_por_id"),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  cotacaoSelecionadaId: uuid("cotacao_selecionada_id"),
  pedidoFornecedorId: uuid("pedido_fornecedor_id"),
  lancamentoFinanceiroId: text("lancamento_financeiro_id").references(() => obraLancamentosTable.id, { onDelete: "set null" }),
  origem: text("origem").notNull().default("manual"),
  budgetId: uuid("budget_id"),
  budgetItemId: uuid("budget_item_id"),
  specObjectId: uuid("spec_object_id"),
  escopoVersao: integer("escopo_versao").notNull().default(1),
  escopoHash: text("escopo_hash"),
  escopoSnapshot: jsonb("escopo_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  valorVendaSnapshot: numeric("valor_venda_snapshot", { precision: 15, scale: 2 }).notNull().default("0"),
  custoEstimadoSnapshot: numeric("custo_estimado_snapshot", { precision: 15, scale: 2 }).notNull().default("0"),
  custoConfirmado: numeric("custo_confirmado", { precision: 15, scale: 2 }),
  cotacaoDesatualizada: boolean("cotacao_desatualizada").notNull().default(false),
  documentos: jsonb("documentos").$type<Array<Record<string, unknown>>>().notNull().default([]),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompraObraSchema = createInsertSchema(comprasObrasTable, {
  quantidade: decimalOptional,
  valorUnitario: decimalOptional,
  valorTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCompraObraSchema = createSelectSchema(comprasObrasTable, {
  quantidade: decimalOptional,
  valorUnitario: decimalOptional,
  valorTotal: decimalOptional,
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCompraObra = z.infer<typeof insertCompraObraSchema>;
export type UpdateCompraObra = z.infer<typeof updateCompraObraSchema>;
export type CompraObra = typeof comprasObrasTable.$inferSelect;

// ─── Recebimentos de compras da obra ──────────────────────────────────────────

export const obraCompraRecebimentosTable = pgTable("obra_compra_recebimentos", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: text("tenant_id").notNull(),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  compraId: text("compra_id").notNull().references(() => comprasObrasTable.id, { onDelete: "cascade" }),
  supplierOrderId: uuid("supplier_order_id").notNull(),
  dataRecebimento: timestamp("data_recebimento", { withTimezone: true }).notNull().defaultNow(),
  quantidadeRecebida: numeric("quantidade_recebida", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeAprovada: numeric("quantidade_aprovada", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeRejeitada: numeric("quantidade_rejeitada", { precision: 15, scale: 4 }).notNull().default("0"),
  status: text("status").notNull().default("inspecao"),
  responsavelId: text("responsavel_id"),
  responsavelNome: text("responsavel_nome"),
  observacoes: text("observacoes"),
  fotos: jsonb("fotos").$type<Array<Record<string, unknown>>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ObraCompraRecebimento = typeof obraCompraRecebimentosTable.$inferSelect;

export const insertMovimentacaoEstoqueObraSchema = createInsertSchema(movimentacoesEstoqueObrasTable, {
  quantia: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal")),
  tipo: z.enum(["entrada", "saida", "alocacao", "devolucao", "transferencia"]),
}).omit({ id: true, createdAt: true });

export type InsertMovimentacaoEstoqueObra = z.infer<typeof insertMovimentacaoEstoqueObraSchema>;
