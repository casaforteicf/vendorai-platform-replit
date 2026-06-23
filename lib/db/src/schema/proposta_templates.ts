import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { propostaItemSchema } from "./propostas";

export const propostaTemplatesTable = pgTable("proposta_templates", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  planSlug: text("plan_slug").notNull(),
  cycle: text("cycle").notNull(),
  itens: jsonb("itens").$type<Array<z.infer<typeof propostaItemSchema>>>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPropostaTemplateSchema = createInsertSchema(propostaTemplatesTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const updatePropostaTemplateSchema = createSelectSchema(propostaTemplatesTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .partial();

export type PropostaTemplate = typeof propostaTemplatesTable.$inferSelect;
export type InsertPropostaTemplate = z.infer<typeof insertPropostaTemplateSchema>;
