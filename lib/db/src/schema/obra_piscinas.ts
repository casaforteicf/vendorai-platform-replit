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

export const PISCINA_TIPOS = [
  "convencional",
  "borda_infinita",
  "overflow",
  "praia",
  "spa",
  "hidromassagem",
  "infantil",
  "raia",
  "espelho_dagua",
  "outro",
] as const;

export const PISCINA_ESTRUTURAS = [
  "concreto_armado",
  "alvenaria_estrutural",
  "fibra",
  "vinil",
  "aco_inox",
  "outro",
] as const;

export const PISCINA_CIRCUITO_TIPOS = [
  "filtracao",
  "aspiracao",
  "retorno",
  "dreno_fundo",
  "cascata",
  "hidromassagem",
  "borda_infinita",
  "overflow",
  "aquecimento",
  "tratamento",
  "recalque",
  "outro",
] as const;

export const PISCINA_TRATAMENTOS = [
  "cloro_manual",
  "dosador_cloro",
  "gerador_cloro_sal",
  "ozonio",
  "uv",
  "ionizador",
  "automatico",
  "outro",
] as const;

export const obraPiscinasTable = pgTable("obra_piscinas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  elementoId: text("elemento_id").references(() => obraElementosTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  nome: text("nome").notNull(),
  tipo: text("tipo").notNull(),
  estrutura: text("estrutura").notNull(),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  larguraM: numeric("largura_m", { precision: 15, scale: 4 }),
  profundidadeMinM: numeric("profundidade_min_m", { precision: 15, scale: 4 }),
  profundidadeMaxM: numeric("profundidade_max_m", { precision: 15, scale: 4 }),
  areaEspelhoM2: numeric("area_espelho_m2", { precision: 15, scale: 4 }),
  volumeM3: numeric("volume_m3", { precision: 15, scale: 4 }),
  areaRevestimentoM2: numeric("area_revestimento_m2", { precision: 15, scale: 4 }),
  perimetroM: numeric("perimetro_m", { precision: 15, scale: 4 }),
  impermeabilizacaoTipo: text("impermeabilizacao_tipo"),
  revestimentoTipo: text("revestimento_tipo"),
  composicaoEstruturaId: text("composicao_estrutura_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  composicaoImpermeabilizacaoId: text("composicao_impermeabilizacao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  composicaoRevestimentoId: text("composicao_revestimento_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_piscinas_obra_tipo_idx").on(t.obraId, t.tipo),
}));

export const obraPiscinaCasasMaquinasTable = pgTable("obra_piscina_casas_maquinas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  distanciaPiscinaM: numeric("distancia_piscina_m", { precision: 15, scale: 4 }),
  desnívelM: numeric("desnivel_m", { precision: 15, scale: 4 }),
  ventilacaoObrigatoria: boolean("ventilacao_obrigatoria").notNull().default(true),
  drenoObrigatorio: boolean("dreno_obrigatorio").notNull().default(true),
  pontoEletricoObrigatorio: boolean("ponto_eletrico_obrigatorio").notNull().default(true),
  acessoManutencao: boolean("acesso_manutencao").notNull().default(true),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraPiscinaCircuitosTable = pgTable("obra_piscina_circuitos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  casaMaquinasId: text("casa_maquinas_id").references(() => obraPiscinaCasasMaquinasTable.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  tipo: text("tipo").notNull(),
  diametroMm: numeric("diametro_mm", { precision: 10, scale: 2 }),
  comprimentoM: numeric("comprimento_m", { precision: 15, scale: 4 }),
  vazaoM3h: numeric("vazao_m3h", { precision: 15, scale: 4 }),
  perdaCargaMca: numeric("perda_carga_mca", { precision: 15, scale: 4 }),
  quantidadePontos: integer("quantidade_pontos"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  piscinaTipoIdx: index("obra_piscina_circuitos_piscina_tipo_idx").on(t.piscinaId, t.tipo),
}));

export const obraPiscinaEquipamentosTable = pgTable("obra_piscina_equipamentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  casaMaquinasId: text("casa_maquinas_id").references(() => obraPiscinaCasasMaquinasTable.id, { onDelete: "set null" }),
  tipo: text("tipo").notNull(),
  nome: text("nome").notNull(),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  vazaoM3h: numeric("vazao_m3h", { precision: 15, scale: 4 }),
  capacidade: text("capacidade"),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraPiscinaTratamentoTable = pgTable("obra_piscina_tratamento", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  automatizado: boolean("automatizado").notNull().default(false),
  controlePh: boolean("controle_ph").notNull().default(false),
  controleOrp: boolean("controle_orp").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraPiscinaAquecimentoTable = pgTable("obra_piscina_aquecimento", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  potenciaKw: numeric("potencia_kw", { precision: 15, scale: 4 }),
  temperaturaAlvoC: numeric("temperatura_alvo_c", { precision: 10, scale: 2 }),
  deltaTProjetoC: numeric("delta_t_projeto_c", { precision: 10, scale: 2 }),
  apoio: text("apoio"),
  somenteInfraestrutura: boolean("somente_infraestrutura").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const obraPiscinaOverflowTable = pgTable("obra_piscina_overflow", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  piscinaId: text("piscina_id").notNull().references(() => obraPiscinasTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  comprimentoCalhaM: numeric("comprimento_calha_m", { precision: 15, scale: 4 }),
  volumeCompensacaoM3: numeric("volume_compensacao_m3", { precision: 15, scale: 4 }),
  reservatorioCompensacao: boolean("reservatorio_compensacao").notNull().default(true),
  bombaRecalque: boolean("bomba_recalque").notNull().default(false),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraPiscinaSchema = createInsertSchema(obraPiscinasTable, {
  tipo: z.enum(PISCINA_TIPOS),
  estrutura: z.enum(PISCINA_ESTRUTURAS),
  comprimentoM: decimalOptional,
  larguraM: decimalOptional,
  profundidadeMinM: decimalOptional,
  profundidadeMaxM: decimalOptional,
  areaEspelhoM2: decimalOptional,
  volumeM3: decimalOptional,
  areaRevestimentoM2: decimalOptional,
  perimetroM: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaCasaMaquinasSchema = createInsertSchema(obraPiscinaCasasMaquinasTable, {
  distanciaPiscinaM: decimalOptional,
  desnívelM: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaCircuitoSchema = createInsertSchema(obraPiscinaCircuitosTable, {
  tipo: z.enum(PISCINA_CIRCUITO_TIPOS),
  diametroMm: decimalOptional,
  comprimentoM: decimalOptional,
  vazaoM3h: decimalOptional,
  perdaCargaMca: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaEquipamentoSchema = createInsertSchema(obraPiscinaEquipamentosTable, {
  quantidade: decimalOptional,
  potenciaKw: decimalOptional,
  vazaoM3h: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaTratamentoSchema = createInsertSchema(obraPiscinaTratamentoTable, {
  tipo: z.enum(PISCINA_TRATAMENTOS),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaAquecimentoSchema = createInsertSchema(obraPiscinaAquecimentoTable, {
  potenciaKw: decimalOptional,
  temperaturaAlvoC: decimalOptional,
  deltaTProjetoC: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertObraPiscinaOverflowSchema = createInsertSchema(obraPiscinaOverflowTable, {
  comprimentoCalhaM: decimalOptional,
  volumeCompensacaoM3: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });
