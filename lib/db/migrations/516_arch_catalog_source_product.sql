ALTER TABLE arch_catalogo
  ADD COLUMN IF NOT EXISTS source_product_id text;

CREATE UNIQUE INDEX IF NOT EXISTS arch_catalogo_tenant_source_product_uidx
  ON arch_catalogo (tenant_id, source_product_id)
  WHERE source_product_id IS NOT NULL;
