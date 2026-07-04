CREATE TYPE "public"."user_function" AS ENUM('vendedor', 'financeiro', 'suporte', 'entrega', 'administrador', 'outro');--> statement-breakpoint
CREATE TYPE "public"."anexo_categoria" AS ENUM('projeto', 'imagem', 'documento', 'outras_informacoes');--> statement-breakpoint
CREATE TYPE "public"."payment_composition_forma" AS ENUM('pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'boleto', 'transferencia', 'outro');--> statement-breakpoint
CREATE TYPE "public"."ai_feature" AS ENUM('agent_sdr', 'agent_closer', 'agent_followup', 'agent_reactivation', 'agent_scheduler', 'agent_service', 'agent_onboarding', 'agent_relacionamento', 'proposal_generator', 'briefing_generator', 'site_generator', 'content_generator', 'image_generator', 'audio_transcription', 'intelligence_analysis', 'document_extraction', 'embedding', 'web_search', 'media_interpretation', 'auto_quote');--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."bug_report_categoria" AS ENUM('bug', 'duvida', 'sugestao');--> statement-breakpoint
CREATE TYPE "public"."bug_report_prioridade" AS ENUM('baixa', 'media', 'alta', 'critica');--> statement-breakpoint
CREATE TYPE "public"."bug_report_status" AS ENUM('aberto', 'em_analise', 'resolvido');--> statement-breakpoint
ALTER TYPE "public"."deal_etapa" ADD VALUE 'parceiro';--> statement-breakpoint
ALTER TYPE "public"."activity_tipo" ADD VALUE 'escalacao_humano';--> statement-breakpoint
ALTER TYPE "public"."activity_tipo" ADD VALUE 'handoff_agente';--> statement-breakpoint
ALTER TYPE "public"."agent_task_agent_name" ADD VALUE 'relacionamento';--> statement-breakpoint
CREATE TABLE "obra_orcamento_etapas" (
	"id" text PRIMARY KEY NOT NULL,
	"orcamento_id" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_orcamento_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"etapa_id" text NOT NULL,
	"nome" text NOT NULL,
	"unidade" text DEFAULT 'un' NOT NULL,
	"quantidade" numeric(15, 4) DEFAULT '1' NOT NULL,
	"custo_unitario" numeric(15, 4) DEFAULT '0' NOT NULL,
	"bdi" numeric(5, 2),
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_orcamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"obra_id" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"titulo" text,
	"descricao" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"bdi_global" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_compositions" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"forma" "payment_composition_forma" NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"comprovante_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_briefings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"channels_used" jsonb,
	"contact_type" text,
	"approached_by" text,
	"contact_date" text,
	"situation_answers" jsonb,
	"problem_answers" jsonb,
	"problem_minimized" boolean DEFAULT false,
	"implication_answers" jsonb,
	"implication_estimated_value" text,
	"need_answers" jsonb,
	"need_thermometer" text,
	"objections" jsonb,
	"prospect_size" text,
	"presentation_sent" boolean DEFAULT false,
	"presentation_sent_date" text,
	"presentation_link" text,
	"next_step_type" text,
	"next_step_date" text,
	"free_notes" text,
	"ai_summary" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_briefings_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "lead_products" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"nome" text NOT NULL,
	"imagem_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"version" integer NOT NULL,
	"html_content" text NOT NULL,
	"json_content" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_calendar_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"commercial_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enable_spouse_gift_flow" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_calendar_settings_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "lead_spouse_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"consent_status" text DEFAULT 'none' NOT NULL,
	"consent_given" boolean DEFAULT false NOT NULL,
	"consent_given_at" timestamp,
	"consent_requested_at" timestamp,
	"spouse_lead_id" text,
	"gift_preference" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_spouse_consent_lead_id_unique" UNIQUE("lead_id")
);
--> statement-breakpoint
CREATE TABLE "lead_campaign_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"campaign_type" text NOT NULL,
	"campaign_key" text NOT NULL,
	"year" text NOT NULL,
	"sent_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_campaign_log_event_unique" UNIQUE("tenant_id","lead_id","campaign_key","year")
);
--> statement-breakpoint
CREATE TABLE "product_presentations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"product_name" text NOT NULL,
	"catalog_product_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"html_content" text NOT NULL,
	"json_content" text NOT NULL,
	"web_sources" jsonb,
	"reviewed_by" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"model" text NOT NULL,
	"feature" "ai_feature" NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_estimate_usd" numeric(12, 6) NOT NULL,
	"used_byok" boolean DEFAULT false NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"api_name" text NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"requests_used" integer DEFAULT 0 NOT NULL,
	"requests_limit" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_enrichments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"nome_empresa" text,
	"endereco" text,
	"rating" numeric(2, 1),
	"review_count" integer,
	"telefone" text,
	"whatsapp" text,
	"instagram" text,
	"site_oficial" text,
	"cnpj" text,
	"razao_social" text,
	"nome_fantasia" text,
	"situacao_cadastral" text,
	"atividade_principal" text,
	"pontos_fortes" jsonb,
	"dores_principais" jsonb,
	"publico_alvo" text,
	"tipo_negocio" text,
	"nivel_presenca_digital" text,
	"resumo_negocio" text,
	"score_prospector" integer,
	"tem_contato" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"message_type" text,
	"generated_text" text,
	"approved_text" text,
	"action" text,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospect_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"status" text,
	"day1_sent_at" timestamp,
	"day3_sent_at" timestamp,
	"day7_sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposta_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plan_slug" text NOT NULL,
	"cycle" text NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "proposta_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "obra_lancamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"obra_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tipo" text DEFAULT 'outros' NOT NULL,
	"fornecedor" text,
	"numero" text,
	"valor" numeric(15, 2) DEFAULT '0' NOT NULL,
	"data_emissao" date,
	"data_vencimento" date,
	"descricao" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"etapa_id" text,
	"documento_url" text,
	"asaas_payment_id" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_commissions" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tipo" text,
	"valor_base" numeric(10, 2),
	"percentual" numeric(5, 2),
	"valor" numeric(10, 2),
	"data_referencia" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_indicators" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"mes_referencia" date NOT NULL,
	"total_clientes_ativos" integer DEFAULT 0 NOT NULL,
	"total_comissao" numeric(10, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text,
	"tenant_id" text,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"empresa" text,
	"objetivo" text,
	"status" text DEFAULT 'novo' NOT NULL,
	"source" text DEFAULT 'parceiro' NOT NULL,
	"prospector_job_id" text,
	"google_place_id" text,
	"score" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_prospector_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"cidade" text NOT NULL,
	"uf" text NOT NULL,
	"nichos" jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"total_encontrados" integer DEFAULT 0,
	"total_qualificados" integer DEFAULT 0,
	"total_inseridos" integer DEFAULT 0,
	"erro_msg" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prospector_flows" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"segmento" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospector_flow_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"ordem" integer NOT NULL,
	"canal" text NOT NULL,
	"delay_horas" integer DEFAULT 0,
	"mensagem_template" text,
	"material_tipo" text,
	"material_prompt" text,
	"material_prompt_vars" jsonb,
	"material_upload_url" text,
	"material_upload_nome" text,
	"material_fonte" text
);
--> statement-breakpoint
CREATE TABLE "prospector_flow_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"step_id" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"material_gerado_url" text,
	"agendado_para" timestamp,
	"executado_em" timestamp,
	"erro_msg" text
);
--> statement-breakpoint
CREATE TABLE "agent_defaults" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" text,
	"system_prompt_base" text NOT NULL,
	"parametros_base" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_defaults_agent_key_unique" UNIQUE("agent_key")
);
--> statement-breakpoint
CREATE TABLE "tenant_agent_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_key" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"system_prompt_custom" text,
	"parametros" jsonb,
	"nome_perfil" text,
	"tom" text DEFAULT 'profissional' NOT NULL,
	"restricoes" text,
	"knowledge_base_ids" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_agent_configs_tenant_agent_unique" UNIQUE("tenant_id","agent_key")
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"step_atual" integer DEFAULT 1 NOT NULL,
	"step1_completo" boolean DEFAULT false NOT NULL,
	"step2_completo" boolean DEFAULT false NOT NULL,
	"step3_completo" boolean DEFAULT false NOT NULL,
	"step4_completo" boolean DEFAULT false NOT NULL,
	"concluido" boolean DEFAULT false NOT NULL,
	"concluido_em" timestamp,
	"dados_step1" jsonb,
	"dados_step2" jsonb,
	"dados_step3" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "tenant_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"canal" varchar(20) NOT NULL,
	"provider" varchar(20) DEFAULT 'zapi' NOT NULL,
	"status" varchar(20) DEFAULT 'inativo',
	"credenciais" jsonb,
	"phone_number_id" varchar(100),
	"waba_id" varchar(100),
	"ig_account_id" varchar(100),
	"webhook_verify_token" varchar(100),
	"ultimo_teste" timestamp,
	"ultimo_erro" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_channels_tenant_canal_unique" UNIQUE("tenant_id","canal")
);
--> statement-breakpoint
CREATE TABLE "arch_projetos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cliente_nome" varchar(255),
	"cliente_email" varchar(255),
	"cliente_telefone" varchar(20),
	"titulo" varchar(255) NOT NULL,
	"descricao" text,
	"status" varchar(30) DEFAULT 'briefing',
	"tipo_obra" varchar(50),
	"area_m2" numeric(8, 2),
	"orcamento_total" numeric(12, 2),
	"prazo_estimado" integer,
	"arquiteto_responsavel" varchar(255),
	"portal_token" varchar(64),
	"portal_ativo" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_ambientes" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"nome" varchar(100),
	"area_m2" numeric(6, 2),
	"descricao" text,
	"ordem" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "arch_orcamento_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"ambiente_id" text,
	"categoria" varchar(50),
	"descricao" varchar(255) NOT NULL,
	"quantidade" numeric(8, 2),
	"unidade" varchar(20),
	"valor_unitario" numeric(10, 2),
	"valor_total" numeric(12, 2),
	"fornecedor" varchar(255),
	"produto_id" text,
	"gerado_por_ia" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "arch_catalogo" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"categoria" varchar(50),
	"subcategoria" varchar(50),
	"fornecedor" varchar(255),
	"preco_base" numeric(10, 2),
	"unidade" varchar(20),
	"imagens" jsonb,
	"especificacoes" jsonb,
	"ativo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_cenas" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"ambiente_id" text,
	"nome" varchar(100),
	"scene_data" jsonb,
	"render_url" varchar(500),
	"thumbnail_url" varchar(500),
	"status" varchar(20) DEFAULT 'rascunho',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_renders" (
	"id" text PRIMARY KEY NOT NULL,
	"cena_id" text NOT NULL,
	"blender_job_id" varchar(100),
	"status" varchar(20) DEFAULT 'aguardando',
	"image_url" varchar(500),
	"resolucao" varchar(20) DEFAULT '1920x1080',
	"tempo_render_ms" integer,
	"erro_msg" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_marketplace_items" (
	"id" text PRIMARY KEY NOT NULL,
	"vendedor_tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"categoria" varchar(50),
	"preco" numeric(10, 2),
	"comissao_vendorai" numeric(5, 2) DEFAULT '10',
	"imagens" jsonb,
	"especificacoes" jsonb,
	"ativo" boolean DEFAULT true,
	"total_vendas" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_marketplace_pedidos" (
	"id" text PRIMARY KEY NOT NULL,
	"comprador_tenant_id" text NOT NULL,
	"item_id" text NOT NULL,
	"projeto_id" text,
	"quantidade" numeric(8, 2),
	"valor_unitario" numeric(10, 2),
	"valor_total" numeric(12, 2),
	"comissao" numeric(10, 2),
	"status" varchar(20) DEFAULT 'pendente',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_render_versoes" (
	"id" text PRIMARY KEY NOT NULL,
	"cena_id" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	"image_url" varchar(500) NOT NULL,
	"prompt" text,
	"scene_data" jsonb,
	"origem" varchar(20) DEFAULT 'original',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_render_solicitacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"cena_id" text NOT NULL,
	"cliente_nome" varchar(255),
	"status" varchar(20) DEFAULT 'pendente',
	"itens_adicionados" jsonb,
	"texturas_alteradas" jsonb,
	"observacoes" text,
	"versao_gerada_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processado_em" timestamp
);
--> statement-breakpoint
CREATE TABLE "arch_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"style" text NOT NULL,
	"image_url" text NOT NULL,
	"saved" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "render_surface_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"surface_id" text NOT NULL,
	"material_name" text NOT NULL,
	"material_prompt_fragment" text,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"applied_by" text
);
--> statement-breakpoint
CREATE TABLE "render_surfaces" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"category" text NOT NULL,
	"label" text NOT NULL,
	"mask_path" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_ai_renders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"project_id" text,
	"parent_render_id" text,
	"mode" varchar(20) DEFAULT 'criar' NOT NULL,
	"ambiente" text NOT NULL,
	"estilo" text,
	"iluminacao" text,
	"angulo" text,
	"mask_zones" jsonb,
	"mask_file_url" text,
	"original_image_url" text,
	"result_image_url" text,
	"segmentation_confidence" jsonb,
	"composited" boolean DEFAULT false,
	"version_tag" varchar(30),
	"status" varchar(30) DEFAULT 'processando',
	"erro_msg" text,
	"prompt" text,
	"motor" varchar(50),
	"retentativas" varchar(5) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"concluido_em" timestamp
);
--> statement-breakpoint
CREATE TABLE "arch_project_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"nome_config" text NOT NULL,
	"mode" varchar(20) DEFAULT 'preservar' NOT NULL,
	"estilo" text,
	"iluminacao" text,
	"angulo_padrao" text,
	"paleta_materiais" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beauty_servicos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"descricao" text,
	"categoria" varchar(50),
	"duracao_minutos" integer NOT NULL,
	"preco" numeric(10, 2) NOT NULL,
	"comissao_profissional" numeric(5, 2) DEFAULT '0',
	"ativo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beauty_profissionais" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255),
	"telefone" varchar(20),
	"especialidades" jsonb,
	"comissao_base" numeric(5, 2) DEFAULT '40',
	"ativo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beauty_agendamentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cliente_id" text NOT NULL,
	"profissional_id" text,
	"servico_id" text NOT NULL,
	"data_hora" timestamp NOT NULL,
	"duracao_minutos" integer,
	"status" varchar(20) DEFAULT 'agendado',
	"valor" numeric(10, 2),
	"observacoes" text,
	"lembrete1_enviado" boolean DEFAULT false,
	"lembrete2_enviado" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beauty_prontuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cliente_id" text NOT NULL,
	"agendamento_id" text,
	"servico" varchar(255),
	"profissional" varchar(255),
	"observacoes" text,
	"fotos_antes" jsonb,
	"fotos_depois" jsonb,
	"produtos_usados" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_especialidades" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(100) NOT NULL,
	"descricao" text,
	"duracao_consulta_minutos" integer DEFAULT 30,
	"valor_consulta" numeric(10, 2),
	"ativo" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "clinic_convenios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"codigo_ans" varchar(20),
	"contato" varchar(255),
	"ativo" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "clinic_medicos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"crm" varchar(30),
	"especialidade_id" text,
	"email" varchar(255),
	"telefone" varchar(20),
	"ativo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_consultas" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"paciente_id" text NOT NULL,
	"medico_id" text NOT NULL,
	"especialidade_id" text,
	"data_hora" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'agendada',
	"tipo_atendimento" varchar(20) DEFAULT 'presencial',
	"convenio" varchar(100),
	"numero_carteirinha" varchar(50),
	"valor" numeric(10, 2),
	"lembrete1_enviado" boolean DEFAULT false,
	"lembrete2_enviado" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_prontuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"paciente_id" text NOT NULL,
	"consulta_id" text,
	"queixa_principal" text,
	"anamnese" text,
	"exame" text,
	"diagnostico" text,
	"cid10" varchar(10),
	"prescricao" text,
	"retorno" date,
	"arquivos" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_regras" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" varchar(255) NOT NULL,
	"tipo" varchar(50) NOT NULL,
	"condicoes" jsonb NOT NULL,
	"acao" jsonb NOT NULL,
	"ativo" boolean DEFAULT true,
	"total_disparos" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scout_oportunidades" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cliente_id" text NOT NULL,
	"regra_id" text NOT NULL,
	"tipo" varchar(50),
	"descricao" text,
	"valor_estimado" numeric(10, 2),
	"status" varchar(20) DEFAULT 'pendente',
	"canal" varchar(20),
	"mensagem_enviada" text,
	"respondeu" boolean DEFAULT false,
	"converteu" boolean DEFAULT false,
	"enviado_em" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_service_gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"cliente_id" text NOT NULL,
	"servico_ou_produto" varchar(255),
	"ultima_compra" date,
	"proxima_recompra_estimada" date,
	"dias_atraso" integer DEFAULT 0,
	"valor_estimado" numeric(10, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text,
	"contract_type" text,
	"status" text DEFAULT 'pending_signature' NOT NULL,
	"zapsign_doc_id" text,
	"zapsign_sign_url" text,
	"pdf_url" text,
	"sent_at" timestamp,
	"signed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text,
	"asaas_payment_id" text,
	"invoice_url" text,
	"valor" numeric(12, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"split_percent" numeric(5, 2),
	"partner_wallet_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"flow" text,
	"deal_id" text,
	"step" text,
	"status" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactivation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending',
	"loss_reason" text,
	"executed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_verticais" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" varchar(50) NOT NULL,
	"nome" varchar(100) NOT NULL,
	"tag_categoria" varchar(100),
	"titulo" varchar(255),
	"descricao" text,
	"resultado_titulo" varchar(255),
	"resultado_descricao" text,
	"beneficios_esquerda" jsonb,
	"beneficios_direita" jsonb,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_verticais_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "site_contatos" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"telefone" varchar(20),
	"empresa" varchar(255),
	"mensagem" text,
	"origem" varchar(50),
	"status" varchar(20) DEFAULT 'novo' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospector_config" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"setor" text,
	"cidade" text,
	"raio_km" integer,
	"ritmo_diario" integer DEFAULT 10 NOT NULL,
	"auto_dispatch_threshold" integer DEFAULT 80 NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"horario_cron" text DEFAULT '09:00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prospector_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"place_id" text NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"endereco" text,
	"setor" text,
	"cidade" text,
	"website" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"dados_completos" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"reference_type" text DEFAULT 'agendamento' NOT NULL,
	"recipient" text NOT NULL,
	"channel" text NOT NULL,
	"notification_type" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sdr_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"cenario" text NOT NULL,
	"ordem" integer DEFAULT 1 NOT NULL,
	"delay_horas" integer DEFAULT 0 NOT NULL,
	"template" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_studio_uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"file_url" text NOT NULL,
	"purpose" text DEFAULT 'style_reference' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segment_benchmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"segmento" text NOT NULL,
	"ticket_medio" numeric(10, 2),
	"taxa_resposta_padrao" numeric(5, 2),
	"volume_medio_atendimentos" integer,
	"perda_estimada_por_lead_perdido" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "segment_benchmarks_segmento_unique" UNIQUE("segmento")
);
--> statement-breakpoint
CREATE TABLE "sdr_vertical_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"vertical" text NOT NULL,
	"tom" text NOT NULL,
	"vocabulario" jsonb DEFAULT '[]'::jsonb,
	"dores_tipicas" jsonb DEFAULT '[]'::jsonb,
	"abertura_padrao" text NOT NULL,
	"exemplos" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sdr_vertical_profiles_vertical_unique" UNIQUE("vertical")
);
--> statement-breakpoint
CREATE TABLE "prospecting_objections" (
	"id" text PRIMARY KEY NOT NULL,
	"segmento" text,
	"objecao" text NOT NULL,
	"frequencia" integer DEFAULT 1 NOT NULL,
	"respostas" jsonb DEFAULT '[]'::jsonb,
	"taxa_conversao" numeric(5, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_events" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"score_boost" integer DEFAULT 0,
	"expires_at" timestamp,
	"notified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cnae_vertical_map" (
	"cnae" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"vertical" text NOT NULL,
	"prioridade" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arq_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"object_client_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"material" text,
	"finish" text,
	"color" text,
	"dimensions" jsonb,
	"position" jsonb,
	"visual_weight" real,
	"design_intent" jsonb,
	"component_id" text,
	"manufacturer_id" text,
	"locked" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arq_materials" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"material_client_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"finish" text DEFAULT '' NOT NULL,
	"gloss" real DEFAULT 0,
	"palette" jsonb,
	"used_by_objects" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arq_aie_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"projeto_id" text NOT NULL,
	"overall_score" real,
	"render_readiness_score" real,
	"material_score" real,
	"consistency_score" real,
	"composition_score" real,
	"lighting_score" real,
	"photography_score" real,
	"geometry_score" real,
	"prompt_quality_score" real,
	"full_result" jsonb,
	"project_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_prompt_variations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"translator" varchar(50) NOT NULL,
	"detail" varchar(50) NOT NULL,
	"prompt" text NOT NULL,
	"negative_prompt" text DEFAULT '' NOT NULL,
	"estimated_tokens" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"saved_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"type" text DEFAULT 'SUPPLIER' NOT NULL,
	"logo_url" text,
	"description" text,
	"website" text,
	"phone" text,
	"email" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'BR',
	"regions" jsonb DEFAULT '[]'::jsonb,
	"segments" jsonb DEFAULT '[]'::jsonb,
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '["pt-BR"]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"tier" text DEFAULT 'basic' NOT NULL,
	"cnpj" text,
	"working_hours" jsonb DEFAULT '{}'::jsonb,
	"social_media" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"total_leads" integer DEFAULT 0 NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_partner_products" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"description" text,
	"category" text,
	"subcategory" text,
	"collection" text,
	"price" numeric(12, 2),
	"price_unit" text DEFAULT 'un',
	"currency" text DEFAULT 'BRL',
	"in_stock" boolean DEFAULT true NOT NULL,
	"lead_time_days" integer,
	"min_order_qty" integer DEFAULT 1,
	"image_url" text,
	"images" jsonb DEFAULT '[]'::jsonb,
	"specs" jsonb DEFAULT '{}'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"colors" jsonb DEFAULT '[]'::jsonb,
	"finishes" jsonb DEFAULT '[]'::jsonb,
	"dimensions" jsonb DEFAULT '{}'::jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"total_quotes" integer DEFAULT 0 NOT NULL,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_partner_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"region" text,
	"whatsapp" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vep_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'OTHER' NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"logo_url" text,
	"cover_url" text,
	"description" text,
	"mission" text,
	"history" text,
	"website" text,
	"cnpj" text,
	"phone" text,
	"email" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'BR',
	"address" text,
	"segments" jsonb DEFAULT '[]'::jsonb,
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '["pt-BR"]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"tier" text DEFAULT 'basic' NOT NULL,
	"founded_year" integer,
	"team_size" text,
	"social_media" jsonb DEFAULT '{}'::jsonb,
	"working_hours" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"projects_count" integer DEFAULT 0 NOT NULL,
	"portfolio_count" integer DEFAULT 0 NOT NULL,
	"tenant_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vep_professionals" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"name" text NOT NULL,
	"role" text,
	"title" text,
	"bio" text,
	"avatar_url" text,
	"email" text,
	"phone" text,
	"linkedin" text,
	"instagram" text,
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '["pt-BR"]'::jsonb,
	"register_number" text,
	"register_type" text,
	"user_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vep_portfolio" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" text DEFAULT 'PROJECT' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cover_url" text,
	"media_urls" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"style" text,
	"area" integer,
	"year" integer,
	"city" text,
	"state" text,
	"partner_ids" jsonb DEFAULT '[]'::jsonb,
	"views_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"saves_count" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vep_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"from_company_id" text NOT NULL,
	"to_company_id" text NOT NULL,
	"type" text DEFAULT 'follow' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vcn_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'MANUFACTURER' NOT NULL,
	"legal_name" text NOT NULL,
	"brand_name" text,
	"logo_url" text,
	"cover_url" text,
	"description" text,
	"website" text,
	"cnpj" text,
	"phone" text,
	"email" text,
	"city" text,
	"state" text,
	"country" text DEFAULT 'BR',
	"address" text,
	"segments" jsonb DEFAULT '[]'::jsonb,
	"categories" jsonb DEFAULT '[]'::jsonb,
	"regions" jsonb DEFAULT '[]'::jsonb,
	"specialties" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '["pt-BR"]'::jsonb,
	"certification_level" text DEFAULT 'official' NOT NULL,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"verified" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"founded_year" integer,
	"team_size" text,
	"social_media" jsonb DEFAULT '{}'::jsonb,
	"working_hours" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"products_count" integer DEFAULT 0 NOT NULL,
	"specifications_count" integer DEFAULT 0 NOT NULL,
	"quotations_count" integer DEFAULT 0 NOT NULL,
	"specialists_count" integer DEFAULT 0 NOT NULL,
	"tenant_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vcn_specialists" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"specialist_type" text DEFAULT 'GENERAL' NOT NULL,
	"avatar_url" text,
	"description" text,
	"system_prompt" text,
	"knowledge_topics" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '["pt-BR"]'::jsonb,
	"response_style" text DEFAULT 'professional',
	"agent_config_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vcn_products" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"line" text,
	"model" text,
	"sku" text,
	"description" text,
	"cover_url" text,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"finishes" jsonb DEFAULT '[]'::jsonb,
	"colors" jsonb DEFAULT '[]'::jsonb,
	"materials" jsonb DEFAULT '[]'::jsonb,
	"dimensions" jsonb DEFAULT '{}'::jsonb,
	"compatibility" jsonb DEFAULT '[]'::jsonb,
	"related_skus" jsonb DEFAULT '[]'::jsonb,
	"specs" jsonb DEFAULT '{}'::jsonb,
	"bim_urls" jsonb DEFAULT '[]'::jsonb,
	"cad_urls" jsonb DEFAULT '[]'::jsonb,
	"pbr_urls" jsonb DEFAULT '[]'::jsonb,
	"texture_urls" jsonb DEFAULT '[]'::jsonb,
	"manual_urls" jsonb DEFAULT '[]'::jsonb,
	"video_urls" jsonb DEFAULT '[]'::jsonb,
	"price" numeric(12, 2),
	"price_unit" text,
	"in_stock" boolean DEFAULT true NOT NULL,
	"lead_time_days" integer,
	"warranty_months" integer,
	"norms" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"specifications_count" integer DEFAULT 0 NOT NULL,
	"quotations_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"category" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vcn_knowledge" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"type" text DEFAULT 'PDF' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_url" text,
	"file_size" integer,
	"mime_type" text,
	"product_skus" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"indexed" boolean DEFAULT false NOT NULL,
	"indexed_at" timestamp,
	"chunk_count" integer,
	"published" boolean DEFAULT true NOT NULL,
	"language" text DEFAULT 'pt-BR',
	"version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poe_opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"project_name" text,
	"type" text DEFAULT 'missing_item' NOT NULL,
	"status" text DEFAULT 'detected' NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"environment" text,
	"category" text,
	"item_ref" text,
	"justification" text,
	"technical_basis" jsonb DEFAULT '[]'::jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poe_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"vcn_company_id" text,
	"vcn_product_id" text,
	"company_name" text,
	"product_name" text,
	"product_sku" text,
	"score_technical" integer,
	"score_aesthetic" integer,
	"score_dimensional" integer,
	"score_financial" integer,
	"score_regional" integer,
	"score_lead_time" integer,
	"score_overall" integer,
	"justification" text NOT NULL,
	"advantages" jsonb DEFAULT '[]'::jsonb,
	"caveats" jsonb DEFAULT '[]'::jsonb,
	"estimated_price" numeric(12, 2),
	"price_unit" text,
	"lead_time_days" integer,
	"in_stock" boolean,
	"region" text,
	"selected" boolean DEFAULT false NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"rank" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poe_quotation_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text,
	"project_name" text,
	"items" jsonb DEFAULT '[]'::jsonb,
	"vcn_company_id" text,
	"company_name" text,
	"contact_email" text,
	"contact_phone" text,
	"region" text,
	"deadline" timestamp,
	"notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"lead_id" text,
	"opportunity_id" text,
	"activity_id" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poe_quotation_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"vcn_company_id" text,
	"company_name" text,
	"responded_by" text,
	"items" jsonb DEFAULT '[]'::jsonb,
	"total_price" numeric(14, 2),
	"currency" text DEFAULT 'BRL',
	"valid_until" timestamp,
	"lead_time_days" integer,
	"notes" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"selected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arqdor_workspace_projects" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"context_blob" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arqdor_workspace_projects_id_tenant_id_pk" PRIMARY KEY("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "content_library" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"variation" jsonb NOT NULL,
	"theme" text,
	"title" text,
	"saved_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text NOT NULL,
	"categoria" "bug_report_categoria" DEFAULT 'bug' NOT NULL,
	"status" "bug_report_status" DEFAULT 'aberto' NOT NULL,
	"prioridade" "bug_report_prioridade" DEFAULT 'media' NOT NULL,
	"rota_afetada" text,
	"erro_tecnico" text,
	"stack_trace" text,
	"resposta_suporte" text,
	"resolvido_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_spec_items" (
	"id" text PRIMARY KEY NOT NULL,
	"specification_id" text NOT NULL,
	"categoria" text NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" integer DEFAULT 1,
	"confianca" numeric(3, 2) DEFAULT '0.80',
	"status" text DEFAULT 'pendente' NOT NULL,
	"catalogo_item_id" text,
	"override_nome" text,
	"override_fornecedor" text,
	"override_preco" numeric(10, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arch_specifications" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"projeto_id" text NOT NULL,
	"render_id" text,
	"render_image_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"items_count" integer DEFAULT 0,
	"specified_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partners" DROP CONSTRAINT "partners_email_unique";--> statement-breakpoint
ALTER TABLE "partners" DROP CONSTRAINT "partners_cnpj_unique";--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "cnpj" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_configs" ALTER COLUMN "monthly_token_limit" SET DEFAULT 26250000;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ALTER COLUMN "tenant_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "tenant_id" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "nome_fantasia" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "cidade" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "uf" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "licenca_exclusiva" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "status" text DEFAULT 'ativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "nivel" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "data_cadastro" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "indicado_por" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "anthropic_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "anthropic_key_configured_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "anthropic_key_status" text DEFAULT 'nao_configurada';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_credits_usd" numeric(12, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_daily_spend_usd" numeric(12, 6) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_daily_spend_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "prospect_status" text DEFAULT 'learning' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_migrated_from" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_migrated_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "extra_user_slots" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "provisioning_method" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "created_by_admin_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "access_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "first_login_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "onboarding_concluido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "integracoes_concluido" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "integracoes_step" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "asaas_api_key" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "zapsign_api_key" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "whatsapp_provider" varchar(20) DEFAULT 'zapi';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "instagram_provider" varchar(20) DEFAULT 'meta';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "nome_empresa" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "segmento" varchar(100);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "cor_primaria" varchar(7) DEFAULT '#A78BFA';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "site" varchar(255);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "descricao" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "user_function" "user_function" DEFAULT 'outro';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "force_password_reset" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "partner_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "mercado_segmento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cor_destaque" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "cor_secundaria" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "genero" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "birth_month" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "birth_day" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "special_date_messages_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "pipeline_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "ia_ativa" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tipo_pessoa" text DEFAULT 'fisica' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "dados_pj" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enrichment_status" text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "propensity_score" integer;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "roi_estimate" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "enrichment_data" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "priority_reason" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_inbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "current_agent" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "url_linha_produtos" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "metodo_vendas" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "special_date_messages_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "whatsapp_template_id" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "comment_keywords" jsonb;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "data_fechamento" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "won_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "skip_asaas_billing" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "aquecimento_tipo" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "ai_briefing" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "ai_briefing_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "spin_briefing" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "spin_generated_at" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "anexo_nome" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "anexo_url" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "anexo_mime_type" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "anexo_tamanho" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "anexo_categoria" "anexo_categoria";--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "accepted_via" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "accepted_by" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "payment_compositions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "mensagens_etapa" jsonb;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "codigo_barras" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "product_type" text DEFAULT 'physical' NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "descricao_longa" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "marca" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "tags" jsonb;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "destaque" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "imagens" jsonb;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "peso" numeric(10, 3);--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "dimensoes" jsonb;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "modalidade" text;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "criado_por" text DEFAULT 'humano';--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "participantes" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "content_generations" ADD COLUMN "content_format" text;--> statement-breakpoint
ALTER TABLE "content_generations" ADD COLUMN "aspect_ratio" text;--> statement-breakpoint
ALTER TABLE "billing_events" ADD COLUMN "proposta_id" text;--> statement-breakpoint
ALTER TABLE "obras" ADD COLUMN "portal_token" text;--> statement-breakpoint
ALTER TABLE "generated_sites" ADD COLUMN "site_slug" text;--> statement-breakpoint
ALTER TABLE "generated_sites" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "ai_quota_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "max_users" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "extra_user_price_cents" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "places_api_limit" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "obra_orcamento_etapas" ADD CONSTRAINT "obra_orcamento_etapas_orcamento_id_obra_orcamentos_id_fk" FOREIGN KEY ("orcamento_id") REFERENCES "public"."obra_orcamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_orcamento_itens" ADD CONSTRAINT "obra_orcamento_itens_etapa_id_obra_orcamento_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."obra_orcamento_etapas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_orcamentos" ADD CONSTRAINT "obra_orcamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_orcamentos" ADD CONSTRAINT "obra_orcamentos_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_compositions" ADD CONSTRAINT "payment_compositions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_briefings" ADD CONSTRAINT "lead_briefings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_briefings" ADD CONSTRAINT "lead_briefings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_briefings" ADD CONSTRAINT "lead_briefings_approached_by_users_id_fk" FOREIGN KEY ("approached_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_products" ADD CONSTRAINT "lead_products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_products" ADD CONSTRAINT "lead_products_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_proposals" ADD CONSTRAINT "lead_proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_calendar_settings" ADD CONSTRAINT "tenant_calendar_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_spouse_consent" ADD CONSTRAINT "lead_spouse_consent_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_spouse_consent" ADD CONSTRAINT "lead_spouse_consent_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_campaign_log" ADD CONSTRAINT "lead_campaign_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_campaign_log" ADD CONSTRAINT "lead_campaign_log_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_enrichments" ADD CONSTRAINT "prospect_enrichments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_enrichments" ADD CONSTRAINT "prospect_enrichments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_approvals" ADD CONSTRAINT "prospect_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_approvals" ADD CONSTRAINT "prospect_approvals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_campaigns" ADD CONSTRAINT "prospect_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospect_campaigns" ADD CONSTRAINT "prospect_campaigns_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_lancamentos" ADD CONSTRAINT "obra_lancamentos_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_lancamentos" ADD CONSTRAINT "obra_lancamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_lancamentos" ADD CONSTRAINT "obra_lancamentos_etapa_id_obra_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."obra_etapas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_indicators" ADD CONSTRAINT "partner_indicators_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_leads" ADD CONSTRAINT "partner_leads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_flows" ADD CONSTRAINT "prospector_flows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_flow_steps" ADD CONSTRAINT "prospector_flow_steps_flow_id_prospector_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."prospector_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_flow_executions" ADD CONSTRAINT "prospector_flow_executions_flow_id_prospector_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."prospector_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_flow_executions" ADD CONSTRAINT "prospector_flow_executions_lead_id_partner_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."partner_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_flow_executions" ADD CONSTRAINT "prospector_flow_executions_step_id_prospector_flow_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."prospector_flow_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_agent_configs" ADD CONSTRAINT "tenant_agent_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_progress" ADD CONSTRAINT "onboarding_progress_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_channels" ADD CONSTRAINT "tenant_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_projetos" ADD CONSTRAINT "arch_projetos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_ambientes" ADD CONSTRAINT "arch_ambientes_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_orcamento_itens" ADD CONSTRAINT "arch_orcamento_itens_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_orcamento_itens" ADD CONSTRAINT "arch_orcamento_itens_ambiente_id_arch_ambientes_id_fk" FOREIGN KEY ("ambiente_id") REFERENCES "public"."arch_ambientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_catalogo" ADD CONSTRAINT "arch_catalogo_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_cenas" ADD CONSTRAINT "arch_cenas_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_cenas" ADD CONSTRAINT "arch_cenas_ambiente_id_arch_ambientes_id_fk" FOREIGN KEY ("ambiente_id") REFERENCES "public"."arch_ambientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_renders" ADD CONSTRAINT "arch_renders_cena_id_arch_cenas_id_fk" FOREIGN KEY ("cena_id") REFERENCES "public"."arch_cenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_marketplace_items" ADD CONSTRAINT "arch_marketplace_items_vendedor_tenant_id_tenants_id_fk" FOREIGN KEY ("vendedor_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_marketplace_pedidos" ADD CONSTRAINT "arch_marketplace_pedidos_comprador_tenant_id_tenants_id_fk" FOREIGN KEY ("comprador_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_marketplace_pedidos" ADD CONSTRAINT "arch_marketplace_pedidos_item_id_arch_marketplace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."arch_marketplace_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_marketplace_pedidos" ADD CONSTRAINT "arch_marketplace_pedidos_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_render_versoes" ADD CONSTRAINT "arch_render_versoes_cena_id_arch_cenas_id_fk" FOREIGN KEY ("cena_id") REFERENCES "public"."arch_cenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_render_solicitacoes" ADD CONSTRAINT "arch_render_solicitacoes_cena_id_arch_cenas_id_fk" FOREIGN KEY ("cena_id") REFERENCES "public"."arch_cenas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_render_solicitacoes" ADD CONSTRAINT "arch_render_solicitacoes_versao_gerada_id_arch_render_versoes_id_fk" FOREIGN KEY ("versao_gerada_id") REFERENCES "public"."arch_render_versoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_suggestions" ADD CONSTRAINT "arch_suggestions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_suggestions" ADD CONSTRAINT "arch_suggestions_project_id_arch_projetos_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."arch_projetos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_surface_materials" ADD CONSTRAINT "render_surface_materials_surface_id_render_surfaces_id_fk" FOREIGN KEY ("surface_id") REFERENCES "public"."render_surfaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_surface_materials" ADD CONSTRAINT "render_surface_materials_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "render_surfaces" ADD CONSTRAINT "render_surfaces_project_id_arch_projetos_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_servicos" ADD CONSTRAINT "beauty_servicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_profissionais" ADD CONSTRAINT "beauty_profissionais_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_agendamentos" ADD CONSTRAINT "beauty_agendamentos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_agendamentos" ADD CONSTRAINT "beauty_agendamentos_cliente_id_leads_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_agendamentos" ADD CONSTRAINT "beauty_agendamentos_profissional_id_beauty_profissionais_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."beauty_profissionais"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_agendamentos" ADD CONSTRAINT "beauty_agendamentos_servico_id_beauty_servicos_id_fk" FOREIGN KEY ("servico_id") REFERENCES "public"."beauty_servicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_prontuarios" ADD CONSTRAINT "beauty_prontuarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_prontuarios" ADD CONSTRAINT "beauty_prontuarios_cliente_id_leads_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beauty_prontuarios" ADD CONSTRAINT "beauty_prontuarios_agendamento_id_beauty_agendamentos_id_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."beauty_agendamentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_especialidades" ADD CONSTRAINT "clinic_especialidades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_convenios" ADD CONSTRAINT "clinic_convenios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_medicos" ADD CONSTRAINT "clinic_medicos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_medicos" ADD CONSTRAINT "clinic_medicos_especialidade_id_clinic_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."clinic_especialidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_consultas" ADD CONSTRAINT "clinic_consultas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_consultas" ADD CONSTRAINT "clinic_consultas_paciente_id_leads_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_consultas" ADD CONSTRAINT "clinic_consultas_medico_id_clinic_medicos_id_fk" FOREIGN KEY ("medico_id") REFERENCES "public"."clinic_medicos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_consultas" ADD CONSTRAINT "clinic_consultas_especialidade_id_clinic_especialidades_id_fk" FOREIGN KEY ("especialidade_id") REFERENCES "public"."clinic_especialidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_prontuarios" ADD CONSTRAINT "clinic_prontuarios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_prontuarios" ADD CONSTRAINT "clinic_prontuarios_paciente_id_leads_id_fk" FOREIGN KEY ("paciente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_prontuarios" ADD CONSTRAINT "clinic_prontuarios_consulta_id_clinic_consultas_id_fk" FOREIGN KEY ("consulta_id") REFERENCES "public"."clinic_consultas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_regras" ADD CONSTRAINT "scout_regras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_oportunidades" ADD CONSTRAINT "scout_oportunidades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_oportunidades" ADD CONSTRAINT "scout_oportunidades_cliente_id_leads_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scout_oportunidades" ADD CONSTRAINT "scout_oportunidades_regra_id_scout_regras_id_fk" FOREIGN KEY ("regra_id") REFERENCES "public"."scout_regras"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_service_gaps" ADD CONSTRAINT "client_service_gaps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_service_gaps" ADD CONSTRAINT "client_service_gaps_cliente_id_leads_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."leads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactivation_queue" ADD CONSTRAINT "reactivation_queue_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_tenants" ADD CONSTRAINT "partner_tenants_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_tenants" ADD CONSTRAINT "partner_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_config" ADD CONSTRAINT "prospector_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_queue" ADD CONSTRAINT "prospector_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospector_queue" ADD CONSTRAINT "prospector_queue_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sdr_templates" ADD CONSTRAINT "sdr_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_studio_uploads" ADD CONSTRAINT "content_studio_uploads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arq_objects" ADD CONSTRAINT "arq_objects_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arq_materials" ADD CONSTRAINT "arq_materials_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arq_aie_snapshots" ADD CONSTRAINT "arq_aie_snapshots_projeto_id_arch_projetos_id_fk" FOREIGN KEY ("projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_prompt_variations" ADD CONSTRAINT "arch_prompt_variations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_partner_products" ADD CONSTRAINT "vpn_partner_products_partner_id_vpn_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."vpn_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_partner_contacts" ADD CONSTRAINT "vpn_partner_contacts_partner_id_vpn_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."vpn_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vep_professionals" ADD CONSTRAINT "vep_professionals_company_id_vep_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."vep_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vep_portfolio" ADD CONSTRAINT "vep_portfolio_company_id_vep_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."vep_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vep_connections" ADD CONSTRAINT "vep_connections_from_company_id_vep_companies_id_fk" FOREIGN KEY ("from_company_id") REFERENCES "public"."vep_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vep_connections" ADD CONSTRAINT "vep_connections_to_company_id_vep_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."vep_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vcn_specialists" ADD CONSTRAINT "vcn_specialists_company_id_vcn_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."vcn_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vcn_products" ADD CONSTRAINT "vcn_products_company_id_vcn_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."vcn_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vcn_knowledge" ADD CONSTRAINT "vcn_knowledge_company_id_vcn_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."vcn_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poe_recommendations" ADD CONSTRAINT "poe_recommendations_opportunity_id_poe_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."poe_opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poe_quotation_responses" ADD CONSTRAINT "poe_quotation_responses_request_id_poe_quotation_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."poe_quotation_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arqdor_workspace_projects" ADD CONSTRAINT "arqdor_workspace_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_spec_items" ADD CONSTRAINT "arch_spec_items_specification_id_arch_specifications_id_fk" FOREIGN KEY ("specification_id") REFERENCES "public"."arch_specifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arch_specifications" ADD CONSTRAINT "arch_specifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_commissions_partner_idx" ON "partner_commissions" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_commissions_tenant_idx" ON "partner_commissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partner_indicators_partner_mes_idx" ON "partner_indicators" USING btree ("partner_id","mes_referencia");--> statement-breakpoint
CREATE INDEX "partner_leads_partner_idx" ON "partner_leads" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "partner_leads_tenant_idx" ON "partner_leads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "partner_leads_job_idx" ON "partner_leads" USING btree ("prospector_job_id");--> statement-breakpoint
CREATE INDEX "prospector_flow_steps_flow_idx" ON "prospector_flow_steps" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "prospector_flow_steps_ordem_idx" ON "prospector_flow_steps" USING btree ("flow_id","ordem");--> statement-breakpoint
CREATE INDEX "prospector_flow_exec_flow_idx" ON "prospector_flow_executions" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "prospector_flow_exec_lead_idx" ON "prospector_flow_executions" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "prospector_flow_exec_status_idx" ON "prospector_flow_executions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_tenants_partner_tenant_idx" ON "partner_tenants" USING btree ("partner_id","tenant_id");--> statement-breakpoint
CREATE INDEX "idx_vpn_products_partner" ON "vpn_partner_products" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_vpn_products_category" ON "vpn_partner_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_vpn_contacts_partner" ON "vpn_partner_contacts" USING btree ("partner_id");--> statement-breakpoint
CREATE INDEX "idx_vep_companies_type" ON "vep_companies" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_vep_companies_status" ON "vep_companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vep_professionals_company" ON "vep_professionals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_vep_portfolio_company" ON "vep_portfolio" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_vep_portfolio_type" ON "vep_portfolio" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_vep_connections_from" ON "vep_connections" USING btree ("from_company_id");--> statement-breakpoint
CREATE INDEX "idx_vep_connections_to" ON "vep_connections" USING btree ("to_company_id");--> statement-breakpoint
CREATE INDEX "idx_vcn_companies_type" ON "vcn_companies" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_vcn_companies_status" ON "vcn_companies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vcn_companies_cert" ON "vcn_companies" USING btree ("certification_level");--> statement-breakpoint
CREATE INDEX "idx_vcn_specialists_company" ON "vcn_specialists" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_vcn_products_company" ON "vcn_products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_vcn_products_category" ON "vcn_products" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_vcn_knowledge_company" ON "vcn_knowledge" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_vcn_knowledge_type" ON "vcn_knowledge" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_poe_opportunities_tenant" ON "poe_opportunities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_poe_opportunities_project" ON "poe_opportunities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_poe_opportunities_status" ON "poe_opportunities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_poe_recs_opportunity" ON "poe_recommendations" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "idx_poe_recs_company" ON "poe_recommendations" USING btree ("vcn_company_id");--> statement-breakpoint
CREATE INDEX "idx_poe_quot_req_tenant" ON "poe_quotation_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_poe_quot_req_status" ON "poe_quotation_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_poe_quot_req_company" ON "poe_quotation_requests" USING btree ("vcn_company_id");--> statement-breakpoint
CREATE INDEX "idx_poe_quot_resp_request" ON "poe_quotation_responses" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_indicado_por_partners_id_fk" FOREIGN KEY ("indicado_por") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras" ADD CONSTRAINT "obras_portal_token_unique" UNIQUE("portal_token");--> statement-breakpoint
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_site_slug_unique" UNIQUE("site_slug");