-- Sprint 031 — Real Budget Engine: arch_budgets + arch_budget_items
CREATE TABLE IF NOT EXISTS arch_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  ambiente_id UUID NULL,
  render_id UUID NULL,
  title TEXT NOT NULL,
  client_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  subtotal_material NUMERIC NOT NULL DEFAULT 0,
  subtotal_labor NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'fixed',
  discount_value NUMERIC NOT NULL DEFAULT 0,
  discount_total NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NULL,
  client_notes TEXT NULL,
  internal_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS arch_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  budget_id UUID NOT NULL REFERENCES arch_budgets(id) ON DELETE CASCADE,
  spec_object_id UUID NULL,
  project_id UUID NOT NULL,
  ambiente_id UUID NULL,
  render_id UUID NULL,
  item TEXT NOT NULL,
  description TEXT NULL,
  type TEXT NOT NULL DEFAULT 'product',
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  material_value NUMERIC NOT NULL DEFAULT 0,
  labor_value NUMERIC NOT NULL DEFAULT 0,
  unit_total NUMERIC NOT NULL DEFAULT 0,
  total_material NUMERIC NOT NULL DEFAULT 0,
  total_labor NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  supplier_name TEXT NULL,
  manufacturer_name TEXT NULL,
  product_name TEXT NULL,
  material_name TEXT NULL,
  visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_arch_budgets_tenant             ON arch_budgets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_budgets_project            ON arch_budgets (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_budgets_status             ON arch_budgets (status);
CREATE INDEX IF NOT EXISTS idx_arch_budget_items_tenant        ON arch_budget_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_budget_items_budget        ON arch_budget_items (budget_id);
CREATE INDEX IF NOT EXISTS idx_arch_budget_items_project       ON arch_budget_items (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_budget_items_spec_object   ON arch_budget_items (spec_object_id);
