-- Specification commercial purchase units.
-- Keeps technical quantity (m2/m/un) separate from supplier purchase units (box/slab/kit/piece).
ALTER TABLE arch_spec_objects
  ADD COLUMN IF NOT EXISTS purchase_mode TEXT NOT NULL DEFAULT 'same_unit',
  ADD COLUMN IF NOT EXISTS purchase_unit TEXT NULL;

ALTER TABLE arch_spec_objects
  DROP CONSTRAINT IF EXISTS arch_spec_objects_purchase_mode_chk;

ALTER TABLE arch_spec_objects
  ADD CONSTRAINT arch_spec_objects_purchase_mode_chk
    CHECK (purchase_mode IN ('same_unit','package','slab','piece','kit'));

COMMENT ON COLUMN arch_spec_objects.package_yield IS
  'Technical quantity covered by one purchase unit. Example: 2.40 m2 per box or 5.76 m2 per slab.';

COMMENT ON COLUMN arch_spec_objects.purchase_quantity IS
  'Number of purchase units when purchase_mode differs from same_unit; otherwise gross technical quantity after waste.';

COMMENT ON COLUMN arch_spec_objects.purchase_unit IS
  'Commercial unit sent to supplier, e.g. caixa, chapa, kit, peca, m2.';
