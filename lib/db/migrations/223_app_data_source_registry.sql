-- VendorAI App Builder — registry global de data sources read-only.
-- O registry guarda somente contratos declarativos. executor_key aponta para
-- executores allowlisted no backend; SQL, URLs e código não são armazenados aqui.

CREATE TABLE IF NOT EXISTS app_data_source_registry (
  id text PRIMARY KEY,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  category text,
  executor_key text NOT NULL,
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_data_source_registry_status_check
    CHECK (status IN ('active', 'deprecated', 'archived')),
  CONSTRAINT app_data_source_registry_required_permissions_array_check
    CHECK (jsonb_typeof(required_permissions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_data_source_registry_key_uidx
  ON app_data_source_registry (key);
CREATE INDEX IF NOT EXISTS app_data_source_registry_category_idx
  ON app_data_source_registry (category);
CREATE INDEX IF NOT EXISTS app_data_source_registry_status_idx
  ON app_data_source_registry (status);
CREATE INDEX IF NOT EXISTS app_data_source_registry_executor_idx
  ON app_data_source_registry (executor_key);

-- Registry global: autoria passa pela API SuperAdmin. O runtime nunca recebe
-- acesso direto à tabela; executores validam tenant, App Instance e App User.
GRANT SELECT, INSERT, UPDATE, DELETE ON app_data_source_registry TO vendorai_app;

COMMENT ON TABLE app_data_source_registry IS
  'Contratos globais de data sources read-only do App Builder; executor_key resolve apenas handlers allowlisted no backend.';
COMMENT ON COLUMN app_data_source_registry.executor_key IS
  'Chave opaca para executor implementado no backend. Nunca contém SQL, URL ou código executável.';
COMMENT ON COLUMN app_data_source_registry.required_permissions IS
  'Permissões de App User exigidas antes da execução do data source.';
