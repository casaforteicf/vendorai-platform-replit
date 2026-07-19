-- Sprint 033 — Production, Procurement & Execution Flow
CREATE TABLE IF NOT EXISTS arch_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  proposal_id UUID NULL,
  proposal_item_id UUID NULL,
  budget_item_id UUID NULL,
  spec_object_id UUID NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  type TEXT NOT NULL DEFAULT 'production',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'planned',
  item TEXT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  material_name TEXT NULL,
  product_name TEXT NULL,
  supplier_name TEXT NULL,
  manufacturer_name TEXT NULL,
  planned_start DATE NULL,
  planned_end DATE NULL,
  actual_start TIMESTAMPTZ NULL,
  actual_end TIMESTAMPTZ NULL,
  estimated_cost NUMERIC NOT NULL DEFAULT 0,
  actual_cost NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS arch_supplier_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  work_order_id UUID NULL,
  supplier_name TEXT NOT NULL,
  contact_name TEXT NULL,
  contact_phone TEXT NULL,
  contact_email TEXT NULL,
  item TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  estimated_value NUMERIC NOT NULL DEFAULT 0,
  confirmed_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not-requested',
  requested_at TIMESTAMPTZ NULL,
  expected_delivery DATE NULL,
  delivered_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS arch_installation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  work_order_id UUID NULL,
  title TEXT NOT NULL,
  team TEXT NULL,
  location TEXT NULL,
  scheduled_date DATE NULL,
  duration_hours NUMERIC NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'planned',
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NULL,
  project_id UUID NOT NULL,
  work_order_id UUID NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  responsible TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_execution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  work_order_id UUID NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_name TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_work_orders_tenant        ON arch_work_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_work_orders_project       ON arch_work_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_work_orders_proposal      ON arch_work_orders (proposal_id);
CREATE INDEX IF NOT EXISTS idx_arch_work_orders_status        ON arch_work_orders (status);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_tenant    ON arch_supplier_orders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_project   ON arch_supplier_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_work_order ON arch_supplier_orders (work_order_id);
CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_status    ON arch_supplier_orders (status);
CREATE INDEX IF NOT EXISTS idx_arch_installation_tasks_project ON arch_installation_tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_project    ON arch_quality_checks (project_id);
CREATE INDEX IF NOT EXISTS idx_arch_execution_events_project  ON arch_execution_events (project_id);
