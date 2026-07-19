-- Sprint 030 — SpecObject persistence
CREATE TABLE IF NOT EXISTS arch_spec_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  ambiente_id UUID NULL,
  cena_id UUID NULL,
  render_id UUID NULL,
  source_object_id TEXT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NULL,
  region TEXT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  catalog_product_id UUID NULL,
  catalog_material_id UUID NULL,
  manufacturer_id UUID NULL,
  supplier_id UUID NULL,
  product_name TEXT NULL,
  material_name TEXT NULL,
  manufacturer_name TEXT NULL,
  supplier_name TEXT NULL,
  material_value NUMERIC NOT NULL DEFAULT 0,
  labor_value NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_tenant  ON arch_spec_objects (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_project ON arch_spec_objects (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_render  ON arch_spec_objects (render_id);
CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_status  ON arch_spec_objects (status);
