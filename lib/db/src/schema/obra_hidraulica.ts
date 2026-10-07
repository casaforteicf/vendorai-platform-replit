import { pgTable, text, timestamp, numeric, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable } from "./obras";
import { obraAmbientesTable, obraElementosTable } from "./obra_superficies";
import { composicoesTable } from "./composicoes";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const HIDRAULICA_FUNCOES = [
  "agua_fria",
  "agua_quente",
  "esgoto",
  "ventilacao",
  "pluvial",
  "drenagem",
  "reuso",
  "irrigacao",
  "piscina",
  "hidromassagem",
  "outro",
] as const;

export const HIDRAULICA_TECNOLOGIAS = [
  "pex",
  "ppr",
  "pvc",
  "cpvc",
  "aquatherm",
  "cobre",
  "multicamada",
  "pead",
  "ferro_fundido",
  "pp",
  "outro",
] as const;

export const HIDRAULICA_PONTO_TIPOS = [
  "ponto_agua_fria",
  "ponto_agua_quente",
  "ponto_esgoto",
  "ponto_ventilacao",
  "ralo",
  "caixa_sifonada",
  "caixa_gordura",
  "registro",
  "torneira",
  "chuveiro",
  "vaso_sanitario",
  "cuba",
  "tanque",
  "maquina_lavar",
  "lava_loucas",
  "ducha_higienica",
  "outro",
] as const;

export const HIDRAULICA_REDE_TIPOS = [
  "barrilete",
  "prumada",
  "ramal",
  "subramal",
  "coletor",
  "recirculacao",
  "rede_externa",
  "rede_enterrada",
  "rede_tecnica",
] as const;

export const obraHidraulicaRedesTable = pgTable("obra_hidraulica_redes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  funcao: text("funcao").notNull(),
  tipoRede: text("tipo_rede").notNull().default("ramal"),
  tecnologia: text("tecnologia").notNull(),
  configuracao: text("configuracao"),
  diametroMm: numeric("diametro_mm", { precision: 10, scale: 2 }),
  classePressao: text("classe_pressao"),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  vazaoLMin: numeric("vazao_l_min", { precision: 15, scale: 4 }),
  pressaoMca: numeric("pressao_mca", { precision: 15, scale: 4 }),
  isolamento: text("isolamento"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraFuncaoIdx: index("obra_hidraulica_redes_obra_funcao_idx").on(t.obraId, t.funcao),
  obraCodigoIdx: index("obra_hidraulica_redes_obra_codigo_idx").on(t.obraId, t.codigo),
}));

export const obraHidraulicaPontosTable = pgTable("obra_hidraulica_pontos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  elementoId: text("elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  tipo: text("tipo").notNull(),
  funcao: text("funcao").notNull(),
  redeId: text("rede_id").references(() => obraHidraulicaRedesTable.id, { onDelete: "set null" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  diametroMm: numeric("diametro_mm", { precision: 10, scale: 2 }),
  incluiLigacaoAteRede: boolean("inclui_ligacao_ate_rede").notNull().default(true),
  incluiAparelhoFinal: boolean("inclui_aparelho_final").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_hidraulica_pontos_obra_tipo_idx").on(t.obraId, t.tipo),
  ambienteIdx: index("obra_hidraulica_pontos_ambiente_idx").on(t.ambienteId),
}));

export const obraHidraulicaSegmentosTable = pgTable("obra_hidraulica_segmentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  redeId: text("rede_id").notNull().references(() => obraHidraulicaRedesTable.id, { onDelete: "cascade" }),
  codigo: text("codigo"),
  tecnologia: text("tecnologia"),
  diametroMm: numeric("diametro_mm", { precision: 10, scale: 2 }),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  origemElementoId: text("origem_elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  destinoElementoId: text("destino_elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraHidraulicaEquipamentosTable = pgTable("obra_hidraulica_equipamentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  funcao: text("funcao"),
  nome: text("nome").notNull(),
  vazaoLMin: numeric("vazao_l_min", { precision: 15, scale: 4 }),
  pressaoMca: numeric("pressao_mca", { precision: 15, scale: 4 }),
  volumeL: numeric("volume_l", { precision: 15, scale: 4 }),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraHidraulicaRedeSchema = createInsertSchema(obraHidraulicaRedesTable, {
  funcao: z.enum(HIDRAULICA_FUNCOES),
  tipoRede: z.enum(HIDRAULICA_REDE_TIPOS),
  tecnologia: z.enum(HIDRAULICA_TECNOLOGIAS),
  diametroMm: decimalOptional,
  comprimentoM: decimalOptional,
  vazaoLMin: decimalOptional,
  pressaoMca: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaPontoSchema = createInsertSchema(obraHidraulicaPontosTable, {
  tipo: z.enum(HIDRAULICA_PONTO_TIPOS),
  funcao: z.enum(HIDRAULICA_FUNCOES),
  quantidade: decimalOptional,
  diametroMm: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaSegmentoSchema = createInsertSchema(obraHidraulicaSegmentosTable, {
  tecnologia: z.enum(HIDRAULICA_TECNOLOGIAS).optional(),
  diametroMm: decimalOptional,
  comprimentoM: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaEquipamentoSchema = createInsertSchema(obraHidraulicaEquipamentosTable, {
  funcao: z.enum(HIDRAULICA_FUNCOES).optional(),
  vazaoLMin: decimalOptional,
  pressaoMca: decimalOptional,
  volumeL: decimalOptional,
  potenciaKw: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ObraHidraulicaRede = typeof obraHidraulicaRedesTable.$inferSelect;
export type ObraHidraulicaPonto = typeof obraHidraulicaPontosTable.$inferSelect;
export type ObraHidraulicaSegmento = typeof obraHidraulicaSegmentosTable.$inferSelect;
export type ObraHidraulicaEquipamento = typeof obraHidraulicaEquipamentosTable.$inferSelect;
