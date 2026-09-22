-- Reconcile tenant-owned public tables that have RLS enabled but no policy.
-- Applies the canonical VendorAI tenant isolation policy only to tables that:
--   * live in public
--   * have tenant_id or tenantId
--   * already have RLS enabled
--   * currently have zero policies
--
-- Global tables and tables with existing custom policies are intentionally skipped.

BEGIN;

DO $$
DECLARE
  target RECORD;
  tenant_expression TEXT;
BEGIN
  FOR target IN
    SELECT
      n.nspname AS table_schema,
      c.relname AS table_name,
      a.attname AS tenant_column
    FROM pg_class c
    JOIN pg_namespace n
      ON n.oid = c.relnamespace
    JOIN pg_attribute a
      ON a.attrelid = c.oid
     AND a.attnum > 0
     AND NOT a.attisdropped
     AND a.attname IN ('tenant_id', 'tenantId')
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','p')
      AND c.relrowsecurity = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policy p
        WHERE p.polrelid = c.oid
      )
    ORDER BY c.relname
  LOOP
    tenant_expression := format(
      '(app_security.is_super_admin() OR %I::text = app_security.current_tenant_id())',
      target.tenant_column
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I.%I AS PERMISSIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      target.table_schema,
      target.table_name,
      tenant_expression,
      tenant_expression
    );

    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I.%I AS RESTRICTIVE FOR ALL TO vendorai_app USING (%s) WITH CHECK (%s)',
      target.table_schema,
      target.table_name,
      tenant_expression,
      tenant_expression
    );
  END LOOP;
END
$$;

COMMIT;
