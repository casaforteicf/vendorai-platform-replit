import { pgTable, text, timestamp, numeric, boolean, jsonb, index } from "drizzle-orm/pg-core";
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
