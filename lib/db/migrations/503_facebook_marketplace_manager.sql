-- Facebook Marketplace Manager
-- Mantém o catálogo oficial em produtos_catalogo e registra apenas o ciclo da listagem.

CREATE TABLE IF NOT EXISTS facebook_marketplace_listings (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES produtos_catalogo(id) ON DELETE CASCADE,
  campaign_id text REFERENCES campaigns(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'facebook_marketplace',
  publish_mode text NOT NULL DEFAULT 'assisted',
  status text NOT NULL DEFAULT 'draft',
  title text NOT NULL,
  description text NOT NULL,
  price numeric(12,2) NOT NULL,
  category text,
  condition text NOT NULL DEFAULT 'new',
  city text,
  state text,
  media_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_id text,
  external_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamp,
  last_renewed_at timestamp,
  next_renewal_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_marketplace_tenant
  ON facebook_marketplace_listings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fb_marketplace_product
  ON facebook_marketplace_listings(product_id);
CREATE INDEX IF NOT EXISTS idx_fb_marketplace_status
  ON facebook_marketplace_listings(status);
CREATE INDEX IF NOT EXISTS idx_fb_marketplace_campaign
  ON facebook_marketplace_listings(campaign_id);

ALTER TABLE facebook_marketplace_listings
  DROP CONSTRAINT IF EXISTS facebook_marketplace_listings_status_check;
ALTER TABLE facebook_marketplace_listings
  ADD CONSTRAINT facebook_marketplace_listings_status_check
  CHECK (status IN ('draft','ready','published','paused','sold','renewal_due','failed'));

ALTER TABLE facebook_marketplace_listings
  DROP CONSTRAINT IF EXISTS facebook_marketplace_listings_publish_mode_check;
ALTER TABLE facebook_marketplace_listings
  ADD CONSTRAINT facebook_marketplace_listings_publish_mode_check
  CHECK (publish_mode IN ('assisted','official_api'));


-- Defense in depth: a listagem é dado comercial do tenant e deve manter o
-- mesmo isolamento RLS usado pelo restante do VendorAI.
ALTER TABLE facebook_marketplace_listings ENABLE ROW LEVEL SECURITY;

DO $ BEGIN
  CREATE POLICY vendorai_tenant_access
    ON facebook_marketplace_listings
    AS PERMISSIVE
    FOR ALL
    TO vendorai_app
    USING (
      app_security.is_super_admin()
      OR tenant_id = app_security.current_tenant_id()
    )
    WITH CHECK (
      app_security.is_super_admin()
      OR tenant_id = app_security.current_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $;

DO $ BEGIN
  CREATE POLICY vendorai_tenant_guard
    ON facebook_marketplace_listings
    AS RESTRICTIVE
    FOR ALL
    TO vendorai_app
    USING (
      app_security.is_super_admin()
      OR tenant_id = app_security.current_tenant_id()
    )
    WITH CHECK (
      app_security.is_super_admin()
      OR tenant_id = app_security.current_tenant_id()
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $;
