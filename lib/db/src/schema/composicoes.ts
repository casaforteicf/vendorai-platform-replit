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
