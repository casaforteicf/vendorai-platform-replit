-- 575_ab_equipe_escala.sql
-- Equipe operacional do A&B, ligada ao cargo, com jornada e folgas.

CREATE TABLE IF NOT EXISTS ab_equipe (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) > 0),
  cargo_id text REFERENCES ab_cargos(id) ON DELETE SET NULL,
  dias_semana jsonb NOT NULL DEFAULT '[]'::jsonb,
  hora_inicio time NOT NULL,
  intervalo_inicio time,
  intervalo_fim time,
  hora_fim time NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_equipe_tenant_id_uq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ab_equipe_tenant_cargo_idx
  ON ab_equipe(tenant_id, cargo_id, ativo);

ALTER TABLE ab_equipe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_equipe_tenant_isolation ON ab_equipe;
CREATE POLICY ab_equipe_tenant_isolation ON ab_equipe
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_equipe TO vendorai_app_login';
  END IF;
END $$;
