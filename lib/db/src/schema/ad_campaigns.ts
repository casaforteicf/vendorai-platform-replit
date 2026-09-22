import { pgTable, text, timestamp, numeric, jsonb, pgEnum, date, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { generatedSitesTable } from "./generated_sites";

// Módulo de anúncios — cross-vertical (produto/veículo/imóvel), começando
// pelo Google (Search RSA + Performance Max), com plataforma já modelada
// pra Meta/TikTok/LinkedIn entrarem depois sem precisar de nova migration
// no núcleo da tabela.
export const adPlataformaEnum = pgEnum("ad_plataforma", ["google", "meta", "tiktok", "linkedin"]);
export const adTipoAnuncioEnum = pgEnum("ad_tipo_anuncio", ["shopping", "rsa_pmax", "imagem", "video"]);
export const adItemTipoEnum = pgEnum("ad_item_tipo", ["produto", "veiculo", "imovel", "landing_page", "livre"]);
export const adModoEnum = pgEnum("ad_modo", ["unico", "carrossel"]);
export const adDestinoCliqueEnum = pgEnum("ad_destino_clique", ["landing_page", "whatsapp", "produto", "formulario_lead"]);
export const adCampanhaStatusEnum = pgEnum("ad_campanha_status", [
  "rascunho", "aguardando_conexao_plataforma", "ativo", "pausado", "encerrado",
]);
export const adCriativoStatusEnum = pgEnum("ad_criativo_status", ["rascunho", "aprovado"]);

const decimalField = z
  .union([z.string(), z.number()])
  .transform((v) => String(v))
  .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid decimal"));

export const adCampaignsTable = pgTable("ad_campaigns", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  plataforma: adPlataformaEnum("plataforma").notNull().default("google"),
  tipoAnuncio: adTipoAnuncioEnum("tipo_anuncio").notNull(),
  vertical: text("vertical").notNull(),
  itemTipo: adItemTipoEnum("item_tipo").notNull(),
  // Nulo quando modo='carrossel' com alvo de categoria inteira
  itemId: text("item_id"),
  // Nome/rótulo do item no momento da criação (ex: nome da LP, do
  // produto) — snapshot só pra exibição, evita re-buscar o item toda
  // vez que a lista de campanhas é exibida. Pode ficar desatualizado se
  // o item for renomeado depois; isso é aceitável aqui, é só um rótulo.
  itemLabel: text("item_label"),
  // Só no modo carrossel: categoria/segmento pra puxar itens relacionados
  categoriaFiltro: text("categoria_filtro"),
  modo: adModoEnum("modo").notNull().default("unico"),
  // 4º eixo — pra onde vai quem clica. Nem toda combinação com os outros 3
  // eixos faz sentido (Shopping só Google; Stories/Reels só Meta) — a
  // validação de combinação fica na camada de rota/UI, não no schema, pra
  // não precisar remodelar a cada plataforma/formato novo.
  destinoClique: adDestinoCliqueEnum("destino_clique").notNull().default("produto"),
  // Preenchido só quando itemTipo='landing_page'
  landingPageId: text("landing_page_id").references(() => generatedSitesTable.id, { onDelete: "set null" }),
  // Preenchido só quando o criativo (imagem/vídeo) veio do Content Studio
  // já existente (content_generations) em vez de gerado ad-hoc aqui
  contentGenerationId: text("content_generation_id"),
  // Foto real do próprio item (produto/veículo/imóvel/LP) escolhida pelo
  // usuário no formulário, em vez de deixar a IA gerar uma do zero — só
  // vale pra tipoAnuncio='imagem'. Null = gera com IA (comportamento
  // padrão, sem mudança).
  imagemEscolhidaUrl: text("imagem_escolhida_url"),
  orcamentoDiario: numeric("orcamento_diario", { precision: 10, scale: 2 }).notNull(),
  segmentacao: jsonb("segmentacao").$type<{
    localizacao?: { locais: string[]; tipoPresenca: "presenca" | "interesse" | "ambos"; raioKm?: number | null };
    demografia?: { idades: string[]; generos: string[]; statusParental: string[]; rendas: string[] };
    audiencias?: { afinidade: string[]; noMercado: string[]; termosPesquisa: string[]; sites: string[]; aplicativos: string[] };
    dadosProprios?: { remarketing: string[]; customerMatch: string[]; semelhantes: string[] };
    origemInstagram?: { mediaId: string; variationIndex: number; contentGenerationId: string };
    marketingContext?: {
      nicheId: string;
      nicheName: string;
      productIds: string[];
      productNames: string[];
      businessVertical?: string;
      businessVerticalSlug?: string;
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
      campaignId?: string;
      campaignName?: string;
    };
    audiencePlan?: {
      summary: string;
      google: { keywords: string[] };
      meta: { interestQueries: string[]; resolvedInterests?: Array<{ id: string; name: string }> };
    };
    campaignControl?: {
      objective: "whatsapp" | "lead" | "sale" | "visit" | "awareness";
      startDate: string;
      startTime?: string;
      endDate: string;
      endTime?: string;
      timezone?: string;
      weeklySchedule?: {
        days: Array<"MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY">;
        startTime: string;
        endTime: string;
      }[];
      totalBudget: number;
      specialAdCategory: "NONE" | "HOUSING" | "EMPLOYMENT" | "CREDIT" | "ISSUES_ELECTIONS_POLITICS";
      conversionTracking: { mode: "vendorai" | "platform" | "clicks"; confirmed: boolean };
      automation: {
        autoPauseNoResults: boolean;
        spendWithoutResultLimit?: number | null;
        allowBudgetIncrease: false;
        lastAutoPause?: { at: string; spend: number; reason: string };
      };
    };
    previousRejectionReason?: string;
    platformReview?: {
      status: "nao_enviada" | "em_analise" | "aprovada" | "aprovada_limitada" | "reprovada" | "erro_pagamento" | "erro_conta";
      reason?: string;
      policyTopics?: string[];
      syncedAt: string;
    };
  }>().notNull().default({}),
  status: adCampanhaStatusEnum("status").notNull().default("rascunho"),
  // Código curto único pra usar como utm_campaign em qualquer link que
  // aponte pra essa campanha — existe desde o rascunho (independente de
  // já ter sido publicada na plataforma), pra já poder ir em material de
  // divulgação. Usado por resolveAdCampaignFromUtm (adAttribution.ts) pra
  // ligar um lead que chegou por esse link à campanha certa.
  utmCode: text("utm_code"),
  // Só preenchido depois de publicar de verdade na plataforma (resource
  // name/campaign id retornado pela API)
  externalCampaignId: text("external_campaign_id"),
  pausarAoInteresse: boolean("pausar_ao_interesse").notNull().default(true),
  slaNegociacaoHoras: integer("sla_negociacao_horas").notNull().default(48),
  responsavelId: text("responsavel_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const adCreativesTable = pgTable("ad_creatives", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  // RSA do Google aceita até 15 títulos / 4 descrições — array cabe isso e
  // as variações de outras plataformas no futuro
  headlines: jsonb("headlines").$type<string[]>().notNull().default([]),
  descriptions: jsonb("descriptions").$type<string[]>().notNull().default([]),
  imagens: jsonb("imagens").$type<string[]>().notNull().default([]),
  status: adCriativoStatusEnum("status").notNull().default("rascunho"),
  geradoEm: timestamp("gerado_em").notNull().defaultNow(),
  aprovadoPorId: text("aprovado_por_id").references(() => usersTable.id, { onDelete: "set null" }),
  aprovadoEm: timestamp("aprovado_em"),
});

// Snapshot diário de métricas puxadas da plataforma — populado por job que
// depende do developer token/API de cada plataforma estar aprovado.
export const adPerformanceSnapshotsTable = pgTable("ad_performance_snapshots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  campaignId: text("campaign_id").notNull().references(() => adCampaignsTable.id, { onDelete: "cascade" }),
  data: date("data").notNull(),
  impressoes: integer("impressoes").notNull().default(0),
  cliques: integer("cliques").notNull().default(0),
  custo: numeric("custo", { precision: 10, scale: 2 }).notNull().default("0"),
  conversoesPlataforma: integer("conversoes_plataforma"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAdCampaignSchema = createInsertSchema(adCampaignsTable, {
  orcamentoDiario: decimalField,
}).omit({ id: true, createdAt: true, updatedAt: true, externalCampaignId: true, status: true });

export const updateAdCampaignSchema = createSelectSchema(adCampaignsTable, {
  orcamentoDiario: decimalField.optional(),
}).omit({ id: true, tenantId: true, createdAt: true, updatedAt: true }).partial();

export type AdCampaign = typeof adCampaignsTable.$inferSelect;
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCreative = typeof adCreativesTable.$inferSelect;
export type AdPerformanceSnapshot = typeof adPerformanceSnapshotsTable.$inferSelect;
