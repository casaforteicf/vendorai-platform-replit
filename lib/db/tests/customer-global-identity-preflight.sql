-- Standalone preflight checks for customer global identity foundation.
-- Run ONLY against an isolated/restored database after the migration.
-- Read-only: no changes to business data.
DO $check$
DECLARE
  identities_rls boolean;
  links_rls boolean;
  identities_force boolean;
  links_force boolean;
  app_identities_select boolean;
  app_links_select boolean;
  cols_ok boolean;
BEGIN
  SELECT c.relrowsecurity,c.relforcerowsecurity
    INTO identities_rls,identities_force
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='customer_global_identities';
  SELECT c.relrowsecurity,c.relforcerowsecurity
    INTO links_rls,links_force
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='customer_global_tenant_links';
  IF NOT (coalesce(identities_rls,false) AND coalesce(links_rls,false)
      AND coalesce(identities_force,false) AND coalesce(links_force,false)) THEN
    RAISE EXCEPTION 'Global identity RLS/FORCE RLS missing';
  END IF;
  SELECT has_table_privilege('vendorai_app','public.customer_global_identities','SELECT'),
         has_table_privilege('vendorai_app','public.customer_global_tenant_links','SELECT')
    INTO app_identities_select,app_links_select;
  IF app_identities_select OR app_links_select THEN
    RAISE EXCEPTION 'Unexpected vendorai_app access to global identity tables';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('customer_global_identities','customer_global_tenant_links')
  ) THEN
    RAISE EXCEPTION 'Global identity access policies enabled too early';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='customer_global_tenant_link_unique_user'
      AND conrelid='public.customer_global_tenant_links'::regclass
  ) INTO cols_ok;
  IF NOT cols_ok THEN
    RAISE EXCEPTION 'Legacy account uniqueness constraint missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.customer_global_tenant_links'::regclass
      AND tgname='trg_guard_customer_global_tenant_link'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Tenant linkage integrity guard missing';
  END IF;
  RAISE NOTICE 'CUSTOMER_GLOBAL_IDENTITY_PREFLIGHT_OK';
END
$check$;
