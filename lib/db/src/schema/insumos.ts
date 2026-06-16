import { pgTable, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { obrasTable } from "./obras";
import { usersTable } from "./users";

const decimalOptional = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d+)?$/, "Invalid decimal"))
  .optional();

// ─── Insumos (central materials registry) ────────────────────────────────────

export const insumosTable = pgTable("insumos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  unidade: text("unidade").notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 15, scale: 4 }),
  categoria: text("categoria"),
  codigo: text("codigo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInsumoSchema = createInsertSchema(insumosTable, {
  precoUnitario: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateInsumoSchema = createSelectSchema(insumosTable, {
  precoUnitario: decimalOptional,
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertInsumo = z.infer<typeof insertInsumoSchema>;
export type UpdateInsumo = z.infer<typeof updateInsumoSchema>;
export type Insumo = typeof insumosTable.$inferSelect;

// ─── Estoque Central de Obras ─────────────────────────────────────────────────

export const estoqueCentralObrasTable = pgTable("estoque_central_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  quantidadeAtual: numeric("quantidade_atual", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 15, scale: 4 }).notNull().default("0"),
  localizacao: text("localizacao"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EstoqueCentralObra = typeof estoqueCentralObrasTable.$inferSelect;

// ─── Estoque por Obra ─────────────────────────────────────────────────────────

export const estoqueObrasTable = pgTable("estoque_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  obraId: text("obra_id")
    .notNull()
    .references(() => obrasTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  quantidadeAtual: numeric("quantidade_atual", { precision: 15, scale: 4 }).notNull().default("0"),
  quantidadeMinima: numeric("quantidade_minima", { precision: 15, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EstoqueObra = typeof estoqueObrasTable.$inferSelect;

// ─── Movimentações de Estoque ─────────────────────────────────────────────────

export const movimentacoesEstoqueObrasTable = pgTable("movimentacoes_estoque_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  insumoId: text("insumo_id")
    .notNull()
    .references(() => insumosTable.id, { onDelete: "restrict" }),
  tipo: text("tipo").notNull(),
  quantia: numeric("quantia", { precision: 15, scale: 4 }).notNull(),
  origemTipo: text("origem_tipo"),
  origemObraId: text("origem_obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  destinoTipo: text("destino_tipo"),
  destinoObraId: text("destino_obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MovimentacaoEstoqueObra = typeof movimentacoesEstoqueObrasTable.$inferSelect;

// ─── Compras por Obra ─────────────────────────────────────────────────────────

export const comprasObrasTable = pgTable("compras_obras", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  obraId: text("obra_id").references(() => obrasTable.id, { onDelete: "set null" }),
  insumoId: text("insumo_id").references(() => insumosTable.id, { onDelete: "set null" }),
  descricao: text("descricao").notNull(),
  fornecedor: text("fornecedor"),
  quantidade: numeric("quantidade", { precision: 15, scale: 4 }),
  valorUnitario: numeric("valor_unitario", { precision: 15, scale: 4 }),
  valorTotal: numeric("valor_total", { precision: 15, scale: 2 }),
  status: text("status").notNull().default("pendente"),
  dataPrevista: text("data_prevista"),
  dataEfetuada: text("data_efetuada"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCompraObraSchema = createInsertSchema(comprasObrasTable, {
  quantidade: decimalOptional,
  valorUnitario: decimalOptional,
  valorTotal: decimalOptional,
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCompraObraSchema = createSelectSchema(comprasObrasTable, {
  quantidade: decimalOptional,
  valorUnitario: decimalOptional,
  valorTotal: decimalOptional,
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCompraObra = z.infer<typeof insertCompraObraSchema>;
export type UpdateCompraObra = z.infer<typeof updateCompraObraSchema>;
export type CompraObra = typeof comprasObrasTable.$inferSelect;
