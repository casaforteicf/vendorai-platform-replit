-- Human-readable consumption packs. Prices intentionally start pending/inactive.
-- This migration prepares the commercial objects and resource-specific wallet
-- without activating purchase checkout or usage enforcement.

ALTER TABLE vendor_credit_transactions
  ADD COLUMN IF NOT EXISTS metric_key text REFERENCES usage_metrics(key) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quantity_delta numeric(14,3),
  ADD COLUMN IF NOT EXISTS expires_at timestamp;

CREATE INDEX IF NOT EXISTS vendor_credit_transactions_tenant_metric_idx
  ON vendor_credit_transactions(tenant_id, metric_key);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_credit_transactions_reference_uq
  ON vendor_credit_transactions(commercial_key, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS consumption_pack_definitions (
  commercial_key text PRIMARY KEY
    REFERENCES commercial_product_profiles(commercial_key)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  metric_key text NOT NULL REFERENCES usage_metrics(key) ON DELETE RESTRICT,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  vendor_credits integer NOT NULL CHECK (vendor_credits >= 0),
  expires_after_days integer CHECK (expires_after_days IS NULL OR expires_after_days > 0),
  active boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consumption_pack_definitions_metric_idx
  ON consumption_pack_definitions(metric_key);

-- Resolve institutional VendorAI catalog tenant from canonical products.
WITH vendor_catalog_tenant AS (
  SELECT tenant_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND sku IN ('vendor-crm-monthly','vendor-growth-monthly','vendor-prospector-monthly')
  ORDER BY CASE WHEN sku = 'vendor-crm-monthly' THEN 0 ELSE 1 END, created_at DESC
  LIMIT 1
), packs(nome, sku, descricao) AS (
  VALUES
    ('+50 conteúdos', 'vendor-pack-content-50', 'Pacote extra de 50 conteúdos gerados por IA.'),
    ('+20 imagens', 'vendor-pack-images-20', 'Pacote extra de 20 imagens geradas por IA.'),
    ('+5 vídeos', 'vendor-pack-video-5', 'Pacote extra de 5 vídeos gerados por IA.'),
    ('+500 prospects', 'vendor-pack-prospects-500', 'Pacote extra de 500 prospects enriquecidos.'),
    ('+1.000 interações IA', 'vendor-pack-agent-interactions-1000', 'Pacote extra de 1.000 interações automatizadas dos agentes.'),
    ('+10 renders', 'vendor-pack-renders-10', 'Pacote extra de 10 renders do arqdor.ai.'),
    ('+1 site', 'vendor-pack-site-1', 'Pacote extra para gerar 1 site completo.'),
    ('+10 artigos Autopilot', 'vendor-pack-autopilot-10', 'Pacote extra de 10 artigos do Content Autopilot.')
)
INSERT INTO produtos_catalogo
  (tenant_id, nome, sku, product_type, descricao, preco_base, unidade, ativo, destaque)
SELECT v.tenant_id, p.nome, p.sku, 'saas_addon', p.descricao, 0, 'pacote', false, false
FROM vendor_catalog_tenant v
CROSS JOIN packs p
WHERE NOT EXISTS (SELECT 1 FROM produtos_catalogo c WHERE c.sku = p.sku);

-- Commercial profiles are inactive until price/margin is approved.
INSERT INTO commercial_product_profiles
  (commercial_key, catalog_product_id, offer_kind, included_in_growth, max_users, module_keys, benefits, display_order, active, metadata)
VALUES
  ('vendor.pack.content.50',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-content-50' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+50 conteúdos"]', 410, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.image.20',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-images-20' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+20 imagens"]', 420, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.video.5',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-video-5' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+5 vídeos"]', 430, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.prospect.500',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-prospects-500' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+500 prospects"]', 440, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.agent_interaction.1000',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-agent-interactions-1000' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+1.000 interações IA"]', 450, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.render.10',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-renders-10' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+10 renders"]', 460, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.site.1',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-site-1' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+1 site"]', 470, false, '{"priceStatus":"pending"}'),
  ('vendor.pack.autopilot_article.10',
   (SELECT id FROM produtos_catalogo WHERE sku='vendor-pack-autopilot-10' ORDER BY created_at DESC LIMIT 1),
   'consumption_pack', false, NULL, '[]', '["+10 artigos Autopilot"]', 480, false, '{"priceStatus":"pending"}')
ON CONFLICT (commercial_key) DO UPDATE SET
  catalog_product_id = EXCLUDED.catalog_product_id,
  offer_kind = EXCLUDED.offer_kind,
  benefits = EXCLUDED.benefits,
  display_order = EXCLUDED.display_order,
  updated_at = now();

INSERT INTO consumption_pack_definitions
  (commercial_key, metric_key, quantity, vendor_credits, expires_after_days, active, metadata)
SELECT x.commercial_key,
       x.metric_key,
       x.quantity,
       CEIL(x.quantity * m.vendor_credits_per_unit)::integer,
       NULL,
       false,
       jsonb_build_object('priceStatus','pending','customerFacing',true)
FROM (
  VALUES
    ('vendor.pack.content.50','content',50::numeric),
    ('vendor.pack.image.20','image',20::numeric),
    ('vendor.pack.video.5','video',5::numeric),
    ('vendor.pack.prospect.500','prospect',500::numeric),
    ('vendor.pack.agent_interaction.1000','agent_interaction',1000::numeric),
    ('vendor.pack.render.10','render',10::numeric),
    ('vendor.pack.site.1','site',1::numeric),
    ('vendor.pack.autopilot_article.10','autopilot_article',10::numeric)
) AS x(commercial_key, metric_key, quantity)
JOIN usage_metrics m ON m.key = x.metric_key
ON CONFLICT (commercial_key) DO UPDATE SET
  metric_key = EXCLUDED.metric_key,
  quantity = EXCLUDED.quantity,
  vendor_credits = EXCLUDED.vendor_credits,
  updated_at = now();

-- A pack cannot be turned on accidentally with price zero/pending. One product
-- activation becomes the operational source: it synchronizes pack definition
-- and catalog visibility after validation.
CREATE OR REPLACE FUNCTION validate_and_sync_consumption_pack_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_price numeric;
  v_has_definition boolean;
BEGIN
  IF NEW.offer_kind <> 'consumption_pack' THEN
    RETURN NEW;
  END IF;

  IF NEW.active = true THEN
    SELECT COALESCE(NULLIF(preco_promocional, 0), NULLIF(preco_mensalidade, 0), NULLIF(preco_base, 0), 0)
      INTO v_price
    FROM produtos_catalogo
    WHERE id = NEW.catalog_product_id;

    SELECT EXISTS(
      SELECT 1
      FROM consumption_pack_definitions d
      WHERE d.commercial_key = NEW.commercial_key
        AND d.quantity > 0
    ) INTO v_has_definition;

    IF COALESCE(v_price, 0) <= 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CONSUMPTION_PACK_PRICE_REQUIRED',
        HINT = 'Defina um preço positivo no catálogo antes de ativar o pacote.';
    END IF;
    IF NOT v_has_definition THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'CONSUMPTION_PACK_DEFINITION_REQUIRED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_consumption_pack_activation ON commercial_product_profiles;
CREATE TRIGGER trg_validate_consumption_pack_activation
BEFORE UPDATE OF active ON commercial_product_profiles
FOR EACH ROW
EXECUTE FUNCTION validate_and_sync_consumption_pack_activation();

CREATE OR REPLACE FUNCTION sync_consumption_pack_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.offer_kind = 'consumption_pack' THEN
    UPDATE consumption_pack_definitions
       SET active = NEW.active,
           updated_at = now()
     WHERE commercial_key = NEW.commercial_key;

    IF NEW.catalog_product_id IS NOT NULL THEN
      UPDATE produtos_catalogo
         SET ativo = NEW.active,
             updated_at = now()
       WHERE id = NEW.catalog_product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_consumption_pack_activation ON commercial_product_profiles;
CREATE TRIGGER trg_sync_consumption_pack_activation
AFTER UPDATE OF active ON commercial_product_profiles
FOR EACH ROW
EXECUTE FUNCTION sync_consumption_pack_activation();

-- Packs deliberately remain unavailable to customers until their price and
-- margin are approved. After pricing, activating the commercial product also
-- activates the resource definition and catalog row; no schema change is needed.
