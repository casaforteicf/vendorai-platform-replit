import { pgTable, text, timestamp, numeric, integer, date, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export type ObraPortalConfig = {
  showOverview: boolean;
  showSchedule: boolean;
  showBudget: boolean;
  showDiary: boolean;
  showDiaryPhotos: boolean;
  showFinancialSummary: boolean;
  showFinancialDetails: boolean;
  showClientDecisions: boolean;
  showMeasurements: boolean;
  showMilestones: boolean;
  showDocuments: boolean;
  showProcurementSummary: boolean;
  showProjectGallery: boolean;
  requireLogin: boolean;
  allowSelfRegistration: boolean;
  showExecutiveBalance: boolean;
  showProposals: boolean;
  showContracts: boolean;
  showInvoices: boolean;
  showManuals: boolean;
  showSupport: boolean;
  showChat: boolean;
  showBriefing: boolean;
  showAgenda: boolean;
  showSearch: boolean;
  showPostSale: boolean;
  showVendi: boolean;
  showBudgetItems: boolean;
  showBudgetQuantities: boolean;
  showBudgetUnitPrices: boolean;
  showBudgetStageTotals: boolean;
};

export const DEFAULT_OBRA_PORTAL_CONFIG: ObraPortalConfig = {
  showOverview: true,
  showSchedule: true,
  showBudget: true,
  showDiary: true,
  showDiaryPhotos: true,
  showFinancialSummary: false,
  showFinancialDetails: false,
  showClientDecisions: true,
  showMeasurements: true,
  showMilestones: true,
  showDocuments: true,
  showProcurementSummary: true,
  showProjectGallery: true,
  requireLogin: false,
  allowSelfRegistration: true,
  showExecutiveBalance: true,
  showProposals: true,
  showContracts: false,
  showInvoices: false,
  showManuals: true,
  showSupport: true,
  showChat: true,
  showBriefing: true,
  showAgenda: true,
  showSearch: true,
  showPostSale: true,
  showVendi: true,
  showBudgetItems: true,
  showBudgetQuantities: true,
  showBudgetUnitPrices: false,
  showBudgetStageTotals: true,
};

export const obrasTable = pgTable("obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  // Proposta contratada que originou a obra. Mantém o vínculo canônico sem
  // depender de nome/cliente e torna o provisionamento idempotente.
  propostaOrigemId: text("proposta_origem_id").unique(),
  // Deal/lead permitem que revisões e aditivos aceitos encontrem a mesma obra.
  dealOrigemId: text("deal_origem_id").unique(),
  leadOrigemId: text("lead_origem_id"),
  clienteNome: text("cliente_nome"),
  clienteContato: text("cliente_contato"),
  endereco: text("endereco"),
  status: text("status").notNull().default("planejamento"),
  dataInicio: date("data_inicio", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  dataFimReal: date("data_fim_real", { mode: "string" }),
  orcamentoTotal: numeric("orcamento_total", { precision: 15, scale: 2 }),
  custoRealizado: numeric("custo_realizado", { precision: 15, scale: 2 }).notNull().default("0"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  linkCliente: text("link_cliente"),
  portalToken: text("portal_token").unique().$defaultFn(() => crypto.randomUUID()),
  portalConfig: jsonb("portal_config").$type<ObraPortalConfig>().notNull().default(DEFAULT_OBRA_PORTAL_CONFIG),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const insertObraSchema = createInsertSchema(obrasTable, {
  orcamentoTotal: decimalOptional,
  custoRealizado: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraSchema = createSelectSchema(obrasTable, {
  orcamentoTotal: decimalOptional,
  custoRealizado: decimalOptional,
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObra = z.infer<typeof insertObraSchema>;
export type UpdateObra = z.infer<typeof updateObraSchema>;
export type Obra = typeof obrasTable.$inferSelect;

export const obraEtapasTable = pgTable("obra_etapas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  // ID da etapa no orçamento/proposta contratada. Permite que diário,
  // compras, medições e financeiro apontem para a mesma etapa de origem.
  origemEtapaId: text("origem_etapa_id"),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  ordem: integer("ordem").notNull().default(0),
  dataInicioPrevista: date("data_inicio_prevista", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  dataInicioReal: date("data_inicio_real", { mode: "string" }),
  dataFimReal: date("data_fim_real", { mode: "string" }),
  status: text("status").notNull().default("pendente"),
  percentualExecutado: numeric("percentual_executado", { precision: 5, scale: 2 }).notNull().default("0"),
  responsavel: text("responsavel"),
  equipeNome: text("equipe_nome"),
  equipeQuantidade: integer("equipe_quantidade").notNull().default(1),
  horasDia: numeric("horas_dia", { precision: 5, scale: 2 }).notNull().default("8"),
  custoHoraPessoa: numeric("custo_hora_pessoa", { precision: 12, scale: 2 }).notNull().default("0"),
  produtividadeDia: numeric("produtividade_dia", { precision: 12, scale: 3 }).notNull().default("0"),
  custoPrevisto: numeric("custo_previsto", { precision: 15, scale: 2 }).notNull().default("0"),
  pesoFisico: numeric("peso_fisico", { precision: 7, scale: 4 }).notNull().default("0"),
  marco: boolean("marco").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraEtapaSchema = createInsertSchema(obraEtapasTable, {
  percentualExecutado: decimalOptional,
  horasDia: decimalOptional,
  custoHoraPessoa: decimalOptional,
  produtividadeDia: decimalOptional,
  custoPrevisto: decimalOptional,
  pesoFisico: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraEtapaSchema = createSelectSchema(obraEtapasTable, {
  percentualExecutado: decimalOptional,
  horasDia: decimalOptional,
  custoHoraPessoa: decimalOptional,
  produtividadeDia: decimalOptional,
  custoPrevisto: decimalOptional,
  pesoFisico: decimalOptional,
})
  .omit({ id: true, obraId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertObraEtapa = z.infer<typeof insertObraEtapaSchema>;
export type UpdateObraEtapa = z.infer<typeof updateObraEtapaSchema>;
export type ObraEtapa = typeof obraEtapasTable.$inferSelect;

export const obraEtapaDependenciasTable = pgTable("obra_etapa_dependencias", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  etapaId: text("etapa_id").notNull().references(() => obraEtapasTable.id, { onDelete: "cascade" }),
  dependeDeEtapaId: text("depende_de_etapa_id").notNull().references(() => obraEtapasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("FS"),
  defasagemDias: integer("defasagem_dias").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraEtapaDependenciaSchema = createInsertSchema(obraEtapaDependenciasTable).omit({ id: true, createdAt: true });
export type InsertObraEtapaDependencia = z.infer<typeof insertObraEtapaDependenciaSchema>;
export type ObraEtapaDependencia = typeof obraEtapaDependenciasTable.$inferSelect;

export const obraEtapaFasesTable = pgTable("obra_etapa_fases", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  etapaId: text("etapa_id").notNull().references(() => obraEtapasTable.id, { onDelete: "cascade" }),
  origemFaseId: text("origem_fase_id"),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull().default(0),
  dataInicioPrevista: date("data_inicio_prevista", { mode: "string" }),
  dataFimPrevista: date("data_fim_prevista", { mode: "string" }),
  dataInicioReal: date("data_inicio_real", { mode: "string" }),
  dataFimReal: date("data_fim_real", { mode: "string" }),
  status: text("status").notNull().default("pendente"),
  percentualEtapa: numeric("percentual_etapa", { precision: 7, scale: 4 }).notNull().default("0"),
  percentualExecutado: numeric("percentual_executado", { precision: 5, scale: 2 }).notNull().default("0"),
  custoPrevisto: numeric("custo_previsto", { precision: 15, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraEtapaFaseSchema = createInsertSchema(obraEtapaFasesTable, {
  percentualEtapa: decimalOptional,
  percentualExecutado: decimalOptional,
  custoPrevisto: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraEtapaFaseSchema = createSelectSchema(obraEtapaFasesTable, {
  percentualEtapa: decimalOptional,
  percentualExecutado: decimalOptional,
  custoPrevisto: decimalOptional,
}).omit({ id: true, obraId: true, etapaId: true, createdAt: true, updatedAt: true }).partial();

export type InsertObraEtapaFase = z.infer<typeof insertObraEtapaFaseSchema>;
export type UpdateObraEtapaFase = z.infer<typeof updateObraEtapaFaseSchema>;
export type ObraEtapaFase = typeof obraEtapaFasesTable.$inferSelect;

export const obraEtapaFaseDependenciasTable = pgTable("obra_etapa_fase_dependencias", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  faseId: text("fase_id").notNull().references(() => obraEtapaFasesTable.id, { onDelete: "cascade" }),
  dependeDeFaseId: text("depende_de_fase_id").notNull().references(() => obraEtapaFasesTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("FS"),
  defasagemDias: integer("defasagem_dias").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const obraEtapaMedicoesTable = pgTable("obra_etapa_medicoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  etapaId: text("etapa_id").notNull().references(() => obraEtapasTable.id, { onDelete: "cascade" }),
  data: date("data", { mode: "string" }).notNull(),
  percentualAnterior: numeric("percentual_anterior", { precision: 5, scale: 2 }).notNull().default("0"),
  percentualNovo: numeric("percentual_novo", { precision: 5, scale: 2 }).notNull(),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraEtapaMedicaoSchema = createInsertSchema(obraEtapaMedicoesTable, {
  percentualAnterior: decimalOptional,
  percentualNovo: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal")),
}).omit({ id: true, createdAt: true });

export type InsertObraEtapaMedicao = z.infer<typeof insertObraEtapaMedicaoSchema>;
export type ObraEtapaMedicao = typeof obraEtapaMedicoesTable.$inferSelect;

export const obraEtapaFaseMedicoesTable = pgTable("obra_etapa_fase_medicoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  faseId: text("fase_id").notNull().references(() => obraEtapaFasesTable.id, { onDelete: "cascade" }),
  data: date("data", { mode: "string" }).notNull(),
  percentualAnterior: numeric("percentual_anterior", { precision: 5, scale: 2 }).notNull().default("0"),
  percentualNovo: numeric("percentual_novo", { precision: 5, scale: 2 }).notNull(),
  valorBruto: numeric("valor_bruto", { precision: 15, scale: 2 }).notNull().default("0"),
  amortizacaoEntrada: numeric("amortizacao_entrada", { precision: 15, scale: 2 }).notNull().default("0"),
  valorLiquido: numeric("valor_liquido", { precision: 15, scale: 2 }).notNull().default("0"),
  saldoEntradaApos: numeric("saldo_entrada_apos", { precision: 15, scale: 2 }).notNull().default("0"),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObraEtapaFaseMedicaoSchema = createInsertSchema(obraEtapaFaseMedicoesTable, {
  percentualAnterior: decimalOptional,
  percentualNovo: decimalOptional,
  valorBruto: decimalOptional,
  amortizacaoEntrada: decimalOptional,
  valorLiquido: decimalOptional,
  saldoEntradaApos: decimalOptional,
}).omit({ id: true, createdAt: true });

export type InsertObraEtapaFaseMedicao = z.infer<typeof insertObraEtapaFaseMedicaoSchema>;
export type ObraEtapaFaseMedicao = typeof obraEtapaFaseMedicoesTable.$inferSelect;

export const obraOrcamentosTable = pgTable("obra_orcamentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  propostaOrigemId: text("proposta_origem_id").unique(),
  // Snapshot imutável da contratação. Revisões futuras geram nova versão em
  // vez de reescrever silenciosamente a linha de base aprovada.
  linhaBaseSnapshot: jsonb("linha_base_snapshot").$type<Record<string, unknown> | null>(),
  versao: integer("versao").notNull().default(1),
  titulo: text("titulo"),
  descricao: text("descricao"),
  status: text("status").notNull().default("rascunho"),
  bdiGlobal: numeric("bdi_global", { precision: 5, scale: 2 }).notNull().default("0"),
  tabelaPrecoId: text("tabela_preco_id"),
  precosDesatualizados: boolean("precos_desatualizados").notNull().default(false),
  precosAtualizadosEm: timestamp("precos_atualizados_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraOrcamentoSchema = createInsertSchema(obraOrcamentosTable, {
  bdiGlobal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraOrcamentoSchema = createSelectSchema(obraOrcamentosTable, {
  bdiGlobal: decimalOptional,
}).omit({ id: true, tenantId: true, obraId: true, createdAt: true, updatedAt: true }).partial();

export type InsertObraOrcamento = z.infer<typeof insertObraOrcamentoSchema>;
export type UpdateObraOrcamento = z.infer<typeof updateObraOrcamentoSchema>;
export type ObraOrcamento = typeof obraOrcamentosTable.$inferSelect;

export const obraOrcamentoEtapasTable = pgTable("obra_orcamento_etapas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  orcamentoId: text("orcamento_id").notNull().references(() => obraOrcamentosTable.id, { onDelete: "cascade" }),
  origemEtapaId: text("origem_etapa_id"),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraOrcamentoEtapaSchema = createInsertSchema(obraOrcamentoEtapasTable).omit({ id: true, createdAt: true, updatedAt: true });
export const updateObraOrcamentoEtapaSchema = createSelectSchema(obraOrcamentoEtapasTable).omit({ id: true, orcamentoId: true, createdAt: true, updatedAt: true }).partial();
export type InsertObraOrcamentoEtapa = z.infer<typeof insertObraOrcamentoEtapaSchema>;
export type UpdateObraOrcamentoEtapa = z.infer<typeof updateObraOrcamentoEtapaSchema>;
export type ObraOrcamentoEtapa = typeof obraOrcamentoEtapasTable.$inferSelect;

export const obraOrcamentoItensTable = pgTable("obra_orcamento_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  etapaId: text("etapa_id").notNull().references(() => obraOrcamentoEtapasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  unidade: text("unidade").notNull().default("un"),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  custoUnitario: numeric("custo_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  insumoId: text("insumo_id"),
  composicaoId: text("composicao_id"),
  origemPreco: text("origem_preco").notNull().default("manual"),
  precoAtualizadoEm: timestamp("preco_atualizado_em", { withTimezone: true }),
  bdi: numeric("bdi", { precision: 5, scale: 2 }),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraOrcamentoItemSchema = createInsertSchema(obraOrcamentoItensTable, {
  quantidade: decimalOptional,
  custoUnitario: decimalOptional,
  bdi: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateObraOrcamentoItemSchema = createSelectSchema(obraOrcamentoItensTable, {
  quantidade: decimalOptional,
  custoUnitario: decimalOptional,
  bdi: decimalOptional,
}).omit({ id: true, etapaId: true, createdAt: true, updatedAt: true }).partial();

export type InsertObraOrcamentoItem = z.infer<typeof insertObraOrcamentoItemSchema>;
export type UpdateObraOrcamentoItem = z.infer<typeof updateObraOrcamentoItemSchema>;
export type ObraOrcamentoItem = typeof obraOrcamentoItensTable.$inferSelect;
