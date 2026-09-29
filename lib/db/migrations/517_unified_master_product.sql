ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS project_library_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS texture_url text,
  ADD COLUMN IF NOT EXISTS model3d_url text,
  ADD COLUMN IF NOT EXISTS project_technical_config jsonb;

ALTER TABLE arch_catalog_product_materials
  ADD COLUMN IF NOT EXISTS master_product_id text;

UPDATE arch_catalog_product_materials link
SET master_product_id = ac.source_product_id
FROM arch_catalogo ac
WHERE link.product_id = ac.id
  AND ac.source_product_id IS NOT NULL
  AND link.master_product_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'arch_catalog_product_materials_master_product_fk'
  ) THEN
    ALTER TABLE arch_catalog_product_materials
      ADD CONSTRAINT arch_catalog_product_materials_master_product_fk
      FOREIGN KEY (master_product_id)
      REFERENCES produtos_catalogo(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS arch_catalog_product_materials_master_product_idx
  ON arch_catalog_product_materials (tenant_id, master_product_id);

CREATE UNIQUE INDEX IF NOT EXISTS arch_catalog_product_materials_master_uidx
  ON arch_catalog_product_materials (tenant_id, master_product_id, material_id, COALESCE(surface_key, ''))
  WHERE master_product_id IS NOT NULL;

UPDATE produtos_catalogo p
SET
  model3d_url = COALESCE(
    p.model3d_url,
    NULLIF(ac.especificacoes->>'model3dUrl', '')
  ),
  project_technical_config = COALESCE(
    p.project_technical_config,
    CASE
      WHEN ac.especificacoes IS NULL THEN NULL
      ELSE ac.especificacoes - 'model3dUrl'
    END
  )
FROM arch_catalogo ac
WHERE ac.source_product_id = p.id;

