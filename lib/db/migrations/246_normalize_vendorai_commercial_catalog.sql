-- Normalize the VendorAI commercial catalog without touching customer product catalogs.
-- Canonical taxonomy:
--   saas_plan  = umbrella/base plans
--   saas_addon = recurring software products/modules
--   service    = one-off human/custom services
-- Legacy values such as software/physical/servico remain valid for historical
-- rows outside the canonical VendorAI SKU set and can be migrated separately.

-- Recurring VendorAI products/modules.
UPDATE produtos_catalogo
SET
  product_type = 'saas_addon',
  preco_mensalidade = COALESCE(preco_mensalidade, preco_base),
  recorrencia = COALESCE(recorrencia, 'mensal'),
  updated_at = now()
WHERE sku IN (
  'vendor-crm-monthly',
  'vendor-agenda-monthly',
  'vendor-omnichannel-monthly',
  'vendor-prospector-monthly',
  'vendor-ai-team-10-monthly',
  'vendor-revenue-scout-monthly',
  'vendor-propostas-orcamentos-monthly',
  'vendor-financeiro-erp-monthly',
  'vendor-jarvis-monthly',
  'vendor-knowledge-ai-monthly',
  'vendor-bi-analytics-monthly',
  'vendor-automations-monthly',
  'vendor-content-planner-monthly',
  'vendor-content-studio-monthly',
  'vendor-creative-studio-monthly',
  'vendor-ads-monthly',
  'vendor-sites-autopilot-monthly',
  'vendor-marketplace-praca-monthly',
  'vendor-app-builder-monthly',
  'vendor-reputation-monthly'
);

-- Canonical public/commercial names. SKU remains stable so checkout, links and
-- historical references do not break.
UPDATE produtos_catalogo
SET nome = 'Vendor Gestão', updated_at = now()
WHERE sku = 'vendor-financeiro-erp-monthly';

UPDATE produtos_catalogo
SET nome = 'Vendor Propostas & Catálogo', updated_at = now()
WHERE sku = 'vendor-propostas-orcamentos-monthly';

UPDATE produtos_catalogo
SET nome = 'Praça.ai', updated_at = now()
WHERE sku = 'vendor-marketplace-praca-monthly';

-- One-off human/custom services.
UPDATE produtos_catalogo
SET
  product_type = 'service',
  preco_mensalidade = NULL,
  recorrencia = NULL,
  updated_at = now()
WHERE sku IN (
  'vendor-implementation-cash',
  'vendor-custom-app-cash'
);

-- Growth and CRM Free are plans. If migration 240 created them, keep the
-- taxonomy explicit and idempotent.
UPDATE produtos_catalogo
SET product_type = 'saas_plan', recorrencia = 'mensal', updated_at = now()
WHERE sku IN ('vendor-crm-free', 'vendor-growth-monthly');

UPDATE produtos_catalogo
SET product_type = 'saas_addon', recorrencia = NULL, updated_at = now()
WHERE sku = 'vendor-growth-5d';
