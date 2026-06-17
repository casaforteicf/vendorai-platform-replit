import { pgTable, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const varejoFornecedorTable = pgTable("varejo_fornecedores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  marca: text("marca"),
  contato: text("contato"),
  email: text("email"),
  telefone: text("telefone"),
  cnpj: text("cnpj"),
  condicoesPagamento: text("condicoes_pagamento"),
  prazoEntregaDias: integer("prazo_entrega_dias"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoFornecedorSchema = createInsertSchema(varejoFornecedorTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoFornecedorSchema = createSelectSchema(varejoFornecedorTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoFornecedor = typeof varejoFornecedorTable.$inferSelect;
export type InsertVarejoFornecedor = z.infer<typeof insertVarejoFornecedorSchema>;
