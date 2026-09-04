-- VendorAI App Builder — identidade externa universal e memberships por app.
-- Mantém usuários finais separados de `users` (equipe interna do VendorAI).
-- A mesma pessoa externa pode participar de múltiplos apps do mesmo tenant.

CREATE TABLE IF NOT EXISTS app_users (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  email text,
  phone text,
  identity_provider text NOT NULL DEFAULT 'local',
  auth_subject text,
  status text NOT NULL DEFAULT 'invited',
  locale text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_verified_at timestamp,
  phone_verified_at timestamp,
  last_login_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_users_status_check
    CHECK (status IN ('invited', 'active', 'blocked', 'archived')),
  CONSTRAINT app_users_identity_provider_check
    CHECK (length(trim(identity_provider)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_email_uidx
  ON app_users (tenant_id, email)
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_tenant_auth_subject_uidx
  ON app_users (tenant_id, identity_provider, auth_subject)
  WHERE auth_subject IS NOT NULL;
CREATE INDEX IF NOT EXISTS app_users_tenant_status_idx
  ON app_users (tenant_id, status);
CREATE INDEX IF NOT EXISTS app_users_tenant_lead_idx
  ON app_users (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS app_users_tenant_phone_idx
  ON app_users (tenant_id, phone);

CREATE TABLE IF NOT EXISTS app_user_memberships (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_instance_id text NOT NULL REFERENCES app_instances(id) ON DELETE CASCADE,
  app_user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_key text NOT NULL DEFAULT 'customer',
  status text NOT NULL DEFAULT 'invited',
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT app_user_memberships_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'archived')),
  CONSTRAINT app_user_memberships_role_key_check
    CHECK (length(trim(role_key)) > 0),
  CONSTRAINT app_user_memberships_permissions_array_check
    CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS app_user_memberships_app_user_uidx
  ON app_user_memberships (app_instance_id, app_user_id);
CREATE INDEX IF NOT EXISTS app_user_memberships_tenant_app_idx
  ON app_user_memberships (tenant_id, app_instance_id, status);
CREATE INDEX IF NOT EXISTS app_user_memberships_tenant_user_idx
  ON app_user_memberships (tenant_id, app_user_id, status);
CREATE INDEX IF NOT EXISTS app_user_memberships_role_idx
  ON app_user_memberships (tenant_id, role_key, status);

-- Defesa em profundidade: identidade externa e memberships são sempre tenant-scoped.
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON app_users;
DROP POLICY IF EXISTS vendorai_tenant_guard ON app_users;
CREATE POLICY vendorai_tenant_access ON app_users
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON app_users
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_access ON app_user_memberships;
DROP POLICY IF EXISTS vendorai_tenant_guard ON app_user_memberships;
CREATE POLICY vendorai_tenant_access ON app_user_memberships
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
CREATE POLICY vendorai_tenant_guard ON app_user_memberships
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON app_users, app_user_memberships TO vendorai_app;

COMMENT ON TABLE app_users IS 'Identidades externas dos apps, separadas dos usuários internos do VendorAI; podem apontar opcionalmente para um lead/contato do mesmo tenant.';
COMMENT ON TABLE app_user_memberships IS 'Vínculo entre uma identidade externa e cada App Instance, com role_key e permissões configuráveis por app.';
COMMENT ON COLUMN app_users.auth_subject IS 'Identificador opaco do provedor de autenticação; credenciais não são armazenadas nesta tabela.';
COMMENT ON COLUMN app_user_memberships.role_key IS 'Papel schema-driven definido pelo app/template; não é limitado a uma lista fixa de nichos.';
