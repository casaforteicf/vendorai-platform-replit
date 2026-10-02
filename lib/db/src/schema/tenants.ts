import {
  pgTable,
  text,
  integer,
  bigint,
  numeric,
  timestamp,
  boolean,
  pgEnum,
  json,
  check,
  varchar,
} from "drizzle-orm/pg-core";
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

export const supportedCountryCodes = ["BR", "PY", "AR", "UY", "CL"] as const;
export const supportedTenantLocales = [
  "pt-BR",
  "es-PY",
  "es-AR",
  "es-UY",
  "es-CL",
] as const;
export const supportedTenantCurrencies = [
  "BRL",
  "USD",
  "PYG",
  "ARS",
  "UYU",
  "CLP",
] as const;

export const tenantsTable = pgTable(
  "tenants",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // Identidade pública, curta, imutável e única do tenant (ex.: VAI-000031).
    // O banco gera o valor via tenant_public_code_seq; o UUID continua sendo a PK interna.
    tenantCode: varchar("tenant_code", { length: 16 })
      .notNull()
      .unique()
      .default(sql`'VAI-' || lpad(nextval('tenant_public_code_seq')::text, 6, '0')`),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    status: tenantStatusEnum("status").notNull().default("active"),
    vertical: text("vertical"),
    // Opcional -- segunda vertical do mesmo tenant (ex: padaria que também
    // é confeitaria, ótica que também é clínica). Generaliza o padrão que
    // antes só existia pro Pet Shop via exceção escrita na mão no código
    // de elegibilidade de módulos. Nulo pra maioria dos tenants.
    verticalSecundaria: text("vertical_secundaria"),
    countryCode: varchar("country_code", { length: 2 })
      .$type<(typeof supportedCountryCodes)[number]>()
      .notNull()
      .default("BR"),
    defaultLocale: varchar("default_locale", { length: 12 })
      .$type<(typeof supportedTenantLocales)[number]>()
      .notNull()
      .default("pt-BR"),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("America/Sao_Paulo"),
    defaultCurrency: varchar("default_currency", { length: 3 })
      .$type<(typeof supportedTenantCurrencies)[number]>()
      .notNull()
      .default("BRL"),
    supportedCurrencies: json("supported_currencies")
      .$type<(typeof supportedTenantCurrencies)[number][]>()
      .notNull()
      .default(["BRL"]),
    taxIdentifierType: varchar("tax_identifier_type", { length: 32 }),
    taxIdentifier: varchar("tax_identifier", { length: 64 }),
    agentsEnabled: json("agents_enabled")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    // Classificações configuráveis de contatos que não são leads.
    // Cada tenant mantém sua própria lista sem misturar esses contatos
    // com a pipeline comercial.
    naoLeadClassificacoes: json("nao_lead_classificacoes")
      .$type<Array<{ id: string; label: string; active?: boolean; description?: string }>>()
      .notNull()
      .default([
        { id: "colaborador", label: "Colaborador", active: true },
        { id: "fornecedor", label: "Fornecedor", active: true },
        { id: "parceiro", label: "Parceiro", active: true },
        { id: "familiar", label: "Familiar", active: true },
        { id: "amigo", label: "Amigo", active: true },
        { id: "outro", label: "Outro", active: true },
      ]),
    setupCompletedAt: timestamp("setup_completed_at"),
    autonomyEnabledAt: timestamp("autonomy_enabled_at"),
    monthlyTokenLimit: integer("monthly_token_limit"),
    tokensUsedCurrentMonth: integer("tokens_used_current_month")
      .notNull()
      .default(0),
    dailyMessageLimit: integer("daily_message_limit"),
    messagesSentToday: integer("messages_sent_today").notNull().default(0),
    // Horário comercial pra mensagens PROATIVAS (campanhas de reativação,
    // follow-up automático, Revenue Scout) — mensagens de RESPOSTA a um
    // cliente que chamou nunca são bloqueadas por isso, só o disparo
    // espontâneo do sistema. As horas são interpretadas no timezone do tenant.
    horarioComercialInicio: integer("horario_comercial_inicio")
      .notNull()
      .default(8),
    horarioComercialFim: integer("horario_comercial_fim").notNull().default(18),
    analysisStalenessHours: integer("analysis_staleness_hours"),
    analysisMessageThreshold: integer("analysis_message_threshold"),
    maxAnalysesPerHour: integer("max_analyses_per_hour"),
    webhookEstoqueUrl: text("webhook_estoque_url"),
    apiKeyEstoque: text("api_key_estoque"),
    integrationType: text("integration_type").default("api"),
    tipoFechamentoDefault: text("tipo_fechamento_default").$type<
      "pedido" | "contrato" | "pedido_e_contrato"
    >(),
    // Valor efetivamente negociado/cobrado do tenant (campo legado preservado).
    mensalidadeValor: numeric("mensalidade_valor", { precision: 10, scale: 2 }),
    mensalidadeTabelaValor: numeric("mensalidade_tabela_valor", { precision: 10, scale: 2 }),
    taxaImplantacaoValor: numeric("taxa_implantacao_valor", { precision: 10, scale: 2 }),
    descontoPercentual: numeric("desconto_percentual", { precision: 5, scale: 2 }),
    formaPagamento: varchar("forma_pagamento", { length: 32 }).$type<
      "pix" | "boleto" | "cartao" | "transferencia" | "outro"
    >(),
    statusPagamento: varchar("status_pagamento", { length: 24 }).$type<
      "pago" | "pendente" | "atrasado" | "isento"
    >(),
    diaVencimento: integer("dia_vencimento"),
    ultimoPagamentoEm: timestamp("ultimo_pagamento_em"),
    proximoPagamentoEm: timestamp("proximo_pagamento_em"),
    contratoInicioEm: timestamp("contrato_inicio_em"),
    contratoFimEm: timestamp("contrato_fim_em"),
    renovacaoAutomatica: boolean("renovacao_automatica").notNull().default(false),
    origemCliente: varchar("origem_cliente", { length: 80 }),
    responsavelComercial: varchar("responsavel_comercial", { length: 160 }),
    observacoesComerciais: text("observacoes_comerciais"),
    motivoDesconto: text("motivo_desconto"),
    cancelamentoSolicitadoEm: timestamp("cancelamento_solicitado_em"),
    canceladoEm: timestamp("cancelado_em"),
    motivoCancelamento: text("motivo_cancelamento"),
    tokenCredits: bigint("token_credits", { mode: "number" }).notNull().default(0),
    partnerId: text("partner_id").references(() => partnersTable.id, {
      onDelete: "set null",
    }),
    indicadoPor: text("indicado_por").references(() => partnersTable.id, {
      onDelete: "set null",
    }),
    subdomainSlug: text("subdomain_slug").unique(),
    planId: text("plan_id").references(() => plansTable.id, {
      onDelete: "set null",
    }),
    billingCycle: text("billing_cycle").$type<"monthly" | "annual">(),
    planStartedAt: timestamp("plan_started_at"),
    // Demo permanece um tenant normal: mesma identidade, dados e histórico.
    // Ao converter para pagante, isDemo muda para false e tenantCode não muda.
    isDemo: boolean("is_demo").notNull().default(false),
    demoStartedAt: timestamp("demo_started_at"),
    demoExpiresAt: timestamp("demo_expires_at"),
    demoConvertedAt: timestamp("demo_converted_at"),
    demoSeeded: boolean("demo_seeded").notNull().default(false),
    openaiApiKeyEncrypted: text("openai_api_key_encrypted"),
    openaiKeyConfiguredAt: timestamp("openai_key_configured_at"),
    openaiKeyStatus: text("openai_key_status").default("nao_configurada"),
    anthropicApiKeyEncrypted: text("anthropic_api_key_encrypted"),
    anthropicKeyConfiguredAt: timestamp("anthropic_key_configured_at"),
    anthropicKeyStatus: text("anthropic_key_status").default("nao_configurada"),
    aiCreditsUsd: numeric("ai_credits_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    aiDailySpendUsd: numeric("ai_daily_spend_usd", { precision: 12, scale: 6 })
      .notNull()
      .default("0"),
    aiDailySpendResetAt: timestamp("ai_daily_spend_reset_at"),
    prospectStatus: text("prospect_status").notNull().default("learning"),
    suspendedReason: text("suspended_reason"),
    planMigratedFrom: text("plan_migrated_from"),
    planMigratedAt: timestamp("plan_migrated_at"),
    extraUserSlots: integer("extra_user_slots").notNull().default(0),
    provisioningMethod: text("provisioning_method").$type<
      "self_service" | "manual" | "trial"
    >(),
    createdByAdminId: text("created_by_admin_id"),
    accessSentAt: timestamp("access_sent_at"),
    firstLoginAt: timestamp("first_login_at"),
    internalNotes: text("internal_notes"),
    onboardingConcluido: boolean("onboarding_concluido")
      .notNull()
      .default(false),
    integracoesConcluido: boolean("integracoes_concluido")
      .notNull()
      .default(false),
    // Confirmação de estoque antes do financeiro: quando true, o fechamento
    // pausa em deals.etapa="conferencia_estoque" (novo agent_task tipo
    // "conferencia_estoque") antes de disparar contrato/cobrança.
    confirmarEstoqueAntesFinanceiro: boolean(
      "confirmar_estoque_antes_financeiro",
    )
      .notNull()
      .default(false),
    // FK para users.id — sem .references() para evitar import circular
    // (users.ts já importa tenantsTable). Escolha livre do tenant, não
    // amarrado a uma função/cargo específico.
    usuarioConferenciaEstoqueId: text("usuario_conferencia_estoque_id"),
    integracoesStep: integer("integracoes_step").notNull().default(0),
    asaasApiKey: text("asaas_api_key"),
    googleReviewLink: text("google_review_link"),
    zapsignApiKey: text("zapsign_api_key"),
    whatsappProvider: varchar("whatsapp_provider", { length: 20 }).default(
      "zapi",
    ),
    instagramProvider: varchar("instagram_provider", { length: 20 }).default(
      "meta",
    ),
    nomeEmpresa: varchar("nome_empresa", { length: 255 }),
    segmento: varchar("segmento", { length: 100 }),
    logoUrl: varchar("logo_url", { length: 500 }),
    corPrimaria: varchar("cor_primaria", { length: 7 }).default("#A78BFA"),
    site: varchar("site", { length: 255 }),
    descricao: text("descricao"),
    proposalStyleMemory: json("proposal_style_memory").$type<{
      toneNotes?: string;
      structureNotes?: string;
      contentNotes?: string;
      avoidNotes?: string;
      editCount?: number;
      updatedAt?: string;
    }>(),
    // FK para organizacoes.id — nullable; sem .references() para evitar import circular.
    // Preencher via BLOCO 14 ao vincular tenant a uma organização (rede de lojas).
    organizacaoId: text("organizacao_id"),
    comissaoPadraoPercentual: numeric("comissao_padrao_percentual", {
      precision: 5,
      scale: 2,
    }).default("0"),
    // Praça.ai (marketplace) — colunas já existiam no banco (criadas via
    // migration direta antes deste schema ser atualizado), adicionadas aqui
    // pra bater com a realidade do banco de produção.
    vendeNoPracaAi: boolean("vende_no_praca_ai").notNull().default(false),
    // Rede de Parceiros entre tenants (Opportunity Engine) — opt-in
    // explícito: um tenant fornecedor/indústria/prestador marca que quer
    // receber cotações de outros tenants (ex: escritórios de arquitetura),
    // filtradas pelas categorias que ele escolhe. Nunca visibilidade
    // aberta — só cotações endereçadas especificamente a ele.
    parceiroRedeAtivo: boolean("parceiro_rede_ativo").notNull().default(false),
    parceiroCategorias: json("parceiro_categorias")
      .$type<string[]>()
      .default([]),
    // Programa de marca (white-label) — ex: "arqdor". Independente da
    // vertical: tanto o negócio principal do programa quanto os
    // fornecedores/parceiros que vendem pra esse público entram aqui.
    // Quando preenchido, logo/cor do programa substituem o padrão
    // Vendor.ai na experiência desse tenant.
    programaMarca: text("programa_marca"),
    // Copiado do programa quando aplicado — true esconde "Vendor.ai"
    // completamente da experiência desse tenant (só a marca do programa).
    whiteLabelCompleto: boolean("white_label_completo")
      .notNull()
      .default(false),
    freteMesmaCidade: numeric("frete_mesma_cidade", {
      precision: 10,
      scale: 2,
    }).default("0"),
    freteOutraCidade: numeric("frete_outra_cidade", {
      precision: 10,
      scale: 2,
    }).default("15.90"),
    freteGratisAcimaDe: numeric("frete_gratis_acima_de", {
      precision: 10,
      scale: 2,
    }).default("79.00"),
    // Comissão da Praça.ai sobre venda originada de lá (distinta de
    // comissaoPadraoPercentual, que é do módulo de rede de parceiros/revenda).
    comissaoPracaAiPercentual: numeric("comissao_praca_ai_percentual", {
      precision: 5,
      scale: 2,
    }).default("8.00"),
    // Código de embaixador do Praça.ai usado no cadastro (?ref=CODIGO) —
    // guardado pra rastreabilidade, mesmo que a chamada de indicação em si
    // já tenha sido disparada no momento do signup.
    codigoIndicacaoPraca: text("codigo_indicacao_praca"),
    // Marketing por tenant — cada cliente cola o próprio ID de conversão
    // pros sites gerados pelo Vendor.ai (LP/site do tenant). Independente
    // da tag do institucional appvendorai.com. Formato esperado:
    // googleAdsConversionId = "AW-XXXXXXXXX", metaPixelId = ID numérico do Meta.
    googleAdsConversionId: varchar("google_ads_conversion_id", { length: 40 }),
    metaPixelId: varchar("meta_pixel_id", { length: 40 }),
    linkedinInsightTagId: varchar("linkedin_insight_tag_id", { length: 40 }),
    tiktokPixelId: varchar("tiktok_pixel_id", { length: 80 }),
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
    check(
      "tenants_country_code_check",
      sql`${table.countryCode} IN ('BR', 'PY', 'AR', 'UY', 'CL')`,
    ),
    check(
      "tenants_default_locale_check",
      sql`${table.defaultLocale} IN ('pt-BR', 'es-PY', 'es-AR', 'es-UY', 'es-CL')`,
    ),
    check(
      "tenants_default_currency_check",
      sql`${table.defaultCurrency} IN ('BRL', 'USD', 'PYG', 'ARS', 'UYU', 'CLP')`,
    ),
    check(
      "tenants_dia_vencimento_check",
      sql`${table.diaVencimento} IS NULL OR (${table.diaVencimento} >= 1 AND ${table.diaVencimento} <= 31)`,
    ),
    check(
      "tenants_desconto_percentual_check",
      sql`${table.descontoPercentual} IS NULL OR (${table.descontoPercentual} >= 0 AND ${table.descontoPercentual} <= 100)`,
    ),
  ],
);

const positiveIntOrNull = z
  .int()
  .min(1, "Must be a positive integer (>= 1)")
  .nullable()
  .optional();

const billingCycleOrNull = z.enum(["monthly", "annual"]).nullable().optional();

const tipoFechamentoOrNull = z
  .enum(["pedido", "contrato", "pedido_e_contrato"])
  .nullable()
  .optional();

const provisioningMethodEnum = z
  .enum(["trial", "self_service", "manual"])
  .nullish();

const countryCodeSchema = z.enum(supportedCountryCodes);
const tenantLocaleSchema = z.enum(supportedTenantLocales);
const tenantCurrencySchema = z.enum(supportedTenantCurrencies);
const supportedCurrenciesSchema = z.array(tenantCurrencySchema).min(1);
const nullableTimestampInput = z.coerce.date().nullable().optional();
const paymentMethodInput = z.enum(["pix", "boleto", "cartao", "transferencia", "outro"]).nullable().optional();
const paymentStatusInput = z.enum(["pago", "pendente", "atrasado", "isento"]).nullable().optional();

export const insertTenantSchema = createInsertSchema(tenantsTable)
  .omit({
    id: true,
    tenantCode: true,
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
    countryCode: countryCodeSchema.optional(),
    defaultLocale: tenantLocaleSchema.optional(),
    defaultCurrency: tenantCurrencySchema.optional(),
    supportedCurrencies: supportedCurrenciesSchema.optional(),
  });

export const updateTenantSchema = createSelectSchema(tenantsTable)
  .omit({
    id: true,
    tenantCode: true,
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
    countryCode: countryCodeSchema,
    defaultLocale: tenantLocaleSchema,
    defaultCurrency: tenantCurrencySchema,
    supportedCurrencies: supportedCurrenciesSchema,
    formaPagamento: paymentMethodInput,
    statusPagamento: paymentStatusInput,
    demoStartedAt: nullableTimestampInput,
    demoExpiresAt: nullableTimestampInput,
    demoConvertedAt: nullableTimestampInput,
    ultimoPagamentoEm: nullableTimestampInput,
    proximoPagamentoEm: nullableTimestampInput,
    contratoInicioEm: nullableTimestampInput,
    contratoFimEm: nullableTimestampInput,
    cancelamentoSolicitadoEm: nullableTimestampInput,
    canceladoEm: nullableTimestampInput,
  })
  .partial();

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type UpdateTenant = z.infer<typeof updateTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;