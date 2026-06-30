import {
  pgTable,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteContatosTable = pgTable("site_contatos", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nome: varchar("nome", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  telefone: varchar("telefone", { length: 20 }),
  empresa: varchar("empresa", { length: 255 }),
  mensagem: text("mensagem"),
  origem: varchar("origem", { length: 50 }),
  status: varchar("status", { length: 20 }).notNull().default("novo"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSiteContatoSchema = createInsertSchema(siteContatosTable).omit({
  id: true,
  createdAt: true,
});

export const updateSiteContatoSchema = createSelectSchema(siteContatosTable)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertSiteContato = z.infer<typeof insertSiteContatoSchema>;
export type UpdateSiteContato = z.infer<typeof updateSiteContatoSchema>;
export type SiteContato = typeof siteContatosTable.$inferSelect;
