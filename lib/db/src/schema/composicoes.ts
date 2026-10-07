import { pgTable, text, timestamp, numeric, boolean, integer, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { insumosTable } from "./insumos";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

// ─── Composições ──────────────────────────────────────────────────────────────

export const COMPOSICAO_ETAPA_KEYS = [
  "pre_obra_projetos",
  "mobilizacao_canteiro",
  "terraplenagem_preparacao",
  "locacao_obra",
  "fundacoes",
  "infraestrutura_enterrada",
  "estrutura_principal",
  "sistema_construtivo_paredes",
  "cobertura",
  "impermeabilizacao",
  "esquadrias",
  "instalacoes_hidraulicas",
  "instalacoes_sanitarias",
  "instalacoes_pluviais",
  "instalacoes_eletricas",
  "dados_automacao_seguranca",
  "climatizacao_ventilacao",
  "energia_sistemas_especiais",
  "revestimento_bruto_interno",
  "revestimento_bruto_externo",
  "contrapisos_regularizacoes",
  "forros",
  "revestimentos_pisos",
  "revestimentos_paredes",
  "pintura_interna",
  "pintura_externa_fachadas",
  "loucas_metais",
  "marcenaria_mobiliario",
  "marmoraria",
  "serralheria",
  "iluminacao_acabamentos_eletricos",
  "piscina_lazer",
  "areas_externas",
  "paisagismo",
  "infraestrutura_externa",
  "equipamentos_especiais",
  "limpeza_acabamento_final",
  "testes_comissionamento",
  "vistoria_entrega",
  "pos_obra_assistencia",
  // Chaves legadas mantidas para compatibilidade com dados/telas existentes.
  "projetos_legalizacao",
  "preliminares",
  "terraplenagem",
  "estrutura",
  "lajes",
  "hidraulica",
  "eletrica",
  "revestimentos",
  "forros_pintura",
  "acabamentos",
  "solar_automacao",
  "limpeza_entrega",
] as const;

export const COMPOSICAO_TIPOS = [
  "elementar",
  "sistema",
  "interface",
  "mao_de_obra",
  "equipamento",
  "servico",
  "subempreitada",
] as const;

export const COMPOSICAO_STATUS_VERSAO = [
  "rascunho",
  "ativa",
  "arquivada",
] as const;

export const COMPOSICAO_SISTEMAS_CONSTRUTIVOS = [
  "icf",
  "alvenaria_convencional",
  "alvenaria_estrutural",
  "concreto_armado_vedacao",
  "parede_concreto",
  "steel_frame",
  "wood_frame",
  "pre_moldado_concreto",
  "estrutura_metalica_fechamento",
  "sip_paineis",
  "hibrido",
  // Identificadores legados mantidos para compatibilidade.
  "alvenaria",
  "madeira",
  "concreto",
  "outro",
] as const;

export const SISTEMA_REGRA_ACOES = [
  "manter",
  "substituir",
  "adicionar",
  "remover",
  "dimensionar_pelo_projeto",
] as const;

export const SISTEMA_ESCOPO_APLICACAO = [
  "parede_externa",
  "parede_interna",
  "estrutura",
  "fundacao",
  "cobertura",
  "fachada",
  "interface",
  "outro",
] as const;

export const sistemasConstrutivosTable = pgTable("sistemas_construtivos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  chave: text("chave").notNull(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  escoposAplicacao: text("escopos_aplicacao").array().notNull().default([]),
  parametrosPadrao: jsonb("parametros_padrao").$type<Record<string, unknown> | null>(),
  memorial: jsonb("memorial").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantChaveIdx: index("sistemas_construtivos_tenant_chave_idx").on(table.tenantId, table.chave),
  tenantAtivoIdx: index("sistemas_construtivos_tenant_ativo_idx").on(table.tenantId, table.ativo),
}));

export const sistemaVariantesTable = pgTable("sistema_variantes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sistemaId: text("sistema_id").notNull().references(() => sistemasConstrutivosTable.id, { onDelete: "cascade" }),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  criteriosAplicacao: jsonb("criterios_aplicacao").$type<Record<string, unknown> | null>(),
  memorial: jsonb("memorial").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const sistemaComposicaoRegrasTable = pgTable("sistema_composicao_regras", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sistemaId: text("sistema_id").notNull().references(() => sistemasConstrutivosTable.id, { onDelete: "cascade" }),
  varianteId: text("variante_id").references(() => sistemaVariantesTable.id, { onDelete: "cascade" }),
  slotKey: text("slot_key").notNull(),
  etapaKey: text("etapa_key"),
  acao: text("acao").notNull().default("manter"),
  composicaoId: text("composicao_id"),
  composicaoSubstituidaId: text("composicao_substituida_id"),
  obrigatoria: boolean("obrigatoria").notNull().default(false),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  condicao: jsonb("condicao").$type<Record<string, unknown> | null>(),
  observacoes: text("observacoes"),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  sistemaSlotIdx: index("sistema_composicao_regras_sistema_slot_idx").on(table.sistemaId, table.slotKey),
}));

export const sistemaInterfacesTable = pgTable("sistema_interfaces", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  chave: text("chave").notNull(),
  nome: text("nome").notNull(),
  sistemaOrigem: text("sistema_origem"),
  destinoTipo: text("destino_tipo"),
  composicaoId: text("composicao_id"),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  memorial: jsonb("memorial").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSistemaConstrutivoSchema = createInsertSchema(sistemasConstrutivosTable, {
  chave: z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS),
  escoposAplicacao: z.array(z.enum(SISTEMA_ESCOPO_APLICACAO)).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateSistemaConstrutivoSchema = createSelectSchema(sistemasConstrutivosTable, {
  chave: z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS).optional(),
  escoposAplicacao: z.array(z.enum(SISTEMA_ESCOPO_APLICACAO)).optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertSistemaVarianteSchema = createInsertSchema(sistemaVariantesTable).omit({ id: true, createdAt: true, updatedAt: true });

export const insertSistemaComposicaoRegraSchema = createInsertSchema(sistemaComposicaoRegrasTable, {
  etapaKey: z.enum(COMPOSICAO_ETAPA_KEYS).nullable().optional(),
  acao: z.enum(SISTEMA_REGRA_ACOES),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertSistemaInterfaceSchema = createInsertSchema(sistemaInterfacesTable).omit({ id: true, createdAt: true, updatedAt: true });

export const composicoesTable = pgTable("composicoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  unidade: text("unidade").notNull(),
  tipoComposicao: text("tipo_composicao").notNull().default("elementar"),
  // Memorial técnico para "Entender composição".
  aplicacao: text("aplicacao"),
  inclui: text("inclui"),
  naoInclui: text("nao_inclui"),
  criterioMedicao: text("criterio_medicao"),
  observacoesTecnicas: text("observacoes_tecnicas"),
  // Fórmula/parametrização estruturada; não executar expressão arbitrária.
  formulaCalculo: jsonb("formula_calculo").$type<Record<string, unknown> | null>(),
  parametrosPadrao: jsonb("parametros_padrao").$type<Record<string, unknown> | null>(),
  // Versionamento explícito da biblioteca.
  composicaoOrigemId: text("composicao_origem_id"),
  varianteDeId: text("variante_de_id"),
  versao: integer("versao").notNull().default(1),
  statusVersao: text("status_versao").notNull().default("ativa"),
  versaoAtual: boolean("versao_atual").notNull().default(true),
  custoTotal: numeric("custo_total", { precision: 15, scale: 4 }),
  produtividadeDia: numeric("produtividade_dia", { precision: 15, scale: 4 }),
  equipePadrao: integer("equipe_padrao").notNull().default(1),
  horasDiaPadrao: numeric("horas_dia_padrao", { precision: 5, scale: 2 }).notNull().default("8"),
  codigo: text("codigo"),
  etapaKey: text("etapa_key"),
  sistemasConstrutivos: text("sistemas_construtivos").array().notNull().default([]),
  comumTodosSistemas: boolean("comum_todos_sistemas").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantEtapaIdx: index("composicoes_tenant_etapa_idx").on(table.tenantId, table.etapaKey),
  tenantAtivoIdx: index("composicoes_tenant_ativo_idx").on(table.tenantId, table.ativo),
}));

export const insertComposicaoSchema = createInsertSchema(composicoesTable, {
  custoTotal: decimalOptional,
  produtividadeDia: decimalOptional,
  horasDiaPadrao: decimalOptional,
  tipoComposicao: z.enum(COMPOSICAO_TIPOS).optional(),
  statusVersao: z.enum(COMPOSICAO_STATUS_VERSAO).optional(),
  etapaKey: z.enum(COMPOSICAO_ETAPA_KEYS).nullable().optional(),
  sistemasConstrutivos: z.array(z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS)).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateComposicaoSchema = createSelectSchema(composicoesTable, {
  custoTotal: decimalOptional,
  produtividadeDia: decimalOptional,
  horasDiaPadrao: decimalOptional,
  tipoComposicao: z.enum(COMPOSICAO_TIPOS).optional(),
  statusVersao: z.enum(COMPOSICAO_STATUS_VERSAO).optional(),
  etapaKey: z.enum(COMPOSICAO_ETAPA_KEYS).nullable().optional(),
  sistemasConstrutivos: z.array(z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS)).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertComposicao = z.infer<typeof insertComposicaoSchema>;
export type UpdateComposicao = z.infer<typeof updateComposicaoSchema>;
export type Composicao = typeof composicoesTable.$inferSelect;

// ─── Composição → Insumos ─────────────────────────────────────────────────────

export const composicaoInsumosTable = pgTable("composicao_insumos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  composicaoId: text("composicao_id")
    .notNull()
    .references(() => composicoesTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull(),
  // Override opcional. Quando nulo, usa perdaPadraoPercentual do insumo.
  // Nunca somar perda padrão + override: o override substitui o padrão.
  perdaPercentualOverride: numeric("perda_percentual_override", { precision: 7, scale: 3 }),
  // Quantidade pode ser fixa ou derivada de parâmetros técnicos da composição.
  formulaQuantidade: jsonb("formula_quantidade").$type<Record<string, unknown> | null>(),
  condicaoAplicabilidade: jsonb("condicao_aplicabilidade").$type<Record<string, unknown> | null>(),
  observacaoTecnica: text("observacao_tecnica"),
  precoUnitario: numeric("preco_unitario", { precision: 15, scale: 4 }),
});

export const insertComposicaoInsumoSchema = createInsertSchema(composicaoInsumosTable, {
  quantidade: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal")),
  perdaPercentualOverride: decimalOptional,
  precoUnitario: decimalOptional,
}).omit({ id: true });

export type InsertComposicaoInsumo = z.infer<typeof insertComposicaoInsumoSchema>;
export type ComposicaoInsumo = typeof composicaoInsumosTable.$inferSelect;
