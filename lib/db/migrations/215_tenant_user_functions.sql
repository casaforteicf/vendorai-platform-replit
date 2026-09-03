-- Reusable tenant-scoped user functions (custom roles) with module allowlists.

CREATE TABLE IF NOT EXISTS tenant_user_functions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_user_functions_permissions_array
    CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_user_functions_tenant_name_uidx
  ON tenant_user_functions (tenant_id, lower(name));

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS custom_function_id TEXT
  REFERENCES tenant_user_functions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_custom_function_id_idx
  ON users(custom_function_id);

-- Match the existing VendorAI tenant isolation model for new tenant-scoped data.
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_user_functions TO vendorai_app;
ALTER TABLE tenant_user_functions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON tenant_user_functions;
CREATE POLICY vendorai_tenant_access
  ON tenant_user_functions
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (
    app_security.is_super_admin()
    OR tenant_id = app_security.current_tenant_id()
  )
  WITH CHECK (
    app_security.is_super_admin()
    OR tenant_id = app_security.current_tenant_id()
  );

DROP POLICY IF EXISTS vendorai_tenant_guard ON tenant_user_functions;
CREATE POLICY vendorai_tenant_guard
  ON tenant_user_functions
  AS RESTRICTIVE
  FOR ALL
  TO vendorai_app
  USING (
    app_security.is_super_admin()
    OR tenant_id = app_security.current_tenant_id()
  )
  WITH CHECK (
    app_security.is_super_admin()
    OR tenant_id = app_security.current_tenant_id()
  );
