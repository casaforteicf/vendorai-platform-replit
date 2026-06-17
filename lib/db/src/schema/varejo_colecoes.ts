import { pgTable, text, timestamp, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const varejoTemporadaEnum = pgEnum("varejo_temporada", [
  "verao", "inverno", "outono", "primavera", "especial",
]);

export const varejoColecaoStatusEnum = pgEnum("varejo_colecao_status", [
  "planejamento", "ativa", "encerrada",
]);

export const varejoColecaoTable = pgTable("varejo_colecoes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  temporada: varejoTemporadaEnum("temporada").notNull(),
  ano: integer("ano").notNull(),
  status: varejoColecaoStatusEnum("status").notNull().default("planejamento"),
  descricao: text("descricao"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoColecaoSchema = createInsertSchema(varejoColecaoTable, {
  ano: z.number().int().min(2000).max(2100),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoColecaoSchema = createSelectSchema(varejoColecaoTable, {
  ano: z.number().int().min(2000).max(2100).optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoColecao = typeof varejoColecaoTable.$inferSelect;
export type InsertVarejoColecao = z.infer<typeof insertVarejoColecaoSchema>;
