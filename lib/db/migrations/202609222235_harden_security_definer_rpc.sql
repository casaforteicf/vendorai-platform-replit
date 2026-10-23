-- Harden existing internal functions without inventing legacy Supabase helpers.
-- New trigger functions receive the same ACL in their defining migrations 205/210.
BEGIN;

DO $vendi_hardening$
DECLARE
  signature text;
  target regprocedure;
  browser_role text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.rls_auto_enable()', 'public.vendorai_create_order_work_card_on_won()', 'public.vendorai_log_deal_stage_event()', 'public.vendorai_log_work_card_stage_event()']
  LOOP
    target := to_regprocedure(signature);
    IF target IS NULL THEN
      CONTINUE; -- Optional legacy helper or function created later by 205/210.
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', target);
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF to_regrole(browser_role) IS NOT NULL THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', target, browser_role);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO vendorai_app', target);
  END LOOP;
END
$vendi_hardening$;

-- Foundational RLS helpers only use pg_catalog built-ins. Pinning search_path
-- removes object-hijacking risk and resolves the mutable-search-path advisory.
ALTER FUNCTION app_security.current_tenant_id()
  SET search_path = pg_catalog;

ALTER FUNCTION app_security.is_super_admin()
  SET search_path = pg_catalog;

ALTER FUNCTION app_security.set_tenant_context(text, boolean)
  SET search_path = pg_catalog;

COMMIT;
