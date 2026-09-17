-- Link the existing customer-facing/internal catalogs to the canonical
-- commercial master instead of duplicating prices, entitlements and quotas.

ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS commercial_offer_code text;

ALTER TABLE produtos_internos
  ADD COLUMN IF NOT EXISTS commercial_offer_code text;

DO $$ BEGIN
  ALTER TABLE produtos_catalogo
    ADD CONSTRAINT produtos_catalogo_commercial_offer_fk
    FOREIGN KEY (commercial_offer_code) REFERENCES vendor_commercial_offers(code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE produtos_internos
    ADD CONSTRAINT produtos_internos_commercial_offer_fk
    FOREIGN KEY (commercial_offer_code) REFERENCES vendor_commercial_offers(code) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS produtos_catalogo_commercial_offer_idx
  ON produtos_catalogo(commercial_offer_code) WHERE commercial_offer_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS produtos_internos_commercial_offer_idx
  ON produtos_internos(commercial_offer_code) WHERE commercial_offer_code IS NOT NULL;

-- Map current SaaS catalog rows by stable SKU first, then by canonical name.
UPDATE produtos_catalogo SET commercial_offer_code='crm_pro', product_type='saas_plan', preco_mensalidade=49.90, preco_base=49.90, updated_at=now()
WHERE lower(coalesce(sku,'')) IN ('vendor-crm','vendor-crm-monthly') OR lower(nome)='vendor crm';

UPDATE produtos_catalogo SET commercial_offer_code='prospector', product_type='saas_addon', preco_mensalidade=399.00, preco_base=399.00, updated_at=now()
WHERE lower(nome)='vendor prospector';
UPDATE produtos_catalogo SET commercial_offer_code='omnichannel', product_type='saas_addon', preco_mensalidade=199.00, preco_base=199.00, updated_at=now()
WHERE lower(nome)='vendor omnichannel';
UPDATE produtos_catalogo SET commercial_offer_code='agenda', product_type='saas_addon', preco_mensalidade=19.90, preco_base=19.90, updated_at=now()
WHERE lower(nome)='vendor agenda';
UPDATE produtos_catalogo SET commercial_offer_code='ai_team', product_type='saas_addon', preco_mensalidade=499.00, preco_base=499.00, updated_at=now()
WHERE lower(nome) IN ('vendor ai team — 10 agentes','vendor ai team - 10 agentes');
UPDATE produtos_catalogo SET commercial_offer_code='revenue_scout', product_type='saas_addon', preco_mensalidade=499.00, preco_base=499.00, updated_at=now()
WHERE lower(nome)='vendor revenue scout';
UPDATE produtos_catalogo SET commercial_offer_code='content_planner', product_type='saas_addon', preco_mensalidade=199.00, preco_base=199.00, updated_at=now()
WHERE lower(nome)='vendor content planner';
UPDATE produtos_catalogo SET commercial_offer_code='content_studio', product_type='saas_addon', preco_mensalidade=399.00, preco_base=399.00, updated_at=now()
WHERE lower(nome)='vendor content studio';
UPDATE produtos_catalogo SET commercial_offer_code='creative_studio', product_type='saas_addon', preco_mensalidade=139.00, preco_base=139.00, updated_at=now()
WHERE lower(nome)='vendor creative studio';
UPDATE produtos_catalogo SET commercial_offer_code='sites_autopilot', product_type='saas_addon', preco_mensalidade=499.00, preco_base=499.00, updated_at=now()
WHERE lower(nome)='vendor sites & autopilot';
UPDATE produtos_catalogo SET commercial_offer_code='ads', product_type='saas_addon', preco_mensalidade=199.00, preco_base=199.00, updated_at=now()
WHERE lower(nome)='vendor ads';
UPDATE produtos_catalogo SET commercial_offer_code='jarvis', product_type='saas_addon', preco_mensalidade=149.00, preco_base=149.00, updated_at=now()
WHERE lower(nome)='vendor jarvis';
UPDATE produtos_catalogo SET commercial_offer_code='propostas_catalogo', product_type='saas_addon', preco_mensalidade=99.00, preco_base=99.00, nome='Vendor Propostas & Catálogo', updated_at=now()
WHERE lower(nome) IN ('vendor propostas & catálogo','vendor propostas & orçamentos');
UPDATE produtos_catalogo SET commercial_offer_code='gestao', product_type='saas_addon', preco_mensalidade=299.00, preco_base=299.00, nome='Vendor Gestão', updated_at=now()
WHERE lower(nome) IN ('vendor gestão','vendor financeiro + erp hub');
UPDATE produtos_catalogo SET commercial_offer_code='praca_ai', product_type='saas_addon', preco_mensalidade=299.00, preco_base=299.00, nome='Praça.ai', updated_at=now()
WHERE lower(nome) IN ('praça.ai','vendor marketplace / praça.ai');
UPDATE produtos_catalogo SET commercial_offer_code='app_builder', product_type='saas_addon', preco_mensalidade=299.00, preco_base=299.00, updated_at=now()
WHERE lower(nome)='vendor app builder';
UPDATE produtos_catalogo SET commercial_offer_code='automations', product_type='saas_addon', preco_mensalidade=149.00, preco_base=149.00, updated_at=now()
WHERE lower(nome)='vendor automations';
UPDATE produtos_catalogo SET commercial_offer_code='bi_analytics', product_type='saas_addon', preco_mensalidade=149.00, preco_base=149.00, updated_at=now()
WHERE lower(nome)='vendor bi & analytics';
UPDATE produtos_catalogo SET commercial_offer_code='knowledge_ai', product_type='saas_addon', preco_mensalidade=99.00, preco_base=99.00, updated_at=now()
WHERE lower(nome)='vendor knowledge ai';
UPDATE produtos_catalogo SET commercial_offer_code='reputation', product_type='saas_addon', preco_mensalidade=79.00, preco_base=79.00, updated_at=now()
WHERE lower(nome)='vendor reputation';
UPDATE produtos_catalogo SET commercial_offer_code='arqdor_ai', product_type='saas_addon', updated_at=now()
WHERE lower(nome)='arqdor.ai';
UPDATE produtos_catalogo SET commercial_offer_code='implementation', product_type='service', preco_implantacao=1890.00, preco_base=1890.00, recorrencia=NULL, updated_at=now()
WHERE lower(nome) IN ('implantação vendorai','implantação e suporte');
UPDATE produtos_catalogo SET commercial_offer_code='custom_app', product_type='service', preco_base=4990.00, recorrencia=NULL, updated_at=now()
WHERE lower(nome)='app personalizado vendorai';

-- The old all-in-one PME bundle is historical; Growth is the canonical bundle.
UPDATE produtos_catalogo SET ativo=false, updated_at=now()
WHERE lower(nome)='vendorai pme completo';

-- Internal commercial catalog now points at exactly the same canonical offers.
UPDATE produtos_internos p
SET commercial_offer_code = CASE lower(p.nome)
  WHEN 'vendorai growth' THEN 'growth'
  WHEN 'vendor crm' THEN 'crm_pro'
  WHEN 'vendor prospector' THEN 'prospector'
  WHEN 'vendor omnichannel' THEN 'omnichannel'
  WHEN 'vendor agenda' THEN 'agenda'
  WHEN 'vendor ai team — 10 agentes' THEN 'ai_team'
  WHEN 'vendor revenue scout' THEN 'revenue_scout'
  WHEN 'vendor content planner' THEN 'content_planner'
  WHEN 'vendor content studio' THEN 'content_studio'
  WHEN 'vendor creative studio' THEN 'creative_studio'
  WHEN 'vendor sites & autopilot' THEN 'sites_autopilot'
  WHEN 'vendor ads' THEN 'ads'
  WHEN 'vendor jarvis' THEN 'jarvis'
  WHEN 'vendor propostas & catálogo' THEN 'propostas_catalogo'
  WHEN 'vendor gestão' THEN 'gestao'
  WHEN 'arqdor.ai' THEN 'arqdor_ai'
  WHEN 'praça.ai' THEN 'praca_ai'
  WHEN 'vendor app builder' THEN 'app_builder'
  WHEN 'vendor automations' THEN 'automations'
  WHEN 'vendor bi & analytics' THEN 'bi_analytics'
  WHEN 'vendor knowledge ai' THEN 'knowledge_ai'
  WHEN 'vendor reputation' THEN 'reputation'
  WHEN 'app personalizado vendorai' THEN 'custom_app'
  WHEN 'implantação vendorai' THEN 'implementation'
  ELSE p.commercial_offer_code
END,
updated_at=now()
WHERE p.categoria='Produtos Comerciais VendorAI';

-- One read model for Catalog, Super Admin, Checkout and public-site APIs.
CREATE OR REPLACE VIEW vendor_commercial_catalog AS
SELECT
  o.code,
  o.name,
  o.offer_type,
  o.description,
  o.monthly_price_cents,
  o.one_time_price_cents,
  o.billing_cycle,
  o.max_users,
  o.unlimited_users,
  o.includes_all_segment_modules,
  o.growth_included,
  o.public_visible,
  o.active,
  o.sort_order,
  o.metadata,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'metricKey', q.metric_key,
        'displayName', m.display_name,
        'unitName', m.unit_name,
        'includedQuantity', q.included_quantity,
        'period', q.period,
        'hardLimit', q.hard_limit,
        'vendorCreditsPerUnit', m.vendor_credits_per_unit
      ) ORDER BY m.display_name
    ) FILTER (WHERE q.id IS NOT NULL),
    '[]'::jsonb
  ) AS quotas,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('moduleKey',mm.module_key,'mode',mm.entitlement_mode) ORDER BY mm.module_key)
     FROM vendor_offer_module_map mm WHERE mm.offer_code=o.code),
    '[]'::jsonb
  ) AS modules
FROM vendor_commercial_offers o
LEFT JOIN vendor_offer_quotas q ON q.offer_code=o.code
LEFT JOIN vendor_usage_metrics m ON m.metric_key=q.metric_key
GROUP BY o.code,o.name,o.offer_type,o.description,o.monthly_price_cents,o.one_time_price_cents,o.billing_cycle,o.max_users,o.unlimited_users,o.includes_all_segment_modules,o.growth_included,o.public_visible,o.active,o.sort_order,o.metadata;
