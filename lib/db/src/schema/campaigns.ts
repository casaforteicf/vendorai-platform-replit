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

/**
 * Plano de jornada comercial da campanha. A campanha é temporária, mas o lead e
 * seu histórico são permanentes: ao encerrar uma campanha, o mesmo lead pode
 * entrar em outra quando voltar a cumprir os sinais de entrada.
 */
export const campaignJourneyPlanSchema = z.object({
  entrySignals: z.array(z.string()).optional(),
  audienceTags: z.array(z.string()).optional(),
  sdrActivationScore: z.number().int().min(0).max(100).optional(),
  opportunityScore: z.number().int().min(0).max(100).optional(),
  nurtureMaterialTags: z.array(z.string()).optional(),
  followUpHours: z.array(z.number().int().positive()).optional(),
  exitSignals: z.array(z.string()).optional(),
  reentryAllowed: z.boolean().optional(),
  notes: z.string().optional(),
}).optional();

export type CampaignJourneyPlan = z.infer<typeof campaignJourneyPlanSchema>;

/**
 * Briefing mestre compartilhado entre campanhas, conteúdo, Ads e demais
 * superfícies de marketing. Os campos continuam opcionais para preservar
 * campanhas legadas e permitir evolução sem migration (segmento_filtro é JSONB).
 */
export const campaignMarketingContextSchema = z.object({
  nicheId: z.string().optional(),
  nicheName: z.string().optional(),
  productIds: z.array(z.string()).optional(),
  productNames: z.array(z.string()).optional(),
  businessVertical: z.string().optional(),
  businessVerticalSlug: z.string().optional(),
  audienceSegment: z.string().optional(),
  audienceNiche: z.string().optional(),
  campaignGoal: z.string().optional(),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  locationRegion: z.string().optional(),
  projectName: z.string().optional(),
  specificDetails: z.string().optional(),
  mandatoryDifferentiators: z.string().optional(),
  restrictions: z.string().optional(),
  primaryKpi: z.string().optional(),
  researchEnabled: z.boolean().optional(),
  seoTrackingEnabled: z.boolean().optional(),
  marketingIntelligence: z.unknown().optional(),
  campaignId: z.string().optional(),
  campaignName: z.string().optional(),
  journeyPlan: campaignJourneyPlanSchema,
});

export type CampaignMarketingContext = z.infer<typeof campaignMarketingContextSchema>;

export const segmentoFiltroSchema = z
  .object({
    churnRisk: numericFilterSchema.optional(),
    journeyStage: z.string().optional(),
    nextBestAction: z.string().optional(),
    intentAnalysis: z.string().optional(),
    dealEtapas: z.array(z.string()).optional(),
    leadIds: z.array(z.string()).optional(),
    audienceTags: z.array(z.string()).optional(),
    commercialStages: z.array(z.enum(["descoberta", "aquecimento", "quente", "oportunidade"])).optional(),
    behaviorIntentMin: z.number().int().min(0).max(100).optional(),
    remarketingEligible: z.boolean().optional(),
    marketingContext: campaignMarketingContextSchema.optional(),
  })
  .optional();

export type SegmentoFiltro = z.infer<typeof segmentoFiltroSchema>;
export type NumericFilter = z.infer<typeof numericFilterSchema>;

export type CampaignContext = {
  origin?: string;
  prospectorBatchId?: string;
  leadIds?: string[];
  tenantName?: string;
  businessVertical?: string;
  region?: string;
  opportunity?: string;
  averageScore?: number;
  offer?: string;
  productIds?: string[];
  productNames?: string[];
  audienceSegment?: string;
  audienceNiche?: string;
  campaignGoal?: string;
  locationCity?: string;
  locationState?: string;
  locationRegion?: string;
  projectName?: string;
  specificDetails?: string;
  mandatoryDifferentiators?: string;
  restrictions?: string;
  primaryKpi?: string;
  researchEnabled?: boolean;
  seoTrackingEnabled?: boolean;
  marketingIntelligence?: unknown;
  journeyPlan?: CampaignJourneyPlan;
  recommendedChannel?: "whatsapp" | "email" | "instagram";
  recommendedPaidPlatform?: "meta" | "google";
  adsHeadline?: string;
  adsDescription?: string;
  lpHeadline?: string;
  lpSubheadline?: string;
  marketingContext?: CampaignMarketingContext;
  createdFromRevenueScoutAt?: string;
};

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
  contexto: jsonb("contexto").$type<CampaignContext>(),
  mensagem: text("mensagem").notNull(),
  imageUrl: text("image_url"),
  mensagensEtapa: jsonb("mensagens_etapa").$type<Record<string, string>>(),
  status: campaignStatusEnum("status").notNull().default("rascunho"),
  agendadaPara: timestamp("agendada_para"),
  totalDestinatarios: integer("total_destinatarios").notNull().default(0),
  totalEnviados: integer("total_enviados").notNull().default(0),
  abTestEnabled: integer("ab_test_enabled").default(0),
  abTestSamplePct: integer("ab_test_sample_pct").default(30),
  variantAText: text("variant_a_text"),
  variantBText: text("variant_b_text"),
  winningVariant: text("winning_variant"),
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
