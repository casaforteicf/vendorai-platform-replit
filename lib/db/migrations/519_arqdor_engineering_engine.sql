CREATE TABLE IF NOT EXISTS arqdor_engineering_systems (
  id text PRIMARY KEY,
  tenant_id text NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'universal',
  manufacturer text NOT NULL,
  line text NOT NULL,
  material text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  source text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_engineering_systems_scope_uidx
  ON arqdor_engineering_systems (scope, tenant_id, manufacturer, line, version);
CREATE INDEX IF NOT EXISTS arqdor_engineering_systems_active_idx
  ON arqdor_engineering_systems (is_active, material);

CREATE TABLE IF NOT EXISTS arqdor_engineering_components (
  id text PRIMARY KEY,
  system_id text NOT NULL REFERENCES arqdor_engineering_systems(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  "group" text NOT NULL,
  role text NOT NULL,
  unit text NOT NULL DEFAULT 'un',
  commercial_length_mm numeric(12,3),
  weight_kg_per_m numeric(12,5),
  cost_value numeric(14,4),
  sale_value numeric(14,4),
  pricing_basis text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_engineering_components_code_uidx
  ON arqdor_engineering_components (system_id, code);
CREATE INDEX IF NOT EXISTS arqdor_engineering_components_group_idx
  ON arqdor_engineering_components (system_id, "group", role);

CREATE TABLE IF NOT EXISTS arqdor_engineering_configurations (
  id text PRIMARY KEY,
  system_id text NOT NULL REFERENCES arqdor_engineering_systems(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  opening_type text NOT NULL,
  product_kind text NOT NULL DEFAULT 'window',
  leaf_count integer,
  frame_code text,
  min_width_mm numeric(12,3),
  max_width_mm numeric(12,3),
  min_height_mm numeric(12,3),
  max_height_mm numeric(12,3),
  max_leaf_weight_kg numeric(12,3),
  allowed_glass_thickness_mm jsonb NOT NULL DEFAULT '[]'::jsonb,
  geometry_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  compatibility_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  installation_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_engineering_configurations_code_uidx
  ON arqdor_engineering_configurations (system_id, code);
CREATE INDEX IF NOT EXISTS arqdor_engineering_configurations_lookup_idx
  ON arqdor_engineering_configurations (system_id, product_kind, opening_type, leaf_count, is_active);

CREATE TABLE IF NOT EXISTS arqdor_engineering_configuration_components (
  id text PRIMARY KEY,
  configuration_id text NOT NULL REFERENCES arqdor_engineering_configurations(id) ON DELETE CASCADE,
  component_id text NOT NULL REFERENCES arqdor_engineering_components(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  required boolean NOT NULL DEFAULT true,
  quantity_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  dimension_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  condition_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  cutting_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  waste_rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_engineering_configuration_components_uidx
  ON arqdor_engineering_configuration_components (configuration_id, component_id, sequence);
CREATE INDEX IF NOT EXISTS arqdor_engineering_configuration_components_cfg_idx
  ON arqdor_engineering_configuration_components (configuration_id, sequence);

CREATE TABLE IF NOT EXISTS arqdor_engineering_performance_tests (
  id text PRIMARY KEY,
  configuration_id text NOT NULL REFERENCES arqdor_engineering_configurations(id) ON DELETE CASCADE,
  report_number text,
  test_type text NOT NULL,
  acoustic_db numeric(8,3),
  watertightness_pa numeric(12,3),
  wind_pressure_pa numeric(12,3),
  air_permeability numeric(12,5),
  measured_deflection_mm numeric(12,4),
  allowed_deflection_mm numeric(12,4),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_file text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_engineering_performance_tests_cfg_idx
  ON arqdor_engineering_performance_tests (configuration_id, test_type);

CREATE TABLE IF NOT EXISTS arqdor_engineering_quote_snapshots (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id text,
  budget_id text,
  configuration_id text REFERENCES arqdor_engineering_configurations(id) ON DELETE SET NULL,
  engine_version text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_bom jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_engineering_quote_snapshots_budget_idx
  ON arqdor_engineering_quote_snapshots (tenant_id, budget_id, created_at);
CREATE INDEX IF NOT EXISTS arqdor_engineering_quote_snapshots_project_idx
  ON arqdor_engineering_quote_snapshots (tenant_id, project_id, created_at);
