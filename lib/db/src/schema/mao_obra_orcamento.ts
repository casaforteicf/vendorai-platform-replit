import { pgTable, text, timestamp, numeric, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { composicoesTable } from "./composicoes";
import { obraOrcamentoEtapasTable, obraOrcamentoItensTable } from "./obras";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const MAO_OBRA_MODALIDADES = [
  "funcionario_hora",
  "funcionario_producao",
  "equipe_propria",
  "etapa_unidade",
  "empreitada_global",
  "terceirizada",
  "diaria",
  "hora_tecnica",
] as const;

export const MAO_OBRA_ESCOPO_TIPOS = [
  "composicao",
  "etapa_orcamento",
  "item_orcamento",
] as const;

export const maoObraRecursosTable = pgTable("mao_obra_recursos", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  funcao: text("funcao"),
  modalidade: text("modalidade").notNull().default("funcionario_hora"),
  unidadeCusto: text("unidade_custo").notNull().default("h"),
  custoBase: numeric("custo_base", { precision: 15, scale: 4 }).notNull().default("0"),
  salarioMensal: numeric("salario_mensal", { precision: 15, scale: 4 }),
  encargosPercentual: numeric("encargos_percentual", { precision: 7, scale: 3 }).notNull().default("0"),
  beneficiosMensais: numeric("beneficios_mensais", { precision: 15, scale: 4 }).notNull().default("0"),
  outrosCustosMensais: numeric("outros_custos_mensais", { precision: 15, scale: 4 }).notNull().default("0"),
  horasMensais: numeric("horas_mensais", { precision: 10, scale: 2 }),
  custoHoraCalculado: numeric("custo_hora_calculado", { precision: 15, scale: 4 }),
  produtividade: numeric("produtividade", { precision: 15, scale: 4 }),
  unidadeProdutividade: text("unidade_produtividade"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantAtivoIdx: index("mao_obra_recursos_tenant_ativo_idx").on(table.tenantId, table.ativo),
}));

export const maoObraEquipesTable = pgTable("mao_obra_equipes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  produtividade: numeric("produtividade", { precision: 15, scale: 4 }),
  unidadeProdutividade: text("unidade_produtividade"),
  horasDia: numeric("horas_dia", { precision: 5, scale: 2 }).notNull().default("8"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const maoObraEquipeMembrosTable = pgTable("mao_obra_equipe_membros", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  equipeId: text("equipe_id").notNull().references(() => maoObraEquipesTable.id, { onDelete: "cascade" }),
  recursoId: text("recurso_id").notNull().references(() => maoObraRecursosTable.id, { onDelete: "restrict" }),
  quantidade: numeric("quantidade", { precision: 10, scale: 3 }).notNull().default("1"),
});

export const maoObraCoberturasTable = pgTable("mao_obra_coberturas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  escopoTipo: text("escopo_tipo").notNull(),
  composicaoId: text("composicao_id").references(() => composicoesTable.id, { onDelete: "cascade" }),
  orcamentoEtapaId: text("orcamento_etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "cascade" }),
  orcamentoItemId: text("orcamento_item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "cascade" }),
  modalidade: text("modalidade").notNull(),
  recursoId: text("recurso_id").references(() => maoObraRecursosTable.id, { onDelete: "set null" }),
  equipeId: text("equipe_id").references(() => maoObraEquipesTable.id, { onDelete: "set null" }),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }).notNull().default("1"),
  unidade: text("unidade").notNull().default("h"),
  custoUnitario: numeric("custo_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  custoTotal: numeric("custo_total", { precision: 15, scale: 4 }).notNull().default("0"),
  incluiMaoObraComposicoesFilhas: boolean("inclui_mao_obra_composicoes_filhas").notNull().default(false),
  atividadesIncluidas: jsonb("atividades_incluidas").$type<string[]>().notNull().default([]),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tenantEscopoIdx: index("mao_obra_coberturas_tenant_escopo_idx").on(table.tenantId, table.escopoTipo),
  composicaoIdx: index("mao_obra_coberturas_composicao_idx").on(table.composicaoId),
  etapaIdx: index("mao_obra_coberturas_etapa_idx").on(table.orcamentoEtapaId),
  itemIdx: index("mao_obra_coberturas_item_idx").on(table.orcamentoItemId),
}));

export const insertMaoObraRecursoSchema = createInsertSchema(maoObraRecursosTable, {
  modalidade: z.enum(MAO_OBRA_MODALIDADES),
  custoBase: decimalOptional,
  salarioMensal: decimalOptional,
  encargosPercentual: decimalOptional,
  beneficiosMensais: decimalOptional,
  outrosCustosMensais: decimalOptional,
  horasMensais: decimalOptional,
  custoHoraCalculado: decimalOptional,
  produtividade: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateMaoObraRecursoSchema = createSelectSchema(maoObraRecursosTable, {
  modalidade: z.enum(MAO_OBRA_MODALIDADES).optional(),
  custoBase: decimalOptional,
  salarioMensal: decimalOptional,
  encargosPercentual: decimalOptional,
  beneficiosMensais: decimalOptional,
  outrosCustosMensais: decimalOptional,
  horasMensais: decimalOptional,
  custoHoraCalculado: decimalOptional,
  produtividade: decimalOptional,
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export const insertMaoObraEquipeSchema = createInsertSchema(maoObraEquipesTable, {
  produtividade: decimalOptional,
  horasDia: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertMaoObraEquipeMembroSchema = createInsertSchema(maoObraEquipeMembrosTable, {
  quantidade: decimalOptional,
}).omit({ id: true });

export const insertMaoObraCoberturaSchema = createInsertSchema(maoObraCoberturasTable, {
  escopoTipo: z.enum(MAO_OBRA_ESCOPO_TIPOS),
  modalidade: z.enum(MAO_OBRA_MODALIDADES),
  quantidade: decimalOptional,
  custoUnitario: decimalOptional,
  custoTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type MaoObraRecurso = typeof maoObraRecursosTable.$inferSelect;
export type MaoObraEquipe = typeof maoObraEquipesTable.$inferSelect;
export type MaoObraEquipeMembro = typeof maoObraEquipeMembrosTable.$inferSelect;
export type MaoObraCobertura = typeof maoObraCoberturasTable.$inferSelect;
