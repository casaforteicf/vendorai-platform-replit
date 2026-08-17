CREATE TABLE IF NOT EXISTS vehicles (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate text, chassis text, renavam text, brand text, model text, version text,
  raw_description text, full_name text, manufacture_year integer, model_year integer,
  fuel text, engine text, transmission text, power_hp integer, color text, vehicle_type text,
  fipe_code text, source text NOT NULL, confidence numeric(4,3) NOT NULL,
  confidence_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  possible_versions jsonb NOT NULL DEFAULT '[]'::jsonb, provider_data jsonb,
  last_verified_at timestamp NOT NULL DEFAULT now(), created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_plate_unique ON vehicles(tenant_id, plate) WHERE plate IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_chassis_unique ON vehicles(tenant_id, chassis) WHERE chassis IS NOT NULL;
CREATE TABLE IF NOT EXISTS vehicle_lookup_cache (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lookup_type text NOT NULL, lookup_hash text NOT NULL, vehicle_id text NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  provider text NOT NULL, expires_at timestamp NOT NULL, created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, lookup_type, lookup_hash)
);
CREATE TABLE IF NOT EXISTS vehicle_lookup_history (
  id text PRIMARY KEY, tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  query_type text NOT NULL, query_masked text NOT NULL, vehicle_id text REFERENCES vehicles(id) ON DELETE SET NULL,
  provider text NOT NULL, success boolean NOT NULL, duration_ms integer NOT NULL, error_code text,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicle_lookup_history_tenant_created_idx ON vehicle_lookup_history(tenant_id, created_at);
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS chassi text;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS renavam text;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS versao text;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS motor text;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS potencia_hp integer;
ALTER TABLE veiculos_estoque ADD COLUMN IF NOT EXISTS codigo_fipe text;
CREATE UNIQUE INDEX IF NOT EXISTS veiculos_estoque_tenant_placa_unique ON veiculos_estoque(tenant_id, placa) WHERE placa IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS veiculos_estoque_tenant_chassi_unique ON veiculos_estoque(tenant_id, chassi) WHERE chassi IS NOT NULL;
