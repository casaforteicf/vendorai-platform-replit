import {
  pgTable,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export interface SiteVerticalBeneficio {
  icone: string;
  texto: string;
}

export const siteVerticaisTable = pgTable("site_verticais", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  nome: varchar("nome", { length: 100 }).notNull(),
  tagCategoria: varchar("tag_categoria", { length: 100 }),
  titulo: varchar("titulo", { length: 255 }),
  descricao: text("descricao"),
  resultadoTitulo: varchar("resultado_titulo", { length: 255 }),
  resultadoDescricao: text("resultado_descricao"),
  beneficiosEsquerda: jsonb("beneficios_esquerda").$type<SiteVerticalBeneficio[]>(),
  beneficiosDireita: jsonb("beneficios_direita").$type<SiteVerticalBeneficio[]>(),
  ativo: boolean("ativo").notNull().default(true),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSiteVerticalSchema = createInsertSchema(siteVerticaisTable).omit({
  id: true,
  createdAt: true,
});

export const updateSiteVerticalSchema = createSelectSchema(siteVerticaisTable)
  .omit({ id: true, createdAt: true })
  .partial();

export type InsertSiteVertical = z.infer<typeof insertSiteVerticalSchema>;
export type UpdateSiteVertical = z.infer<typeof updateSiteVerticalSchema>;
export type SiteVertical = typeof siteVerticaisTable.$inferSelect;
