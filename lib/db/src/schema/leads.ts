import { pgTable, text, timestamp, jsonb, boolean, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

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
  // Pós-venda: quando setado, a próxima mensagem recebida do lead é tratada
  // como resposta à pesquisa de satisfação da entrega (não passa pelo roteamento
  // normal de agentes). Sem FK para evitar import circular com entregas.ts.
  pendingFeedbackEntregaId: text("pending_feedback_entrega_id"),
  // Revenue Scout (sequencia_produto): quando setado, a próxima mensagem do lead é
  // tratada como resposta à oferta do próximo produto da sequência (não passa pelo
  // roteamento normal de agentes até ser resolvida). Sem FK para evitar import circular.
  pendingSequenceOportunidadeId: text("pending_sequence_oportunidade_id"),
  assignedTo: text("assigned_to").references(() => usersTable.id, { onDelete: "set null" }),
  instagramScopedId: text("instagram_scoped_id"),
  instagramHandle: text("instagram_handle"),
  endereco: text("endereco"),
  dataNascimento: text("data_nascimento"),
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
