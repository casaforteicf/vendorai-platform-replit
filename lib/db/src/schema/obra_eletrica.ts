import { pgTable, text, timestamp, numeric, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable } from "./obras";
import { obraAmbientesTable, obraElementosTable } from "./obra_superficies";
import { composicoesTable } from "./composicoes";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const ELETRICA_PONTO_TIPOS = [
  "iluminacao",
  "tomada",
  "tomada_dedicada",
  "interruptor",
  "sensor",
  "campainha",
  "interfone",
  "cftv",
  "dados",
  "tv",
  "automacao",
  "outro",
] as const;

export const ELETRICA_REDE_TIPOS = [
  "circuito",
  "alimentador",
  "quadro",
  "aterramento",
  "spda",
  "dados",
  "automacao",
] as const;

export const obraEletricaPontosTable = pgTable("obra_eletrica_pontos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  elementoId: text("elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  tipo: text("tipo").notNull(),
  descricao: text("descricao"),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  potenciaW: numeric("potencia_w", { precision: 15, scale: 4 }),
  tensaoV: numeric("tensao_v", { precision: 10, scale: 2 }),
  fases: integer("fases"),
  circuitoId: text("circuito_id"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  incluiInfraestruturaAteCaixa: boolean("inclui_infraestrutura_ate_caixa").notNull().default(true),
  incluiDispositivoFinal: boolean("inclui_dispositivo_final").notNull().default(true),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_eletrica_pontos_obra_tipo_idx").on(t.obraId, t.tipo),
  ambienteIdx: index("obra_eletrica_pontos_ambiente_idx").on(t.ambienteId),
}));

export const obraEletricaCircuitosTable = pgTable("obra_eletrica_circuitos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  tipo: text("tipo").notNull().default("circuito"),
  quadroCodigo: text("quadro_codigo"),
  descricao: text("descricao"),
  tensaoV: numeric("tensao_v", { precision: 10, scale: 2 }),
  fases: integer("fases"),
  potenciaInstaladaW: numeric("potencia_instalada_w", { precision: 15, scale: 4 }),
  demandaW: numeric("demanda_w", { precision: 15, scale: 4 }),
  correnteA: numeric("corrente_a", { precision: 15, scale: 4 }),
  disjuntorA: numeric("disjuntor_a", { precision: 15, scale: 4 }),
  secaoCondutorMm2: numeric("secao_condutor_mm2", { precision: 15, scale: 4 }),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  eletrodutoMm: numeric("eletroduto_mm", { precision: 15, scale: 4 }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraCodigoIdx: index("obra_eletrica_circuitos_obra_codigo_idx").on(t.obraId, t.codigo),
}));

export const obraEletricaQuadrosTable = pgTable("obra_eletrica_quadros", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  codigo: text("codigo").notNull(),
  descricao: text("descricao"),
  tipo: text("tipo").notNull().default("distribuicao"),
  tensaoV: numeric("tensao_v", { precision: 10, scale: 2 }),
  fases: integer("fases"),
  correnteNominalA: numeric("corrente_nominal_a", { precision: 15, scale: 4 }),
  quantidadeDisjuntores: integer("quantidade_disjuntores"),
  drObrigatorio: boolean("dr_obrigatorio").notNull().default(false),
  dpsObrigatorio: boolean("dps_obrigatorio").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraEletricaRedesEspeciaisTable = pgTable("obra_eletrica_redes_especiais", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  codigo: text("codigo"),
  descricao: text("descricao"),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  quantidadePontos: numeric("quantidade_pontos", { precision: 15, scale: 4 }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraEletricaPontoSchema = createInsertSchema(obraEletricaPontosTable, {
  tipo: z.enum(ELETRICA_PONTO_TIPOS),
  quantidade: decimalOptional,
  potenciaW: decimalOptional,
  tensaoV: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraEletricaCircuitoSchema = createInsertSchema(obraEletricaCircuitosTable, {
  tipo: z.enum(ELETRICA_REDE_TIPOS),
  tensaoV: decimalOptional,
  potenciaInstaladaW: decimalOptional,
  demandaW: decimalOptional,
  correnteA: decimalOptional,
  disjuntorA: decimalOptional,
  secaoCondutorMm2: decimalOptional,
  comprimentoM: decimalOptional,
  eletrodutoMm: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraEletricaQuadroSchema = createInsertSchema(obraEletricaQuadrosTable, {
  tensaoV: decimalOptional,
  correnteNominalA: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraEletricaRedeEspecialSchema = createInsertSchema(obraEletricaRedesEspeciaisTable, {
  tipo: z.enum(ELETRICA_REDE_TIPOS),
  comprimentoM: decimalOptional,
  quantidadePontos: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ObraEletricaPonto = typeof obraEletricaPontosTable.$inferSelect;
export type ObraEletricaCircuito = typeof obraEletricaCircuitosTable.$inferSelect;
export type ObraEletricaQuadro = typeof obraEletricaQuadrosTable.$inferSelect;
export type ObraEletricaRedeEspecial = typeof obraEletricaRedesEspeciaisTable.$inferSelect;


export const ENERGIA_SISTEMA_TIPOS = [
  "fotovoltaico_on_grid",
  "fotovoltaico_hibrido",
  "off_grid",
  "banco_baterias",
  "carregador_ve",
  "gerador",
  "nobreak_ups",
  "quadro_cargas_essenciais",
  "chave_transferencia",
  "gestao_energia",
] as const;

export const ENERGIA_COMPONENTE_TIPOS = [
  "infraestrutura",
  "equipamento",
  "protecao",
  "armazenamento",
  "geracao",
  "conversao",
  "controle",
  "medicao",
  "estrutura_fixacao",
  "aterramento",
] as const;

export const obraEnergiaSistemasTable = pgTable("obra_energia_sistemas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  codigo: text("codigo"),
  nome: text("nome"),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  energiaKwh: numeric("energia_kwh", { precision: 15, scale: 4 }),
  tensaoV: numeric("tensao_v", { precision: 10, scale: 2 }),
  fases: integer("fases"),
  autonomiaHoras: numeric("autonomia_horas", { precision: 10, scale: 2 }),
  potenciaPicoKw: numeric("potencia_pico_kw", { precision: 15, scale: 4 }),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_energia_sistemas_obra_tipo_idx").on(t.obraId, t.tipo),
}));

export const obraEnergiaComponentesTable = pgTable("obra_energia_componentes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sistemaId: text("sistema_id").notNull().references(() => obraEnergiaSistemasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  slotKey: text("slot_key").notNull(),
  nome: text("nome").notNull(),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  unidade: text("unidade").notNull().default("un"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  circuitoId: text("circuito_id").references(() => obraEletricaCircuitosTable.id, { onDelete: "set null" }),
  incluiInfraestrutura: boolean("inclui_infraestrutura").notNull().default(false),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  sistemaSlotIdx: index("obra_energia_componentes_sistema_slot_idx").on(t.sistemaId, t.slotKey),
}));

export const insertObraEnergiaSistemaSchema = createInsertSchema(obraEnergiaSistemasTable, {
  tipo: z.enum(ENERGIA_SISTEMA_TIPOS),
  potenciaKw: decimalOptional,
  energiaKwh: decimalOptional,
  tensaoV: decimalOptional,
  autonomiaHoras: decimalOptional,
  potenciaPicoKw: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraEnergiaComponenteSchema = createInsertSchema(obraEnergiaComponentesTable, {
  tipo: z.enum(ENERGIA_COMPONENTE_TIPOS),
  quantidade: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ObraEnergiaSistema = typeof obraEnergiaSistemasTable.$inferSelect;
export type ObraEnergiaComponente = typeof obraEnergiaComponentesTable.$inferSelect;
