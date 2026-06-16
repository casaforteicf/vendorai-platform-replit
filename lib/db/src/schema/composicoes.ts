import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertComposicaoSchema = createInsertSchema(composicoesTable, {
  custoTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateComposicaoSchema = createSelectSchema(composicoesTable, {
  custoTotal: decimalOptional,
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
