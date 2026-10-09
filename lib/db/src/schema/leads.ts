import { pgTable, text, timestamp, jsonb, boolean, integer, real, index, numeric, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { tenantUserFunctionsTable } from "./tenant_user_functions";

export const leadsTable = pgTable("leads", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenantsTable.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  telefone: text("telefone"),
  email: text("email"),
  empresa: text("empresa"),
  documento: text("documento"),
  tamanhoEquipe: text("tamanho_equipe"),
  objetivo: text("objetivo"),
  urgencia: text("urgencia"),
  orcamento: text("orcamento"),
  planoRecomendado: text("plano_recomendado"),
  dorPrincipal: text("dor_principal"),
  proximaAcao: text("proxima_acao"),
  status: text("status").notNull().default("novo"),
  activeAgentLock: text("active_agent_lock"),
  // "Nunca ativar agente" — decisão permanente por lead, diferente do
  // lock temporário acima. Marcada manualmente pra contatos pessoais
  // (não são leads de negócio de verdade) que entraram no WhatsApp do
  // tenant — o agente nunca despacha pra esse lead, nem uma vez.
  agenteDesativado: boolean("agente_desativado").notNull().default(false),
  // Exclusão lógica — lead nunca sai do banco de verdade. Null =
  // não excluído. Quando setado, sai das listagens padrão e vira
  // visível na aba "Excluídos" com o motivo registrado.
  excluidoEm: timestamp("excluido_em"),
  motivoExclusao: text("motivo_exclusao"),
  // Classificação como não-lead (D-003/D-003A) -- diferente de exclusão:
  // contato válido (colaborador, fornecedor, parceiro, familiar, amigo,
  // outro), só que não é prospect de venda. Sai da pipeline/análise de
  // churn quando setado; null = é lead de verdade.
  // Valor livre validado contra a configuração do tenant no backend.
  naoLeadTipo: text("nao_lead_tipo"),
  naoLeadNotas: text("nao_lead_notas"),
  naoLeadClassificadoEm: timestamp("nao_lead_classificado_em"),
  // Pós-venda: quando setado, a próxima mensagem recebida do lead é tratada
  // como resposta à pesquisa de satisfação da entrega (não passa pelo roteamento
  // normal de agentes). Sem FK para evitar import circular com entregas.ts.
  pendingFeedbackEntregaId: text("pending_feedback_entrega_id"),
  // Revenue Scout (sequencia_produto): quando setado, a próxima mensagem do lead é
  // tratada como resposta à oferta do próximo produto da sequência (não passa pelo
  // roteamento normal de agentes até ser resolvida). Sem FK para evitar import circular.
  pendingSequenceOportunidadeId: text("pending_sequence_oportunidade_id"),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  // Empresa representante tratada como responsável comercial externo.
  // Aponta para uma função do tenant representado (ex.: Krafht -> Windoor),
  // sem transformar os usuários da representante em usuários internos.
  representativeFunctionId: text("representative_function_id").references(() => tenantUserFunctionsTable.id, { onDelete: "set null" }),
  instagramScopedId: text("instagram_scoped_id"),
  // PSID (page-scoped ID) do Messenger — mesmo conceito do Instagram
  // Scoped ID, mas namespace separado (Messenger e Instagram Direct têm
  // IDs diferentes mesmo quando é a mesma pessoa/página).
  messengerScopedId: text("messenger_scoped_id"),
  instagramHandle: text("instagram_handle"),
  endereco: text("endereco"),
  // Cache do geocoding de `endereco` (Nominatim/OSM, mesma lib do módulo
  // Fretes) — usado pro critério de proximidade real (raio) na distribuição
  // de vendedor. Null até o primeiro geocode bem-sucedido; nunca bloqueia
  // criação do lead se a geocodificação falhar ou não rodar.
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  dataNascimento: text("data_nascimento"),
  profissao: text("profissao"),
  estadoCivil: text("estado_civil"),
  conjugeNome: text("conjuge_nome"),
  conjugeTelefone: text("conjuge_telefone"),
  conjugeEmail: text("conjuge_email"),
  conjugeDataNascimento: text("conjuge_data_nascimento"),

  // ── Dados para Contrato (qualificação do representante legal + testemunha) ──
  representanteCargo: text("representante_cargo"),
  representanteNacionalidade: text("representante_nacionalidade"),
  representanteEstadoCivil: text("representante_estado_civil"),
  representanteProfissao: text("representante_profissao"),
  representanteRg: text("representante_rg"),
  testemunha2Nome: text("testemunha2_nome"),
  testemunha2Cpf: text("testemunha2_cpf"),
  filhos: jsonb("filhos").$type<Array<{ nome: string; dataNascimento: string; genero?: string; birthMonth?: number; birthDay?: number; source?: string; lastCampaignSentYear?: number }>>(),
  discoveryData: jsonb("discovery_data").$type<Record<string, unknown>>(),
  tipo: text("tipo").notNull().default("cliente"),
  indicadoPor: text("indicado_por"),
  partnerVisible: boolean("partner_visible").notNull().default(true),
  notasNutricao: text("notas_nutricao"),
  source: text("source").notNull().default("manual"),
  // Atribuição comercial persistente da origem do lead. Permanece mesmo
  // quando a oportunidade é encaminhada para outro tenant pelo Arqdor Market.
  originTenantId: text("origin_tenant_id").references(() => tenantsTable.id, { onDelete: "set null" }),
  originSource: text("origin_source"),
  originCampaignId: text("origin_campaign_id"),
  originCapturedAt: timestamp("origin_captured_at", { withTimezone: true }),
  // Campanha de anúncio que gerou este lead, quando souber (captura de
  // UTM/parâmetro na origem) — separado de `source` (rótulo livre de
  // canal), usado pra métrica real de atribuição do módulo de Anúncios.
  adCampaignId: text("ad_campaign_id"),
  possivelDuplicata: boolean("possivel_duplicata").notNull().default(false),
  leadSimilarId: text("lead_similar_id"),

  // Proposta fields
  mercadoSegmento: text("mercado_segmento"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  corDestaque: text("cor_destaque"),
  corSecundaria: text("cor_secundaria"),

  // Family / relationship agent fields
  genero: text("genero"),
  birthMonth: integer("birth_month"),
  birthDay: integer("birth_day"),
  specialDateMessagesOptOut: boolean("special_date_messages_opt_out").notNull().default(false),
  specialDates: jsonb("special_dates").$type<Array<{
    id?: string;
    name: string;
    date: string;
    recurring?: boolean;
    category?: "personal" | "family" | "relationship" | "purchase" | "professional" | "custom";
    notes?: string;
    active?: boolean;
  }>>().notNull().default([]),

  // Spouse gift flow fields
  pipelineExempt: boolean("pipeline_exempt").notNull().default(false),

  // IA on/off por lead — quando false o agent-engine pula a resposta automática
  iaAtiva: boolean("ia_ativa").notNull().default(true),

  // Tipo de pessoa e dados PJ
  tipoPessoa: text("tipo_pessoa").notNull().default("fisica"),
  dadosPj: jsonb("dados_pj").$type<{
    cnpj?: string | null;
    razaoSocial?: string | null;
    segmento?: string | null;
    numFuncionarios?: string | null;
    faturamentoEstimado?: string | null;
    socios?: Array<{ nome: string; dataNascimento?: string; telefone?: string; email?: string }>;
  }>(),

  // Metadados extras (ex: dados do Google Places, fonte externa)
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),

  // ── Motor Preditivo (Cmd 22) ───────────────────────────────────────────────
  // pending → enriched → scored → dispatched | discarded
  enrichmentStatus: text("enrichment_status").$type<"pending" | "enriched" | "scored" | "dispatched" | "discarded">().default("pending"),
  propensityScore: integer("propensity_score"),           // 0-100
  // Limite de crédito B2B — genérico, útil pra distribuidora/atacado em
  // geral (não só alimentos). erp_titulos não tem vínculo confiável com
  // o lead (só um campo texto solto "pessoa"), por isso esses dois
  // campos são diretos aqui, não calculados automaticamente.
  limiteCredito: numeric("limite_credito", { precision: 14, scale: 2 }),
  creditoUtilizado: numeric("credito_utilizado", { precision: 14, scale: 2 }),
  roiEstimate: jsonb("roi_estimate").$type<{
    volume_atendimentos_mes?: number;
    perda_estimada_mes?: number;
    ganho_potencial_mes?: number;
    ticket_estimado?: string;
  }>(),
  enrichmentData: jsonb("enrichment_data").$type<{
    digital?: {
      tem_site?: boolean;
      site_qualidade?: "nenhum" | "simples" | "profissional";
      responde_whatsapp?: boolean;
      tem_agendamento_online?: boolean;
      tem_ecommerce?: boolean;
      presenca_instagram?: boolean;
      indicio_crm?: boolean;
      presenca_google?: boolean;
    };
    growth?: {
      reviews_velocity?: number;
      rating_trend?: "subindo" | "estavel" | "caindo";
      horario_estendido?: boolean;
      multiplas_unidades?: boolean;
      contratando?: boolean;
      anuncios_ativos?: boolean;
    };
    score_breakdown?: {
      dor_operacional?: number;
      momento_expansao?: number;
      capacidade_pagamento?: number;
    };
    enriquecido_em?: string;
  }>(),
  priorityReason: text("priority_reason"),

  // ── Pesquisa de maturidade em IA/automação (frio_teste) ───────────────────
  // 1 = responde tudo manualmente, sem sistema
  // 2 = tem sistema, mas sem IA
  // 3 = já usa IA ou automação de alguma forma
  maturidadeIA: integer("maturidade_ia"),
  dataRespostaPesquisa: timestamp("data_resposta_pesquisa"),

  // ── Sinais de intenção de compra (Revenue Scout) ──────────────────────────
  // Calculado em tempo real toda vez que um sinal de intenção é recebido.
  // 0-100. Boost no score das oportunidades geradas pelo Revenue Scout.
  intentScore: real("intent_score").default(0),
  lastIntentUpdate: timestamp("last_intent_update"),
  // Estágio atual da obra (vertical construção). Ex: fundacao, alvenaria, acabamento.
  constructionStage: text("construction_stage"),
  contextAnsweredAt: timestamp("context_answered_at"),

  // ── Perfil de atividade do negócio (SPIN adaptativo) ─────────────────────
  // Classificado via IA a partir do nome da empresa/segmento ao longo da conversa.
  // Ex: 'distribuidor', 'fabricante', 'varejista', 'prestador_servicos', 'outro'
  businessActivity: text("business_activity"),
  businessSubActivity: text("business_sub_activity"),
  businessDescription: text("business_description"),
  businessActivityConfidence: real("business_activity_confidence").default(0),

  // ── Churn tracking ────────────────────────────────────────────────────────
  isChurned: boolean("is_churned").notNull().default(false),
  churnedAt: timestamp("churned_at"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  tenantPhoneIdx: index("leads_tenant_phone_idx").on(table.tenantId, table.telefone),
  tenantDocIdx: index("leads_tenant_doc_idx").on(table.tenantId, table.documento),
  originTenantIdx: index("leads_origin_tenant_idx").on(table.originTenantId),
}));

export const insertLeadSchema = createInsertSchema(leadsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateLeadSchema = createSelectSchema(leadsTable)
  .omit({
    id: true,
    tenantId: true,
    createdAt: true,
    updatedAt: true,
    leadSimilarId: true,
    possivelDuplicata: true,
  })
  .partial();

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type UpdateLead = z.infer<typeof updateLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
