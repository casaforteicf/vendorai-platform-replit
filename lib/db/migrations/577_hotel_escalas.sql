-- 577_hotel_escalas.sql
-- Escala operacional do A&B por tenant, com histórico de versões.
-- O estado é o JSON compatível com o backup do AJEscala V5.

CREATE TABLE IF NOT EXISTS hotel_escala_config (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Escala A&B',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_escala_config_tenant_uq UNIQUE (tenant_id),
  CONSTRAINT hotel_escala_config_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_escala_versoes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  config_id text NOT NULL,
  version integer NOT NULL,
  state jsonb NOT NULL,
  saved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_escala_versoes_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT hotel_escala_versoes_config_version_uq UNIQUE (tenant_id, config_id, version),
  FOREIGN KEY (tenant_id, config_id) REFERENCES hotel_escala_config(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hotel_escala_versoes_tenant_created_idx
  ON hotel_escala_versoes(tenant_id, created_at DESC);

ALTER TABLE hotel_escala_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotel_escala_config_tenant_isolation ON hotel_escala_config;
CREATE POLICY hotel_escala_config_tenant_isolation ON hotel_escala_config
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE hotel_escala_versoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotel_escala_versoes_tenant_isolation ON hotel_escala_versoes;
CREATE POLICY hotel_escala_versoes_tenant_isolation ON hotel_escala_versoes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_escala_config TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_escala_versoes TO vendorai_app_login';
  END IF;
END $$;
