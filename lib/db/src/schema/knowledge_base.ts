import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const knowledgeBaseTable = pgTable("knowledge_base", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  conteudo: text("conteudo").notNull(),
  categoria: text("categoria").notNull(),
  tags: jsonb("tags").$type<string[]>().default([]),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertKnowledgeBaseSchema = createInsertSchema(knowledgeBaseTable, {
  titulo: z.string().min(1),
  conteudo: z.string().min(1),
  categoria: z.string().min(1),
  tags: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateKnowledgeBaseSchema = createSelectSchema(knowledgeBaseTable, {
  titulo: z.string().min(1).optional(),
  conteudo: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  ativo: z.boolean().optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();
