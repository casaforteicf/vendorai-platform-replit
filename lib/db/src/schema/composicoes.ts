import { pgTable, text, timestamp, numeric, boolean, integer, index } from "drizzle-orm/pg-core";
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
  etapaKey: z.enum(COMPOSICAO_ETAPA_KEYS).nullable().optional(),
  sistemasConstrutivos: z.array(z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS)).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateComposicaoSchema = createSelectSchema(composicoesTable, {
  custoTotal: decimalOptional,
  produtividadeDia: decimalOptional,
  horasDiaPadrao: decimalOptional,
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
