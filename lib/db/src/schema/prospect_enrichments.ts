import { pgTable, text, integer, numeric, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { leadsTable } from "./leads";

export const prospectEnrichmentsTable = pgTable("prospect_enrichments", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  leadId: text("lead_id").references(() => leadsTable.id, { onDelete: "set null" }),

  nomeEmpresa: text("nome_empresa"),
  endereco: text("endereco"),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  reviewCount: integer("review_count"),
  telefone: text("telefone"),
  whatsapp: text("whatsapp"),
  siteOficial: text("site_oficial"),
  pontosFortes: jsonb("pontos_fortes").$type<string[]>(),
  doresPrincipais: jsonb("dores_principais").$type<string[]>(),
  scoreProspector: integer("score_prospector"),
  temContato: boolean("tem_contato").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertProspectEnrichmentSchema = createInsertSchema(prospectEnrichmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateProspectEnrichmentSchema = createSelectSchema(prospectEnrichmentsTable)
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type ProspectEnrichment = typeof prospectEnrichmentsTable.$inferSelect;
export type InsertProspectEnrichment = z.infer<typeof insertProspectEnrichmentSchema>;
export type UpdateProspectEnrichment = z.infer<typeof updateProspectEnrichmentSchema>;
