import { pgTable, text, timestamp, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const ARQDOR_MARKET_PROTECAO_ESCOPOS = [
  "categoria",
  "subcategoria",
  "produto_servico",
] as const;

export const ARQDOR_MARKET_PROTECAO_MODOS = [
  "exclusivo",
  "preferencial",
  "aberto",
  "bloqueado",
] as const;

export type ArqdorMarketProtecaoEscopo = typeof ARQDOR_MARKET_PROTECAO_ESCOPOS[number];
export type ArqdorMarketProtecaoModo = typeof ARQDOR_MARKET_PROTECAO_MODOS[number];

export const arqdorMarketProtecoesTenantTable = pgTable("arqdor_market_protecoes_tenant", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  escopo: text("escopo").$type<ArqdorMarketProtecaoEscopo>().notNull(),
  valor: text("valor").notNull(),
  valorNormalizado: text("valor_normalizado").notNull(),
  modo: text("modo").$type<ArqdorMarketProtecaoModo>().notNull().default("exclusivo"),
  prioridade: integer("prioridade").notNull().default(100),
  ativo: boolean("ativo").notNull().default(true),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("arqdor_market_protecoes_tenant_idx").on(t.tenantId, t.ativo, t.prioridade),
  uniqueRule: uniqueIndex("arqdor_market_protecoes_tenant_rule_uidx").on(t.tenantId, t.escopo, t.valorNormalizado),
}));

export const insertArqdorMarketProtecaoTenantSchema = createInsertSchema(arqdorMarketProtecoesTenantTable, {
  escopo: z.enum(ARQDOR_MARKET_PROTECAO_ESCOPOS),
  modo: z.enum(ARQDOR_MARKET_PROTECAO_MODOS),
  valor: z.string().trim().min(2).max(180),
  prioridade: z.coerce.number().int().min(0).max(10000).optional(),
}).omit({
  id: true,
  tenantId: true,
  valorNormalizado: true,
  createdAt: true,
  updatedAt: true,
});

export const selectArqdorMarketProtecaoTenantSchema = createSelectSchema(arqdorMarketProtecoesTenantTable);
