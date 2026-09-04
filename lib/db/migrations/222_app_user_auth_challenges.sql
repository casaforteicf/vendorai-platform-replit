-- VendorAI App Builder — challenges de autenticação externa por app.
-- Nunca armazena o código em texto puro; somente HMAC do challenge.

CREATE TABLE IF NOT EXISTS app_user_auth_challenges (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_instance_id text NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
  app_user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  purpose text NOT NULL DEFAULT 'login',
  token_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  requested_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_user_auth_challenges_channel_check CHECK (channel IN ('email')),
  CONSTRAINT app_user_auth_challenges_purpose_check CHECK (purpose IN ('login')),
  CONSTRAINT app_user_auth_challenges_attempts_check CHECK (attempts >= 0 AND attempts <= 20)
);

CREATE INDEX IF NOT EXISTS app_user_auth_challenges_lookup_idx
  ON app_user_auth_challenges (tenant_id, app_instance_id, app_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS app_user_auth_challenges_expiry_idx
  ON app_user_auth_challenges (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE app_user_auth_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON app_user_auth_challenges;
DROP POLICY IF EXISTS vendorai_tenant_guard ON app_user_auth_challenges;
CREATE POLICY vendorai_tenant_access ON app_user_auth_challenges
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON app_user_auth_challenges
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app_user_auth_challenges TO vendorai_app;

COMMENT ON TABLE app_user_auth_challenges IS 'Challenges efêmeros e hashed para autenticação de usuários externos dos App Instances.';
