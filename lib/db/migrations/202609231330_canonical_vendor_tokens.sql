-- Canonical Vendor.ai customer token standard.
-- Stable commercial unit: R$ 1,00 = 1.000 Tokens.
-- Historical customer balances used 50 credits/BRL, therefore x20 preserves
-- their approximate commercial value during the one-time migration.

ALTER TABLE tenants
  ALTER COLUMN token_credits TYPE bigint
  USING token_credits::bigint;

ALTER TABLE token_purchases
  ALTER COLUMN credits TYPE bigint
  USING credits::bigint;

UPDATE tenants
SET token_credits = token_credits * 20
WHERE token_credits <> 0;

UPDATE token_purchases
SET credits = credits * 20
WHERE credits <> 0;

ALTER TABLE tenants
  DROP CONSTRAINT IF EXISTS tenants_token_credits_nonnegative;
ALTER TABLE tenants
  ADD CONSTRAINT tenants_token_credits_nonnegative
  CHECK (token_credits >= 0);

-- Canonical sellable token package.
WITH vendor_catalog_tenant AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN (
      'vendor-growth-monthly',
      'vendor-crm-monthly',
      'vendor-prospector-monthly',
      'vendor-omnichannel-monthly'
    )
  ORDER BY CASE WHEN sku = 'vendor-growth-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
)
INSERT INTO produtos_catalogo
  (id, tenant_id, categoria_id, nome, sku, product_type, descricao,
   preco_base, unidade, ativo, destaque, recorrencia)
SELECT
  gen_random_uuid()::text,
  tenant_id,
  categoria_id,
  '165.000 Tokens Vendor.ai',
  'vendor-tokens-165k',
  'consumption_pack',
  'Pacote pré-pago de 165.000 Tokens Vendor.ai para upgrades e gerações premium.',
  165,
  'un',
  true,
  true,
  NULL
FROM vendor_catalog_tenant
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo WHERE sku = 'vendor-tokens-165k'
);

INSERT INTO commercial_product_profiles
  (commercial_key, catalog_product_id, offer_kind, included_in_growth,
   module_keys, benefits, display_order, metadata)
VALUES (
  'vendor.tokens.165k',
  (SELECT id FROM produtos_catalogo WHERE sku='vendor-tokens-165k' ORDER BY created_at DESC LIMIT 1),
  'consumption_pack',
  false,
  '[]',
  '["165.000 Tokens","Saldo pré-pago reutilizável","Uso em upgrades e gerações premium"]',
  4,
  '{"tokenStandard":"vendor-v1","tokensPerBrl":1000,"packPriceBrl":165,"packTokens":165000}'
)
ON CONFLICT (commercial_key) DO UPDATE SET
  catalog_product_id = EXCLUDED.catalog_product_id,
  offer_kind = EXCLUDED.offer_kind,
  included_in_growth = EXCLUDED.included_in_growth,
  benefits = EXCLUDED.benefits,
  display_order = EXCLUDED.display_order,
  metadata = EXCLUDED.metadata,
  updated_at = now();
