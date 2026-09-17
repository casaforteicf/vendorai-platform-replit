-- VendorAI commercial master + universal usage ledger — 2026-09-17
--
-- Goals:
-- 1. Separate sellable products from technical modules/screens.
-- 2. Make CRM Free (1 user), CRM Pro and Growth explicit commercial offers.
-- 3. Make Growth unlimited by user count, but governed by monthly usage franchises.
-- 4. Tokenize costly operations with Vendor Credits without exposing provider tokens.
-- 5. Keep real provider cost (USD/BRL) for margin analysis.
-- 6. Measure first; blocking/charging can be enabled later per metric/offer.

CREATE TABLE IF NOT EXISTS vendor_commercial_offers (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  offer_type text NOT NULL CHECK (offer_type IN ('plan','module','pass','service','consumption_pack')),
  description text,
  monthly_price_cents integer,
  one_time_price_cents integer,
  billing_cycle text CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly','annual','one_time','prepaid')),
  max_users integer,
  unlimited_users boolean NOT NULL DEFAULT false,
  includes_all_segment_modules boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  public_visible boolean NOT NULL DEFAULT true,
  growth_included boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_offer_module_map (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  offer_code text NOT NULL REFERENCES vendor_commercial_offers(code) ON DELETE CASCADE,
  module_key text NOT NULL,
  entitlement_mode text NOT NULL DEFAULT 'included' CHECK (entitlement_mode IN ('included','optional','trial','dependency')),
  segment_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (offer_code, module_key)
);

CREATE TABLE IF NOT EXISTS vendor_usage_metrics (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  metric_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  unit_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('generation','automation','data','processing','software')),
  vendor_credits_per_unit numeric(14,4) NOT NULL DEFAULT 0,
  customer_metered boolean NOT NULL DEFAULT true,
  charge_only_on_success boolean NOT NULL DEFAULT true,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendor_offer_quotas (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  offer_code text NOT NULL REFERENCES vendor_commercial_offers(code) ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES vendor_usage_metrics(metric_key) ON DELETE CASCADE,
  included_quantity numeric(14,4),
  period text NOT NULL DEFAULT 'month' CHECK (period IN ('day','month','pass','lifetime')),
  hard_limit boolean NOT NULL DEFAULT false,
  warning_threshold_percent integer NOT NULL DEFAULT 80 CHECK (warning_threshold_percent BETWEEN 1 AND 100),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (offer_code, metric_key, period)
);

CREATE TABLE IF NOT EXISTS vendor_usage_ledger (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text,
  offer_code text REFERENCES vendor_commercial_offers(code) ON DELETE SET NULL,
  product_code text,
  metric_key text NOT NULL REFERENCES vendor_usage_metrics(metric_key),
  feature_key text,
  source_system text,
  source_record_id text,
  request_id text,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  vendor_credits numeric(16,4) NOT NULL DEFAULT 0,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  provider_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  external_api_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  infrastructure_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  total_cost_usd numeric(14,6) NOT NULL DEFAULT 0,
  fx_usd_brl numeric(10,6),
  total_cost_brl numeric(14,6),
  success boolean NOT NULL DEFAULT true,
  customer_billable boolean NOT NULL DEFAULT true,
  charged_to_quota boolean NOT NULL DEFAULT true,
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_usage_ledger_tenant_occurred_idx
  ON vendor_usage_ledger (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vendor_usage_ledger_tenant_metric_idx
  ON vendor_usage_ledger (tenant_id, metric_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS vendor_usage_ledger_request_idx
  ON vendor_usage_ledger (request_id) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_usage_ledger_source_unique_idx
  ON vendor_usage_ledger (source_system, source_record_id, metric_key)
  WHERE source_system IS NOT NULL AND source_record_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS vendor_tenant_entitlements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  offer_code text NOT NULL REFERENCES vendor_commercial_offers(code) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'subscription' CHECK (source IN ('free','subscription','pass','purchase','courtesy','admin_override')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','scheduled','paused','expired','cancelled')),
  starts_at timestamp NOT NULL DEFAULT now(),
  ends_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_tenant_entitlements_active_idx
  ON vendor_tenant_entitlements (tenant_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS vendor_consumption_packs (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  metric_key text NOT NULL REFERENCES vendor_usage_metrics(metric_key),
  quantity numeric(14,4) NOT NULL,
  bonus_vendor_credits numeric(16,4) NOT NULL DEFAULT 0,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Canonical offers. Commercial values mirror the current VendorAI catalog.
-- CRM Free is intentionally complete for one user; CRM Pro monetizes team use.
-- Growth has unlimited users and all standard software modules applicable to
-- the tenant segment. Usage-heavy capabilities are governed by franchises.
-- ---------------------------------------------------------------------------
INSERT INTO vendor_commercial_offers
(code,name,offer_type,description,monthly_price_cents,one_time_price_cents,billing_cycle,max_users,unlimited_users,includes_all_segment_modules,active,public_visible,growth_included,sort_order,metadata)
VALUES
('crm_free','Vendor CRM Free','plan','CRM completo para 1 usuário. Recursos nativos de CRM não são artificialmente reduzidos; produtos especializados permanecem contratáveis separadamente.',0,NULL,'monthly',1,false,false,true,true,true,10,'{"cta":"Começar grátis"}'),
('crm_pro','Vendor CRM Pro','plan','CRM completo para equipe, mantendo a mesma base funcional do Free e ampliando usuários e franquia de assistência IA.',4990,NULL,'monthly',5,false,false,true,true,true,20,'{}'),
('growth','VendorAI Growth','plan','Ecossistema VendorAI completo para os módulos padrão aplicáveis ao segmento, usuários ilimitados e franquias mensais de consumo.',149000,NULL,'monthly',NULL,true,true,true,true,false,30,'{"free_days_per_month":5,"pass_days":5,"pass_price_cents":39900}'),
('growth_5d','Growth +5 dias','pass','Bloco pré-pago de 5 dias de acesso Growth.',NULL,39900,'prepaid',NULL,true,true,true,true,false,31,'{"days":5}'),
('agenda','Vendor Agenda','module','Agenda, disponibilidade, agendamentos, reagendamentos e lembretes.',1990,NULL,'monthly',NULL,false,false,true,true,true,104,'{}'),
('creative_studio','Vendor Creative Studio','module','Geração de imagens, vídeos, voz, dublagem, mockups e mídia criativa.',13900,NULL,'monthly',NULL,false,false,true,true,true,109,'{}'),
('jarvis','Vendor JARVIS','module','Inteligência executiva, alertas, prioridades, oportunidades, riscos e automações.',14900,NULL,'monthly',NULL,false,false,true,true,true,112,'{}'),
('automations','Vendor Automations','module','Automações e workflows operacionais.',14900,NULL,'monthly',NULL,false,false,true,true,true,120,'{}'),
('bi_analytics','Vendor BI & Analytics','module','Indicadores, relatórios e análises gerenciais.',14900,NULL,'monthly',NULL,false,false,true,true,true,121,'{}'),
('omnichannel','Vendor Omnichannel','module','Atendimento e conversas integradas com canais conectados ao CRM.',19900,NULL,'monthly',NULL,false,false,true,true,true,103,'{}'),
('content_planner','Vendor Content Planner','module','Planejamento, calendário, pautas, canais e estratégia de conteúdo.',19900,NULL,'monthly',NULL,false,false,true,true,true,107,'{}'),
('ads','Vendor Ads','module','Planejamento e geração de campanhas, públicos, textos e criativos.',19900,NULL,'monthly',NULL,false,false,true,true,true,111,'{}'),
('gestao','Vendor Gestão','module','ERP, financeiro, estoque, compras, fornecedores e controles operacionais.',29900,NULL,'monthly',NULL,false,false,true,true,true,114,'{}'),
('app_builder','Vendor App Builder','module','Construção e gestão de aplicativos conectados ao ecossistema VendorAI.',29900,NULL,'monthly',NULL,false,false,true,true,true,119,'{}'),
('praca_ai','Praça.ai','module','Marketplace, pedidos, pagamentos, reputação, logística, entregas e painel executivo.',29900,NULL,'monthly',NULL,false,false,true,true,true,116,'{}'),
('content_studio','Vendor Content Studio','module','Geração de textos, copies, roteiros, carrosséis e conteúdo de campanha.',39900,NULL,'monthly',NULL,false,false,true,true,true,108,'{}'),
('prospector','Vendor Prospector','module','Prospecção, descoberta, enriquecimento e qualificação de empresas e leads.',39900,NULL,'monthly',NULL,false,false,true,true,true,102,'{}'),
('ai_team','Vendor AI Team — 10 agentes','module','Agentes especializados para vendas, atendimento, follow-up, financeiro, cobrança, agenda e pós-venda.',49900,NULL,'monthly',NULL,false,false,true,true,true,105,'{}'),
('revenue_scout','Vendor Revenue Scout','module','Inteligência de receita, oportunidades, recompra, risco, reativação e próxima melhor ação.',49900,NULL,'monthly',NULL,false,false,true,true,true,106,'{}'),
('sites_autopilot','Vendor Sites & Autopilot','module','Sites, landing pages, SEO, analytics e Content Autopilot.',49900,NULL,'monthly',NULL,false,false,true,true,true,110,'{}'),
('propostas_catalogo','Vendor Propostas & Catálogo','module','Catálogo, propostas, orçamentos, contratos, aprovação e comissões.',9900,NULL,'monthly',NULL,false,false,true,true,true,113,'{}'),
('knowledge_ai','Vendor Knowledge AI','module','Base de conhecimento e inteligência contextual da empresa.',9900,NULL,'monthly',NULL,false,false,true,true,true,122,'{}'),
('reputation','Vendor Reputation','module','Avaliações, reputação e relacionamento pós-entrega.',7900,NULL,'monthly',NULL,false,false,true,true,true,123,'{}'),
('arqdor_ai','arqdor.ai','module','Arquitetura e interiores: projetos, render, orçamento técnico, especificação, biblioteca e portal do cliente.',NULL,NULL,'monthly',NULL,false,false,true,true,true,115,'{}'),
('implementation','Implantação VendorAI','service','Implantação assistida opcional com configuração, parametrização, integrações, usuários e treinamento.',NULL,189000,'one_time',NULL,false,false,true,true,false,200,'{}'),
('custom_app','App Personalizado VendorAI','service','Aplicativo personalizado com marca, nome, identidade, ícone, splash e configuração do tenant.',NULL,499000,'one_time',NULL,false,false,true,true,false,201,'{}')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,
  offer_type=EXCLUDED.offer_type,
  description=EXCLUDED.description,
  monthly_price_cents=EXCLUDED.monthly_price_cents,
  one_time_price_cents=EXCLUDED.one_time_price_cents,
  billing_cycle=EXCLUDED.billing_cycle,
  max_users=EXCLUDED.max_users,
  unlimited_users=EXCLUDED.unlimited_users,
  includes_all_segment_modules=EXCLUDED.includes_all_segment_modules,
  active=EXCLUDED.active,
  public_visible=EXCLUDED.public_visible,
  growth_included=EXCLUDED.growth_included,
  sort_order=EXCLUDED.sort_order,
  metadata=EXCLUDED.metadata,
  updated_at=now();

-- Metrics: Vendor Credits are internal commercial weights, not provider tokens.
INSERT INTO vendor_usage_metrics
(metric_key,display_name,unit_name,category,vendor_credits_per_unit,customer_metered,charge_only_on_success,description)
VALUES
('crm_ai_assist','Assistência IA do CRM','assistência','automation',1,true,true,'Resumo, sugestão de próxima ação, redação assistida e pequenas assistências dentro do CRM.'),
('content_generation','Conteúdo IA','conteúdo','generation',5,true,true,'Peça textual final gerada.'),
('image_generation','Imagem IA','imagem','generation',10,true,true,'Imagem final entregue; crop/redimensionamento simples não consome.'),
('video_generation','Vídeo IA','vídeo','generation',200,true,true,'Vídeo final concluído. Peso ajustável por motor/modelo.'),
('arch_render','Render arqdor.ai','render','generation',25,true,true,'Novo render final. Visualizar, baixar ou editar metadados não consome.'),
('prospect_enrichment','Prospect enriquecido','prospect','data',2,true,true,'Empresa/lead válido e enriquecido; duplicata/falha não consome.'),
('ai_agent_interaction','Interação de agente IA','interação','automation',1,true,true,'Interação automatizada efetivamente realizada por agente.'),
('proposal_generation','Proposta/orçamento IA','documento','generation',5,true,true,'Nova proposta ou orçamento gerado.'),
('intelligence_analysis','Análise inteligente','análise','processing',2,true,true,'Análise JARVIS, Revenue Scout ou inteligência equivalente.'),
('autopilot_article','Artigo Content Autopilot','artigo','generation',20,true,true,'Artigo final concluído.'),
('site_generation','Site completo','site','generation',100,true,true,'Nova geração completa de site. Edição de conteúdo existente não consome como novo site.'),
('landing_page_generation','Landing page','landing page','generation',40,true,true,'Nova landing page gerada.'),
('ads_campaign_generation','Campanha/kit Ads IA','campanha','generation',20,true,true,'Campanha ou kit criativo/estratégico gerado.'),
('audio_transcription_minute','Transcrição de áudio','minuto','processing',1,true,true,'Minuto efetivamente processado.'),
('document_processing','Documento processado','documento','processing',2,true,true,'Documento/foto processado com extração útil.'),
('knowledge_page','Knowledge AI','página equivalente','processing',1,true,true,'Página/documento equivalente indexado.'),
('media_interpretation','Interpretação de mídia','arquivo','processing',3,true,true,'Arquivo de mídia analisado.'),
('software_operation','Operação normal do software','operação','software',0,false,false,'CRM, pipeline, tarefas, agenda, estoque, obras e demais operações sem custo marginal relevante.')
ON CONFLICT (metric_key) DO UPDATE SET
  display_name=EXCLUDED.display_name,
  unit_name=EXCLUDED.unit_name,
  category=EXCLUDED.category,
  vendor_credits_per_unit=EXCLUDED.vendor_credits_per_unit,
  customer_metered=EXCLUDED.customer_metered,
  charge_only_on_success=EXCLUDED.charge_only_on_success,
  description=EXCLUDED.description,
  updated_at=now();

-- Growth Quota V1. These are deliberately soft limits at first (hard_limit=false)
-- so production can measure real usage/cost before enforcement is turned on.
INSERT INTO vendor_offer_quotas (offer_code,metric_key,included_quantity,period,hard_limit,warning_threshold_percent)
VALUES
('growth','content_generation',300,'month',false,80),
('growth','image_generation',100,'month',false,80),
('growth','video_generation',10,'month',false,80),
('growth','arch_render',30,'month',false,80),
('growth','prospect_enrichment',1500,'month',false,80),
('growth','ai_agent_interaction',10000,'month',false,80),
('growth','proposal_generation',500,'month',false,80),
('growth','intelligence_analysis',1000,'month',false,80),
('growth','autopilot_article',30,'month',false,80),
('growth','site_generation',3,'month',false,80),
('growth','landing_page_generation',10,'month',false,80),
('growth','ads_campaign_generation',30,'month',false,80),
('growth','audio_transcription_minute',600,'month',false,80),
('growth','document_processing',500,'month',false,80),
('growth','knowledge_page',2000,'month',false,80),
('growth','media_interpretation',200,'month',false,80),
('crm_free','crm_ai_assist',30,'month',false,80),
('crm_pro','crm_ai_assist',100,'month',false,80),
('content_studio','content_generation',100,'month',false,80),
('creative_studio','image_generation',20,'month',false,80),
('creative_studio','video_generation',2,'month',false,80),
('prospector','prospect_enrichment',500,'month',false,80),
('ai_team','ai_agent_interaction',2500,'month',false,80),
('sites_autopilot','site_generation',2,'month',false,80),
('sites_autopilot','autopilot_article',12,'month',false,80),
('ads','ads_campaign_generation',10,'month',false,80),
('propostas_catalogo','proposal_generation',100,'month',false,80),
('knowledge_ai','knowledge_page',500,'month',false,80),
('revenue_scout','intelligence_analysis',250,'month',false,80)
ON CONFLICT (offer_code, metric_key, period) DO UPDATE SET
  included_quantity=EXCLUDED.included_quantity,
  hard_limit=EXCLUDED.hard_limit,
  warning_threshold_percent=EXCLUDED.warning_threshold_percent,
  updated_at=now();

-- Technical module mapping. Segment-specific modules remain contextual and can
-- be appended by segment templates instead of being sold as duplicate products.
INSERT INTO vendor_offer_module_map (offer_code,module_key,entitlement_mode)
VALUES
('crm_free','dashboard','included'),('crm_free','leads','included'),('crm_free','deals','included'),('crm_free','conversations','included'),('crm_free','scheduler','included'),
('crm_pro','dashboard','included'),('crm_pro','leads','included'),('crm_pro','deals','included'),('crm_pro','conversations','included'),('crm_pro','scheduler','included'),
('prospector','prospector','included'),('omnichannel','conversations','included'),('agenda','scheduler','included'),('ai_team','agents','included'),
('revenue_scout','revenue','included'),('revenue_scout','churn','included'),('content_planner','campaigns','included'),('content_studio','content','included'),
('sites_autopilot','content_autopilot','included'),('ads','campaigns','included'),('jarvis','vendor_brain','included'),('jarvis','intelligence','included'),
('propostas_catalogo','proposals','included'),('gestao','financeiro','included'),('gestao','inventory','included'),('arqdor_ai','arch','included'),('arqdor_ai','obras','included'),
('praca_ai','praca_ai','included'),('automations','setup','included'),('bi_analytics','analytics','included'),('bi_analytics','reports','included'),('knowledge_ai','knowledge_graph','included')
ON CONFLICT (offer_code,module_key) DO UPDATE SET entitlement_mode=EXCLUDED.entitlement_mode;

-- Convenience views for Super Admin and customer usage screens.
CREATE OR REPLACE VIEW vendor_usage_monthly AS
SELECT
  tenant_id,
  date_trunc('month', occurred_at) AS month,
  metric_key,
  sum(CASE WHEN success AND charged_to_quota THEN quantity ELSE 0 END) AS used_quantity,
  sum(CASE WHEN success AND customer_billable THEN vendor_credits ELSE 0 END) AS used_vendor_credits,
  sum(total_cost_usd) AS total_cost_usd,
  sum(COALESCE(total_cost_brl,0)) AS total_cost_brl
FROM vendor_usage_ledger
GROUP BY tenant_id, date_trunc('month', occurred_at), metric_key;

CREATE OR REPLACE VIEW vendor_growth_quota_snapshot AS
SELECT
  q.metric_key,
  m.display_name,
  m.unit_name,
  q.included_quantity,
  m.vendor_credits_per_unit,
  q.hard_limit,
  q.warning_threshold_percent
FROM vendor_offer_quotas q
JOIN vendor_usage_metrics m ON m.metric_key=q.metric_key
WHERE q.offer_code='growth' AND q.period='month';
