-- Active backend queues/config + explicit deny for legacy/admin-only tables.
BEGIN;

REVOKE ALL ON TABLE public."reactivation_queue" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."reactivation_queue" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."reactivation_queue" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."reactivation_queue" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."reactivation_queue";
CREATE POLICY vendorai_backend_access ON public."reactivation_queue" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."partner_prospector_jobs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."partner_prospector_jobs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."partner_prospector_jobs" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."partner_prospector_jobs" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."partner_prospector_jobs";
CREATE POLICY vendorai_backend_access ON public."partner_prospector_jobs" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."acquisition_budget_orchestrator" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."acquisition_budget_orchestrator" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."acquisition_budget_orchestrator" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."acquisition_budget_orchestrator" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."acquisition_budget_orchestrator";
CREATE POLICY vendorai_backend_access ON public."acquisition_budget_orchestrator" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."instagram_corrected_publish_assets_stage" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."instagram_corrected_publish_assets_stage" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."instagram_corrected_publish_assets_stage" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."instagram_corrected_publish_assets_stage" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."instagram_corrected_publish_assets_stage";
CREATE POLICY vendorai_backend_access ON public."instagram_corrected_publish_assets_stage" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."referrals" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."referrals" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."referrals" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."referrals";
CREATE POLICY vendorai_intentionally_blocked ON public."referrals" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public."vendorai_schema_migrations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."vendorai_schema_migrations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."vendorai_schema_migrations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON public."vendorai_schema_migrations";
CREATE POLICY vendorai_intentionally_blocked ON public."vendorai_schema_migrations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

COMMIT;
