CREATE TYPE "public"."tenant_status" AS ENUM('active', 'suspended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('super_admin', 'tenant_admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."agent_action_status" AS ENUM('pending', 'approved', 'executed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."deal_etapa" AS ENUM('novo', 'qualificado', 'proposta', 'negociacao', 'ganho', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('pendente', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."activity_tipo" AS ENUM('ligacao', 'whatsapp', 'email', 'visita', 'tarefa');--> statement-breakpoint
CREATE TYPE "public"."proposta_status" AS ENUM('rascunho', 'enviada', 'aceita', 'rejeitada', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."message_canal" AS ENUM('whatsapp', 'instagram', 'email', 'chat');--> statement-breakpoint
CREATE TYPE "public"."message_direcao" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TYPE "public"."message_enviado_por" AS ENUM('lead', 'agente_ia', 'humano');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('enviado', 'entregue', 'lido', 'erro');--> statement-breakpoint
CREATE TYPE "public"."message_tipo_conteudo" AS ENUM('texto', 'imagem', 'audio', 'documento');--> statement-breakpoint
CREATE TYPE "public"."agent_task_agent_name" AS ENUM('sdr', 'closer', 'followup', 'reactivation', 'scheduler', 'service', 'onboarding');--> statement-breakpoint
CREATE TYPE "public"."agent_task_status" AS ENUM('pendente_aprovacao', 'aprovado', 'executando', 'concluido', 'rejeitado', 'erro');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('rascunho', 'agendada', 'enviando', 'concluida', 'pausada');--> statement-breakpoint
CREATE TYPE "public"."campaign_tipo" AS ENUM('whatsapp', 'email', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."agendamento_status" AS ENUM('agendado', 'confirmado', 'concluido', 'cancelado', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."agendamento_tipo" AS ENUM('reuniao', 'visita', 'consulta', 'instalacao');--> statement-breakpoint
CREATE TYPE "public"."subscription_plano" AS ENUM('starter', 'growth', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'ativa', 'inadimplente', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."invoice_forma_pagamento" AS ENUM('pix', 'cartao', 'boleto');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pendente', 'paga', 'atrasada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."rule_acao" AS ENUM('criar_agent_task', 'criar_campanha', 'notificar_usuario', 'criar_atividade');--> statement-breakpoint
CREATE TYPE "public"."rule_trigger" AS ENUM('lead_criado', 'churn_risk_alto', 'proposta_enviada', 'agendamento_proximo', 'sem_atividade_x_dias', 'deal_ganho', 'deal_perdido');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"vertical" text,
	"agents_enabled" json DEFAULT '{}'::json NOT NULL,
	"setup_completed_at" timestamp,
	"autonomy_enabled_at" timestamp,
	"monthly_token_limit" integer,
	"tokens_used_current_month" integer DEFAULT 0 NOT NULL,
	"daily_message_limit" integer,
	"messages_sent_today" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"platform_role" "platform_role" DEFAULT 'member' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"empresa" text,
	"tamanho_equipe" text,
	"objetivo" text,
	"urgencia" text,
	"orcamento" text,
	"plano_recomendado" text,
	"dor_principal" text,
	"proxima_acao" text,
	"status" text DEFAULT 'novo' NOT NULL,
	"active_agent_lock" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"channel" text,
	"status" text DEFAULT 'open' NOT NULL,
	"agent_name" text,
	"metadata" json,
	"ultima_mensagem_em" timestamp,
	"nao_lidas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"agent_name" text NOT NULL,
	"action_type" text NOT NULL,
	"status" "agent_action_status" DEFAULT 'pending' NOT NULL,
	"payload" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"channel" text NOT NULL,
	"consent_given_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" text,
	"endereco" text,
	"telefone" text,
	"email" text,
	"vertical" text,
	"produtos" jsonb,
	"discovery_completed_at" timestamp,
	"discovery_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "business_profiles_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agents" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"daily_message_limit" integer DEFAULT 100 NOT NULL,
	"messages_sent_today" integer DEFAULT 0 NOT NULL,
	"monthly_token_limit" integer DEFAULT 100000 NOT NULL,
	"tokens_used_current_month" integer DEFAULT 0 NOT NULL,
	"setup_completed_at" timestamp,
	"autonomy_enabled_at" timestamp,
	"messages_sent_today_reset_at" timestamp,
	"tokens_reset_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_configs_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "funis" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"etapas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"titulo" text NOT NULL,
	"valor" numeric(12, 2),
	"etapa" "deal_etapa" DEFAULT 'novo' NOT NULL,
	"funil_id" text,
	"probabilidade" integer DEFAULT 0,
	"data_fechamento_prevista" timestamp,
	"motivo_perda" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"deal_id" text,
	"tipo" "activity_tipo" NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"status" "activity_status" DEFAULT 'pendente' NOT NULL,
	"data_vencimento" timestamp,
	"concluida_em" timestamp,
	"responsavel_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "propostas" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"deal_id" text,
	"titulo" text NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valor_total" numeric(12, 2),
	"status" "proposta_status" DEFAULT 'rascunho' NOT NULL,
	"validade_ate" timestamp,
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"direcao" "message_direcao" NOT NULL,
	"canal" "message_canal" NOT NULL,
	"conteudo" text NOT NULL,
	"tipo_conteudo" "message_tipo_conteudo" DEFAULT 'texto' NOT NULL,
	"enviado_por" "message_enviado_por" NOT NULL,
	"agent_name" text,
	"status" "message_status" DEFAULT 'enviado' NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_intelligence" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"behavior_score" jsonb,
	"intent_analysis" text,
	"goal_analysis" text,
	"journey_stage" text,
	"opportunities" jsonb,
	"churn_risk" integer,
	"churn_reasons" jsonb,
	"next_best_action" text,
	"next_best_action_reason" text,
	"last_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_intelligence_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "agent_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"agent_name" "agent_task_agent_name" NOT NULL,
	"action_type" text NOT NULL,
	"payload" jsonb,
	"status" "agent_task_status" DEFAULT 'pendente_aprovacao' NOT NULL,
	"result" jsonb,
	"error_message" text,
	"scheduled_for" timestamp,
	"executed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "campaign_tipo" NOT NULL,
	"segmento_filtro" jsonb,
	"mensagem" text NOT NULL,
	"status" "campaign_status" DEFAULT 'rascunho' NOT NULL,
	"agendada_para" timestamp,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"total_enviados" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produtos_catalogo" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" text,
	"preco_base" numeric(12, 2) NOT NULL,
	"unidade" text DEFAULT 'un' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"deal_id" text,
	"tipo" "agendamento_tipo" NOT NULL,
	"titulo" text NOT NULL,
	"data_hora_inicio" timestamp NOT NULL,
	"data_hora_fim" timestamp NOT NULL,
	"local" text,
	"status" "agendamento_status" DEFAULT 'agendado' NOT NULL,
	"responsavel_id" text,
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plano" "subscription_plano" NOT NULL,
	"valor_mensal" numeric(12, 2) NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"asaas_customer_id" text,
	"asaas_subscription_id" text,
	"data_inicio" timestamp NOT NULL,
	"proxima_cobranca" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"subscription_id" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"status" "invoice_status" DEFAULT 'pendente' NOT NULL,
	"forma_pagamento" "invoice_forma_pagamento",
	"asaas_invoice_id" text,
	"link_pagamento" text,
	"data_vencimento" timestamp NOT NULL,
	"data_pagamento" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_base" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"titulo" text NOT NULL,
	"conteudo" text NOT NULL,
	"categoria" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"trigger" "rule_trigger" NOT NULL,
	"condicoes" jsonb DEFAULT '[]'::jsonb,
	"acao" "rule_acao" NOT NULL,
	"acao_payload" jsonb DEFAULT '{}'::jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions_log" ADD CONSTRAINT "agent_actions_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions_log" ADD CONSTRAINT "agent_actions_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funis" ADD CONSTRAINT "funis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_funil_id_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."funis"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD CONSTRAINT "customer_intelligence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD CONSTRAINT "customer_intelligence_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD CONSTRAINT "produtos_catalogo_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;