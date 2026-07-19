-- Vendor.ai multi-tenant RLS foundation
--
-- This migration versions tenant policies without forcing them on table owners.
-- The current API uses a shared PostgreSQL pool and does not yet set a tenant
-- context inside each database transaction. Therefore:
--   1. RLS is ENABLED on tenant-owned tables;
--   2. FORCE ROW LEVEL SECURITY is intentionally NOT enabled yet;
--   3. table owners / BYPASSRLS roles may still bypass policies;
--   4. a later migration may FORCE RLS only after request-scoped DB context is live.

CREATE SCHEMA IF NOT EXISTS app_security;
GRANT USAGE ON SCHEMA app_security TO PUBLIC;

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

-- Only the database owner may set server-side tenant context. The read helpers
-- remain callable because PostgreSQL evaluates them inside RLS policies.
REVOKE ALL ON FUNCTION app_security.set_tenant_context(TEXT, BOOLEAN) FROM PUBLIC;

DO $$
DECLARE
  tenant_table RECORD;
  tenant_expression TEXT;
BEGIN
  FOR tenant_table IN
    SELECT
      cols.table_schema,
      cols.table_name,
      cols.column_name
    FROM information_schema.columns AS cols
    JOIN information_schema.tables AS tbl
      ON tbl.table_schema = cols.table_schema
     AND tbl.table_name = cols.table_name
    WHERE cols.table_schema = 'public'
      AND tbl.table_type = 'BASE TABLE'
      AND cols.column_name IN ('tenant_id', 'tenantId')
      AND cols.table_name <> 'vendorai_schema_migrations'
    ORDER BY cols.table_name
  LOOP
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

    -- A permissive policy is required for rows to be visible when RLS applies.
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I.%I AS PERMISSIVE FOR ALL TO PUBLIC USING (%s) WITH CHECK (%s)',
      tenant_table.table_schema,
      tenant_table.table_name,
      tenant_expression,
      tenant_expression
    );

    -- The restrictive policy prevents any broader existing permissive policy
    -- from granting cross-tenant access.
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING (%s) WITH CHECK (%s)',
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

COMMENT ON SCHEMA app_security IS
  'Tenant isolation helpers and RLS coverage metadata for Vendor.ai.';

COMMENT ON FUNCTION app_security.set_tenant_context(TEXT, BOOLEAN) IS
  'Sets transaction-local tenant context. Must be called inside the same explicit transaction as protected queries.';

COMMENT ON VIEW app_security.rls_coverage IS
  'Reports RLS and Vendor.ai policy coverage for public tables containing tenant_id.';
