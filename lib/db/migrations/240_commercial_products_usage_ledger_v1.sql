-- VendorAI commercial product matrix + metered usage foundation — 2026-09-17
--
-- Goals
-- 1) Make CRM Free (1 user), CRM Pro, Growth and standalone modules explicit.
-- 2) Keep Growth unlimited by users and meter only cost-bearing/value-bearing actions.
-- 3) Introduce Vendor Credits as an internal accounting unit, without exposing provider tokens.
-- 4) Centralize product -> module -> quota -> usage -> cost relationships.
-- 5) Start in OBSERVE mode: this migration does not block existing tenants.

CREATE TABLE IF NOT EXISTS vendor_commercial_products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_key text NOT NULL UNIQUE,
  sku text UNIQUE,
  name text NOT NULL,
  family text NOT NULL,
  product_type text NOT NULL,
  description text,
  monthly_price_brl numeric(12,2),
  one_time_price_brl numeric(12,2),
  active boolean NOT NULL DEFAULT true,
  free_forever boolean NOT NULL DEFAULT false,
  user_limit integer,
  users_unlimited boolean NOT NULL DEFAULT false,
  included_in_growth boolean NOT NULL DEFAULT false,
  standalone_purchase boolean NOT NULL DEFAULT true,
  grants_all_segment_modules boolean NOT NULL DEFAULT false,
  duration_days integer,
  segment_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vendor_commercial_products_type_check CHECK (
    product_type IN ('plan','module','pass','service','consumption_pack')
  ),
  CONSTRAINT vendor_commercial_products_user_limit_check CHECK (user_limit IS NULL OR user_limit > 0),
  CONSTRAINT vendor_commercial_products_duration_check CHECK (duration_days IS NULL OR duration_days > 0)
);

CREATE TABLE IF NOT EXISTS vendor_commercial_product_modules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_key text NOT NULL REFERENCES vendor_commercial_products(product_key) ON DELETE CASCADE,
  module_key text NOT NULL,
  segment_slug text,
  required boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(product_key, module_key, segment_slug)
);

CREATE TABLE IF NOT EXISTS vendor_usage_features (
  feature_key text PRIMARY KEY,
  label text NOT NULL,
  unit_label text NOT NULL,
  vendor_credits_per_unit numeric(12,4) NOT NULL DEFAULT 1,
  customer_visible boolean NOT NULL DEFAULT true,
  charge_on_success_only boolean NOT NULL DEFAULT true,
  cost_class text NOT NULL DEFAULT 'standard',
  source_features jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vendor_usage_features_credits_check CHECK (vendor_credits_per_unit >= 0),
  CONSTRAINT vendor_usage_features_cost_class_check CHECK (cost_class IN ('low','standard','high','external'))
);

CREATE TABLE IF NOT EXISTS vendor_product_usage_quotas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_key text NOT NULL REFERENCES vendor_commercial_products(product_key) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES vendor_usage_features(feature_key) ON DELETE CASCADE,
  included_quantity numeric(14,3) NOT NULL,
  reset_period text NOT NULL DEFAULT 'monthly',
  hard_limit boolean NOT NULL DEFAULT false,
  overage_allowed boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(product_key, feature_key),
  CONSTRAINT vendor_product_usage_quotas_quantity_check CHECK (included_quantity >= 0),
  CONSTRAINT vendor_product_usage_quotas_period_check CHECK (reset_period IN ('monthly','pass','none'))
);

CREATE TABLE IF NOT EXISTS vendor_tenant_entitlements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_key text NOT NULL REFERENCES vendor_commercial_products(product_key) ON DELETE CASCADE,
  source text NOT NULL,
  source_reference text,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vendor_tenant_entitlements_source_check CHECK (source IN ('free','subscription','module_purchase','growth_pass','manual','legacy')),
  CONSTRAINT vendor_tenant_entitlements_status_check CHECK (status IN ('active','scheduled','expired','cancelled','suspended'))
);

CREATE INDEX IF NOT EXISTS vendor_tenant_entitlements_tenant_idx
  ON vendor_tenant_entitlements(tenant_id, status);
CREATE INDEX IF NOT EXISTS vendor_tenant_entitlements_product_idx
  ON vendor_tenant_entitlements(product_key, status);

CREATE TABLE IF NOT EXISTS vendor_usage_ledger (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,
  product_key text REFERENCES vendor_commercial_products(product_key) ON DELETE SET NULL,
  feature_key text NOT NULL REFERENCES vendor_usage_features(feature_key),
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  vendor_credits numeric(14,3) NOT NULL DEFAULT 0,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  external_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  fx_rate_brl numeric(10,4),
  total_cost_brl numeric(14,6),
  successful boolean NOT NULL DEFAULT true,
  billable boolean NOT NULL DEFAULT true,
  quota_consumed numeric(14,3) NOT NULL DEFAULT 0,
  request_id text,
  source_table text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT vendor_usage_ledger_quantity_check CHECK (quantity >= 0),
  CONSTRAINT vendor_usage_ledger_credit_check CHECK (vendor_credits >= 0),
  CONSTRAINT vendor_usage_ledger_cost_check CHECK (external_cost_usd >= 0 AND total_cost_usd >= 0)
);

CREATE INDEX IF NOT EXISTS vendor_usage_ledger_tenant_created_idx
  ON vendor_usage_ledger(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_usage_ledger_feature_created_idx
  ON vendor_usage_ledger(feature_key, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_usage_ledger_product_created_idx
  ON vendor_usage_ledger(product_key, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_usage_ledger_request_idx
  ON vendor_usage_ledger(request_id) WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendor_commercial_settings (
  setting_key text PRIMARY KEY,
  setting_value jsonb NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO vendor_commercial_settings(setting_key, setting_value)
VALUES
  ('usage_enforcement_mode', '"observe"'::jsonb),
  ('usage_customer_display', '"units"'::jsonb),
  ('growth_product_key', '"growth"'::jsonb),
  ('free_product_key', '"crm_free"'::jsonb),
  ('growth_pass_product_key', '"growth_5_day_pass"'::jsonb),
  ('vendor_credits_customer_facing', 'false'::jsonb)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value, updated_at = now();

-- ── Canonical commercial matrix ─────────────────────────────────────────────
INSERT INTO vendor_commercial_products (
  product_key, sku, name, family, product_type, description,
  monthly_price_brl, one_time_price_brl, active, free_forever,
  user_limit, users_unlimited, included_in_growth, standalone_purchase,
  grants_all_segment_modules, duration_days, sort_order, benefits, metadata
)
VALUES
  ('crm_free', NULL, 'Vendor CRM Free', 'CRM', 'plan', 'CRM completo para operação individual. A limitação comercial é 1 usuário, não um CRM reduzido.', 0, NULL, true, true, 1, false, false, false, false, NULL, 10, '["CRM completo para 1 usuário","Entrada permanente sem mensalidade","Base para upsell contextual dentro do sistema"]'::jsonb, '{"cta":"Começar grátis"}'::jsonb),
  ('crm_pro', 'vendor-crm-monthly', 'Vendor CRM Pro', 'CRM', 'module', 'CRM completo para equipe, mantendo a mesma experiência funcional do Free e ampliando capacidade de usuários.', 49.90, NULL, true, false, 5, false, true, true, false, NULL, 20, '["CRM completo","Uso em equipe","Porta de entrada para módulos adicionais"]'::jsonb, '{}'::jsonb),
  ('growth', NULL, 'VendorAI Growth', 'Suite', 'plan', 'Ecossistema VendorAI completo aplicável ao segmento do cliente, com usuários ilimitados e franquias mensais por função de consumo.', 1490.00, NULL, true, false, NULL, true, false, true, true, NULL, 30, '["Usuários ilimitados","Todos os módulos padrão aplicáveis ao segmento","Franquias mensais ampliadas","Compra de capacidade adicional sem troca de plano"]'::jsonb, '{"billing":"monthly","usage_model":"feature_quotas_plus_vendor_credits"}'::jsonb),
  ('growth_5_day_pass', NULL, 'Growth +5 dias', 'Suite', 'pass', 'Bloco adicional de 5 dias de acesso Growth. O CRM Free permanece disponível quando o período termina.', NULL, 399.00, true, false, NULL, true, false, true, true, 5, 40, '["5 dias adicionais de acesso Growth","Mesmos módulos aplicáveis ao segmento durante o período"]'::jsonb, '{"free_days_per_month":5}'::jsonb),
  ('agenda', 'vendor-agenda-monthly', 'Vendor Agenda', 'Operação', 'module', 'Agenda, disponibilidade, agendamentos, reagendamentos e lembretes conectados ao CRM.', 19.90, NULL, true, false, NULL, false, true, true, false, NULL, 100, '[]'::jsonb, '{}'::jsonb),
  ('reputation', 'vendor-reputation-monthly', 'Vendor Reputation', 'Operação', 'module', 'Reputação, avaliações, feedbacks e acompanhamento da experiência do cliente.', 79.00, NULL, true, false, NULL, false, true, true, false, NULL, 110, '[]'::jsonb, '{}'::jsonb),
  ('knowledge_ai', 'vendor-knowledge-ai-monthly', 'Vendor Knowledge AI', 'IA', 'module', 'Base de conhecimento e relações do negócio para agentes e respostas contextualizadas.', 99.00, NULL, true, false, NULL, false, true, true, false, NULL, 120, '[]'::jsonb, '{}'::jsonb),
  ('propostas_catalogo', 'vendor-propostas-orcamentos-monthly', 'Vendor Propostas & Catálogo', 'Vendas', 'module', 'Catálogo, propostas, orçamentos, aprovação, contratos e confirmação comercial.', 99.00, NULL, true, false, NULL, false, true, true, false, NULL, 130, '[]'::jsonb, '{}'::jsonb),
  ('creative_studio', 'vendor-creative-studio-monthly', 'Vendor Creative Studio', 'Marketing', 'module', 'Imagens, vídeos, voz, dublagem, mockups e materiais criativos com IA.', 139.00, NULL, true, false, NULL, false, true, true, false, NULL, 140, '[]'::jsonb, '{}'::jsonb),
  ('jarvis', 'vendor-jarvis-monthly', 'Vendor JARVIS', 'Inteligência', 'module', 'Assistente executivo para análise, prioridades, alertas, oportunidades e decisões.', 149.00, NULL, true, false, NULL, false, true, true, false, NULL, 150, '[]'::jsonb, '{}'::jsonb),
  ('automations', 'vendor-automations-monthly', 'Vendor Automations', 'Automação', 'module', 'Automações e workflows operacionais conectados aos dados e módulos do VendorAI.', 149.00, NULL, true, false, NULL, false, true, true, false, NULL, 160, '[]'::jsonb, '{}'::jsonb),
  ('bi_analytics', 'vendor-bi-analytics-monthly', 'Vendor BI & Analytics', 'Inteligência', 'module', 'Indicadores, relatórios, análises e acompanhamento de desempenho da operação.', 149.00, NULL, true, false, NULL, false, true, true, false, NULL, 170, '[]'::jsonb, '{}'::jsonb),
  ('ads', 'vendor-ads-monthly', 'Vendor Ads', 'Marketing', 'module', 'Planejamento e geração de campanhas, públicos, textos, criativos e acompanhamento.', 199.00, NULL, true, false, NULL, false, true, true, false, NULL, 180, '[]'::jsonb, '{}'::jsonb),
  ('content_planner', 'vendor-content-planner-monthly', 'Vendor Content Planner', 'Marketing', 'module', 'Planejamento editorial, calendário, temas, canais, frequência e campanhas.', 199.00, NULL, true, false, NULL, false, true, true, false, NULL, 190, '[]'::jsonb, '{}'::jsonb),
  ('omnichannel', 'vendor-omnichannel-monthly', 'Vendor Omnichannel', 'Atendimento', 'module', 'Central de atendimento conectando WhatsApp, Instagram e demais canais ao CRM.', 199.00, NULL, true, false, NULL, false, true, true, false, NULL, 200, '[]'::jsonb, '{}'::jsonb),
  ('gestao', 'vendor-financeiro-erp-monthly', 'Vendor Gestão', 'Gestão', 'module', 'ERP, financeiro, contas a pagar e receber, estoque, compras, fornecedores e controles administrativos.', 299.00, NULL, true, false, NULL, false, true, true, false, NULL, 210, '[]'::jsonb, '{}'::jsonb),
  ('praca_ai', 'vendor-marketplace-praca-monthly', 'Praça.ai', 'Marketplace', 'module', 'Marketplace, pedidos, pagamentos, reputação, logística, entregas, rastreio e painel executivo.', 299.00, NULL, true, false, NULL, false, true, true, false, NULL, 220, '[]'::jsonb, '{}'::jsonb),
  ('app_builder', 'vendor-app-builder-monthly', 'Vendor App Builder', 'Apps', 'module', 'Criação e publicação de aplicativos conectados ao ecossistema VendorAI.', 299.00, NULL, true, false, NULL, false, true, true, false, NULL, 230, '[]'::jsonb, '{}'::jsonb),
  ('content_studio', 'vendor-content-studio-monthly', 'Vendor Content Studio', 'Marketing', 'module', 'Geração de posts, copies, legendas, roteiros, carrosséis e conteúdo de campanhas.', 399.00, NULL, true, false, NULL, false, true, true, false, NULL, 240, '[]'::jsonb, '{}'::jsonb),
  ('prospector', 'vendor-prospector-monthly', 'Vendor Prospector', 'Vendas', 'module', 'Descoberta, enriquecimento, qualificação e envio de prospects para o CRM.', 399.00, NULL, true, false, NULL, false, true, true, false, NULL, 250, '[]'::jsonb, '{}'::jsonb),
  ('ai_team', 'vendor-ai-team-10-monthly', 'Vendor AI Team — 10 agentes', 'IA', 'module', 'Agentes especializados para SDR, Closer, Follow-up, Financeiro, Cobrança, Suporte, Agendamento e Pós-venda.', 499.00, NULL, true, false, NULL, false, true, true, false, NULL, 260, '[]'::jsonb, '{}'::jsonb),
  ('sites_autopilot', 'vendor-sites-autopilot-monthly', 'Vendor Sites & Autopilot', 'Marketing', 'module', 'Sites, landing pages, SEO, conteúdo, analytics e Content Autopilot integrados.', 499.00, NULL, true, false, NULL, false, true, true, false, NULL, 270, '[]'::jsonb, '{}'::jsonb),
  ('revenue_scout', 'vendor-revenue-scout-monthly', 'Vendor Revenue Scout', 'Inteligência', 'module', 'Inteligência de receita, oportunidades, recompra, churn, reativação e próxima melhor ação.', 499.00, NULL, true, false, NULL, false, true, true, false, NULL, 280, '[]'::jsonb, '{}'::jsonb),
  ('arqdor_ai', NULL, 'arqdor.ai', 'Arquitetura', 'module', 'Projetos, arquitetura, interiores, render por IA, orçamento técnico, especificação, biblioteca e portal do cliente.', NULL, NULL, true, false, NULL, false, true, true, false, NULL, 290, '[]'::jsonb, '{"standalone_price_status":"to_define"}'::jsonb),
  ('implementation', 'vendor-implementation-cash', 'Implantação VendorAI', 'Serviços', 'service', 'Implantação assistida opcional com configuração, integrações, parametrização, usuários e treinamento.', NULL, 1890.00, true, false, NULL, false, false, true, false, NULL, 900, '[]'::jsonb, '{}'::jsonb),
  ('custom_app', 'vendor-custom-app-cash', 'App Personalizado VendorAI', 'Serviços', 'service', 'Aplicativo personalizado com marca, identidade e configuração do tenant.', NULL, 4990.00, true, false, NULL, false, false, true, false, NULL, 910, '[]'::jsonb, '{}'::jsonb)
ON CONFLICT (product_key) DO UPDATE SET
  sku = EXCLUDED.sku,
  name = EXCLUDED.name,
  family = EXCLUDED.family,
  product_type = EXCLUDED.product_type,
  description = EXCLUDED.description,
  monthly_price_brl = EXCLUDED.monthly_price_brl,
  one_time_price_brl = EXCLUDED.one_time_price_brl,
  active = EXCLUDED.active,
  free_forever = EXCLUDED.free_forever,
  user_limit = EXCLUDED.user_limit,
  users_unlimited = EXCLUDED.users_unlimited,
  included_in_growth = EXCLUDED.included_in_growth,
  standalone_purchase = EXCLUDED.standalone_purchase,
  grants_all_segment_modules = EXCLUDED.grants_all_segment_modules,
  duration_days = EXCLUDED.duration_days,
  sort_order = EXCLUDED.sort_order,
  benefits = EXCLUDED.benefits,
  metadata = vendor_commercial_products.metadata || EXCLUDED.metadata,
  updated_at = now();

-- ── Product -> technical module mapping ─────────────────────────────────────
WITH mappings(product_key, module_key, required) AS (
  VALUES
    ('crm_free','dashboard',true), ('crm_free','leads',true), ('crm_free','deals',true), ('crm_free','settings',true),
    ('crm_pro','dashboard',true), ('crm_pro','leads',true), ('crm_pro','deals',true), ('crm_pro','settings',true),
    ('agenda','scheduler',true),
    ('omnichannel','conversations',true),
    ('prospector','prospector',true),
    ('ai_team','agents',true), ('ai_team','sdr',false),
    ('revenue_scout','revenue',true), ('revenue_scout','churn',false), ('revenue_scout','intelligence',false),
    ('content_planner','content',true),
    ('content_studio','content',true),
    ('creative_studio','content',false),
    ('sites_autopilot','content_autopilot',true),
    ('ads','campaigns',true),
    ('jarvis','vendor_brain',true), ('jarvis','intelligence',false),
    ('propostas_catalogo','proposals',true),
    ('gestao','financeiro',true), ('gestao','inventory',false),
    ('praca_ai','praca_ai',true), ('praca_ai','deliveries',false),
    ('bi_analytics','analytics',true), ('bi_analytics','reports',false),
    ('knowledge_ai','knowledge_graph',true),
    ('arqdor_ai','arch',true), ('arqdor_ai','obras',false)
)
INSERT INTO vendor_commercial_product_modules(product_key, module_key, required)
SELECT product_key, module_key, required FROM mappings
ON CONFLICT (product_key, module_key, segment_slug) DO UPDATE
SET required = EXCLUDED.required;

-- ── Metered features / Vendor Credits ───────────────────────────────────────
INSERT INTO vendor_usage_features (
  feature_key, label, unit_label, vendor_credits_per_unit,
  customer_visible, charge_on_success_only, cost_class, source_features, metadata
)
VALUES
  ('crm_ai_assist','Assistências de IA no CRM','assistência',1,true,true,'low','["intelligence_analysis","briefing_generator"]'::jsonb,'{}'::jsonb),
  ('agent_interaction','Interações automáticas dos agentes','interação',1,true,true,'standard','["agent_sdr","agent_closer","agent_followup","agent_reactivation","agent_scheduler","agent_service","agent_onboarding","agent_relacionamento","agent_financeiro","agent_cobranca"]'::jsonb,'{}'::jsonb),
  ('content_generation','Conteúdos gerados','conteúdo',5,true,true,'standard','["content_generator"]'::jsonb,'{}'::jsonb),
  ('image_generation','Imagens geradas','imagem',10,true,true,'high','["image_generator"]'::jsonb,'{}'::jsonb),
  ('video_generation','Vídeos gerados','vídeo',200,true,true,'high','[]'::jsonb,'{"weight_review":"provider_cost_dependent"}'::jsonb),
  ('render_generation','Renders arqdor.ai','render',25,true,true,'high','[]'::jsonb,'{}'::jsonb),
  ('prospect_enrichment','Prospects enriquecidos','prospect',2,true,true,'external','[]'::jsonb,'{}'::jsonb),
  ('proposal_generation','Propostas/orçamentos IA','proposta',5,true,true,'standard','["proposal_generator","auto_quote"]'::jsonb,'{}'::jsonb),
  ('intelligence_analysis','Análises JARVIS/Revenue','análise',2,true,true,'standard','["intelligence_analysis","churn_retention"]'::jsonb,'{}'::jsonb),
  ('autopilot_article','Artigos Content Autopilot','artigo',20,true,true,'standard','["content_generator","web_search"]'::jsonb,'{}'::jsonb),
  ('site_generation','Sites completos gerados','site',100,true,true,'high','["site_generator"]'::jsonb,'{}'::jsonb),
  ('landing_page_generation','Landing pages geradas','landing page',40,true,true,'high','["site_generator"]'::jsonb,'{}'::jsonb),
  ('ads_campaign_generation','Campanhas/kit Ads gerados','campanha',10,true,true,'standard','["content_generator","image_generator"]'::jsonb,'{}'::jsonb),
  ('audio_transcription_minute','Transcrição de áudio','minuto',1,true,true,'standard','["audio_transcription"]'::jsonb,'{}'::jsonb),
  ('document_processing','Documentos processados','documento',2,true,true,'standard','["document_extraction"]'::jsonb,'{}'::jsonb),
  ('knowledge_page','Conteúdo indexado no Knowledge AI','página equivalente',1,true,true,'low','["embedding"]'::jsonb,'{}'::jsonb),
  ('media_interpretation','Mídias interpretadas','arquivo',5,true,true,'standard','["media_interpretation"]'::jsonb,'{}'::jsonb)
ON CONFLICT (feature_key) DO UPDATE SET
  label = EXCLUDED.label,
  unit_label = EXCLUDED.unit_label,
  vendor_credits_per_unit = EXCLUDED.vendor_credits_per_unit,
  customer_visible = EXCLUDED.customer_visible,
  charge_on_success_only = EXCLUDED.charge_on_success_only,
  cost_class = EXCLUDED.cost_class,
  source_features = EXCLUDED.source_features,
  metadata = vendor_usage_features.metadata || EXCLUDED.metadata,
  updated_at = now();

-- Growth Quota V1: generous usage, tenant-wide, independent of number of users.
WITH quotas(product_key, feature_key, qty) AS (
  VALUES
    ('growth','content_generation',300::numeric),
    ('growth','image_generation',100),
    ('growth','video_generation',10),
    ('growth','render_generation',30),
    ('growth','prospect_enrichment',1500),
    ('growth','agent_interaction',10000),
    ('growth','proposal_generation',500),
    ('growth','intelligence_analysis',1000),
    ('growth','autopilot_article',30),
    ('growth','site_generation',3),
    ('growth','landing_page_generation',10),
    ('growth','ads_campaign_generation',30),
    ('growth','audio_transcription_minute',600),
    ('growth','document_processing',500),
    ('growth','knowledge_page',2000),
    ('growth','media_interpretation',200),
    ('prospector','prospect_enrichment',500),
    ('ai_team','agent_interaction',2500),
    ('content_studio','content_generation',100),
    ('creative_studio','image_generation',20),
    ('creative_studio','video_generation',2),
    ('sites_autopilot','site_generation',2),
    ('sites_autopilot','autopilot_article',12),
    ('ads','ads_campaign_generation',10),
    ('propostas_catalogo','proposal_generation',100),
    ('knowledge_ai','knowledge_page',500),
    ('revenue_scout','intelligence_analysis',250)
)
INSERT INTO vendor_product_usage_quotas(product_key, feature_key, included_quantity, hard_limit, overage_allowed)
SELECT product_key, feature_key, qty, false, true FROM quotas
ON CONFLICT (product_key, feature_key) DO UPDATE SET
  included_quantity = EXCLUDED.included_quantity,
  hard_limit = false,
  overage_allowed = true,
  updated_at = now();

-- ── Plan semantics aligned to the new funnel ────────────────────────────────
-- Start becomes the permanent 1-user CRM Free shell. Growth remains continuous
-- full access with unlimited users. Usage quotas are controlled by the new
-- product/usage tables, not by per-user multiplication.
UPDATE plans
SET name = 'CRM Free', monthly_price_cents = 0, implantation_price_cents = 0,
    max_users = 1, extra_user_price_cents = NULL, is_active = true, updated_at = now()
WHERE slug = 'start';

UPDATE plans
SET name = 'Growth', monthly_price_cents = 149000, max_users = NULL,
    extra_user_price_cents = NULL, is_active = true, updated_at = now()
WHERE slug = 'growth';

-- ── Enrich the existing tenant catalog so site/catalog/checkout can converge ─
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_product_key text;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS included_in_growth boolean;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_user_limit integer;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_users_unlimited boolean;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_benefits jsonb;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_quotas jsonb;
ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS commercial_metadata jsonb;

UPDATE produtos_catalogo pc
SET commercial_product_key = cp.product_key,
    included_in_growth = cp.included_in_growth,
    commercial_user_limit = cp.user_limit,
    commercial_users_unlimited = cp.users_unlimited,
    commercial_benefits = cp.benefits,
    commercial_quotas = COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'featureKey', q.feature_key,
        'label', f.label,
        'unit', f.unit_label,
        'included', q.included_quantity,
        'vendorCreditsPerUnit', f.vendor_credits_per_unit
      ) ORDER BY f.label)
      FROM vendor_product_usage_quotas q
      JOIN vendor_usage_features f ON f.feature_key = q.feature_key
      WHERE q.product_key = cp.product_key
    ), '[]'::jsonb),
    commercial_metadata = jsonb_build_object(
      'family', cp.family,
      'standalonePurchase', cp.standalone_purchase,
      'freeForever', cp.free_forever,
      'durationDays', cp.duration_days
    ),
    nome = CASE pc.sku
      WHEN 'vendor-crm-monthly' THEN 'Vendor CRM Pro'
      WHEN 'vendor-financeiro-erp-monthly' THEN 'Vendor Gestão'
      WHEN 'vendor-propostas-orcamentos-monthly' THEN 'Vendor Propostas & Catálogo'
      WHEN 'vendor-marketplace-praca-monthly' THEN 'Praça.ai'
      ELSE pc.nome
    END,
    product_type = CASE
      WHEN cp.product_type = 'service' THEN 'service'
      WHEN cp.product_type IN ('plan','module') THEN CASE WHEN cp.product_type='plan' THEN 'saas_plan' ELSE 'saas_addon' END
      ELSE pc.product_type
    END,
    preco_mensalidade = COALESCE(cp.monthly_price_brl, pc.preco_mensalidade),
    preco_base = CASE WHEN cp.monthly_price_brl IS NOT NULL THEN cp.monthly_price_brl ELSE COALESCE(cp.one_time_price_brl, pc.preco_base) END,
    updated_at = now()
FROM vendor_commercial_products cp
WHERE pc.sku IS NOT NULL AND pc.sku = cp.sku;

-- Canonical Super Admin/marketing records are linked by stable commercial key
-- inside detalhes so existing screens continue to work without a breaking schema.
UPDATE produtos_internos pi
SET detalhes = COALESCE(pi.detalhes, '{}'::jsonb) || jsonb_build_object(
      'commercialProductKey', cp.product_key,
      'includedInGrowth', cp.included_in_growth,
      'standalonePurchase', cp.standalone_purchase,
      'monthlyPriceBrl', cp.monthly_price_brl,
      'oneTimePriceBrl', cp.one_time_price_brl,
      'userLimit', cp.user_limit,
      'usersUnlimited', cp.users_unlimited
    ),
    updated_at = now()
FROM vendor_commercial_products cp
WHERE pi.categoria = 'Produtos Comerciais VendorAI'
  AND lower(pi.nome) = lower(cp.name);

INSERT INTO produtos_internos (
  id, categoria, nome, descricao_uso, tipo, nichos_relacionados, detalhes,
  anexos, ordem, ativo, created_at, updated_at
)
SELECT
  gen_random_uuid()::text,
  'Produtos Comerciais VendorAI',
  'Vendor CRM Free',
  'CRM completo gratuito para 1 usuário. O CRM não é uma versão básica; a limitação comercial é somente de usuário. Módulos adicionais e consumo premium podem ser contratados dentro do sistema.',
  'oferta',
  '[]'::jsonb,
  jsonb_build_object('commercialProductKey','crm_free','monthlyPriceBrl',0,'userLimit',1,'freeForever',true),
  '[]'::jsonb,
  99,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_internos
  WHERE categoria='Produtos Comerciais VendorAI' AND lower(nome)=lower('Vendor CRM Free')
);

-- Monthly business view used by Super Admin margin dashboards.
CREATE OR REPLACE VIEW vendor_usage_monthly AS
SELECT
  tenant_id,
  product_key,
  feature_key,
  date_trunc('month', created_at) AS month,
  sum(quantity) AS quantity,
  sum(vendor_credits) AS vendor_credits,
  sum(total_cost_usd) AS total_cost_usd,
  sum(COALESCE(total_cost_brl, 0)) AS total_cost_brl,
  count(*) AS events,
  count(*) FILTER (WHERE successful) AS successful_events,
  count(*) FILTER (WHERE billable) AS billable_events
FROM vendor_usage_ledger
GROUP BY tenant_id, product_key, feature_key, date_trunc('month', created_at);

COMMENT ON TABLE vendor_usage_ledger IS 'Universal usage ledger. Provider tokens/cost are internal; customer-facing billing uses product quotas and Vendor Credits.';
COMMENT ON TABLE vendor_usage_features IS 'Configurable conversion between user-understandable units and Vendor Credits.';
COMMENT ON TABLE vendor_commercial_products IS 'Canonical commercial product registry feeding catalog, entitlements, quotas, checkout and public site.';
