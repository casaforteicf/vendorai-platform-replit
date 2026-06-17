import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { varejoProdutoTable } from "./varejo_produtos";

export const varejoGradeTable = pgTable("varejo_grades", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  produtoId: text("produto_id").notNull().references(() => varejoProdutoTable.id, { onDelete: "cascade" }),
  tamanho: text("tamanho").notNull(),
  cor: text("cor").notNull(),
  estoque: integer("estoque").notNull().default(0),
  estoqueMinimo: integer("estoque_minimo").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertVarejoGradeSchema = createInsertSchema(varejoGradeTable)
  .omit({ id: true, createdAt: true, updatedAt: true });

export const updateVarejoGradeSchema = createSelectSchema(varejoGradeTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type VarejoGrade = typeof varejoGradeTable.$inferSelect;
export type InsertVarejoGrade = z.infer<typeof insertVarejoGradeSchema>;
