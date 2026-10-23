-- Backend-only RLS for platform registries, plans, templates and global catalogs.
BEGIN;

REVOKE ALL ON TABLE public."app_template_versions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_template_versions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_template_versions" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_template_versions" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_template_versions";
CREATE POLICY vendorai_backend_access ON public."app_template_versions" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_action_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_action_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_action_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_action_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_action_registry";
CREATE POLICY vendorai_backend_access ON public."app_action_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."produtos_internos" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."produtos_internos" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."produtos_internos" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."produtos_internos" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."produtos_internos";
CREATE POLICY vendorai_backend_access ON public."produtos_internos" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_data_source_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_data_source_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_data_source_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_data_source_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_data_source_registry";
CREATE POLICY vendorai_backend_access ON public."app_data_source_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."finance_integration_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."finance_integration_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."finance_integration_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."finance_integration_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."finance_integration_registry";
CREATE POLICY vendorai_backend_access ON public."finance_integration_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."brand_programs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."brand_programs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."brand_programs" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."brand_programs" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."brand_programs";
CREATE POLICY vendorai_backend_access ON public."brand_programs" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."sdr_vertical_profiles" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."sdr_vertical_profiles" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."sdr_vertical_profiles" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."sdr_vertical_profiles" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."sdr_vertical_profiles";
CREATE POLICY vendorai_backend_access ON public."sdr_vertical_profiles" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."agent_defaults" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."agent_defaults" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."agent_defaults" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."agent_defaults" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."agent_defaults";
CREATE POLICY vendorai_backend_access ON public."agent_defaults" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_templates" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_templates" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_templates" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_templates" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_templates";
CREATE POLICY vendorai_backend_access ON public."app_templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_verticals" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_verticals" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_verticals" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_verticals" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_verticals";
CREATE POLICY vendorai_backend_access ON public."app_verticals" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."cnae_vertical_map" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."cnae_vertical_map" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."cnae_vertical_map" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."cnae_vertical_map" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."cnae_vertical_map";
CREATE POLICY vendorai_backend_access ON public."cnae_vertical_map" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."plans" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."plans" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."plans" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."plans" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."plans";
CREATE POLICY vendorai_backend_access ON public."plans" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."proposta_templates" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."proposta_templates" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."proposta_templates" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."proposta_templates" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."proposta_templates";
CREATE POLICY vendorai_backend_access ON public."proposta_templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."segment_benchmarks" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."segment_benchmarks" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."segment_benchmarks" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."segment_benchmarks" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."segment_benchmarks";
CREATE POLICY vendorai_backend_access ON public."segment_benchmarks" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."site_verticais" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."site_verticais" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."site_verticais" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."site_verticais" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."site_verticais";
CREATE POLICY vendorai_backend_access ON public."site_verticais" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_ai_policies" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_ai_policies" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_ai_policies" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_ai_policies" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_ai_policies";
CREATE POLICY vendorai_backend_access ON public."app_ai_policies" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_component_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_component_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_component_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_component_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_component_registry";
CREATE POLICY vendorai_backend_access ON public."app_component_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_feature_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_feature_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_feature_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_feature_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_feature_registry";
CREATE POLICY vendorai_backend_access ON public."app_feature_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."app_workflow_registry" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_workflow_registry" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."app_workflow_registry" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."app_workflow_registry" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."app_workflow_registry";
CREATE POLICY vendorai_backend_access ON public."app_workflow_registry" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."plan_modules" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."plan_modules" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."plan_modules" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."plan_modules" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."plan_modules";
CREATE POLICY vendorai_backend_access ON public."plan_modules" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."changelog_entries" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."changelog_entries" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public."changelog_entries" FROM authenticated';
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."changelog_entries" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."changelog_entries";
CREATE POLICY vendorai_backend_access ON public."changelog_entries" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

COMMIT;
