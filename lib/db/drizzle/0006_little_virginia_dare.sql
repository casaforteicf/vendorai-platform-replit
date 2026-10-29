CREATE TYPE "public"."deal_tipo_fechamento" AS ENUM('pedido', 'contrato', 'pedido_e_contrato');--> statement-breakpoint
CREATE TYPE "public"."forma_pagamento_proposta" AS ENUM('pix', 'boleto', 'cartao_credito', 'cartao_debito', 'transferencia', 'dinheiro', 'a_combinar');--> statement-breakpoint
CREATE TYPE "public"."movimentacao_tipo" AS ENUM('entrada', 'saida', 'ajuste');--> statement-breakpoint
CREATE TYPE "public"."billing_event_status" AS ENUM('pending', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."billing_event_type" AS ENUM('initial', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."varejo_colecao_status" AS ENUM('planejamento', 'ativa', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."varejo_temporada" AS ENUM('verao', 'inverno', 'outono', 'primavera', 'especial');--> statement-breakpoint
CREATE TYPE "public"."varejo_categoria_produto" AS ENUM('camiseta', 'calca', 'vestido', 'short', 'jaqueta', 'blazer', 'saia', 'acessorio', 'calcado', 'bolsa', 'outro');--> statement-breakpoint
CREATE TYPE "public"."varejo_genero_produto" AS ENUM('masculino', 'feminino', 'unissex', 'infantil');--> statement-breakpoint
CREATE TYPE "public"."varejo_pedido_compra_status" AS ENUM('rascunho', 'enviado', 'confirmado', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."varejo_nivel_fidelidade" AS ENUM('bronze', 'prata', 'ouro', 'diamante');--> statement-breakpoint
CREATE TYPE "public"."supermercado_categoria_produto" AS ENUM('hortifruti', 'carnes', 'frios_laticinios', 'padaria', 'bebidas', 'limpeza', 'higiene', 'mercearia', 'congelados', 'petshop', 'outros');--> statement-breakpoint
CREATE TYPE "public"."supermercado_pedido_origem" AS ENUM('whatsapp', 'app', 'balcao');--> statement-breakpoint
CREATE TYPE "public"."supermercado_pedido_status" AS ENUM('aguardando_confirmacao', 'confirmado', 'em_separacao', 'saiu_para_entrega', 'entregue', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."supermercado_campanha_envio_status" AS ENUM('pendente', 'enviado', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."supermercado_campanha_status" AS ENUM('rascunho', 'agendada', 'enviando', 'concluida', 'pausada');--> statement-breakpoint
CREATE TYPE "public"."supermercado_campanha_tipo" AS ENUM('promocao', 'receita', 'dica', 'data_comemorativa', 'reativacao');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending_dns', 'pending_ssl', 'active', 'failed');--> statement-breakpoint
ALTER TYPE "public"."platform_role" ADD VALUE 'tenant_seller' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."platform_role" ADD VALUE 'partner' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."agent_action_status" ADD VALUE 'blocked_by_plan';--> statement-breakpoint
ALTER TYPE "public"."deal_etapa" ADD VALUE 'em_aquecimento' BEFORE 'novo';--> statement-breakpoint
ALTER TYPE "public"."deal_etapa" ADD VALUE 'em_execucao' BEFORE 'perdido';--> statement-breakpoint
ALTER TYPE "public"."deal_etapa" ADD VALUE 'entregue' BEFORE 'perdido';--> statement-breakpoint
ALTER TYPE "public"."activity_status" ADD VALUE 'planejado';--> statement-breakpoint
ALTER TYPE "public"."activity_tipo" ADD VALUE 'reuniao';--> statement-breakpoint
ALTER TYPE "public"."proposta_status" ADD VALUE 'pendente' BEFORE 'aceita';--> statement-breakpoint
CREATE TABLE "partners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"cnpj" text NOT NULL,
	"phone" text NOT NULL,
	"user_id" text NOT NULL,
	"asaas_account_id" text,
	"asaas_wallet_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partners_email_unique" UNIQUE("email"),
	CONSTRAINT "partners_cnpj_unique" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE TABLE "agendas" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"cor" text DEFAULT '#3B82F6' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"google_calendar_id" text,
	"google_email" text,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"produto_id" text NOT NULL,
	"quantidade_atual" numeric(15, 4) DEFAULT '0' NOT NULL,
	"quantidade_minima" numeric(15, 4) DEFAULT '0' NOT NULL,
	"localizacao" text,
	"unidade" text DEFAULT 'un' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"tipo" "movimentacao_tipo" NOT NULL,
	"quantidade" numeric(15, 4) NOT NULL,
	"motivo" text NOT NULL,
	"referencia_id" text,
	"responsavel_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_config" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tipo" text DEFAULT 'landing_page' NOT NULL,
	"template" text DEFAULT 'padrao' NOT NULL,
	"cor_primaria" text,
	"tagline" text,
	"sobre_empresa" text,
	"whatsapp_contato" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_content" jsonb,
	"hero_image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "segment_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"prompts_sugeridos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"funil_padrao" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categorias_produto_sugeridas" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'tenant_admin' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "content_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"product_id" text,
	"product_name" text,
	"theme" text NOT NULL,
	"result" jsonb DEFAULT '{"variations":[]}'::jsonb NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"mes" text,
	"tipo" "billing_event_type" NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"asaas_charge_id" text,
	"asaas_customer_id" text,
	"status" "billing_event_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"valor" numeric(10, 2) NOT NULL,
	"credits" integer NOT NULL,
	"asaas_charge_id" text,
	"asaas_customer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoice_url" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_etapa_medicoes" (
	"id" text PRIMARY KEY NOT NULL,
	"etapa_id" text NOT NULL,
	"data" date NOT NULL,
	"percentual_anterior" numeric(5, 2) DEFAULT '0' NOT NULL,
	"percentual_novo" numeric(5, 2) NOT NULL,
	"responsavel_id" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_etapas" (
	"id" text PRIMARY KEY NOT NULL,
	"obra_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ordem" integer DEFAULT 0 NOT NULL,
	"data_inicio_prevista" date,
	"data_fim_prevista" date,
	"data_inicio_real" date,
	"data_fim_real" date,
	"status" text DEFAULT 'pendente' NOT NULL,
	"percentual_executado" numeric(5, 2) DEFAULT '0' NOT NULL,
	"responsavel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obras" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"cliente_nome" text,
	"cliente_contato" text,
	"endereco" text,
	"status" text DEFAULT 'planejamento' NOT NULL,
	"data_inicio" date,
	"data_fim_prevista" date,
	"data_fim_real" date,
	"orcamento_total" numeric(15, 2),
	"custo_realizado" numeric(15, 2) DEFAULT '0' NOT NULL,
	"responsavel_id" text,
	"link_cliente" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obra_diario" (
	"id" text PRIMARY KEY NOT NULL,
	"obra_id" text NOT NULL,
	"data" date NOT NULL,
	"conteudo" text NOT NULL,
	"responsavel_id" text,
	"responsavel_nome" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"aprovado_por_id" text,
	"aprovado_em" timestamp with time zone,
	"clima_tempo" text,
	"mao_de_obra" integer,
	"observacoes" text,
	"fotos" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compras_obras" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"obra_id" text,
	"insumo_id" text,
	"descricao" text NOT NULL,
	"fornecedor" text,
	"quantidade" numeric(15, 4),
	"valor_unitario" numeric(15, 4),
	"valor_total" numeric(15, 2),
	"status" text DEFAULT 'pendente' NOT NULL,
	"data_prevista" text,
	"data_efetuada" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_central_obras" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"insumo_id" text NOT NULL,
	"quantidade_atual" numeric(15, 4) DEFAULT '0' NOT NULL,
	"quantidade_minima" numeric(15, 4) DEFAULT '0' NOT NULL,
	"localizacao" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estoque_obras" (
	"id" text PRIMARY KEY NOT NULL,
	"obra_id" text NOT NULL,
	"insumo_id" text NOT NULL,
	"quantidade_atual" numeric(15, 4) DEFAULT '0' NOT NULL,
	"quantidade_minima" numeric(15, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"unidade" text NOT NULL,
	"preco_unitario" numeric(15, 4),
	"categoria" text,
	"codigo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_estoque_obras" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"insumo_id" text NOT NULL,
	"tipo" text NOT NULL,
	"quantia" numeric(15, 4) NOT NULL,
	"origem_tipo" text,
	"origem_obra_id" text,
	"destino_tipo" text,
	"destino_obra_id" text,
	"responsavel_id" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "composicao_insumos" (
	"id" text PRIMARY KEY NOT NULL,
	"composicao_id" text NOT NULL,
	"insumo_id" text NOT NULL,
	"quantidade" numeric(15, 4) NOT NULL,
	"preco_unitario" numeric(15, 4)
);
--> statement-breakpoint
CREATE TABLE "composicoes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"unidade" text NOT NULL,
	"custo_total" numeric(15, 4),
	"codigo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_colecoes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"temporada" "varejo_temporada" NOT NULL,
	"ano" integer NOT NULL,
	"status" "varejo_colecao_status" DEFAULT 'planejamento' NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_fornecedores" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"marca" text,
	"contato" text,
	"email" text,
	"telefone" text,
	"cnpj" text,
	"condicoes_pagamento" text,
	"prazo_entrega_dias" integer,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_produtos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fornecedor_id" text,
	"colecao_id" text,
	"nome" text NOT NULL,
	"codigo" text,
	"descricao" text,
	"categoria" "varejo_categoria_produto",
	"genero" "varejo_genero_produto",
	"preco_compra" numeric(12, 2),
	"preco_venda" numeric(12, 2) NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_grades" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"produto_id" text NOT NULL,
	"tamanho" text NOT NULL,
	"cor" text NOT NULL,
	"estoque" integer DEFAULT 0 NOT NULL,
	"estoque_minimo" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_pedidos_compra" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fornecedor_id" text,
	"colecao_id" text,
	"status" "varejo_pedido_compra_status" DEFAULT 'rascunho' NOT NULL,
	"data_emissao" text NOT NULL,
	"data_prevista" text,
	"valor_total" numeric(12, 2),
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_pedidos_compra_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"pedido_id" text NOT NULL,
	"produto_id" text,
	"tamanho" text NOT NULL,
	"cor" text NOT NULL,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"preco_unitario" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_fidelidade" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"pontos" integer DEFAULT 0 NOT NULL,
	"total_gasto" numeric(12, 2) DEFAULT '0' NOT NULL,
	"nivel" "varejo_nivel_fidelidade" DEFAULT 'bronze' NOT NULL,
	"ultima_compra" text,
	"observacoes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_combos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"preco" numeric(12, 2),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varejo_combo_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"combo_id" text NOT NULL,
	"produto_id" text,
	"tamanho" text,
	"cor" text,
	"quantidade" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_configuracoes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"erp_api_url" text,
	"erp_api_key" text,
	"erp_sync_enabled" boolean DEFAULT false NOT NULL,
	"zapi_instance_id" text,
	"zapi_token" text,
	"bot_ativo" boolean DEFAULT false NOT NULL,
	"mensagem_boas_vindas" text,
	"campanhas_ativas" boolean DEFAULT true NOT NULL,
	"contatos_por_rodada" integer DEFAULT 50 NOT NULL,
	"dias_semana" text[],
	"horario_envio" text DEFAULT '09:00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supermercado_configuracoes_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "supermercado_produtos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"erp_id" text,
	"nome" text NOT NULL,
	"descricao" text,
	"categoria" "supermercado_categoria_produto",
	"unidade" text DEFAULT 'un' NOT NULL,
	"preco_venda" numeric(12, 2) NOT NULL,
	"preco_promocional" numeric(12, 2),
	"estoque" integer DEFAULT 0 NOT NULL,
	"imagem_url" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"destaque_whatsapp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_pedido_itens" (
	"id" text PRIMARY KEY NOT NULL,
	"pedido_id" text NOT NULL,
	"produto_id" text,
	"nome_produto" text NOT NULL,
	"quantidade" numeric(10, 3) NOT NULL,
	"preco_unitario" numeric(12, 2) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_pedidos" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"lead_id" text,
	"origem" "supermercado_pedido_origem" DEFAULT 'whatsapp' NOT NULL,
	"status" "supermercado_pedido_status" DEFAULT 'aguardando_confirmacao' NOT NULL,
	"endereco_entrega" text,
	"observacoes" text,
	"valor_total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"erp_pedido_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supermercado_campanha_envios" (
	"id" text PRIMARY KEY NOT NULL,
	"campanha_id" text NOT NULL,
	"lead_id" text,
	"telefone" text NOT NULL,
	"status" "supermercado_campanha_envio_status" DEFAULT 'pendente' NOT NULL,
	"erro_msg" text,
	"enviado_em" timestamp
);
--> statement-breakpoint
CREATE TABLE "supermercado_campanhas" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"titulo" text NOT NULL,
	"tipo" "supermercado_campanha_tipo" NOT NULL,
	"status" "supermercado_campanha_status" DEFAULT 'rascunho' NOT NULL,
	"conteudo" text NOT NULL,
	"imagem_url" text,
	"agendado_para" timestamp,
	"enviado_em" timestamp,
	"total_enviados" integer DEFAULT 0 NOT NULL,
	"total_falhas" integer DEFAULT 0 NOT NULL,
	"gerado_por_ia" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"site_type" text NOT NULL,
	"config" jsonb NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"account_id" text,
	"page_id" text,
	"username" text,
	"page_access_token" text,
	"token_expires_at" timestamp,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"waba_id" text,
	"phone_number_id" text,
	"business_name" text,
	"display_phone_number" text,
	"access_token" text,
	"token_expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"disconnected_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"phone" text NOT NULL,
	"name" text,
	"profile_picture" text,
	"first_message_at" timestamp,
	"last_message_at" timestamp,
	"tags" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"connection_id" text,
	"external_message_id" text,
	"contact_phone" text,
	"contact_name" text,
	"direction" text,
	"type" text,
	"content" text,
	"media_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"timestamp" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending_dns' NOT NULL,
	"cloudflare_custom_hostname_id" text,
	"dns_record_name" text,
	"dns_record_value" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_domains_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
-- notifications was already created by 0005_deal_closure_notifications.sql
-- Preserve the existing definition and foreign key from migration 0005.
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"implantation_price_cents" integer,
	"monthly_price_cents" integer,
	"monthly_price_annual_cents" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plan_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"module_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_assignment_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text,
	"plan_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_closing_status" (
	"id" text PRIMARY KEY NOT NULL,
	"deal_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"etapa_atual" text NOT NULL,
	"contrato_zapsign_id" text,
	"contrato_status" text,
	"cobranca_asaas_id" text,
	"cobranca_status" text,
	"ultimo_erro" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tipo" text NOT NULL,
	"mensagem" text NOT NULL,
	"urgente" boolean DEFAULT false NOT NULL,
	"lido" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "max_analyses_per_hour" integer;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "webhook_estoque_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "api_key_estoque" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "integration_type" text DEFAULT 'api';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "tipo_fechamento_default" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "mensalidade_valor" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "token_credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "partner_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "subdomain_slug" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "billing_cycle" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan_started_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "demo_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "demo_seeded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "openai_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "openai_key_configured_at" timestamp;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "openai_key_status" text DEFAULT 'nao_configurada';--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "instagram_scoped_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "endereco" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "data_nascimento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "estado_civil" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conjuge_nome" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conjuge_telefone" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conjuge_email" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "conjuge_data_nascimento" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "filhos" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "discovery_data" jsonb;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "tipo" text DEFAULT 'cliente' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "indicado_por" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notas_nutricao" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "possivel_duplicata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lead_similar_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "favicon_url" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "diferenciais" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "publico_alvo" text;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "concorrentes" jsonb;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN "canais_venda" jsonb;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "content_generations_this_month" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "content_generations_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "churn_auto_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "instagram_page_access_token" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "instagram_page_id" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "instagram_username" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "zapi_instance_id" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "zapi_token" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "zapi_client_token" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "meta_phone_number_id" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "meta_waba_id" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "meta_access_token" text;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD COLUMN "meta_verify_token" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "categoria_perda" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "closure_triggered_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "contract_status" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "contract_error" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "onboarding_status" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "onboarding_error" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "zapsign_doc_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_at" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "lost_reason_detail" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "tipo_fechamento" "deal_tipo_fechamento";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "asaas_charge_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "charge_link" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "charge_status" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "etapa_saas" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "mrr" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "arr" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "seats" integer;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "plano_contratado" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "data_renovacao" timestamp;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "prob_churn" integer;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "quote_file_url" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "resultado_execucao" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "agenda_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "data_hora_inicio" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "data_hora_fim" timestamp;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "gerar_meet" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "meet_link" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "forma_pagamento" "forma_pagamento_proposta";--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "cond_pagamento" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "prazo_entrega" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "numero" text;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "recorrente" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "valor_mensal" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "prazo_contrato_meses" integer;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "num_parcelas" integer;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "auto_generated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "propostas" ADD COLUMN "acceptance_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD COLUMN "score_explicacao" text;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD COLUMN "churn_risk_explicacao" text;--> statement-breakpoint
ALTER TABLE "customer_intelligence" ADD COLUMN "is_analyzing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "imagem_url" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "recorrencia" text;--> statement-breakpoint
ALTER TABLE "produtos_catalogo" ADD COLUMN "prazo_contrato" integer;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "agenda_id" text;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "google_event_id" text;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "meet_link" text;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD COLUMN "gerar_meet" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "agendas" ADD CONSTRAINT "agendas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_produto_id_produtos_catalogo_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos_catalogo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_config" ADD CONSTRAINT "site_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_invites" ADD CONSTRAINT "tenant_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_generations" ADD CONSTRAINT "content_generations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_purchases" ADD CONSTRAINT "token_purchases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_etapa_medicoes" ADD CONSTRAINT "obra_etapa_medicoes_etapa_id_obra_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."obra_etapas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_etapa_medicoes" ADD CONSTRAINT "obra_etapa_medicoes_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_etapas" ADD CONSTRAINT "obra_etapas_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras" ADD CONSTRAINT "obras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obras" ADD CONSTRAINT "obras_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_diario" ADD CONSTRAINT "obra_diario_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_diario" ADD CONSTRAINT "obra_diario_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obra_diario" ADD CONSTRAINT "obra_diario_aprovado_por_id_users_id_fk" FOREIGN KEY ("aprovado_por_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_obras" ADD CONSTRAINT "compras_obras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_obras" ADD CONSTRAINT "compras_obras_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras_obras" ADD CONSTRAINT "compras_obras_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_central_obras" ADD CONSTRAINT "estoque_central_obras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_central_obras" ADD CONSTRAINT "estoque_central_obras_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_obras" ADD CONSTRAINT "estoque_obras_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_obras" ADD CONSTRAINT "estoque_obras_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque_obras" ADD CONSTRAINT "movimentacoes_estoque_obras_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque_obras" ADD CONSTRAINT "movimentacoes_estoque_obras_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque_obras" ADD CONSTRAINT "movimentacoes_estoque_obras_origem_obra_id_obras_id_fk" FOREIGN KEY ("origem_obra_id") REFERENCES "public"."obras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque_obras" ADD CONSTRAINT "movimentacoes_estoque_obras_destino_obra_id_obras_id_fk" FOREIGN KEY ("destino_obra_id") REFERENCES "public"."obras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque_obras" ADD CONSTRAINT "movimentacoes_estoque_obras_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_insumos" ADD CONSTRAINT "composicao_insumos_composicao_id_composicoes_id_fk" FOREIGN KEY ("composicao_id") REFERENCES "public"."composicoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicao_insumos" ADD CONSTRAINT "composicao_insumos_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "composicoes" ADD CONSTRAINT "composicoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_colecoes" ADD CONSTRAINT "varejo_colecoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_fornecedores" ADD CONSTRAINT "varejo_fornecedores_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_produtos" ADD CONSTRAINT "varejo_produtos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_produtos" ADD CONSTRAINT "varejo_produtos_fornecedor_id_varejo_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."varejo_fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_produtos" ADD CONSTRAINT "varejo_produtos_colecao_id_varejo_colecoes_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."varejo_colecoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_grades" ADD CONSTRAINT "varejo_grades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_grades" ADD CONSTRAINT "varejo_grades_produto_id_varejo_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."varejo_produtos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_pedidos_compra" ADD CONSTRAINT "varejo_pedidos_compra_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_pedidos_compra" ADD CONSTRAINT "varejo_pedidos_compra_fornecedor_id_varejo_fornecedores_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."varejo_fornecedores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_pedidos_compra" ADD CONSTRAINT "varejo_pedidos_compra_colecao_id_varejo_colecoes_id_fk" FOREIGN KEY ("colecao_id") REFERENCES "public"."varejo_colecoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_pedidos_compra_itens" ADD CONSTRAINT "varejo_pedidos_compra_itens_pedido_id_varejo_pedidos_compra_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."varejo_pedidos_compra"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_pedidos_compra_itens" ADD CONSTRAINT "varejo_pedidos_compra_itens_produto_id_varejo_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."varejo_produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_fidelidade" ADD CONSTRAINT "varejo_fidelidade_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_fidelidade" ADD CONSTRAINT "varejo_fidelidade_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_combos" ADD CONSTRAINT "varejo_combos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_combo_itens" ADD CONSTRAINT "varejo_combo_itens_combo_id_varejo_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."varejo_combos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varejo_combo_itens" ADD CONSTRAINT "varejo_combo_itens_produto_id_varejo_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."varejo_produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_configuracoes" ADD CONSTRAINT "supermercado_configuracoes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_produtos" ADD CONSTRAINT "supermercado_produtos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedido_itens" ADD CONSTRAINT "supermercado_pedido_itens_pedido_id_supermercado_pedidos_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."supermercado_pedidos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedidos" ADD CONSTRAINT "supermercado_pedidos_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_pedidos" ADD CONSTRAINT "supermercado_pedidos_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_campanha_envios" ADD CONSTRAINT "supermercado_campanha_envios_campanha_id_supermercado_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."supermercado_campanhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_campanha_envios" ADD CONSTRAINT "supermercado_campanha_envios_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supermercado_campanhas" ADD CONSTRAINT "supermercado_campanhas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignment_log" ADD CONSTRAINT "plan_assignment_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignment_log" ADD CONSTRAINT "plan_assignment_log_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_assignment_log" ADD CONSTRAINT "plan_assignment_log_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_closing_status" ADD CONSTRAINT "deal_closing_status_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_closing_status" ADD CONSTRAINT "deal_closing_status_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_alerts" ADD CONSTRAINT "tenant_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_agenda_id_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."agendas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_agenda_id_agendas_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."agendas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_tenant_phone_idx" ON "leads" USING btree ("tenant_id","telefone");--> statement-breakpoint
CREATE INDEX "leads_tenant_doc_idx" ON "leads" USING btree ("tenant_id","documento");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_subdomain_slug_unique" UNIQUE("subdomain_slug");--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "analysis_staleness_hours_positive" CHECK ("tenants"."analysis_staleness_hours" IS NULL OR "tenants"."analysis_staleness_hours" >= 1);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "analysis_message_threshold_positive" CHECK ("tenants"."analysis_message_threshold" IS NULL OR "tenants"."analysis_message_threshold" >= 1);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "max_analyses_per_hour_positive" CHECK ("tenants"."max_analyses_per_hour" IS NULL OR "tenants"."max_analyses_per_hour" >= 1);