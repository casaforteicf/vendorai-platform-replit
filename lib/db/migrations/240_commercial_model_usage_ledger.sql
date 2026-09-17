-- VendorAI commercial model + universal usage ledger
-- Safe foundation: metadata/measurement only. It does NOT block tenants.

CREATE TABLE IF NOT EXISTS commercial_product_profiles (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  commercial_key text NOT NULL UNIQUE,
  catalog_product_id text REFERENCES produtos_catalogo(id) ON DELETE SET NULL,
  offer_kind text NOT NULL,
  included_in_growth boolean NOT NULL DEFAULT false,
  max_users integer,
  module_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  segment_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_product_profiles_catalog_idx
  ON commercial_product_profiles(catalog_product_id);

CREATE TABLE IF NOT EXISTS usage_metrics (
  key text PRIMARY KEY,
  name text NOT NULL,
  unit_singular text NOT NULL,
  unit_plural text NOT NULL,
  vendor_credits_per_unit integer NOT NULL CHECK (vendor_credits_per_unit >= 0),
  customer_visible boolean NOT NULL DEFAULT true,
  only_charge_on_success boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_usage_quotas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  commercial_key text NOT NULL,
  metric_key text NOT NULL REFERENCES usage_metrics(key) ON DELETE CASCADE,
  monthly_quantity numeric(14,3),
  hard_cap_quantity numeric(14,3),
  overage_allowed boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (commercial_key, metric_key)
);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  commercial_key text NOT NULL,
  source text NOT NULL,
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_entitlements_tenant_key_idx
  ON tenant_entitlements(tenant_id, commercial_key);
CREATE INDEX IF NOT EXISTS tenant_entitlements_tenant_active_idx
  ON tenant_entitlements(tenant_id, active);

CREATE TABLE IF NOT EXISTS usage_ledger (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,
  commercial_key text,
  metric_key text NOT NULL REFERENCES usage_metrics(key) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  vendor_credits integer NOT NULL DEFAULT 0,
  billing_status text NOT NULL DEFAULT 'measured',
  billable boolean NOT NULL DEFAULT false,
  success boolean NOT NULL DEFAULT true,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  external_api_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  exchange_rate_brl numeric(12,6),
  total_cost_brl numeric(14,6),
  source text NOT NULL,
  source_event_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_ledger_tenant_metric_created_idx
  ON usage_ledger(tenant_id, metric_key, created_at);
CREATE INDEX IF NOT EXISTS usage_ledger_tenant_created_idx
  ON usage_ledger(tenant_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_source_event_uq
  ON usage_ledger(source, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendor_credit_transactions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credits_delta integer NOT NULL,
  reason text NOT NULL,
  commercial_key text,
  reference_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendor_credit_transactions_tenant_created_idx
  ON vendor_credit_transactions(tenant_id, created_at);

-- Resolve the institutional VendorAI catalog from existing canonical SKUs.
-- This removes the old dependency on a hard-coded tenant UUID and keeps the
-- migration portable across staging/production environments.
WITH vendor_catalog_tenant AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN (
      'vendor-crm-monthly',
      'vendor-growth-monthly',
      'vendor-prospector-monthly',
      'vendor-omnichannel-monthly'
    )
  ORDER BY CASE WHEN sku = 'vendor-crm-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
)
INSERT INTO produtos_catalogo
  (id, tenant_id, categoria_id, nome, sku, product_type, descricao, preco_base, preco_mensalidade, unidade, ativo, destaque, recorrencia)
SELECT gen_random_uuid()::text, tenant_id, categoria_id, 'Vendor CRM Free', 'vendor-crm-free', 'saas_plan',
       'CRM completo para 1 usuário. Porta de entrada gratuita do ecossistema VendorAI.',
       0, 0, 'un', true, true, 'mensal'
FROM vendor_catalog_tenant
WHERE NOT EXISTS (SELECT 1 FROM produtos_catalogo WHERE sku = 'vendor-crm-free');

WITH vendor_catalog_tenant AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN ('vendor-crm-monthly','vendor-growth-monthly','vendor-prospector-monthly','vendor-omnichannel-monthly')
  ORDER BY CASE WHEN sku = 'vendor-crm-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
)
INSERT INTO produtos_catalogo
  (id, tenant_id, categoria_id, nome, sku, product_type, descricao, preco_base, preco_mensalidade, unidade, ativo, destaque, recorrencia)
SELECT gen_random_uuid()::text, tenant_id, categoria_id, 'VendorAI Growth', 'vendor-growth-monthly', 'saas_plan',
       'Ecossistema VendorAI completo para o segmento do cliente, com usuários ilimitados e franquias mensais de consumo.',
       1490, 1490, 'un', true, true, 'mensal'
FROM vendor_catalog_tenant
WHERE NOT EXISTS (SELECT 1 FROM produtos_catalogo WHERE sku = 'vendor-growth-monthly');

WITH vendor_catalog_tenant AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN ('vendor-crm-monthly','vendor-growth-monthly','vendor-prospector-monthly','vendor-omnichannel-monthly')
  ORDER BY CASE WHEN sku = 'vendor-crm-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
)
INSERT INTO produtos_catalogo
  (id, tenant_id, categoria_id, nome, sku, product_type, descricao, preco_base, unidade, ativo, destaque)
SELECT gen_random_uuid()::text, tenant_id, categoria_id, 'Growth +5 dias', 'vendor-growth-5d', 'saas_addon',
       'Bloco adicional de 5 dias de acesso Growth.', 399, 'un', true, false
FROM vendor_catalog_tenant
WHERE NOT EXISTS (SELECT 1 FROM produtos_catalogo WHERE sku = 'vendor-growth-5d');

-- Canonical commercial profiles. Raw nav modules remain implementation details.
INSERT INTO commercial_product_profiles
  (commercial_key, catalog_product_id, offer_kind, included_in_growth, max_users, module_keys, benefits, display_order, metadata)
VALUES
('vendor.crm.free', (SELECT id FROM produtos_catalogo WHERE sku='vendor-crm-free' ORDER BY created_at DESC LIMIT 1), 'free', false, 1,
 '["dashboard","leads","deals","scheduler","settings"]', '["CRM completo","1 usuário","Leads, contatos, pipeline, tarefas e histórico"]', 10, '{"acquisition":true}'),
('vendor.crm', (SELECT id FROM produtos_catalogo WHERE sku='vendor-crm-monthly' ORDER BY created_at DESC LIMIT 1), 'subscription', true, NULL,
 '["dashboard","leads","deals","scheduler","settings"]', '["CRM completo","Trabalho em equipe","Gestão comercial"]', 20, '{}'),
('vendor.agenda', (SELECT id FROM produtos_catalogo WHERE sku='vendor-agenda-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["scheduler"]', '["Agenda inteligente","Lembretes e integração de calendário"]', 30, '{}'),
('vendor.omnichannel', (SELECT id FROM produtos_catalogo WHERE sku='vendor-omnichannel-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["conversations"]', '["WhatsApp, Instagram e canais em uma caixa de entrada"]', 40, '{}'),
('vendor.prospector', (SELECT id FROM produtos_catalogo WHERE sku='vendor-prospector-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["prospector"]', '["Prospecção ativa e enriquecimento de leads"]', 50, '{}'),
('vendor.ai_team', (SELECT id FROM produtos_catalogo WHERE sku='vendor-ai-team-10-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["sdr","agents"]', '["SDR, Closer, Follow-up, Recepção, Cobrança, Agendamento e Pós-venda"]', 60, '{}'),
('vendor.revenue_scout', (SELECT id FROM produtos_catalogo WHERE sku='vendor-revenue-scout-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["revenue","churn","intelligence"]', '["Oportunidades, churn e inteligência de receita"]', 70, '{}'),
('vendor.proposals_catalog', (SELECT id FROM produtos_catalogo WHERE sku='vendor-propostas-orcamentos-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["proposals"]', '["Catálogo, propostas, orçamentos, contratos e comissões"]', 80, '{}'),
('vendor.management', (SELECT id FROM produtos_catalogo WHERE sku='vendor-financeiro-erp-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["financeiro","inventory"]', '["Financeiro, ERP, estoque, compras e fornecedores"]', 90, '{}'),
('vendor.jarvis', (SELECT id FROM produtos_catalogo WHERE sku='vendor-jarvis-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["vendor_brain"]', '["Inteligência executiva, alertas e recomendações"]', 100, '{}'),
('vendor.knowledge', (SELECT id FROM produtos_catalogo WHERE sku='vendor-knowledge-ai-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["knowledge_graph"]', '["Base de conhecimento e contexto do negócio"]', 110, '{}'),
('vendor.bi', (SELECT id FROM produtos_catalogo WHERE sku='vendor-bi-analytics-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["analytics","reports"]', '["Indicadores, dashboards e análises"]', 120, '{}'),
('vendor.automations', (SELECT id FROM produtos_catalogo WHERE sku='vendor-automations-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["agents"]', '["Fluxos e automações operacionais"]', 130, '{}'),
('vendor.content_planner', (SELECT id FROM produtos_catalogo WHERE sku='vendor-content-planner-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["content"]', '["Planejamento e calendário de conteúdo"]', 140, '{}'),
('vendor.content_studio', (SELECT id FROM produtos_catalogo WHERE sku='vendor-content-studio-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["content"]', '["Posts, copies, roteiros, legendas e carrosséis"]', 150, '{}'),
('vendor.creative_studio', (SELECT id FROM produtos_catalogo WHERE sku='vendor-creative-studio-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["content"]', '["Imagens, vídeos e criativos com IA"]', 160, '{}'),
('vendor.ads', (SELECT id FROM produtos_catalogo WHERE sku='vendor-ads-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["campaigns"]', '["Planejamento e geração de campanhas de mídia"]', 170, '{}'),
('vendor.sites_autopilot', (SELECT id FROM produtos_catalogo WHERE sku='vendor-sites-autopilot-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["content_autopilot"]', '["Sites, landing pages, SEO, blog e Content Autopilot"]', 180, '{}'),
('vendor.praca', (SELECT id FROM produtos_catalogo WHERE sku='vendor-marketplace-praca-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '["praca_ai"]', '["Marketplace, pedidos, pagamentos, entregas e reputação"]', 190, '{}'),
('vendor.app_builder', (SELECT id FROM produtos_catalogo WHERE sku='vendor-app-builder-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '[]', '["Criação e gestão de aplicativos personalizados"]', 200, '{}'),
('vendor.reputation', (SELECT id FROM produtos_catalogo WHERE sku='vendor-reputation-monthly' ORDER BY created_at DESC LIMIT 1), 'module', true, NULL,
 '[]', '["Avaliações, reputação e prova social"]', 210, '{}'),
('vendor.growth', (SELECT id FROM produtos_catalogo WHERE sku='vendor-growth-monthly' ORDER BY created_at DESC LIMIT 1), 'subscription', false, NULL,
 '[]', '["Usuários ilimitados","Todos os módulos aplicáveis ao segmento","Franquias Growth de consumo"]', 1, '{"unlimitedUsers":true,"segmentScoped":true}'),
('vendor.growth.5d', (SELECT id FROM produtos_catalogo WHERE sku='vendor-growth-5d' ORDER BY created_at DESC LIMIT 1), 'prepaid_pass', false, NULL,
 '[]', '["5 dias adicionais de acesso Growth"]', 2, '{"durationDays":5}'),
('vendor.implementation', (SELECT id FROM produtos_catalogo WHERE sku='vendor-implementation-cash' ORDER BY created_at DESC LIMIT 1), 'service', false, NULL,
 '[]', '["Implantação humana assistida"]', 300, '{}'),
('vendor.custom_app', (SELECT id FROM produtos_catalogo WHERE sku='vendor-custom-app-cash' ORDER BY created_at DESC LIMIT 1), 'service', false, NULL,
 '[]', '["Aplicativo personalizado"]', 310, '{}')
ON CONFLICT (commercial_key) DO UPDATE SET
  catalog_product_id = EXCLUDED.catalog_product_id,
  offer_kind = EXCLUDED.offer_kind,
  included_in_growth = EXCLUDED.included_in_growth,
  max_users = EXCLUDED.max_users,
  module_keys = EXCLUDED.module_keys,
  benefits = EXCLUDED.benefits,
  display_order = EXCLUDED.display_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- Usage units and Vendor Credit weights. These are commercial units, not raw provider tokens.
INSERT INTO usage_metrics
  (key, name, unit_singular, unit_plural, vendor_credits_per_unit, customer_visible, only_charge_on_success)
VALUES
('ai_assist', 'Assistência de IA', 'assistência', 'assistências', 1, true, true),
('content', 'Conteúdo gerado', 'conteúdo', 'conteúdos', 5, true, true),
('image', 'Imagem gerada', 'imagem', 'imagens', 10, true, true),
('video', 'Vídeo gerado', 'vídeo', 'vídeos', 200, true, true),
('render', 'Render arqdor.ai', 'render', 'renders', 25, true, true),
('prospect', 'Prospect enriquecido', 'prospect', 'prospects', 2, true, true),
('agent_interaction', 'Interação automatizada', 'interação', 'interações', 1, true, true),
('proposal', 'Proposta/orçamento IA', 'proposta', 'propostas', 5, true, true),
('intelligence_analysis', 'Análise inteligente', 'análise', 'análises', 2, true, true),
('autopilot_article', 'Artigo Autopilot', 'artigo', 'artigos', 20, true, true),
('site', 'Site completo', 'site', 'sites', 100, true, true),
('landing_page', 'Landing page', 'landing page', 'landing pages', 40, true, true),
('ads_campaign', 'Campanha/kit de Ads', 'campanha', 'campanhas', 10, true, true),
('audio_minute', 'Transcrição de áudio', 'minuto', 'minutos', 1, true, true),
('document', 'Documento processado', 'documento', 'documentos', 2, true, true),
('knowledge_page', 'Página de conhecimento indexada', 'página', 'páginas', 1, true, true),
('media_interpretation', 'Arquivo de mídia analisado', 'arquivo', 'arquivos', 3, true, true)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  unit_singular = EXCLUDED.unit_singular,
  unit_plural = EXCLUDED.unit_plural,
  vendor_credits_per_unit = EXCLUDED.vendor_credits_per_unit,
  customer_visible = EXCLUDED.customer_visible,
  only_charge_on_success = EXCLUDED.only_charge_on_success,
  updated_at = now();

-- Growth Quota V1 + standalone product quotas. NULL would mean unlimited.
INSERT INTO product_usage_quotas
  (commercial_key, metric_key, monthly_quantity, overage_allowed)
VALUES
('vendor.growth','content',300,true),
('vendor.growth','image',100,true),
('vendor.growth','video',10,true),
('vendor.growth','render',30,true),
('vendor.growth','prospect',1500,true),
('vendor.growth','agent_interaction',10000,true),
('vendor.growth','proposal',500,true),
('vendor.growth','intelligence_analysis',1000,true),
('vendor.growth','autopilot_article',30,true),
('vendor.growth','site',3,true),
('vendor.growth','landing_page',10,true),
('vendor.growth','ads_campaign',30,true),
('vendor.growth','audio_minute',600,true),
('vendor.growth','document',500,true),
('vendor.growth','knowledge_page',2000,true),
('vendor.growth','media_interpretation',200,true),
('vendor.crm.free','ai_assist',30,true),
('vendor.prospector','prospect',500,true),
('vendor.ai_team','agent_interaction',2500,true),
('vendor.content_studio','content',100,true),
('vendor.creative_studio','image',20,true),
('vendor.creative_studio','video',2,true),
('vendor.sites_autopilot','site',2,true),
('vendor.sites_autopilot','autopilot_article',12,true),
('vendor.ads','ads_campaign',10,true),
('vendor.proposals_catalog','proposal',100,true),
('vendor.knowledge','knowledge_page',500,true),
('vendor.revenue_scout','intelligence_analysis',250,true)
ON CONFLICT (commercial_key, metric_key) DO UPDATE SET
  monthly_quantity = EXCLUDED.monthly_quantity,
  overage_allowed = EXCLUDED.overage_allowed,
  updated_at = now();

-- No blocking, automatic debits or current-tenant permission rewrites here.
-- Runtime cut-over happens only after ledger coverage is validated per feature.
