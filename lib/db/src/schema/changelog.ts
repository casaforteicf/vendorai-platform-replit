import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const changelogTipoEnum = pgEnum("changelog_tipo", [
  "novidade", "melhoria", "correcao",
]);

export const changelogEntriesTable = pgTable("changelog_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  titulo: text("titulo").notNull(),
  descricao: text("descricao").notNull(),
  tipo: changelogTipoEnum("tipo").notNull().default("novidade"),
  // Rascunho até isso ser preenchido — só entra na listagem pro tenant
  // depois de publicado. Super admin escreve e revisa antes de soltar.
  publicadoEm: timestamp("publicado_em"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertChangelogEntrySchema = createInsertSchema(changelogEntriesTable, {
  titulo: z.string().min(1).max(255),
  descricao: z.string().min(1),
}).omit({ id: true, createdAt: true, updatedAt: true });
export const updateChangelogEntrySchema = createSelectSchema(changelogEntriesTable)
  .omit({ id: true, createdAt: true, updatedAt: true }).partial();
export type ChangelogEntry = typeof changelogEntriesTable.$inferSelect;
