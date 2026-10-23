-- Harden security-definer/internal helper functions exposed through PostgREST.
--
-- Trigger/event-trigger functions must remain executable by the database/backend,
-- but must not be callable directly by browser-facing roles.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM authenticated';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.vendorai_create_order_work_card_on_won() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_create_order_work_card_on_won() FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_create_order_work_card_on_won() FROM authenticated';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.vendorai_log_deal_stage_event() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_log_deal_stage_event() FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_log_deal_stage_event() FROM authenticated';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.vendorai_log_work_card_stage_event() FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_log_work_card_stage_event() FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.vendorai_log_work_card_stage_event() FROM authenticated';
  END IF;
END $$;

-- Keep the restricted backend role explicit.
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO vendorai_app;
GRANT EXECUTE ON FUNCTION public.vendorai_create_order_work_card_on_won() TO vendorai_app;
GRANT EXECUTE ON FUNCTION public.vendorai_log_deal_stage_event() TO vendorai_app;
GRANT EXECUTE ON FUNCTION public.vendorai_log_work_card_stage_event() TO vendorai_app;

-- Foundational RLS helpers only use pg_catalog built-ins. Pinning search_path
-- removes object-hijacking risk and resolves the mutable-search-path advisory.
ALTER FUNCTION app_security.current_tenant_id()
  SET search_path = pg_catalog;

ALTER FUNCTION app_security.is_super_admin()
  SET search_path = pg_catalog;

ALTER FUNCTION app_security.set_tenant_context(text, boolean)
  SET search_path = pg_catalog;

COMMIT;
