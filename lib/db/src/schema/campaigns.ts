import { pgTable, text, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const campaignTipoEnum = pgEnum("campaign_tipo", [
  "whatsapp",
  "email",
  "instagram",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "rascunho",
  "agendada",
  "enviando",
  "concluida",
  "pausada",
]);

export const numericFilterSchema = z.union([
  z.number().int(),
  z.object({
    gt: z.number().int().optional(),
    gte: z.number().int().optional(),
    lt: z.number().int().optional(),
    lte: z.number().int().optional(),
    eq: z.number().int().optional(),
  }),
]);

export const segmentoFiltroSchema = z
  .object({
    churnRisk: numericFilterSchema.optional(),
    journeyStage: z.string().optional(),
    nextBestAction: z.string().optional(),
    intentAnalysis: z.string().optional(),
    dealEtapas: z.array(z.string()).optional(),
  })
  .optional();

export type SegmentoFiltro = z.infer<typeof segmentoFiltroSchema>;
export type NumericFilter = z.infer<typeof numericFilterSchema>;

export const campaignsTable = pgTable("campaigns", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  tipo: campaignTipoEnum("tipo").notNull(),
  segmentoFiltro: jsonb("segmento_filtro").$type<SegmentoFiltro>(),
  mensagem: text("mensagem").notNull(),
  imageUrl: text("image_url"),
  mensagensEtapa: jsonb("mensagens_etapa").$type<Record<string, string>>(),
  status: campaignStatusEnum("status").notNull().default("rascunho"),
  agendadaPara: timestamp("agendada_para"),
  totalDestinatarios: integer("total_destinatarios").notNull().default(0),
  totalEnviados: integer("total_enviados").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable, {
  segmentoFiltro: segmentoFiltroSchema,
  agendadaPara: z.coerce.date().optional(),
  mensagensEtapa: z.record(z.string(), z.string()).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateCampaignSchema = createSelectSchema(campaignsTable, {
  segmentoFiltro: segmentoFiltroSchema,
  agendadaPara: z.coerce.date().optional(),
  mensagensEtapa: z.record(z.string(), z.string()).optional(),
})
  .omit({ id: true, tenantId: true, createdAt: true, updatedAt: true })
  .partial();

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
