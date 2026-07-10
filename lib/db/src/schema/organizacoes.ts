import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organizacoesTable = pgTable("organizacoes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nome: text("nome").notNull(),
  // FK para users.id — sem .references() para evitar import circular
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertOrganizacaoSchema = createInsertSchema(organizacoesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateOrganizacaoSchema = createSelectSchema(organizacoesTable)
  .omit({ id: true, ownerId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertOrganizacao = z.infer<typeof insertOrganizacaoSchema>;
export type UpdateOrganizacao = z.infer<typeof updateOrganizacaoSchema>;
export type Organizacao = typeof organizacoesTable.$inferSelect;
