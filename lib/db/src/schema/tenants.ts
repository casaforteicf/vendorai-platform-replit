import { pgTable, text, integer, numeric, timestamp, boolean, pgEnum, json, check, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";
import { plansTable } from "./plans";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "active",
  "suspended",
  "cancelled",
]);

export const tenantsTable = pgTable(
  "tenants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: tenantStatusEnum("status").notNull().default("active"),
    vertical: text("vertical"),
    agentsEnabled: json("agents_enabled")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    setupCompletedAt: timestamp("setup_completed_at"),
    autonomyEnabledAt: timestamp("autonomy_enabled_at"),
    monthlyTokenLimit: integer("monthly_token_limit"),
    tokensUsedCurrentMonth: integer("tokens_used_current_month")
      .notNull()
      .default(0),
    dailyMessageLimit: integer("daily_message_limit"),
    messagesSentToday: integer("messages_sent_today").notNull().default(0),
    analysisStalenessHours: integer("analysis_staleness_hours"),
    analysisMessageThreshold: integer("analysis_message_threshold"),
    maxAnalysesPerHour: integer("max_analyses_per_hour"),
    webhookEstoqueUrl: text("webhook_estoque_url"),
    apiKeyEstoque: text("api_key_estoque"),
    integrationType: text("integration_type").default("api"),
    tipoFechamentoDefault: text("tipo_fechamento_default").$type<"pedido" | "contrato" | "pedido_e_contrato">(),
    mensalidadeValor: numeric("mensalidade_valor", { precision: 10, scale: 2 }),
    tokenCredits: integer("token_credits").notNull().default(0),
    partnerId: text("partner_id").references(() => partnersTable.id, { onDelete: "set null" }),
    indicadoPor: text("indicado_por").references(() => partnersTable.id, { onDelete: "set null" }),
    subdomainSlug: text("subdomain_slug").unique(),
    planId: text("plan_id").references(() => plansTable.id, { onDelete: "set null" }),
    billingCycle: text("billing_cycle").$type<"monthly" | "annual">(),
    planStartedAt: timestamp("plan_started_at"),
    isDemo: boolean("is_demo").notNull().default(false),
    demoExpiresAt: timestamp("demo_expires_at"),
    demoSeeded: boolean("demo_seeded").notNull().default(false),
    openaiApiKeyEncrypted: text("openai_api_key_encrypted"),
    openaiKeyConfiguredAt: timestamp("openai_key_configured_at"),
    openaiKeyStatus: text("openai_key_status").default("nao_configurada"),
    anthropicApiKeyEncrypted: text("anthropic_api_key_encrypted"),
    anthropicKeyConfiguredAt: timestamp("anthropic_key_configured_at"),
    anthropicKeyStatus: text("anthropic_key_status").default("nao_configurada"),
    aiCreditsUsd: numeric("ai_credits_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    aiDailySpendUsd: numeric("ai_daily_spend_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    aiDailySpendResetAt: timestamp("ai_daily_spend_reset_at"),
    prospectStatus: text("prospect_status").notNull().default("learning"),
    suspendedReason: text("suspended_reason"),
    planMigratedFrom: text("plan_migrated_from"),
    planMigratedAt: timestamp("plan_migrated_at"),
    extraUserSlots: integer("extra_user_slots").notNull().default(0),
    provisioningMethod: text("provisioning_method").$type<"self_service" | "manual" | "trial">(),
    createdByAdminId: text("created_by_admin_id"),
    accessSentAt: timestamp("access_sent_at"),
    firstLoginAt: timestamp("first_login_at"),
    internalNotes: text("internal_notes"),
    onboardingConcluido: boolean("onboarding_concluido").notNull().default(false),
    integracoesConcluido: boolean("integracoes_concluido").notNull().default(false),
    integracoesStep: integer("integracoes_step").notNull().default(0),
    asaasApiKey: text("asaas_api_key"),
    googleReviewLink: text("google_review_link"),
    zapsignApiKey: text("zapsign_api_key"),
    whatsappProvider: varchar("whatsapp_provider", { length: 20 }).default("zapi"),
    instagramProvider: varchar("instagram_provider", { length: 20 }).default("meta"),
    nomeEmpresa:  varchar("nome_empresa",  { length: 255 }),
    segmento:     varchar("segmento",      { length: 100 }),
    logoUrl:      varchar("logo_url",      { length: 500 }),
    corPrimaria:  varchar("cor_primaria",  { length: 7   }).default("#A78BFA"),
    site:         varchar("site",          { length: 255 }),
    descricao:    text("descricao"),
    proposalStyleMemory: json("proposal_style_memory").$type<{
      toneNotes?: string;
      structureNotes?: string;
      contentNotes?: string;
      avoidNotes?: string;
      editCount?: number;
      updatedAt?: string;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "analysis_staleness_hours_positive",
      sql`${table.analysisStalenessHours} IS NULL OR ${table.analysisStalenessHours} >= 1`,
    ),
    check(
      "analysis_message_threshold_positive",
      sql`${table.analysisMessageThreshold} IS NULL OR ${table.analysisMessageThreshold} >= 1`,
    ),
    check(
      "max_analyses_per_hour_positive",
      sql`${table.maxAnalysesPerHour} IS NULL OR ${table.maxAnalysesPerHour} >= 1`,
    ),
  ],
);

const positiveIntOrNull = z
  .int()
  .min(1, "Must be a positive integer (>= 1)")
  .nullable()
  .optional();

const billingCycleOrNull = z
  .enum(["monthly", "annual"])
  .nullable()
  .optional();

const tipoFechamentoOrNull = z
  .enum(["pedido", "contrato", "pedido_e_contrato"])
  .nullable()
  .optional();

const provisioningMethodEnum = z
  .enum(["trial", "self_service", "manual"])
  .nullish();

export const insertTenantSchema = createInsertSchema(tenantsTable)
  .omit({
    id: true,
    tokensUsedCurrentMonth: true,
    messagesSentToday: true,
    createdAt: true,
    updatedAt: true,
    planStartedAt: true,
  })
  .extend({
    analysisStalenessHours: positiveIntOrNull,
    analysisMessageThreshold: positiveIntOrNull,
    maxAnalysesPerHour: positiveIntOrNull,
    billingCycle: billingCycleOrNull,
    tipoFechamentoDefault: tipoFechamentoOrNull,
    provisioningMethod: provisioningMethodEnum,
  });

export const updateTenantSchema = createSelectSchema(tenantsTable)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    analysisStalenessHours: positiveIntOrNull,
    analysisMessageThreshold: positiveIntOrNull,
    maxAnalysesPerHour: positiveIntOrNull,
    billingCycle: billingCycleOrNull,
    tipoFechamentoDefault: tipoFechamentoOrNull,
    provisioningMethod: provisioningMethodEnum,
  })
  .partial();

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type UpdateTenant = z.infer<typeof updateTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
