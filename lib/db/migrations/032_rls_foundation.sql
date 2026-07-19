-- Vendor.ai multi-tenant RLS foundation
--
-- Safe rollout model:
--   1. postgres remains the privileged migration/admin role;
--   2. vendorai_app is created as a non-login, non-superuser, non-BYPASSRLS role;
--   3. tenant policies are enabled for vendorai_app;
--   4. the API keeps using its current connection until APP_DATABASE_URL is
--      provisioned securely with credentials for vendorai_app;
--   5. FORCE ROW LEVEL SECURITY is not required for vendorai_app because it is
--      not the table owner and cannot bypass RLS.

CREATE SCHEMA IF NOT EXISTS app_security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app') THEN
    CREATE ROLE vendorai_app
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE vendorai_app
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOBYPASSRLS;

CREATE OR REPLACE FUNCTION app_security.current_tenant_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')
$$;

CREATE OR REPLACE FUNCTION app_security.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.is_super_admin', TRUE), ''),
    'false'
  )::BOOLEAN
$$;

CREATE OR REPLACE FUNCTION app_security.set_tenant_context(
  p_tenant_id TEXT,
  p_is_super_admin BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE PLPGSQL
VOLATILE
SECURITY INVOKER
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', COALESCE(p_tenant_id, ''), TRUE);
  PERFORM set_config(
    'app.is_super_admin',
    CASE WHEN p_is_super_admin THEN 'true' ELSE 'false' END,
    TRUE
  );
END;
$$;

REVOKE ALL ON SCHEMA app_security FROM PUBLIC;
REVOKE ALL ON FUNCTION app_security.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_security.is_super_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_security.set_tenant_context(TEXT, BOOLEAN) FROM PUBLIC;

GRANT USAGE ON SCHEMA app_security TO vendorai_app;
GRANT EXECUTE ON FUNCTION app_security.current_tenant_id() TO vendorai_app;
GRANT EXECUTE ON FUNCTION app_security.is_super_admin() TO vendorai_app;
GRANT EXECUTE ON FUNCTION app_security.set_tenant_context(TEXT, BOOLEAN) TO vendorai_app;

-- Runtime privileges for the restricted application role.
GRANT USAGE ON SCHEMA public TO vendorai_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vendorai_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO vendorai_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vendorai_app;

-- Future objects created by the migration owner inherit the same runtime grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vendorai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO vendorai_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO vendorai_app;

DO $$
DECLARE
  tenant_table RECORD;
  tenant_expression TEXT;
  current_role_is_superuser BOOLEAN := FALSE;
BEGIN
  SELECT rolsuper
    INTO current_role_is_superuser
    FROM pg_roles
   WHERE rolname = current_user;

  FOR tenant_table IN
    SELECT
      cols.table_schema,
      cols.table_name,
      cols.column_name,
      owner_role.rolname AS table_owner
    FROM information_schema.columns AS cols
    JOIN information_schema.tables AS tbl
      ON tbl.table_schema = cols.table_schema
     AND tbl.table_name = cols.table_name
    JOIN pg_namespace AS ns
      ON ns.nspname = cols.table_schema
    JOIN pg_class AS cls
      ON cls.relnamespace = ns.oid
     AND cls.relname = cols.table_name
    JOIN pg_roles AS owner_role
      ON owner_role.oid = cls.relowner
    WHERE cols.table_schema = 'public'
      AND tbl.table_type = 'BASE TABLE'
      AND cols.column_name IN ('tenant_id', 'tenantId')
      AND cols.table_name <> 'vendorai_schema_migrations'
    ORDER BY cols.table_name
  LOOP
    IF tenant_table.table_owner <> current_user AND NOT current_role_is_superuser THEN
      RAISE NOTICE
        'Skipping RLS policy creation for %.%: current role % is not owner %',
        tenant_table.table_schema,
        tenant_table.table_name,
        current_user,
        tenant_table.table_owner;
      CONTINUE;
    END IF;

    tenant_expression := format(
      '(app_security.is_super_admin() OR %I::text = app_security.current_tenant_id())',
      tenant_table.column_name
    );

    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      tenant_table.table_schema,
      tenant_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS vendorai_tenant_access ON %I.%I',
      tenant_table.table_schema,
      tenant_table.table_name
    );

    EXECUTE format(
      'DROP POLICY IF EXISTS vendorai_tenant_guard ON %I.%I',
      tenant_table.table_schema,
      tenant_table.table_name
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I.%I AS PERMISSIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      tenant_table.table_schema,
      tenant_table.table_name,
      tenant_expression,
      tenant_expression
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I.%I AS RESTRICTIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      tenant_table.table_schema,
      tenant_table.table_name,
      tenant_expression,
      tenant_expression
    );
  END LOOP;
END
$$;

CREATE OR REPLACE VIEW app_security.rls_coverage AS
SELECT
  ns.nspname AS table_schema,
  cls.relname AS table_name,
  cls.relrowsecurity AS rls_enabled,
  cls.relforcerowsecurity AS rls_forced,
  owner_role.rolname AS table_owner,
  EXISTS (
    SELECT 1
    FROM pg_policy AS pol
    WHERE pol.polrelid = cls.oid
      AND pol.polname = 'vendorai_tenant_access'
  ) AS has_access_policy,
  EXISTS (
    SELECT 1
    FROM pg_policy AS pol
    WHERE pol.polrelid = cls.oid
      AND pol.polname = 'vendorai_tenant_guard'
  ) AS has_guard_policy
FROM pg_class AS cls
JOIN pg_namespace AS ns ON ns.oid = cls.relnamespace
JOIN pg_roles AS owner_role ON owner_role.oid = cls.relowner
WHERE ns.nspname = 'public'
  AND cls.relkind IN ('r', 'p')
  AND EXISTS (
    SELECT 1
    FROM pg_attribute AS attr
    WHERE attr.attrelid = cls.oid
      AND attr.attnum > 0
      AND NOT attr.attisdropped
      AND attr.attname IN ('tenant_id', 'tenantId')
  )
ORDER BY cls.relname;

CREATE OR REPLACE VIEW app_security.app_role_status AS
SELECT
  rolname AS role_name,
  rolcanlogin AS can_login,
  rolsuper AS is_superuser,
  rolbypassrls AS bypasses_rls,
  rolcreatedb AS can_create_db,
  rolcreaterole AS can_create_role
FROM pg_roles
WHERE rolname = 'vendorai_app';

REVOKE ALL ON app_security.rls_coverage FROM PUBLIC;
REVOKE ALL ON app_security.app_role_status FROM PUBLIC;
GRANT SELECT ON app_security.rls_coverage TO vendorai_app;
GRANT SELECT ON app_security.app_role_status TO vendorai_app;

COMMENT ON SCHEMA app_security IS
  'Tenant isolation helpers and RLS coverage metadata for Vendor.ai.';
COMMENT ON FUNCTION app_security.set_tenant_context(TEXT, BOOLEAN) IS
  'Sets transaction-local tenant context for the restricted vendorai_app role.';
COMMENT ON VIEW app_security.rls_coverage IS
  'Reports RLS and Vendor.ai policy coverage for public tables containing tenant_id.';
COMMENT ON VIEW app_security.app_role_status IS
  'Reports security attributes of the restricted Vendor.ai application role.';
