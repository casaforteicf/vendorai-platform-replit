CREATE TABLE IF NOT EXISTS arqdor_universal_models (
  id text PRIMARY KEY,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  source_project_id text,
  source_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  source_file_name text,
  architecture jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(5,4) NOT NULL DEFAULT 0,
  dedupe_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ready',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arqdor_universal_models_kind_idx
  ON arqdor_universal_models(kind, is_active);

CREATE INDEX IF NOT EXISTS arqdor_universal_models_source_project_idx
  ON arqdor_universal_models(source_project_id);

COMMENT ON TABLE arqdor_universal_models IS
  'Biblioteca Universal do Arqdor: modelos arquitetônicos anonimizados derivados automaticamente de projetos importados.';
