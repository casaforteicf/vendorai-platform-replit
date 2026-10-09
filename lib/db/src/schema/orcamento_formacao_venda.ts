import { pgTable, text, timestamp, numeric, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { obraOrcamentosTable, obraOrcamentoEtapasTable, obraOrcamentoItensTable } from "./obras";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^-?\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const FORMACAO_CUSTO_TIPOS = [
  "administracao_obra",
  "canteiro",
  "engenharia",
  "seguro",
  "garantia",
  "frete_logistica",
  "despesas_financeiras",
  "impostos",
  "comissao",
  "risco",
  "margem",
  "outro_indireto",
] as const;

export const FORMACAO_MODOS = ["percentual", "valor_fixo"] as const;
export const FORMACAO_BASES = ["custo_direto", "custo_total", "preco_venda"] as const;
export const FORMACAO_ESCOPO = ["orcamento", "etapa", "item"] as const;
export const MARGEM_METODOS = ["margem_sobre_venda", "markup_sobre_custo"] as const;

export const orcamentoFormacaoVendaTable = pgTable("orcamento_formacao_venda", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  orcamentoId: text("orcamento_id").notNull().references(() => obraOrcamentosTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull().default("Formação de venda"),
  metodoMargem: text("metodo_margem").notNull().default("margem_sobre_venda"),
  margemPercentual: numeric("margem_percentual", { precision: 9, scale: 4 }).notNull().default("0"),
  precoVendaManual: numeric("preco_venda_manual", { precision: 15, scale: 4 }),
  arredondamento: numeric("arredondamento", { precision: 15, scale: 4 }),
  observacoes: text("observacoes"),
  versao: integer("versao").notNull().default(1),
  ativo: boolean("ativo").notNull().default(true),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  tenantOrcamentoIdx: index("orc_formacao_tenant_orcamento_idx").on(t.tenantId, t.orcamentoId),
}));

export const orcamentoFormacaoComponentesTable = pgTable("orcamento_formacao_componentes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  formacaoId: text("formacao_id").notNull().references(() => orcamentoFormacaoVendaTable.id, { onDelete: "cascade" }),
  escopo: text("escopo").notNull().default("orcamento"),
  etapaId: text("etapa_id").references(() => obraOrcamentoEtapasTable.id, { onDelete: "cascade" }),
  itemId: text("item_id").references(() => obraOrcamentoItensTable.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  nome: text("nome").notNull(),
  modo: text("modo").notNull().default("percentual"),
  baseCalculo: text("base_calculo").notNull().default("custo_direto"),
  percentual: numeric("percentual", { precision: 9, scale: 4 }),
  valorFixo: numeric("valor_fixo", { precision: 15, scale: 4 }),
  incluiNaVenda: boolean("inclui_na_venda").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  observacoes: text("observacoes"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  formacaoEscopoIdx: index("orc_formacao_componentes_formacao_escopo_idx").on(t.formacaoId, t.escopo),
}));

export const orcamentoFormacaoSnapshotsTable = pgTable("orcamento_formacao_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  formacaoId: text("formacao_id").notNull().references(() => orcamentoFormacaoVendaTable.id, { onDelete: "cascade" }),
  custoDireto: numeric("custo_direto", { precision: 15, scale: 4 }).notNull(),
  custosIndiretos: numeric("custos_indiretos", { precision: 15, scale: 4 }).notNull(),
  impostos: numeric("impostos", { precision: 15, scale: 4 }).notNull(),
  comissao: numeric("comissao", { precision: 15, scale: 4 }).notNull(),
  risco: numeric("risco", { precision: 15, scale: 4 }).notNull(),
  margemValor: numeric("margem_valor", { precision: 15, scale: 4 }).notNull(),
  precoVenda: numeric("preco_venda", { precision: 15, scale: 4 }).notNull(),
  markupEfetivo: numeric("markup_efetivo", { precision: 12, scale: 6 }),
  margemEfetivaPercentual: numeric("margem_efetiva_percentual", { precision: 9, scale: 4 }),
  memoriaCalculo: jsonb("memoria_calculo").$type<Record<string, unknown>>().notNull(),
  criadoPorId: text("criado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  formacaoCreatedIdx: index("orc_formacao_snapshots_formacao_created_idx").on(t.formacaoId, t.createdAt),
}));

export const insertOrcamentoFormacaoVendaSchema = createInsertSchema(orcamentoFormacaoVendaTable, {
  metodoMargem: z.enum(MARGEM_METODOS),
  margemPercentual: decimalOptional,
  precoVendaManual: decimalOptional,
  arredondamento: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateOrcamentoFormacaoVendaSchema = createSelectSchema(orcamentoFormacaoVendaTable, {
  metodoMargem: z.enum(MARGEM_METODOS).optional(),
  margemPercentual: decimalOptional,
  precoVendaManual: decimalOptional,
  arredondamento: decimalOptional,
}).omit({ id: true, tenantId: true, orcamentoId: true, createdAt: true, updatedAt: true }).partial();

export const insertOrcamentoFormacaoComponenteSchema = createInsertSchema(orcamentoFormacaoComponentesTable, {
  escopo: z.enum(FORMACAO_ESCOPO),
  tipo: z.enum(FORMACAO_CUSTO_TIPOS),
  modo: z.enum(FORMACAO_MODOS),
  baseCalculo: z.enum(FORMACAO_BASES),
  percentual: decimalOptional,
  valorFixo: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type OrcamentoFormacaoVenda = typeof orcamentoFormacaoVendaTable.$inferSelect;
export type OrcamentoFormacaoComponente = typeof orcamentoFormacaoComponentesTable.$inferSelect;
export type OrcamentoFormacaoSnapshot = typeof orcamentoFormacaoSnapshotsTable.$inferSelect;
