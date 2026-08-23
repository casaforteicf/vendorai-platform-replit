// Criadores de referência (até 3 por tenant) — inspiração de padrão do
// Dalea AI: aponta pra até 3 contas do Instagram, o sistema lê os posts
// públicos recentes via Business Discovery API e extrai padrões (tom,
// formato, hashtags, cadência) que alimentam a geração de conteúdo do
// tenant. Ver content-reference-creators.ts (service) pra lógica real.
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export interface PadroesDetectados {
  tomDeVoz: string;
  duracaoTipicaSegundos: string | null;
  estiloDeHook: string;
  temasFrequentes: string[];
  hashtagsFrequentes: string[];
  cadenciaPostagem: string;
  observacoes: string;
  baseadoEmPosts: number;
}

export const contentReferenceCreatorsTable = pgTable("content_reference_creators", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  instagramUsername: text("instagram_username").notNull(),
  padroesDetectados: jsonb("padroes_detectados").$type<PadroesDetectados>(),
  ultimaAnaliseEm: timestamp("ultima_analise_em"),
  ultimoErro: text("ultimo_erro"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContentReferenceCreatorSchema = createInsertSchema(contentReferenceCreatorsTable, {
  ultimaAnaliseEm: z.coerce.date().nullable().optional(),
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateContentReferenceCreatorSchema = createSelectSchema(contentReferenceCreatorsTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type ContentReferenceCreator = typeof contentReferenceCreatorsTable.$inferSelect;
export type NewContentReferenceCreator = typeof contentReferenceCreatorsTable.$inferInsert;
