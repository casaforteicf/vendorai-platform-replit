ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS vende_no_arqdor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preco_arqdor numeric(12,2);

ALTER TABLE arch_marketplace_items
  ADD COLUMN IF NOT EXISTS master_product_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'arch_marketplace_items_master_product_fk'
  ) THEN
    ALTER TABLE arch_marketplace_items
      ADD CONSTRAINT arch_marketplace_items_master_product_fk
      FOREIGN KEY (master_product_id)
      REFERENCES produtos_catalogo(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS arch_marketplace_items_master_product_uidx
  ON arch_marketplace_items (vendedor_tenant_id, master_product_id)
  WHERE master_product_id IS NOT NULL;
