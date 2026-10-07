import { pgTable, text, timestamp, numeric, boolean, jsonb, index, date } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { composicoesTable } from "./composicoes";
import { obraOrcamentoEtapasTable, obraOrcamentoItensTable } from "./obras";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const EQUIPAMENTO_ORIGENS = ["proprio", "locado", "terceirizado"] as const;
export const EQUIPAMENTO_UNIDADES_COBRANCA = [
  "h",
  "dia",
  "semana",
  "mes",
  "viagem",
  "mobilizacao",
  "fixo",
] as const;
export const EQUIPAMENTO_ESCOPO_TIPOS = ["composicao", "etapa_orcamento", "item_orcamento"] as const;

export const equipamentosRecursosTable = pgTable("equipamentos_recursos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  categoria: text("categoria"),
  origem: text("origem").notNull().default("locado"),
  unidadeCobranca: text("unidade_cobranca").notNull().default("dia"),
  valorUnitario: numeric("valor_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  mobilizacao: numeric("mobilizacao", { precision: 15, scale: 4 }).notNull().default("0"),
  desmobilizacao: numeric("desmobilizacao", { precision: 15, scale: 4 }).notNull().default("0"),
  transporte: numeric("transporte", { precision: 15, scale: 4 }).notNull().default("0"),
  operadorIncluso: boolean("operador_incluso").notNull().default(false),
  combustivelIncluso: boolean("combustivel_incluso").notNull().default(false),
  custoOperadorHora: numeric("custo_operador_hora", { precision: 15, scale: 4 }).notNull().default("0"),
  custoCombustivelHora: numeric("custo_combustivel_hora", { precision: 15, scale: 4 }).notNull().default("0"),
  custoManutencaoHora: numeric("custo_manutencao_hora", { precision: 15, scale: 4 }).notNull().default("0"),
  depreciacaoHora: numeric("depreciacao_hora", { precision: 15, scale: 4 }).notNull().default("0"),
  capacidade: text("capacidade"),
  especificacaoTecnica: jsonb("especificacao_tecnica").$type<Record<string, unknown> | null>(),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantAtivoIdx: index("equipamentos_recursos_tenant_ativo_idx").on(table.tenantId, table.ativo),
}));

export const equipamentosCoberturasTable = pgTable("equipamentos_coberturas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  escopoTipo: text("escopo_tipo").notNull(),
  slotKey: text("slot_key").notNull().default("principal"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "cascade" }),
  orcamentoEtapaId: text("orcamento_etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "cascade" }),
  orcamentoItemId: text("orcamento_item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "cascade" }),
  equipamentoId: text("equipamento_id").notNull().references(() => equipamentosRecursosTable.id, { onDelete: "restrict" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  unidadeCobranca: text("unidade_cobranca").notNull(),
  valorUnitario: numeric("valor_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  mobilizacao: numeric("mobilizacao", { precision: 15, scale: 4 }).notNull().default("0"),
  desmobilizacao: numeric("desmobilizacao", { precision: 15, scale: 4 }).notNull().default("0"),
  transporte: numeric("transporte", { precision: 15, scale: 4 }).notNull().default("0"),
  horasOperacao: numeric("horas_operacao", { precision: 15, scale: 4 }),
  custoTotal: numeric("custo_total", { precision: 15, scale: 4 }).notNull().default("0"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantEscopoIdx: index("equipamentos_coberturas_tenant_escopo_idx").on(table.tenantId, table.escopoTipo),
  composicaoIdx: index("equipamentos_coberturas_composicao_idx").on(table.composicaoId),
  etapaIdx: index("equipamentos_coberturas_etapa_idx").on(table.orcamentoEtapaId),
  itemIdx: index("equipamentos_coberturas_item_idx").on(table.orcamentoItemId),
}));

export const insertEquipamentoRecursoSchema = createInsertSchema(equipamentosRecursosTable, {
  origem: z.enum(EQUIPAMENTO_ORIGENS),
  unidadeCobranca: z.enum(EQUIPAMENTO_UNIDADES_COBRANCA),
  valorUnitario: decimalOptional,
  mobilizacao: decimalOptional,
  desmobilizacao: decimalOptional,
  transporte: decimalOptional,
  custoOperadorHora: decimalOptional,
  custoCombustivelHora: decimalOptional,
  custoManutencaoHora: decimalOptional,
  depreciacaoHora: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateEquipamentoRecursoSchema = createSelectSchema(equipamentosRecursosTable, {
  origem: z.enum(EQUIPAMENTO_ORIGENS).optional(),
  unidadeCobranca: z.enum(EQUIPAMENTO_UNIDADES_COBRANCA).optional(),
  valorUnitario: decimalOptional,
  mobilizacao: decimalOptional,
  desmobilizacao: decimalOptional,
  transporte: decimalOptional,
  custoOperadorHora: decimalOptional,
  custoCombustivelHora: decimalOptional,
  custoManutencaoHora: decimalOptional,
  depreciacaoHora: decimalOptional,
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertEquipamentoCoberturaSchema = createInsertSchema(equipamentosCoberturasTable, {
  escopoTipo: z.enum(EQUIPAMENTO_ESCOPO_TIPOS),
  unidadeCobranca: z.enum(EQUIPAMENTO_UNIDADES_COBRANCA),
  quantidade: decimalOptional,
  valorUnitario: decimalOptional,
  mobilizacao: decimalOptional,
  desmobilizacao: decimalOptional,
  transporte: decimalOptional,
  horasOperacao: decimalOptional,
  custoTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type EquipamentoRecurso = typeof equipamentosRecursosTable.$inferSelect;
export type EquipamentoCobertura = typeof equipamentosCoberturasTable.$inferSelect;


// ─── Serviços, subempreitadas e contratos ────────────────────────────────────

export const SERVICO_MODALIDADES = [
  "por_unidade",
  "valor_global",
  "mensal",
  "diaria",
  "hora_tecnica",
  "empreitada",
] as const;

export const SERVICO_STATUS_CONTRATO = [
  "rascunho",
  "cotacao",
  "contratado",
  "em_execucao",
  "suspenso",
  "concluido",
  "cancelado",
] as const;

export const SERVICO_ESCOPO_TIPOS = ["composicao", "etapa_orcamento", "item_orcamento"] as const;

export const servicosFornecedoresTable = pgTable("servicos_fornecedores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  documento: text("documento"),
  contatoNome: text("contato_nome"),
  telefone: text("telefone"),
  email: text("email"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantAtivoIdx: index("servicos_fornecedores_tenant_ativo_idx").on(table.tenantId, table.ativo),
}));

export const servicosContratosTable = pgTable("servicos_contratos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  fornecedorId: text("fornecedor_id").references(() => servicosFornecedoresTable.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  numeroContrato: text("numero_contrato"),
  modalidade: text("modalidade").notNull().default("valor_global"),
  unidade: text("unidade"),
  quantidadeContratada: numeric("quantidade_contratada", { precision: 15, scale: 4 }),
  valorUnitario: numeric("valor_unitario", { precision: 15, scale: 4 }),
  valorGlobal: numeric("valor_global", { precision: 15, scale: 4 }).notNull().default("0"),
  retencaoPercentual: numeric("retencao_percentual", { precision: 7, scale: 3 }).notNull().default("0"),
  adiantamentoValor: numeric("adiantamento_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  saldoContratual: numeric("saldo_contratual", { precision: 15, scale: 4 }).notNull().default("0"),
  dataInicio: date("data_inicio", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  status: text("status").notNull().default("rascunho"),
  escopoIncluido: jsonb("escopo_incluido").$type<string[]>().notNull().default([]),
  escopoNaoIncluido: jsonb("escopo_nao_incluido").$type<string[]>().notNull().default([]),
  condicoesPagamento: text("condicoes_pagamento"),
  garantia: text("garantia"),
  observacoes: text("observacoes"),
  documentos: jsonb("documentos").$type<Array<Record<string, unknown>>>().notNull().default([]),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantStatusIdx: index("servicos_contratos_tenant_status_idx").on(table.tenantId, table.status),
}));

export const servicosCoberturasTable = pgTable("servicos_coberturas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").references(() => servicosContratosTable.id, { onDelete: "set null" }),
  escopoTipo: text("escopo_tipo").notNull(),
  slotKey: text("slot_key").notNull().default("principal"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "cascade" }),
  orcamentoEtapaId: text("orcamento_etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "cascade" }),
  orcamentoItemId: text("orcamento_item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "cascade" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  unidade: text("unidade").notNull().default("un"),
  custoUnitario: numeric("custo_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  custoTotal: numeric("custo_total", { precision: 15, scale: 4 }).notNull().default("0"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const servicosMedicoesTable = pgTable("servicos_medicoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").notNull().references(() => servicosContratosTable.id, { onDelete: "cascade" }),
  numeroMedicao: numeric("numero_medicao", { precision: 10, scale: 0 }).notNull(),
  periodoInicio: date("periodo_inicio", { mode: "string" }),
  periodoFim: date("periodo_fim", { mode: "string" }),
  quantidadeMedida: numeric("quantidade_medida", { precision: 15, scale: 4 }),
  percentualMedido: numeric("percentual_medido", { precision: 7, scale: 3 }),
  valorBruto: numeric("valor_bruto", { precision: 15, scale: 4 }).notNull().default("0"),
  retencaoValor: numeric("retencao_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  descontosValor: numeric("descontos_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  acrescimosValor: numeric("acrescimos_valor", { precision: 15, scale: 4 }).notNull().default("0"),
  valorLiquido: numeric("valor_liquido", { precision: 15, scale: 4 }).notNull().default("0"),
  status: text("status").notNull().default("rascunho"),
  observacoes: text("observacoes"),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const servicosAditivosTable = pgTable("servicos_aditivos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  contratoId: text("contrato_id").notNull().references(() => servicosContratosTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("valor"),
  descricao: text("descricao").notNull(),
  valor: numeric("valor", { precision: 15, scale: 4 }).notNull().default("0"),
  prazoDias: numeric("prazo_dias", { precision: 10, scale: 0 }).notNull().default("0"),
  aprovado: boolean("aprovado").notNull().default(false),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServicoFornecedorSchema = createInsertSchema(servicosFornecedoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateServicoFornecedorSchema = createSelectSchema(servicosFornecedoresTable).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertServicoContratoSchema = createInsertSchema(servicosContratosTable, {
  modalidade: z.enum(SERVICO_MODALIDADES),
  status: z.enum(SERVICO_STATUS_CONTRATO).optional(),
  quantidadeContratada: decimalOptional,
  valorUnitario: decimalOptional,
  valorGlobal: decimalOptional,
  retencaoPercentual: decimalOptional,
  adiantamentoValor: decimalOptional,
  saldoContratual: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateServicoContratoSchema = createSelectSchema(servicosContratosTable, {
  modalidade: z.enum(SERVICO_MODALIDADES).optional(),
  status: z.enum(SERVICO_STATUS_CONTRATO).optional(),
  quantidadeContratada: decimalOptional,
  valorUnitario: decimalOptional,
  valorGlobal: decimalOptional,
  retencaoPercentual: decimalOptional,
  adiantamentoValor: decimalOptional,
  saldoContratual: decimalOptional,
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertServicoCoberturaSchema = createInsertSchema(servicosCoberturasTable, {
  escopoTipo: z.enum(SERVICO_ESCOPO_TIPOS),
  quantidade: decimalOptional,
  custoUnitario: decimalOptional,
  custoTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertServicoMedicaoSchema = createInsertSchema(servicosMedicoesTable, {
  numeroMedicao: decimalOptional,
  quantidadeMedida: decimalOptional,
  percentualMedido: decimalOptional,
  valorBruto: decimalOptional,
  retencaoValor: decimalOptional,
  descontosValor: decimalOptional,
  acrescimosValor: decimalOptional,
  valorLiquido: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertServicoAditivoSchema = createInsertSchema(servicosAditivosTable, {
  valor: decimalOptional,
  prazoDias: decimalOptional,
}).omit({ id: true, createdAt: true });

export type ServicoFornecedor = typeof servicosFornecedoresTable.$inferSelect;
export type ServicoContrato = typeof servicosContratosTable.$inferSelect;
export type ServicoCobertura = typeof servicosCoberturasTable.$inferSelect;
export type ServicoMedicao = typeof servicosMedicoesTable.$inferSelect;
export type ServicoAditivo = typeof servicosAditivosTable.$inferSelect;
