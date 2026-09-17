-- VendorAI commercial product matrix + universal usage ledger — 2026-09-17
--
-- Goals:
-- 1) Keep produtos_internos as the single commercial source of truth.
-- 2) Separate commercial products from technical modules and segment context.
-- 3) Support CRM Free (1 user), module subscriptions, Growth and prepaid Growth passes.
-- 4) Measure customer-facing units and Vendor Credits while preserving provider/token cost.
-- 5) Ship in measure-only mode: no quota blocking is enabled by this migration.

-- ─────────────────────────────────────────────────────────────────────────────
-- Commercial master fields on the existing produtos_internos catalog
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS anexos jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS commercial_key text;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS billing_model text;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS public_slug text;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS monthly_price_cents integer;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS one_time_price_cents integer;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS max_users integer;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS unlimited_users boolean NOT NULL DEFAULT false;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS included_in_growth boolean NOT NULL DEFAULT false;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS standalone_purchase boolean NOT NULL DEFAULT true;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS public_visible boolean NOT NULL DEFAULT true;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS module_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS usage_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE produtos_internos ADD COLUMN IF NOT EXISTS commercial_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS produtos_internos_commercial_key_uidx
  ON produtos_internos (commercial_key)
  WHERE commercial_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS produtos_internos_sku_uidx
  ON produtos_internos (sku)
  WHERE sku IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage metrics: customer unit + internal Vendor Credit weight
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_metric_definitions (
  metric_key text PRIMARY KEY,
  label text NOT NULL,
  unit_label text NOT NULL,
  vendor_credit_weight numeric(14,4) NOT NULL DEFAULT 1,
  customer_visible boolean NOT NULL DEFAULT true,
  charge_only_on_success boolean NOT NULL DEFAULT true,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_usage_quotas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id text NOT NULL REFERENCES produtos_internos(id) ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES usage_metric_definitions(metric_key) ON DELETE CASCADE,
  period text NOT NULL DEFAULT 'monthly',
  included_quantity numeric(18,4) NOT NULL,
  hard_cap numeric(18,4),
  overage_allowed boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(product_id, metric_key, period)
);

CREATE TABLE IF NOT EXISTS tenant_product_entitlements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES produtos_internos(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'active',
  quantity integer NOT NULL DEFAULT 1,
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  auto_renew boolean NOT NULL DEFAULT false,
  price_snapshot_cents integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_product_entitlements_tenant_idx
  ON tenant_product_entitlements (tenant_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS tenant_product_entitlements_product_idx
  ON tenant_product_entitlements (product_id, status);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,
  product_id text REFERENCES produtos_internos(id) ON DELETE SET NULL,
  metric_key text NOT NULL REFERENCES usage_metric_definitions(metric_key) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  vendor_credits numeric(18,4) NOT NULL DEFAULT 0,
  quota_consumed boolean NOT NULL DEFAULT false,
  customer_billable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'success',
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  external_api_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  fx_rate_brl numeric(12,6),
  total_cost_brl numeric(14,6),
  used_byok boolean NOT NULL DEFAULT false,
  request_id text,
  source_type text,
  source_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_ledger_tenant_period_idx
  ON usage_ledger (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_ledger_metric_period_idx
  ON usage_ledger (metric_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_ledger_product_period_idx
  ON usage_ledger (product_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS usage_ledger_request_idx
  ON usage_ledger (request_id)
  WHERE request_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- CRM Free + Growth access model
-- ─────────────────────────────────────────────────────────────────────────────
-- Start remains the persistent free account shell. It now means CRM Free and
-- is intentionally limited by team size (1 user), not by a crippled CRM.
UPDATE plans
SET name = 'CRM Free',
    monthly_price_cents = 0,
    implantation_price_cents = 0,
    max_users = 1,
    extra_user_price_cents = NULL,
    ai_quota_usd = 0,
    is_active = true,
    updated_at = now()
WHERE slug = 'start';

-- Growth remains continuous full access with unlimited users. Commercial usage
-- is governed by product quotas/Vendor Credits instead of a user cap.
UPDATE plans
SET name = 'Growth',
    monthly_price_cents = 149000,
    implantation_price_cents = 0,
    max_users = NULL,
    extra_user_price_cents = NULL,
    is_active = true,
    updated_at = now()
WHERE slug = 'growth';

-- Retired historical tiers stay available for old FKs/history only.
UPDATE plans
SET is_active = false, updated_at = now()
WHERE slug NOT IN ('start', 'growth');

-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical commercial products
-- Existing names are preserved for compatibility; commercial_key is the stable
-- contract used by entitlement, site and billing code.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO produtos_internos (
  id, categoria, nome, descricao_uso, tipo, nichos_relacionados, detalhes, anexos,
  ordem, ativo, created_at, updated_at, commercial_key, sku, billing_model,
  public_slug, monthly_price_cents, one_time_price_cents, max_users,
  unlimited_users, included_in_growth, standalone_purchase, public_visible,
  module_keys, usage_policy, commercial_metadata
)
SELECT
  gen_random_uuid()::text,
  'Produtos Comerciais VendorAI',
  'Vendor CRM Free',
  'CRM completo para uma pessoa começar e operar de verdade. A limitação comercial principal é 1 usuário; módulos premium continuam contratáveis separadamente.',
  'oferta', '[]'::jsonb,
  jsonb_build_object(
    'publicName','Vendor CRM Free',
    'headline','CRM completo grátis para 1 usuário',
    'benefits',jsonb_build_array('CRM completo','1 usuário','Sem cartão para começar','Dados permanecem na conta'),
    'exclusions',jsonb_build_array('Prospector','Omnichannel premium','AI Team','Marketing generativo em volume','ERP/Gestão','Módulos especializados')
  ),
  '[]'::jsonb,
  99, true, now(), now(),
  'vendor_crm_free', 'vendor-crm-free', 'free', 'crm-free', 0, NULL, 1,
  false, false, false, true,
  '["dashboard","leads","deals","settings"]'::jsonb,
  '{"version":"v1","enforcement":"measure_only"}'::jsonb,
  '{"role":"acquisition","sourceOfTruth":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_internos WHERE commercial_key = 'vendor_crm_free'
     OR (categoria='Produtos Comerciais VendorAI' AND lower(nome)=lower('Vendor CRM Free'))
);

-- Ensure current commercial rows receive stable commercial keys and economics.
WITH cfg(nome, commercial_key, sku, billing_model, public_slug, monthly_cents, one_time_cents, max_users, unlimited_users, included_growth, standalone, public_visible, module_keys, metadata) AS (
  VALUES
    ('VendorAI Growth','vendorai_growth','vendor-growth-monthly','subscription','growth',149000,NULL,NULL,true,true,true,true,'["growth:segment_applicable"]'::jsonb,'{"role":"bundle","segmentScoped":true,"prepaidEligible":true}'::jsonb),
    ('Vendor CRM','vendor_crm_pro','vendor-crm-monthly','subscription','crm',4990,NULL,NULL,false,true,true,true,'["dashboard","leads","deals","settings"]'::jsonb,'{"publicName":"Vendor CRM Pro","role":"entry_paid"}'::jsonb),
    ('Vendor Prospector','vendor_prospector','vendor-prospector-monthly','subscription','prospeccao',39900,NULL,NULL,false,true,true,true,'["prospector"]'::jsonb,'{}'::jsonb),
    ('Vendor Omnichannel','vendor_omnichannel','vendor-omnichannel-monthly','subscription','omnichannel',19900,NULL,NULL,false,true,true,true,'["conversations"]'::jsonb,'{}'::jsonb),
    ('Vendor Agenda','vendor_agenda','vendor-agenda-monthly','subscription','agenda-inteligente',1990,NULL,NULL,false,true,true,true,'["scheduler"]'::jsonb,'{}'::jsonb),
    ('Vendor AI Team — 10 agentes','vendor_ai_team','vendor-ai-team-10-monthly','subscription','agentes-ia',49900,NULL,NULL,false,true,true,true,'["agents","sdr"]'::jsonb,'{}'::jsonb),
    ('Vendor Revenue Scout','vendor_revenue_scout','vendor-revenue-scout-monthly','subscription','revenue-scout',49900,NULL,NULL,false,true,true,true,'["revenue","churn","intelligence"]'::jsonb,'{}'::jsonb),
    ('Vendor Content Planner','vendor_content_planner','vendor-content-planner-monthly','subscription','content-planner',19900,NULL,NULL,false,true,true,true,'["content"]'::jsonb,'{}'::jsonb),
    ('Vendor Content Studio','vendor_content_studio','vendor-content-studio-monthly','subscription','content-studio',39900,NULL,NULL,false,true,true,true,'["content"]'::jsonb,'{}'::jsonb),
    ('Vendor Creative Studio','vendor_creative_studio','vendor-creative-studio-monthly','subscription','creative-studio',13900,NULL,NULL,false,true,true,true,'["content"]'::jsonb,'{}'::jsonb),
    ('Vendor Sites & Autopilot','vendor_sites_autopilot','vendor-sites-autopilot-monthly','subscription','sites-lp-ecommerce',49900,NULL,NULL,false,true,true,true,'["content_autopilot"]'::jsonb,'{}'::jsonb),
    ('Vendor Ads','vendor_ads','vendor-ads-monthly','subscription','ads',19900,NULL,NULL,false,true,true,true,'["campaigns"]'::jsonb,'{"mediaSpendIncluded":false}'::jsonb),
    ('Vendor JARVIS','vendor_jarvis','vendor-jarvis-monthly','subscription','jarvis',14900,NULL,NULL,false,true,true,true,'["vendor_brain"]'::jsonb,'{}'::jsonb),
    ('Vendor Propostas & Catálogo','vendor_propostas_catalogo','vendor-propostas-orcamentos-monthly','subscription','catalogo-propostas',9900,NULL,NULL,false,true,true,true,'["proposals"]'::jsonb,'{}'::jsonb),
    ('Vendor Gestão','vendor_gestao','vendor-financeiro-erp-monthly','subscription','financeiro',29900,NULL,NULL,false,true,true,true,'["financeiro","inventory"]'::jsonb,'{}'::jsonb),
    ('arqdor.ai','arqdor_ai','arqdor-ai-monthly','subscription','arqdor-ai',NULL,NULL,NULL,false,true,true,true,'["arch"]'::jsonb,'{"segmentScoped":true,"priceStatus":"pending"}'::jsonb),
    ('Praça.ai','praca_ai','vendor-marketplace-praca-monthly','subscription','praca-ai',29900,NULL,NULL,false,true,true,true,'["praca_ai","deliveries"]'::jsonb,'{"transactionFeesIncluded":false}'::jsonb),
    ('App Personalizado VendorAI','vendor_custom_app','vendor-custom-app-cash','one_time','app-personalizado',NULL,499000,NULL,false,false,true,true,'[]'::jsonb,'{"role":"service_like_product"}'::jsonb),
    ('Implantação VendorAI','vendor_implementation','vendor-implementation-cash','service','implantacao',NULL,189000,NULL,false,false,true,true,'[]'::jsonb,'{"role":"optional_service"}'::jsonb),
    ('Vendor App Builder','vendor_app_builder','vendor-app-builder-monthly','subscription','app-builder',29900,NULL,NULL,false,true,true,true,'[]'::jsonb,'{}'::jsonb),
    ('Vendor Automations','vendor_automations','vendor-automations-monthly','subscription','automacoes',14900,NULL,NULL,false,true,true,true,'[]'::jsonb,'{}'::jsonb),
    ('Vendor BI & Analytics','vendor_bi_analytics','vendor-bi-analytics-monthly','subscription','analytics',14900,NULL,NULL,false,true,true,true,'["analytics","reports"]'::jsonb,'{}'::jsonb),
    ('Vendor Knowledge AI','vendor_knowledge_ai','vendor-knowledge-ai-monthly','subscription','knowledge-hub',9900,NULL,NULL,false,true,true,true,'["knowledge_graph"]'::jsonb,'{}'::jsonb),
    ('Vendor Reputation','vendor_reputation','vendor-reputation-monthly','subscription','reputation',7900,NULL,NULL,false,true,true,true,'[]'::jsonb,'{}'::jsonb)
)
UPDATE produtos_internos p
SET commercial_key = cfg.commercial_key,
    sku = cfg.sku,
    billing_model = cfg.billing_model,
    public_slug = cfg.public_slug,
    monthly_price_cents = cfg.monthly_cents,
    one_time_price_cents = cfg.one_time_cents,
    max_users = cfg.max_users,
    unlimited_users = cfg.unlimited_users,
    included_in_growth = cfg.included_growth,
    standalone_purchase = cfg.standalone,
    public_visible = cfg.public_visible,
    module_keys = cfg.module_keys,
    usage_policy = jsonb_build_object('version','v1','enforcement','measure_only'),
    commercial_metadata = COALESCE(p.commercial_metadata,'{}'::jsonb) || cfg.metadata,
    updated_at = now()
FROM cfg
WHERE p.categoria='Produtos Comerciais VendorAI'
  AND lower(p.nome)=lower(cfg.nome);

-- Commercial Growth prepaid pass is a separate entitlement product, not a nav module.
INSERT INTO produtos_internos (
  id,categoria,nome,descricao_uso,tipo,nichos_relacionados,detalhes,anexos,ordem,ativo,
  created_at,updated_at,commercial_key,sku,billing_model,public_slug,monthly_price_cents,
  one_time_price_cents,max_users,unlimited_users,included_in_growth,standalone_purchase,
  public_visible,module_keys,usage_policy,commercial_metadata
)
SELECT
  gen_random_uuid()::text,'Produtos Comerciais VendorAI','VendorAI Growth +5 dias',
  'Bloco pré-pago de 5 dias corridos de acesso Growth. O cliente mantém o CRM e seus dados fora do período ativo; o passe reativa os recursos Growth durante a janela comprada.',
  'oferta','[]'::jsonb,
  '{"publicName":"Growth +5 dias","days":5,"price":399,"freeDaysPerMonth":5}'::jsonb,
  '[]'::jsonb,100,true,now(),now(),'vendorai_growth_5d','vendor-growth-5days','prepaid',
  'growth-5-dias',NULL,39900,NULL,true,false,true,true,'["growth:segment_applicable"]'::jsonb,
  '{"version":"v1","enforcement":"measure_only","quotaMode":"growth_prorated_or_policy"}'::jsonb,
  '{"role":"prepaid_pass","segmentScoped":true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM produtos_internos WHERE commercial_key='vendorai_growth_5d');

-- ─────────────────────────────────────────────────────────────────────────────
-- Usage metric catalog / Vendor Credits V1
-- Credits are an internal economic unit. Customer UI should primarily show the
-- understandable unit (image, video, prospect, render, etc.).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO usage_metric_definitions(metric_key,label,unit_label,vendor_credit_weight,customer_visible,charge_only_on_success,description)
VALUES
  ('ai_assist','Assistências de IA','assistências',1,true,true,'Assistência curta no CRM, briefing ou próxima ação.'),
  ('content_generation','Conteúdos IA','conteúdos',5,true,true,'Post, copy, legenda, roteiro, carrossel ou peça textual concluída.'),
  ('image_generation','Imagens IA','imagens',10,true,true,'Imagem final gerada.'),
  ('video_generation','Vídeos IA','vídeos',200,true,true,'Vídeo final concluído. Peso V1 conservador; recalibrar com custo real do motor.'),
  ('render_generation','Renders arqdor.ai','renders',25,true,true,'Render final concluído.'),
  ('prospect_enrichment','Prospects enriquecidos','prospects',2,true,true,'Empresa/lead válido entregue e enriquecido.'),
  ('agent_interaction','Interações AI Team','interações',1,true,true,'Interação automatizada executada por agente.'),
  ('proposal_generation','Propostas/orçamentos IA','propostas',5,true,true,'Documento novo gerado; edição manual não consome.'),
  ('intelligence_analysis','Análises inteligentes','análises',2,true,true,'Análise JARVIS, Revenue Scout ou inteligência concluída.'),
  ('autopilot_article','Artigos Autopilot','artigos',20,true,true,'Artigo concluído pelo Content Autopilot.'),
  ('site_generation','Sites completos','sites',100,true,true,'Novo site completo gerado; edição simples não consome nova unidade.'),
  ('landing_page_generation','Landing pages','landing pages',40,true,true,'Nova landing page gerada.'),
  ('ads_campaign_generation','Campanhas/kit Ads IA','campanhas',10,true,true,'Campanha ou kit de anúncios gerado; investimento em mídia é separado.'),
  ('audio_transcription_minute','Transcrição de áudio','minutos',1,true,true,'Minuto efetivamente transcrito.'),
  ('document_processing','Documentos processados','documentos',2,true,true,'Documento/foto lido ou extraído com sucesso.'),
  ('knowledge_page','Páginas Knowledge AI','páginas',0.25,true,true,'Página equivalente indexada na base de conhecimento.'),
  ('media_interpretation','Mídias analisadas','arquivos',2,true,true,'Imagem/áudio/vídeo interpretado pela IA.'),
  ('web_search','Pesquisas web','pesquisas',1,true,true,'Pesquisa externa concluída.' )
ON CONFLICT (metric_key) DO UPDATE SET
  label=EXCLUDED.label,
  unit_label=EXCLUDED.unit_label,
  vendor_credit_weight=EXCLUDED.vendor_credit_weight,
  customer_visible=EXCLUDED.customer_visible,
  charge_only_on_success=EXCLUDED.charge_only_on_success,
  description=EXCLUDED.description,
  active=true,
  updated_at=now();

-- Helper for idempotent quota seeding.
WITH quotas(commercial_key,metric_key,included_quantity,hard_cap,overage_allowed,metadata) AS (
  VALUES
    -- CRM Free / Pro: same core CRM, different team/commercial allowance.
    ('vendor_crm_free','ai_assist',30::numeric,NULL::numeric,true,'{"status":"v1"}'::jsonb),
    ('vendor_crm_pro','ai_assist',100,NULL,true,'{"status":"v1"}'::jsonb),

    -- Individual modules.
    ('vendor_prospector','prospect_enrichment',500,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_ai_team','agent_interaction',2500,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_content_studio','content_generation',100,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_creative_studio','image_generation',20,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_creative_studio','video_generation',2,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_sites_autopilot','site_generation',2,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_sites_autopilot','landing_page_generation',5,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_sites_autopilot','autopilot_article',12,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_ads','ads_campaign_generation',10,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_propostas_catalogo','proposal_generation',100,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_knowledge_ai','knowledge_page',500,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_revenue_scout','intelligence_analysis',250,NULL,true,'{"status":"v1"}'::jsonb),
    ('vendor_jarvis','intelligence_analysis',250,NULL,true,'{"status":"v1"}'::jsonb),
    ('arqdor_ai','render_generation',10,NULL,true,'{"status":"v1","priceStatus":"pending"}'::jsonb),

    -- Growth Quota V1 — per tenant/company, never multiplied by user count.
    ('vendorai_growth','content_generation',300,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','image_generation',100,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','video_generation',10,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','render_generation',30,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','prospect_enrichment',1500,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','agent_interaction',10000,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','proposal_generation',500,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','intelligence_analysis',1000,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','autopilot_article',30,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','site_generation',3,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','landing_page_generation',10,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','ads_campaign_generation',30,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','audio_transcription_minute',600,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','document_processing',500,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','knowledge_page',2000,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','media_interpretation',200,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','ai_assist',1000,NULL,true,'{"status":"growth_quota_v1"}'::jsonb),
    ('vendorai_growth','web_search',1000,NULL,true,'{"status":"growth_quota_v1"}'::jsonb)
)
INSERT INTO product_usage_quotas(product_id,metric_key,period,included_quantity,hard_cap,overage_allowed,metadata)
SELECT p.id,q.metric_key,'monthly',q.included_quantity,q.hard_cap,q.overage_allowed,q.metadata
FROM quotas q
JOIN produtos_internos p ON p.commercial_key=q.commercial_key
ON CONFLICT (product_id,metric_key,period) DO UPDATE SET
  included_quantity=EXCLUDED.included_quantity,
  hard_cap=EXCLUDED.hard_cap,
  overage_allowed=EXCLUDED.overage_allowed,
  metadata=EXCLUDED.metadata,
  updated_at=now();

-- ─────────────────────────────────────────────────────────────────────────────
-- Normalize VendorAI tenant catalog so public site/checkout stop using names and
-- types that disagree with the commercial master. No customer tenant is touched.
-- ─────────────────────────────────────────────────────────────────────────────
WITH vendor_tenant AS (
  SELECT id FROM tenants WHERE slug='vendorai' ORDER BY created_at LIMIT 1
)
UPDATE produtos_catalogo p
SET nome = CASE p.sku
      WHEN 'vendor-crm-monthly' THEN 'Vendor CRM Pro'
      WHEN 'vendor-financeiro-erp-monthly' THEN 'Vendor Gestão'
      WHEN 'vendor-propostas-orcamentos-monthly' THEN 'Vendor Propostas & Catálogo'
      WHEN 'vendor-marketplace-praca-monthly' THEN 'Praça.ai'
      ELSE p.nome
    END,
    product_type = CASE
      WHEN p.sku IN ('vendor-custom-app-cash','vendor-implementation-cash') THEN 'service'
      ELSE 'saas_addon'
    END,
    preco_mensalidade = CASE WHEN p.recorrencia='mensal' THEN p.preco_base ELSE p.preco_mensalidade END,
    updated_at = now()
FROM vendor_tenant vt
WHERE p.tenant_id=vt.id
  AND p.sku IN (
    'vendor-crm-monthly','vendor-prospector-monthly','vendor-omnichannel-monthly','vendor-agenda-monthly',
    'vendor-ai-team-10-monthly','vendor-revenue-scout-monthly','vendor-content-planner-monthly',
    'vendor-content-studio-monthly','vendor-creative-studio-monthly','vendor-sites-autopilot-monthly',
    'vendor-ads-monthly','vendor-jarvis-monthly','vendor-propostas-orcamentos-monthly',
    'vendor-financeiro-erp-monthly','vendor-marketplace-praca-monthly','vendor-app-builder-monthly',
    'vendor-automations-monthly','vendor-bi-analytics-monthly','vendor-knowledge-ai-monthly',
    'vendor-reputation-monthly','vendor-custom-app-cash','vendor-implementation-cash'
  );

WITH vendor_tenant AS (
  SELECT id FROM tenants WHERE slug='vendorai' ORDER BY created_at LIMIT 1
), offers(sku,nome,descricao,preco_base,preco_mensalidade,product_type,recorrencia,destaque) AS (
  VALUES
    ('vendor-crm-free','Vendor CRM Free','CRM completo para 1 usuário. Módulos premium podem ser ativados separadamente.','0.00'::numeric,NULL::numeric,'saas_plan','mensal',false),
    ('vendor-growth-monthly','VendorAI Growth','Acesso aos módulos aplicáveis ao segmento, usuários ilimitados e franquias Growth V1. Valor regular de catálogo.','1490.00'::numeric,'1490.00'::numeric,'saas_plan','mensal',true),
    ('vendor-growth-5days','VendorAI Growth +5 dias','Bloco pré-pago de 5 dias de acesso Growth. O benefício gratuito mensal é controlado pela licença de acesso.','399.00'::numeric,NULL::numeric,'saas_addon',NULL,false)
)
INSERT INTO produtos_catalogo(id,tenant_id,nome,sku,product_type,descricao,preco_base,preco_mensalidade,unidade,ativo,destaque,recorrencia,created_at,updated_at)
SELECT gen_random_uuid()::text,vt.id,o.nome,o.sku,o.product_type,o.descricao,o.preco_base,o.preco_mensalidade,'un',true,o.destaque,o.recorrencia,now(),now()
FROM vendor_tenant vt CROSS JOIN offers o
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo p WHERE p.tenant_id=vt.id AND p.sku=o.sku
);

WITH vendor_tenant AS (
  SELECT id FROM tenants WHERE slug='vendorai' ORDER BY created_at LIMIT 1
)
UPDATE produtos_catalogo p
SET ativo=false, updated_at=now()
FROM vendor_tenant vt
WHERE p.tenant_id=vt.id AND p.sku='vendor-pme-completo';

-- The system starts by measuring. Enforcement/automatic blocking is deliberately
-- left off until real 30-90 day cost and usage distributions are reviewed.
