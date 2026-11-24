-- 571_hotel_manutencao_central.sql
--
-- Central de Manutenção da Hotelaria.
-- Estrutura enxuta e persistente para a operação diária: equipamentos,
-- planos preventivos, ordens de serviço/chamados, checklists, medidores e
-- documentação com vencimento.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS e política recriada.

CREATE TABLE IF NOT EXISTS hotel_maintenance_assets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  category text NOT NULL DEFAULT 'Geral' CHECK (char_length(category) BETWEEN 1 AND 80),
  location_type text NOT NULL DEFAULT 'area' CHECK (location_type IN ('room','area')),
  room_id text,
  area_name text,
  brand text,
  model text,
  serial_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_assets_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT hotel_maintenance_assets_code_uq UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, room_id) REFERENCES hotel_rooms(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_plans (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  interval_days integer NOT NULL CHECK (interval_days BETWEEN 1 AND 3650),
  last_done_on date,
  next_due_on date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_plans_tenant_id_uq UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, asset_id) REFERENCES hotel_maintenance_assets(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_work_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id text,
  asset_id text,
  room_id text,
  area_name text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  description text,
  category text NOT NULL DEFAULT 'Geral' CHECK (char_length(category) BETWEEN 1 AND 80),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','done','cancelled')),
  assigned_to text,
  opened_by text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_work_orders_tenant_id_uq UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, plan_id) REFERENCES hotel_maintenance_plans(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, asset_id) REFERENCES hotel_maintenance_assets(tenant_id, id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id, room_id) REFERENCES hotel_rooms(tenant_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_checklist_templates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  area_name text NOT NULL DEFAULT 'Geral' CHECK (char_length(area_name) BETWEEN 1 AND 120),
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly','monthly')),
  active boolean NOT NULL DEFAULT true,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_checklist_templates_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_checklist_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  run_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed_by text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_checklist_runs_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT hotel_maintenance_checklist_runs_day_uq UNIQUE (tenant_id, template_id, run_date),
  FOREIGN KEY (tenant_id, template_id) REFERENCES hotel_maintenance_checklist_templates(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_meters (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  kind text NOT NULL CHECK (kind IN ('water','gas','energy','temperature')),
  unit text NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 20),
  location text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_meters_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_meter_readings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meter_id text NOT NULL,
  reading_date date NOT NULL,
  value numeric(14,3) NOT NULL,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_meter_readings_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT hotel_maintenance_meter_readings_day_uq UNIQUE (tenant_id, meter_id, reading_date),
  FOREIGN KEY (tenant_id, meter_id) REFERENCES hotel_maintenance_meters(tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hotel_maintenance_documents (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  kind text NOT NULL DEFAULT 'Documento' CHECK (char_length(kind) BETWEEN 1 AND 80),
  issuer text,
  valid_until date,
  file_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_maintenance_documents_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS hotel_maintenance_assets_tenant_idx ON hotel_maintenance_assets(tenant_id, status, name);
CREATE INDEX IF NOT EXISTS hotel_maintenance_plans_tenant_due_idx ON hotel_maintenance_plans(tenant_id, active, next_due_on);
CREATE INDEX IF NOT EXISTS hotel_maintenance_work_orders_tenant_idx ON hotel_maintenance_work_orders(tenant_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS hotel_maintenance_work_orders_due_idx ON hotel_maintenance_work_orders(tenant_id, due_at);
CREATE INDEX IF NOT EXISTS hotel_maintenance_checklist_templates_tenant_idx ON hotel_maintenance_checklist_templates(tenant_id, active, title);
CREATE INDEX IF NOT EXISTS hotel_maintenance_checklist_runs_tenant_idx ON hotel_maintenance_checklist_runs(tenant_id, run_date DESC);
CREATE INDEX IF NOT EXISTS hotel_maintenance_meters_tenant_idx ON hotel_maintenance_meters(tenant_id, active, name);
CREATE INDEX IF NOT EXISTS hotel_maintenance_meter_readings_tenant_idx ON hotel_maintenance_meter_readings(tenant_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS hotel_maintenance_documents_tenant_idx ON hotel_maintenance_documents(tenant_id, valid_until);

ALTER TABLE hotel_maintenance_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_meters ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_maintenance_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_maintenance_assets_tenant ON hotel_maintenance_assets;
CREATE POLICY hotel_maintenance_assets_tenant ON hotel_maintenance_assets
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_plans_tenant ON hotel_maintenance_plans;
CREATE POLICY hotel_maintenance_plans_tenant ON hotel_maintenance_plans
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_work_orders_tenant ON hotel_maintenance_work_orders;
CREATE POLICY hotel_maintenance_work_orders_tenant ON hotel_maintenance_work_orders
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_checklist_templates_tenant ON hotel_maintenance_checklist_templates;
CREATE POLICY hotel_maintenance_checklist_templates_tenant ON hotel_maintenance_checklist_templates
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_checklist_runs_tenant ON hotel_maintenance_checklist_runs;
CREATE POLICY hotel_maintenance_checklist_runs_tenant ON hotel_maintenance_checklist_runs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_meters_tenant ON hotel_maintenance_meters;
CREATE POLICY hotel_maintenance_meters_tenant ON hotel_maintenance_meters
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_meter_readings_tenant ON hotel_maintenance_meter_readings;
CREATE POLICY hotel_maintenance_meter_readings_tenant ON hotel_maintenance_meter_readings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_maintenance_documents_tenant ON hotel_maintenance_documents;
CREATE POLICY hotel_maintenance_documents_tenant ON hotel_maintenance_documents
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_assets TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_plans TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_work_orders TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_checklist_templates TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_checklist_runs TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_meters TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_meter_readings TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_maintenance_documents TO vendorai_app_login';
  END IF;
END $$;
