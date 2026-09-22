-- ARQDOR / VendorAI — credenciais e escopo de acesso de campo por obra.
-- Usuários de campo não recebem acesso geral ao tenant: a credencial fica vinculada ao executor + obra.

CREATE TABLE IF NOT EXISTS obra_executor_access (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  executor_id text NOT NULL REFERENCES obra_executores(id) ON DELETE CASCADE,
  login_identifier text NOT NULL,
  password_hash text,
  invite_token_hash text,
  invite_expires_at timestamp with time zone,
  activated_at timestamp with time zone,
  last_login_at timestamp with time zone,
  status text NOT NULL DEFAULT 'invited',
  force_password_reset boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT obra_executor_access_status_check
    CHECK (status IN ('invited','active','blocked','revoked')),
  CONSTRAINT obra_executor_access_identifier_check
    CHECK (length(trim(login_identifier)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS obra_executor_access_executor_uidx
  ON obra_executor_access (executor_id);
CREATE UNIQUE INDEX IF NOT EXISTS obra_executor_access_obra_login_uidx
  ON obra_executor_access (obra_id, lower(login_identifier));
CREATE INDEX IF NOT EXISTS obra_executor_access_tenant_obra_idx
  ON obra_executor_access (tenant_id, obra_id, status);
CREATE INDEX IF NOT EXISTS obra_executor_access_invite_idx
  ON obra_executor_access (invite_token_hash)
  WHERE invite_token_hash IS NOT NULL;

ALTER TABLE obra_diario
  ADD COLUMN IF NOT EXISTS executor_id text NULL REFERENCES obra_executores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS aprovado_por_executor_id text NULL REFERENCES obra_executores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS obra_diario_executor_idx
  ON obra_diario (obra_id, executor_id, data DESC)
  WHERE executor_id IS NOT NULL;

ALTER TABLE obra_executor_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON obra_executor_access;
DROP POLICY IF EXISTS vendorai_tenant_guard ON obra_executor_access;

CREATE POLICY vendorai_tenant_access ON obra_executor_access
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

CREATE POLICY vendorai_tenant_guard ON obra_executor_access
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON obra_executor_access TO vendorai_app;

COMMENT ON TABLE obra_executor_access IS
  'Credencial restrita de executor para acesso apenas à obra vinculada.';
COMMENT ON COLUMN obra_executor_access.login_identifier IS
  'E-mail ou telefone normalizado usado no login de campo.';
COMMENT ON COLUMN obra_diario.executor_id IS
  'Executor de campo que originou a entrada do diário, quando aplicável.';
