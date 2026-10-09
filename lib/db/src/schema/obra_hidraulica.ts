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


export const HIDRAULICA_AREA_TECNICA_TIPOS = [
  "central_hidraulica",
  "casa_maquinas",
  "shaft",
  "abrigo_externo",
  "reservatorio",
  "central_aquecimento",
  "central_pressurizacao",
  "central_reuso",
  "outro",
] as const;

export const HIDRAULICA_GERACAO_AGUA_QUENTE = [
  "eletrico",
  "gas",
  "solar_termico",
  "bomba_calor",
  "boiler_eletrico",
  "boiler_solar",
  "hibrido",
  "instantaneo",
  "outro",
] as const;

export const HIDRAULICA_RESERVATORIO_TIPOS = [
  "agua_fria",
  "agua_quente",
  "reuso",
  "pluvial",
  "expansao",
  "compensacao",
] as const;

export const obraHidraulicaAreasTecnicasTable = pgTable("obra_hidraulica_areas_tecnicas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("central_hidraulica"),
  larguraM: numeric("largura_m", { precision: 10, scale: 4 }),
  profundidadeM: numeric("profundidade_m", { precision: 10, scale: 4 }),
  alturaM: numeric("altura_m", { precision: 10, scale: 4 }),
  ventilacaoObrigatoria: boolean("ventilacao_obrigatoria").notNull().default(false),
  drenoObrigatorio: boolean("dreno_obrigatorio").notNull().default(false),
  pontoEletricoObrigatorio: boolean("ponto_eletrico_obrigatorio").notNull().default(false),
  pontoGasObrigatorio: boolean("ponto_gas_obrigatorio").notNull().default(false),
  acessoManutencao: boolean("acesso_manutencao").notNull().default(true),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_hidraulica_areas_tecnicas_obra_tipo_idx").on(t.obraId, t.tipo),
}));

export const obraHidraulicaManifoldsTable = pgTable("obra_hidraulica_manifolds", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  areaTecnicaId: text("area_tecnica_id").references(() => obraHidraulicaAreasTecnicasTable.id, { onDelete: "set null" }),
  redeId: text("rede_id").references(() => obraHidraulicaRedesTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  funcao: text("funcao").notNull(),
  tecnologia: text("tecnologia").notNull(),
  numeroSaidas: integer("numero_saidas").notNull().default(1),
  diametroEntradaMm: numeric("diametro_entrada_mm", { precision: 10, scale: 2 }),
  diametroSaidasMm: numeric("diametro_saidas_mm", { precision: 10, scale: 2 }),
  registrosIndividuais: boolean("registros_individuais").notNull().default(true),
  identificacaoCircuitos: boolean("identificacao_circuitos").notNull().default(true),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraHidraulicaAquecimentoTable = pgTable("obra_hidraulica_aquecimento", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  areaTecnicaId: text("area_tecnica_id").references(() => obraHidraulicaAreasTecnicasTable.id, { onDelete: "set null" }),
  tipoGeracao: text("tipo_geracao").notNull(),
  nome: text("nome").notNull(),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  volumeAcumulacaoL: numeric("volume_acumulacao_l", { precision: 15, scale: 4 }),
  temperaturaProjetoC: numeric("temperatura_projeto_c", { precision: 10, scale: 2 }),
  quantidadeUsuarios: integer("quantidade_usuarios"),
  demandaSimultaneaLMin: numeric("demanda_simultanea_l_min", { precision: 15, scale: 4 }),
  recirculacao: boolean("recirculacao").notNull().default(false),
  apoioEletrico: boolean("apoio_eletrico").notNull().default(false),
  apoioGas: boolean("apoio_gas").notNull().default(false),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraHidraulicaPressurizacaoTable = pgTable("obra_hidraulica_pressurizacao", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  areaTecnicaId: text("area_tecnica_id").references(() => obraHidraulicaAreasTecnicasTable.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull().default("pressurizador"),
  vazaoProjetoLMin: numeric("vazao_projeto_l_min", { precision: 15, scale: 4 }),
  pressaoProjetoMca: numeric("pressao_projeto_mca", { precision: 15, scale: 4 }),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  redundancia: text("redundancia"),
  vasoExpansaoL: numeric("vaso_expansao_l", { precision: 15, scale: 4 }),
  controlePressao: text("controle_pressao"),
  bypass: boolean("bypass").notNull().default(false),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraHidraulicaReservatoriosTable = pgTable("obra_hidraulica_reservatorios", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  areaTecnicaId: text("area_tecnica_id").references(() => obraHidraulicaAreasTecnicasTable.id, { onDelete: "set null" }),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  volumeL: numeric("volume_l", { precision: 15, scale: 4 }).notNull(),
  material: text("material"),
  enterrado: boolean("enterrado").notNull().default(false),
  superior: boolean("superior").notNull().default(false),
  reservaTecnicaL: numeric("reserva_tecnica_l", { precision: 15, scale: 4 }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraHidraulicaAreaTecnicaSchema = createInsertSchema(obraHidraulicaAreasTecnicasTable, {
  tipo: z.enum(HIDRAULICA_AREA_TECNICA_TIPOS),
  larguraM: decimalOptional,
  profundidadeM: decimalOptional,
  alturaM: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaManifoldSchema = createInsertSchema(obraHidraulicaManifoldsTable, {
  funcao: z.enum(HIDRAULICA_FUNCOES),
  tecnologia: z.enum(HIDRAULICA_TECNOLOGIAS),
  diametroEntradaMm: decimalOptional,
  diametroSaidasMm: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaAquecimentoSchema = createInsertSchema(obraHidraulicaAquecimentoTable, {
  tipoGeracao: z.enum(HIDRAULICA_GERACAO_AGUA_QUENTE),
  potenciaKw: decimalOptional,
  volumeAcumulacaoL: decimalOptional,
  temperaturaProjetoC: decimalOptional,
  demandaSimultaneaLMin: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaPressurizacaoSchema = createInsertSchema(obraHidraulicaPressurizacaoTable, {
  vazaoProjetoLMin: decimalOptional,
  pressaoProjetoMca: decimalOptional,
  potenciaKw: decimalOptional,
  vasoExpansaoL: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraHidraulicaReservatorioSchema = createInsertSchema(obraHidraulicaReservatoriosTable, {
  tipo: z.enum(HIDRAULICA_RESERVATORIO_TIPOS),
  volumeL: decimalOptional,
  reservaTecnicaL: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ObraHidraulicaAreaTecnica = typeof obraHidraulicaAreasTecnicasTable.$inferSelect;
export type ObraHidraulicaManifold = typeof obraHidraulicaManifoldsTable.$inferSelect;
export type ObraHidraulicaAquecimento = typeof obraHidraulicaAquecimentoTable.$inferSelect;
export type ObraHidraulicaPressurizacao = typeof obraHidraulicaPressurizacaoTable.$inferSelect;
export type ObraHidraulicaReservatorio = typeof obraHidraulicaReservatoriosTable.$inferSelect;
