import { pgTable, text, timestamp, numeric, boolean, date, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { obrasTable, obraEtapasTable, obraOrcamentoEtapasTable, obraOrcamentoItensTable } from "./obras";
import { obraElementosTable, obraAmbientesTable } from "./obra_superficies";
import { composicoesTable } from "./composicoes";
import { insumosTable } from "./insumos";

const decimalOptional = z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^-?\d+(\.\d+)?$/, "Invalid decimal")).optional();

export const EXECUCAO_ATIVIDADE_STATUS = ["planejada","liberada","em_execucao","pausada","concluida","cancelada"] as const;
export const EXECUCAO_MEDICAO_ORIGENS = ["manual","diario_obra","checklist","arqdor","ifc_bim","levantamento_campo","importacao"] as const;

export const obraExecucaoAtividadesTable = pgTable("obra_execucao_atividades", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  etapaId: text("etapa_id").references(() => obraEtapasTable.id, { onDelete: "set null" }),
  orcamentoEtapaId: text("orcamento_etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "set null" }),
  orcamentoItemId: text("orcamento_item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "set null" }),
  elementoId: text("elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  unidade: text("unidade").notNull(),
  quantidadePlanejada: numeric("quantidade_planejada", { precision: 15, scale: 4 }).notNull(),
  quantidadeExecutada: numeric("quantidade_executada", { precision: 15, scale: 4 }).notNull().default("0"),
  percentualExecutado: numeric("percentual_executado", { precision: 9, scale: 4 }).notNull().default("0"),
  status: text("status").notNull().default("planejada"),
  inicioPrevisto: date("inicio_previsto", { mode: "string" }),
  fimPrevisto: date("fim_previsto", { mode: "string" }),
  inicioReal: timestamp("inicio_real", { withTimezone: true }),
  fimReal: timestamp("fim_real", { withTimezone: true }),
  custoPlanejado: numeric("custo_planejado", { precision: 15, scale: 4 }).notNull().default("0"),
  custoRealizado: numeric("custo_realizado", { precision: 15, scale: 4 }).notNull().default("0"),
  produtividadePlanejada: numeric("produtividade_planejada", { precision: 15, scale: 6 }),
  produtividadeReal: numeric("produtividade_real", { precision: 15, scale: 6 }),
  unidadeProdutividade: text("unidade_produtividade"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraStatusIdx: index("obra_execucao_atividades_obra_status_idx").on(t.obraId, t.status),
  orcItemIdx: index("obra_execucao_atividades_orc_item_idx").on(t.orcamentoItemId),
}));

export const obraExecucaoMedicoesTable = pgTable("obra_execucao_medicoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  atividadeId: text("atividade_id").notNull().references(() => obraExecucaoAtividadesTable.id, { onDelete: "cascade" }),
  dataMedicao: date("data_medicao", { mode: "string" }).notNull(),
  quantidadeExecutada: numeric("quantidade_executada", { precision: 15, scale: 4 }).notNull(),
  percentualInformado: numeric("percentual_informado", { precision: 9, scale: 4 }),
  origem: text("origem").notNull().default("manual"),
  origemRef: text("origem_ref"),
  qualidadeStatus: text("qualidade_status").notNull().default("pendente"),
  aprovado: boolean("aprovado").notNull().default(false),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em", { withTimezone: true }),
  observacoes: text("observacoes"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obraExecucaoConsumosTable = pgTable("obra_execucao_consumos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  atividadeId: text("atividade_id").notNull().references(() => obraExecucaoAtividadesTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id").references(() => insumosTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
  unidade: text("unidade").notNull(),
  custoUnitario: numeric("custo_unitario", { precision: 15, scale: 6 }).notNull(),
  custoTotal: numeric("custo_total", { precision: 15, scale: 4 }).notNull(),
  origemEstoque: boolean("origem_estoque").notNull().default(false),
  dataReferencia: date("data_referencia", { mode: "string" }).notNull(),
  perdaQuantidade: numeric("perda_quantidade", { precision: 15, scale: 4 }).notNull().default("0"),
  motivoPerda: text("motivo_perda"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraExecucaoAtividadeSchema = createInsertSchema(obraExecucaoAtividadesTable, {
  status: z.enum(EXECUCAO_ATIVIDADE_STATUS).optional(),
  quantidadePlanejada: decimalOptional,
  quantidadeExecutada: decimalOptional,
  percentualExecutado: decimalOptional,
  custoPlanejado: decimalOptional,
  custoRealizado: decimalOptional,
  produtividadePlanejada: decimalOptional,
  produtividadeReal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraExecucaoMedicaoSchema = createInsertSchema(obraExecucaoMedicoesTable, {
  origem: z.enum(EXECUCAO_MEDICAO_ORIGENS),
  quantidadeExecutada: decimalOptional,
  percentualInformado: decimalOptional,
}).omit({ id: true, createdAt: true });

export const insertObraExecucaoConsumoSchema = createInsertSchema(obraExecucaoConsumosTable, {
  quantidade: decimalOptional,
  custoUnitario: decimalOptional,
  custoTotal: decimalOptional,
  perdaQuantidade: decimalOptional,
}).omit({ id: true, createdAt: true });
