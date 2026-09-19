import { pgTable, text, timestamp, numeric, date, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { insumosTable } from "./insumos";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

export const tabelasPrecosObrasTable = pgTable("tabelas_precos_obras", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  regiao: text("regiao"),
  fornecedor: text("fornecedor"),
  fonte: text("fonte").notNull().default("manual"),
  vigenciaInicio: date("vigencia_inicio", { mode: "string" }),
  vigenciaFim: date("vigencia_fim", { mode: "string" }),
  isPadrao: boolean("is_padrao").notNull().default(false),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const tabelaPrecosObrasItensTable = pgTable("tabela_precos_obras_itens", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tabelaPrecoId: text("tabela_preco_id").notNull().references(() => tabelasPrecosObrasTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id").notNull().references(() => insumosTable.id, { onDelete: "cascade" }),
  precoBase: numeric("preco_base", { precision: 15, scale: 4 }).notNull(),
  freteUnitario: numeric("frete_unitario", { precision: 15, scale: 4 }).notNull().default("0"),
  impostosPercentual: numeric("impostos_percentual", { precision: 7, scale: 4 }).notNull().default("0"),
  descontoPercentual: numeric("desconto_percentual", { precision: 7, scale: 4 }).notNull().default("0"),
  precoFinal: numeric("preco_final", { precision: 15, scale: 4 }).notNull(),
  fornecedor: text("fornecedor"),
  marca: text("marca"),
  regiao: text("regiao"),
  dataCotacao: date("data_cotacao", { mode: "string" }),
  validade: date("validade", { mode: "string" }),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tabelaInsumoUnique: uniqueIndex("tabela_precos_obras_itens_tabela_insumo_uniq").on(table.tabelaPrecoId, table.insumoId),
}));

export const insumoPrecoHistoricoTable = pgTable("insumo_preco_historico", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id").notNull().references(() => insumosTable.id, { onDelete: "cascade" }),
  tabelaPrecoId: text("tabela_preco_id").references(() => tabelasPrecosObrasTable.id, { onDelete: "set null" }),
  precoAnterior: numeric("preco_anterior", { precision: 15, scale: 4 }),
  precoNovo: numeric("preco_novo", { precision: 15, scale: 4 }).notNull(),
  origem: text("origem").notNull().default("tabela_precos"),
  fornecedor: text("fornecedor"),
  regiao: text("regiao"),
  alteradoPorId: text("alterado_por_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTabelaPrecosObrasSchema = createInsertSchema(tabelasPrecosObrasTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateTabelaPrecosObrasSchema = createSelectSchema(tabelasPrecosObrasTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export const insertTabelaPrecosObrasItemSchema = createInsertSchema(tabelaPrecosObrasItensTable, {
  precoBase: decimalOptional,
  freteUnitario: decimalOptional,
  impostosPercentual: decimalOptional,
  descontoPercentual: decimalOptional,
  precoFinal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export type TabelaPrecosObras = typeof tabelasPrecosObrasTable.$inferSelect;
export type TabelaPrecosObrasItem = typeof tabelaPrecosObrasItensTable.$inferSelect;
export type InsumoPrecoHistorico = typeof insumoPrecoHistoricoTable.$inferSelect;
