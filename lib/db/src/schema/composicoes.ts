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
  "projetos_legalizacao",
  "preliminares",
  "terraplenagem",
  "fundacoes",
  "estrutura",
  "lajes",
  "cobertura",
  "hidraulica",
  "eletrica",
  "esquadrias",
  "revestimentos",
  "forros_pintura",
  "acabamentos",
  "areas_externas",
  "solar_automacao",
  "limpeza_entrega",
] as const;

export const COMPOSICAO_SISTEMAS_CONSTRUTIVOS = [
  "icf",
  "alvenaria",
  "steel_frame",
  "wood_frame",
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
  etapaKey: z.enum(COMPOSICAO_ETAPA_KEYS).nullable().optional(),
  sistemasConstrutivos: z.array(z.enum(COMPOSICAO_SISTEMAS_CONSTRUTIVOS)).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateComposicaoSchema = createSelectSchema(composicoesTable, {
  custoTotal: decimalOptional,
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
  precoUnitario: numeric("preco_unitario", { precision: 15, scale: 4 }),
});

export const insertComposicaoInsumoSchema = createInsertSchema(composicaoInsumosTable, {
  quantidade: z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal")),
  precoUnitario: decimalOptional,
}).omit({ id: true });

export type InsertComposicaoInsumo = z.infer<typeof insertComposicaoInsumoSchema>;
export type ComposicaoInsumo = typeof composicaoInsumosTable.$inferSelect;
