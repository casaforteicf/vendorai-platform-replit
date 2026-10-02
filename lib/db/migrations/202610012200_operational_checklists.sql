CREATE TABLE IF NOT EXISTS operational_checklist_templates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text NOT NULL,
  stage_key text NOT NULL,
  source_type text NOT NULL DEFAULT 'proposal',
  tolerance_mm integer NOT NULL DEFAULT 3,
  require_photos boolean NOT NULL DEFAULT false,
  block_on_divergence boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS operational_checklist_templates_tenant_key_uidx
  ON operational_checklist_templates (tenant_id, key);

CREATE INDEX IF NOT EXISTS operational_checklist_templates_stage_idx
  ON operational_checklist_templates (tenant_id, stage_key, active);

CREATE TABLE IF NOT EXISTS operational_checklist_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_id text REFERENCES operational_checklist_templates(id) ON DELETE SET NULL,
  deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  proposta_id text REFERENCES propostas(id) ON DELETE SET NULL,
  stage_key text NOT NULL,
  name text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'em_andamento',
  header_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  tolerance_mm integer NOT NULL DEFAULT 3,
  block_on_divergence boolean NOT NULL DEFAULT true,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  completed_by text REFERENCES users(id) ON DELETE SET NULL,
  completed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_checklist_runs_deal_idx
  ON operational_checklist_runs (tenant_id, deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS operational_checklist_runs_stage_idx
  ON operational_checklist_runs (tenant_id, stage_key, status);

REVOKE ALL ON TABLE operational_checklist_templates, operational_checklist_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE operational_checklist_templates, operational_checklist_runs TO vendorai_app;

ALTER TABLE operational_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_checklist_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_backend_access ON operational_checklist_templates;
CREATE POLICY vendorai_backend_access ON operational_checklist_templates
  AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS vendorai_backend_access ON operational_checklist_runs;
CREATE POLICY vendorai_backend_access ON operational_checklist_runs
  AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);