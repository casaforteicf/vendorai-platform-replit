-- Specification V2 — technical measurements, provenance and purchasing quantity
ALTER TABLE arch_spec_objects
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS project_revision TEXT NULL,
  ADD COLUMN IF NOT EXISTS revision_impact TEXT NOT NULL DEFAULT 'unchanged',
  ADD COLUMN IF NOT EXISTS geometry_hash TEXT NULL,
  ADD COLUMN IF NOT EXISTS quantity_source TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS measurement_source TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS measurement_revision TEXT NULL,
  ADD COLUMN IF NOT EXISTS width_mm NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS height_mm NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS depth_mm NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS length_mm NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS area_m2 NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS perimeter_m NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS volume_m3 NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS waste_factor NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_quantity NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS package_yield NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS last_project_sync_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS removed_from_project_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS measurement_confirmed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS measurement_confirmed_by UUID NULL;

CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_source_object
  ON arch_spec_objects (tenant_id, project_id, source_object_id)
  WHERE source_object_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_supplier
  ON arch_spec_objects (tenant_id, project_id, supplier_id);

CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_revision_impact
  ON arch_spec_objects (tenant_id, project_id, revision_impact);
