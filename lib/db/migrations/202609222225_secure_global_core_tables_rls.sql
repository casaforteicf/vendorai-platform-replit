-- Secure global core tables that are server/API managed.
--
-- These tables are intentionally not tenant_id tables:
--   tenants                -> platform/global registry
--   segment_templates      -> shared marketplace templates
--   password_reset_tokens  -> server-only authentication secret material
--
-- The browser must never query them directly through Supabase PostgREST.
-- Runtime access is restricted to the internal vendorai_app database role;
-- postgres/service_role keep their normal owner/BYPASSRLS behavior.

BEGIN;

REVOKE ALL ON TABLE public.tenants,
  public.segment_templates,
  public.password_reset_tokens FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.tenants,
  public.segment_templates,
  public.password_reset_tokens FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.tenants,
  public.segment_templates,
  public.password_reset_tokens FROM authenticated';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.tenants,
  public.segment_templates,
  public.password_reset_tokens
TO vendorai_app;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_backend_access ON public.tenants;
CREATE POLICY vendorai_backend_access
  ON public.tenants
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS vendorai_backend_access ON public.segment_templates;
CREATE POLICY vendorai_backend_access
  ON public.segment_templates
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS vendorai_backend_access ON public.password_reset_tokens;
CREATE POLICY vendorai_backend_access
  ON public.password_reset_tokens
  AS PERMISSIVE
  FOR ALL
  TO vendorai_app
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY vendorai_backend_access ON public.tenants IS
  'Backend-only access. Browser roles anon/authenticated are explicitly revoked. API authorization remains the boundary for the global tenant registry.';

COMMENT ON POLICY vendorai_backend_access ON public.segment_templates IS
  'Backend-only access. Public marketplace reads continue through the VendorAI API, which filters active/ready templates.';

COMMENT ON POLICY vendorai_backend_access ON public.password_reset_tokens IS
  'Backend-only access to hashed password reset tokens. Browser roles are explicitly denied direct table access.';

COMMIT;
