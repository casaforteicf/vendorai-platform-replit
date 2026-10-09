import { pgTable, text, timestamp, numeric, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { obrasTable } from "./obras";
import { composicoesTable, sistemasConstrutivosTable } from "./composicoes";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const ELEMENTO_TIPOS = [
  "parede","piso","teto","fachada","laje","pilar","viga","escada","cobertura","esquadria","impermeabilizacao","outro"
] as const;

export const SUPERFICIE_TIPOS = ["face_parede","piso","teto","fachada","cobertura","outra"] as const;
export const ZONA_GEOMETRIA_TIPOS = ["inteira","retangulo","poligono","faixa_perimetral","trajeto","manual"] as const;
export const ORIGEM_CONFIGURACAO = ["padrao_empresa","padrao_tipo_ambiente","padrao_obra","ambiente","superficie","zona"] as const;

export const obraPavimentosTable = pgTable("obra_pavimentos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  codigo: text("codigo"),
  nivel: numeric("nivel", { precision: 12, scale: 4 }),
  ordem: integer("ordem").notNull().default(0),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraOrdemIdx: index("obra_pavimentos_obra_ordem_idx").on(t.obraId, t.ordem),
}));

export const obraAmbientesTable = pgTable("obra_ambientes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  pavimentoId: text("pavimento_id").references(() => obraPavimentosTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: text("tipo"),
  codigo: text("codigo"),
  areaBruta: numeric("area_bruta", { precision: 15, scale: 4 }),
  areaLiquida: numeric("area_liquida", { precision: 15, scale: 4 }),
  perimetro: numeric("perimetro", { precision: 15, scale: 4 }),
  altura: numeric("altura", { precision: 15, scale: 4 }),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraPavimentoIdx: index("obra_ambientes_obra_pavimento_idx").on(t.obraId, t.pavimentoId),
}));

export const obraElementosTable = pgTable("obra_elementos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  pavimentoId: text("pavimento_id").references(() => obraPavimentosTable.id, { onDelete: "set null" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  tipo: text("tipo").notNull(),
  codigo: text("codigo"),
  nome: text("nome"),
  comprimento: numeric("comprimento", { precision: 15, scale: 4 }),
  altura: numeric("altura", { precision: 15, scale: 4 }),
  espessura: numeric("espessura", { precision: 15, scale: 4 }),
  areaBruta: numeric("area_bruta", { precision: 15, scale: 4 }),
  areaAberturas: numeric("area_aberturas", { precision: 15, scale: 4 }),
  areaLiquida: numeric("area_liquida", { precision: 15, scale: 4 }),
  volume: numeric("volume", { precision: 15, scale: 4 }),
  perimetro: numeric("perimetro", { precision: 15, scale: 4 }),
  sistemaId: text("sistema_id").references(() => sistemasConstrutivosTable.id, { onDelete: "set null" }),
  sistemaVarianteId: text("sistema_variante_id"),
  origem: text("origem"),
  origemRef: text("origem_ref"),
  projetoVersao: text("projeto_versao"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  obraTipoIdx: index("obra_elementos_obra_tipo_idx").on(t.obraId, t.tipo),
  ambienteIdx: index("obra_elementos_ambiente_idx").on(t.ambienteId),
}));

export const obraSuperficiesTable = pgTable("obra_superficies", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").notNull().references(() => obrasTable.id, { onDelete: "cascade" }),
  elementoId: text("elemento_id").references(() => obraElementosTable.id, { onDelete: "cascade" }),
  ambienteId: text("ambiente_id").references(() => obraAmbientesTable.id, { onDelete: "set null" }),
  tipo: text("tipo").notNull(),
  face: text("face"),
  nome: text("nome"),
  areaBruta: numeric("area_bruta", { precision: 15, scale: 4 }),
  areaAberturas: numeric("area_aberturas", { precision: 15, scale: 4 }),
  areaLiquida: numeric("area_liquida", { precision: 15, scale: 4 }),
  perimetro: numeric("perimetro", { precision: 15, scale: 4 }),
  origemConfiguracao: text("origem_configuracao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  elementoFaceIdx: index("obra_superficies_elemento_face_idx").on(t.elementoId, t.face),
  ambienteTipoIdx: index("obra_superficies_ambiente_tipo_idx").on(t.ambienteId, t.tipo),
}));

export const obraSuperficieZonasTable = pgTable("obra_superficie_zonas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  superficieId: text("superficie_id").notNull().references(() => obraSuperficiesTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  geometriaTipo: text("geometria_tipo").notNull().default("inteira"),
  geometria: jsonb("geometria").$type<Record<string, unknown> | null>(),
  area: numeric("area", { precision: 15, scale: 4 }),
  perimetro: numeric("perimetro", { precision: 15, scale: 4 }),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  acabamentoKey: text("acabamento_key"),
  origemConfiguracao: text("origem_configuracao").notNull().default("zona"),
  prioridade: integer("prioridade").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  superficieAtivoIdx: index("obra_superficie_zonas_superficie_ativo_idx").on(t.superficieId, t.ativo),
}));

export const obraAcabamentoPadroesTable = pgTable("obra_acabamento_padroes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "cascade" }),
  escopo: text("escopo").notNull(),
  tipoAmbiente: text("tipo_ambiente"),
  tipoSuperficie: text("tipo_superficie"),
  acabamentoKey: text("acabamento_key"),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "set null" }),
  parametros: jsonb("parametros").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertObraPavimentoSchema = createInsertSchema(obraPavimentosTable, { nivel: decimalOptional }).omit({ id: true, createdAt: true, updatedAt: true });
export const insertObraAmbienteSchema = createInsertSchema(obraAmbientesTable, { areaBruta: decimalOptional, areaLiquida: decimalOptional, perimetro: decimalOptional, altura: decimalOptional }).omit({ id: true, createdAt: true, updatedAt: true });
export const insertObraElementoSchema = createInsertSchema(obraElementosTable, {
  tipo: z.enum(ELEMENTO_TIPOS),
  comprimento: decimalOptional, altura: decimalOptional, espessura: decimalOptional,
  areaBruta: decimalOptional, areaAberturas: decimalOptional, areaLiquida: decimalOptional,
  volume: decimalOptional, perimetro: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertObraSuperficieSchema = createInsertSchema(obraSuperficiesTable, {
  tipo: z.enum(SUPERFICIE_TIPOS),
  areaBruta: decimalOptional, areaAberturas: decimalOptional, areaLiquida: decimalOptional, perimetro: decimalOptional,
  origemConfiguracao: z.enum(ORIGEM_CONFIGURACAO).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertObraSuperficieZonaSchema = createInsertSchema(obraSuperficieZonasTable, {
  geometriaTipo: z.enum(ZONA_GEOMETRIA_TIPOS),
  area: decimalOptional, perimetro: decimalOptional,
  origemConfiguracao: z.enum(ORIGEM_CONFIGURACAO),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const insertObraAcabamentoPadraoSchema = createInsertSchema(obraAcabamentoPadroesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type ObraPavimento = typeof obraPavimentosTable.$inferSelect;
export type ObraAmbiente = typeof obraAmbientesTable.$inferSelect;
export type ObraElemento = typeof obraElementosTable.$inferSelect;
export type ObraSuperficie = typeof obraSuperficiesTable.$inferSelect;
export type ObraSuperficieZona = typeof obraSuperficieZonasTable.$inferSelect;
