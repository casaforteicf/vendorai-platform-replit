-- VendorAI commercial product + usage ledger foundation (V1)
-- Safe rollout: this migration creates the new commercial/usage layer in
-- measure_only mode. It does NOT block existing tenants or replace ai_usage_logs.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Commercial master: one source of truth for products sold by VendorAI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commercial_products (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  product_kind text NOT NULL CHECK (product_kind IN ('free','plan','module','pass','service','usage_pack')),
  description text,
  monthly_price_cents integer,
  one_time_price_cents integer,
  max_users integer,
  users_unlimited boolean NOT NULL DEFAULT false,
  standalone_purchase boolean NOT NULL DEFAULT true,
  included_in_growth boolean NOT NULL DEFAULT false,
  growth_inclusion_mode text NOT NULL DEFAULT 'when_applicable' CHECK (growth_inclusion_mode IN ('always','when_applicable','never')),
  public_visible boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  commercial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commercial_product_modules (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_sku text NOT NULL REFERENCES commercial_products(sku) ON DELETE CASCADE,
  module_key text NOT NULL,
  access_level text NOT NULL DEFAULT 'full' CHECK (access_level IN ('full','read_only','limited')),
  required boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(product_sku, module_key)
);

-- ---------------------------------------------------------------------------
-- 2. Metered feature catalog: customer units + internal Vendor Credits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_feature_catalog (
  feature_key text PRIMARY KEY,
  display_name text NOT NULL,
  category text NOT NULL,
  unit_label text NOT NULL,
  vendor_credit_weight numeric(14,4) NOT NULL DEFAULT 0,
  metered boolean NOT NULL DEFAULT true,
  customer_visible boolean NOT NULL DEFAULT true,
  charge_on_success_only boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_usage_quotas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_sku text NOT NULL REFERENCES commercial_products(sku) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES usage_feature_catalog(feature_key) ON DELETE CASCADE,
  monthly_quantity numeric(14,3),
  hard_limit boolean NOT NULL DEFAULT false,
  enforcement_mode text NOT NULL DEFAULT 'measure_only' CHECK (enforcement_mode IN ('measure_only','warn','enforce')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(product_sku, feature_key)
);

CREATE TABLE IF NOT EXISTS usage_extra_packages (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  feature_key text NOT NULL REFERENCES usage_feature_catalog(feature_key) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  vendor_credits numeric(14,3),
  price_cents integer,
  validity_days integer,
  active boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Entitlements: commercial access is separate from technical nav switches
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_product_entitlements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_sku text NOT NULL REFERENCES commercial_products(sku) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('free','subscription','growth','prepaid','purchase','admin_override','migration')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','scheduled','expired','cancelled','suspended')),
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_product_entitlements_active
  ON tenant_product_entitlements(tenant_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_tenant_product_entitlements_product
  ON tenant_product_entitlements(product_sku, status);

-- ---------------------------------------------------------------------------
-- 4. Universal usage ledger. Technical attempts can be recorded, while only
--    useful/successful customer results need to consume quota.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_ledger (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,
  product_sku text REFERENCES commercial_products(sku) ON DELETE SET NULL,
  feature_key text NOT NULL REFERENCES usage_feature_catalog(feature_key) ON DELETE RESTRICT,
  source text NOT NULL DEFAULT 'system',
  source_reference text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  vendor_credits numeric(14,4) NOT NULL DEFAULT 0,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  provider_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  external_api_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  fx_usd_brl numeric(12,6),
  total_cost_brl numeric(14,6),
  success boolean NOT NULL DEFAULT true,
  delivered_result boolean NOT NULL DEFAULT true,
  charged_to_quota boolean NOT NULL DEFAULT false,
  used_byok boolean NOT NULL DEFAULT false,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_ledger_tenant_month
  ON usage_ledger(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_feature_month
  ON usage_ledger(feature_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_ledger_product_month
  ON usage_ledger(product_sku, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Commercial products V1
-- ---------------------------------------------------------------------------
INSERT INTO commercial_products
  (sku, slug, name, product_kind, description, monthly_price_cents, one_time_price_cents, max_users, users_unlimited, standalone_purchase, included_in_growth, growth_inclusion_mode, public_visible, commercial_metadata)
VALUES
  ('vendor-crm-free', 'crm-free', 'Vendor CRM Free', 'free', 'CRM completo para uma pessoa. A limitação comercial principal é 1 usuário, não recursos básicos do CRM.', 0, NULL, 1, false, false, true, 'always', true, '{"positioning":"acquisition","crm_full":true}'::jsonb),
  ('vendor-crm-monthly', 'crm', 'Vendor CRM Pro', 'plan', 'CRM completo para equipes, com módulos adicionais contratáveis separadamente.', 4990, NULL, 5, false, true, true, 'always', true, '{"positioning":"entry_paid","crm_full":true}'::jsonb),
  ('vendor-growth-monthly', 'growth', 'VendorAI Growth', 'plan', 'Ecossistema VendorAI completo aplicável ao segmento do cliente, com usuários ilimitados e franquias de consumo.', 149000, NULL, NULL, true, true, false, 'never', true, '{"access_model":"growth","quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-pass-5d', 'growth-5-dias', 'Growth +5 dias', 'pass', 'Bloco adicional de cinco dias de acesso ao Growth.', NULL, 39900, NULL, true, true, false, 'never', true, '{"access_days":5,"access_model":"prepaid"}'::jsonb),
  ('vendor-agenda-monthly', 'agenda-inteligente', 'Vendor Agenda', 'module', 'Agenda e agendamentos integrados.', 1990, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-propostas-orcamentos-monthly', 'catalogo-propostas', 'Vendor Propostas & Catálogo', 'module', 'Catálogo, propostas, orçamentos, contratos, confirmação de venda e comissões.', 9900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-creative-studio-monthly', 'creative-studio', 'Vendor Creative Studio', 'module', 'Criação visual com IA para materiais comerciais e marketing.', 13900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-jarvis-monthly', 'jarvis', 'Vendor JARVIS', 'module', 'Inteligência executiva, alertas e análises do negócio.', 14900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-automations-monthly', 'automacoes', 'Vendor Automations', 'module', 'Automações e fluxos operacionais.', 14900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-bi-analytics-monthly', 'analytics', 'Vendor BI & Analytics', 'module', 'Indicadores, relatórios e análise de performance.', 14900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-reputation-monthly', 'reputation', 'Vendor Reputation', 'module', 'Reputação, avaliações e pós-venda.', 7900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-knowledge-ai-monthly', 'knowledge-hub', 'Vendor Knowledge AI', 'module', 'Base de conhecimento e inteligência contextual do negócio.', 9900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-ads-monthly', 'ads', 'Vendor Ads', 'module', 'Planejamento e criação de campanhas de mídia paga.', 19900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-content-planner-monthly', 'content-planner', 'Vendor Content Planner', 'module', 'Planejamento editorial e calendário de conteúdo.', 19900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-omnichannel-monthly', 'omnichannel', 'Vendor Omnichannel', 'module', 'Atendimento e conversas integradas nos canais do negócio.', 19900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-financeiro-erp-monthly', 'gestao', 'Vendor Gestão', 'module', 'Financeiro, ERP, estoque, compras, fornecedores e operação.', 29900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-marketplace-praca-monthly', 'praca-ai', 'Praça.ai', 'module', 'Marketplace, pedidos, pagamentos, reputação, logística e entregas.', 29900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-app-builder-monthly', 'app-builder', 'Vendor App Builder', 'module', 'Criação e gestão de aplicativos conectados ao ecossistema VendorAI.', 29900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-content-studio-monthly', 'content-studio', 'Vendor Content Studio', 'module', 'Produção de conteúdo com IA.', 39900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-prospector-monthly', 'prospeccao', 'Vendor Prospector', 'module', 'Prospecção ativa, enriquecimento e qualificação de potenciais clientes.', 39900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-ai-team-10-monthly', 'agentes-ia', 'Vendor AI Team', 'module', 'Equipe de agentes especializados de IA para atendimento e vendas.', 49900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-sites-autopilot-monthly', 'sites-lp-ecommerce', 'Vendor Sites & Autopilot', 'module', 'Sites, landing pages, SEO, conteúdo e Content Autopilot.', 49900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-revenue-scout-monthly', 'revenue-scout', 'Vendor Revenue Scout', 'module', 'Receita, oportunidades, churn e inteligência de clientes.', 49900, NULL, NULL, false, true, true, 'when_applicable', true, '{}'::jsonb),
  ('vendor-arqdor-monthly', 'arqdor-ai', 'arqdor.ai', 'module', 'Arquitetura e interiores: projetos, render, orçamento técnico, especificação, biblioteca e portal do cliente.', NULL, NULL, NULL, false, true, true, 'when_applicable', true, '{"price_status":"to_define"}'::jsonb),
  ('vendor-custom-app-cash', 'app-personalizado', 'App Personalizado VendorAI', 'service', 'Aplicativo personalizado conectado ao VendorAI.', NULL, 499000, NULL, false, true, false, 'never', true, '{}'::jsonb),
  ('vendor-implementation-cash', 'implantacao', 'Implantação VendorAI', 'service', 'Implantação assistida por especialista.', NULL, 189000, NULL, false, true, false, 'never', true, '{}'::jsonb)
ON CONFLICT (sku) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  product_kind = EXCLUDED.product_kind,
  description = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  one_time_price_cents = EXCLUDED.one_time_price_cents,
  max_users = EXCLUDED.max_users,
  users_unlimited = EXCLUDED.users_unlimited,
  standalone_purchase = EXCLUDED.standalone_purchase,
  included_in_growth = EXCLUDED.included_in_growth,
  growth_inclusion_mode = EXCLUDED.growth_inclusion_mode,
  public_visible = EXCLUDED.public_visible,
  commercial_metadata = commercial_products.commercial_metadata || EXCLUDED.commercial_metadata,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 6. Feature catalog / Vendor Credit weights V1. Credits are internal weights,
--    not OpenAI tokens and not a direct BRL conversion.
-- ---------------------------------------------------------------------------
INSERT INTO usage_feature_catalog
  (feature_key, display_name, category, unit_label, vendor_credit_weight, metered, customer_visible, charge_on_success_only, metadata)
VALUES
  ('ai_assistance', 'Assistência de IA', 'ai', 'assistência', 1, true, true, true, '{}'::jsonb),
  ('jarvis_analysis', 'Análise JARVIS', 'intelligence', 'análise', 2, true, true, true, '{}'::jsonb),
  ('content_generation', 'Conteúdo IA', 'content', 'conteúdo', 5, true, true, true, '{}'::jsonb),
  ('proposal_generation', 'Proposta/orçamento IA', 'sales', 'proposta', 5, true, true, true, '{}'::jsonb),
  ('document_processing', 'Documento processado', 'processing', 'documento', 2, true, true, true, '{}'::jsonb),
  ('prospect_enrichment', 'Prospect enriquecido', 'prospecting', 'prospect', 2, true, true, true, '{}'::jsonb),
  ('image_generation', 'Imagem IA', 'creative', 'imagem', 10, true, true, true, '{}'::jsonb),
  ('render_generation', 'Render arqdor.ai', 'creative', 'render', 25, true, true, true, '{}'::jsonb),
  ('autopilot_article', 'Artigo Content Autopilot', 'content', 'artigo', 20, true, true, true, '{}'::jsonb),
  ('landing_page_generation', 'Landing page', 'sites', 'landing page', 40, true, true, true, '{}'::jsonb),
  ('site_generation', 'Site completo', 'sites', 'site', 100, true, true, true, '{}'::jsonb),
  ('video_generation', 'Vídeo IA', 'creative', 'vídeo', 200, true, true, true, '{"weight_status":"provisional","review_after_cost_telemetry":true}'::jsonb),
  ('ai_team_interaction', 'Interação automatizada AI Team', 'agents', 'interação', 1, true, true, true, '{}'::jsonb),
  ('ads_campaign_generation', 'Campanha/kit Ads IA', 'ads', 'campanha', 10, true, true, true, '{}'::jsonb),
  ('audio_transcription_minute', 'Transcrição de áudio', 'processing', 'minuto', 1, true, true, true, '{}'::jsonb),
  ('knowledge_page', 'Página equivalente Knowledge AI', 'knowledge', 'página', 1, true, true, true, '{}'::jsonb),
  ('media_interpretation', 'Interpretação de mídia', 'processing', 'arquivo', 2, true, true, true, '{}'::jsonb)
ON CONFLICT (feature_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  unit_label = EXCLUDED.unit_label,
  vendor_credit_weight = EXCLUDED.vendor_credit_weight,
  metered = EXCLUDED.metered,
  customer_visible = EXCLUDED.customer_visible,
  charge_on_success_only = EXCLUDED.charge_on_success_only,
  metadata = usage_feature_catalog.metadata || EXCLUDED.metadata,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 7. Growth quota V1. Deliberately measure_only until real margin telemetry is
--    validated. CRM/software operations that have no marginal cost stay outside
--    this table and therefore are not quota-limited.
-- ---------------------------------------------------------------------------
INSERT INTO product_usage_quotas (product_sku, feature_key, monthly_quantity, hard_limit, enforcement_mode, metadata)
VALUES
  ('vendor-growth-monthly', 'content_generation', 300, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'image_generation', 100, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'video_generation', 10, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'render_generation', 30, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'prospect_enrichment', 1500, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'ai_team_interaction', 10000, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'proposal_generation', 500, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'jarvis_analysis', 1000, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'autopilot_article', 30, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'site_generation', 3, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'landing_page_generation', 10, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'ads_campaign_generation', 30, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'audio_transcription_minute', 600, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'document_processing', 500, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'knowledge_page', 2000, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-growth-monthly', 'media_interpretation', 200, false, 'measure_only', '{"quota_version":"growth-v1"}'::jsonb),
  ('vendor-prospector-monthly', 'prospect_enrichment', 500, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-ai-team-10-monthly', 'ai_team_interaction', 2500, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-content-studio-monthly', 'content_generation', 100, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-creative-studio-monthly', 'image_generation', 20, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-creative-studio-monthly', 'video_generation', 2, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-sites-autopilot-monthly', 'site_generation', 2, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-sites-autopilot-monthly', 'autopilot_article', 12, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-ads-monthly', 'ads_campaign_generation', 10, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-propostas-orcamentos-monthly', 'proposal_generation', 100, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-knowledge-ai-monthly', 'knowledge_page', 500, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb),
  ('vendor-revenue-scout-monthly', 'jarvis_analysis', 250, false, 'measure_only', '{"quota_version":"module-v1"}'::jsonb)
ON CONFLICT (product_sku, feature_key) DO UPDATE SET
  monthly_quantity = EXCLUDED.monthly_quantity,
  hard_limit = EXCLUDED.hard_limit,
  enforcement_mode = EXCLUDED.enforcement_mode,
  metadata = product_usage_quotas.metadata || EXCLUDED.metadata,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- 8. Product -> technical module entitlement map
-- ---------------------------------------------------------------------------
INSERT INTO commercial_product_modules (product_sku, module_key, required)
VALUES
  ('vendor-crm-free', 'dashboard', true), ('vendor-crm-free', 'leads', true), ('vendor-crm-free', 'deals', true), ('vendor-crm-free', 'reports', false),
  ('vendor-crm-monthly', 'dashboard', true), ('vendor-crm-monthly', 'leads', true), ('vendor-crm-monthly', 'deals', true), ('vendor-crm-monthly', 'reports', false),
  ('vendor-agenda-monthly', 'scheduler', true),
  ('vendor-omnichannel-monthly', 'conversations', true),
  ('vendor-prospector-monthly', 'prospector', true),
  ('vendor-ai-team-10-monthly', 'agents', true), ('vendor-ai-team-10-monthly', 'sdr', true),
  ('vendor-revenue-scout-monthly', 'revenue', true), ('vendor-revenue-scout-monthly', 'churn', false), ('vendor-revenue-scout-monthly', 'intelligence', false),
  ('vendor-content-planner-monthly', 'content', true),
  ('vendor-content-studio-monthly', 'content', true),
  ('vendor-sites-autopilot-monthly', 'content_autopilot', true),
  ('vendor-ads-monthly', 'campaigns', true),
  ('vendor-jarvis-monthly', 'vendor_brain', true), ('vendor-jarvis-monthly', 'intelligence', false),
  ('vendor-propostas-orcamentos-monthly', 'proposals', true), ('vendor-propostas-orcamentos-monthly', 'commissions', false),
  ('vendor-financeiro-erp-monthly', 'financeiro', true), ('vendor-financeiro-erp-monthly', 'inventory', false),
  ('vendor-marketplace-praca-monthly', 'praca_ai', true), ('vendor-marketplace-praca-monthly', 'deliveries', false), ('vendor-marketplace-praca-monthly', 'partner_network', false),
  ('vendor-bi-analytics-monthly', 'analytics', true), ('vendor-bi-analytics-monthly', 'reports', false),
  ('vendor-knowledge-ai-monthly', 'knowledge_graph', true),
  ('vendor-arqdor-monthly', 'arch', true)
ON CONFLICT (product_sku, module_key) DO UPDATE SET
  required = EXCLUDED.required;

-- ---------------------------------------------------------------------------
-- 9. Align current plan semantics without removing legacy rows.
-- ---------------------------------------------------------------------------
UPDATE plans SET max_users = 1, updated_at = now() WHERE slug = 'start';
UPDATE plans SET max_users = NULL, extra_user_price_cents = NULL, updated_at = now() WHERE slug = 'growth';

-- Normalize the VendorAI SaaS catalog safely by known SKUs. No physical tenant
-- products are touched.
UPDATE produtos_catalogo SET product_type = 'saas_plan', nome = 'Vendor CRM Pro', updated_at = now()
WHERE sku = 'vendor-crm-monthly';

UPDATE produtos_catalogo SET product_type = 'saas_addon', updated_at = now()
WHERE sku IN (
  'vendor-agenda-monthly','vendor-creative-studio-monthly','vendor-jarvis-monthly',
  'vendor-ads-monthly','vendor-content-planner-monthly','vendor-omnichannel-monthly',
  'vendor-financeiro-erp-monthly','vendor-content-studio-monthly','vendor-prospector-monthly',
  'vendor-ai-team-10-monthly','vendor-sites-autopilot-monthly','vendor-revenue-scout-monthly',
  'vendor-propostas-orcamentos-monthly','vendor-bi-analytics-monthly','vendor-automations-monthly',
  'vendor-knowledge-ai-monthly','vendor-marketplace-praca-monthly','vendor-app-builder-monthly',
  'vendor-reputation-monthly'
);

UPDATE produtos_catalogo SET nome = 'Vendor Gestão', updated_at = now() WHERE sku = 'vendor-financeiro-erp-monthly';
UPDATE produtos_catalogo SET nome = 'Vendor Propostas & Catálogo', updated_at = now() WHERE sku = 'vendor-propostas-orcamentos-monthly';
UPDATE produtos_catalogo SET nome = 'Praça.ai', updated_at = now() WHERE sku = 'vendor-marketplace-praca-monthly';
UPDATE produtos_catalogo SET product_type = 'service', updated_at = now()
WHERE sku IN ('vendor-custom-app-cash','vendor-implementation-cash');

-- ---------------------------------------------------------------------------
-- 10. Read models for Super Admin / tenant UI. These views are observability
--     only; enforcement remains off until telemetry is validated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tenant_monthly_usage AS
SELECT
  ul.tenant_id,
  date_trunc('month', ul.occurred_at) AS usage_month,
  ul.feature_key,
  ufc.display_name,
  ufc.unit_label,
  sum(CASE WHEN ul.success AND ul.delivered_result THEN ul.quantity ELSE 0 END) AS delivered_quantity,
  sum(CASE WHEN ul.charged_to_quota THEN ul.vendor_credits ELSE 0 END) AS charged_vendor_credits,
  sum(ul.total_cost_usd) AS total_cost_usd,
  sum(coalesce(ul.total_cost_brl, 0)) AS total_cost_brl,
  count(*) FILTER (WHERE ul.success) AS successful_events,
  count(*) FILTER (WHERE NOT ul.success) AS failed_events
FROM usage_ledger ul
JOIN usage_feature_catalog ufc ON ufc.feature_key = ul.feature_key
GROUP BY ul.tenant_id, date_trunc('month', ul.occurred_at), ul.feature_key, ufc.display_name, ufc.unit_label;

CREATE OR REPLACE VIEW v_commercial_product_matrix AS
SELECT
  cp.sku,
  cp.slug,
  cp.name,
  cp.product_kind,
  cp.monthly_price_cents,
  cp.one_time_price_cents,
  cp.max_users,
  cp.users_unlimited,
  cp.standalone_purchase,
  cp.included_in_growth,
  cp.growth_inclusion_mode,
  cp.public_visible,
  cp.active,
  coalesce(
    jsonb_agg(DISTINCT jsonb_build_object('module_key', cpm.module_key, 'access_level', cpm.access_level, 'required', cpm.required))
      FILTER (WHERE cpm.id IS NOT NULL),
    '[]'::jsonb
  ) AS modules,
  coalesce(
    jsonb_agg(DISTINCT jsonb_build_object(
      'feature_key', puq.feature_key,
      'monthly_quantity', puq.monthly_quantity,
      'enforcement_mode', puq.enforcement_mode,
      'unit_label', ufc.unit_label,
      'vendor_credit_weight', ufc.vendor_credit_weight
    )) FILTER (WHERE puq.id IS NOT NULL),
    '[]'::jsonb
  ) AS quotas
FROM commercial_products cp
LEFT JOIN commercial_product_modules cpm ON cpm.product_sku = cp.sku
LEFT JOIN product_usage_quotas puq ON puq.product_sku = cp.sku
LEFT JOIN usage_feature_catalog ufc ON ufc.feature_key = puq.feature_key
GROUP BY cp.sku, cp.slug, cp.name, cp.product_kind, cp.monthly_price_cents, cp.one_time_price_cents, cp.max_users, cp.users_unlimited, cp.standalone_purchase, cp.included_in_growth, cp.growth_inclusion_mode, cp.public_visible, cp.active;

COMMIT;
