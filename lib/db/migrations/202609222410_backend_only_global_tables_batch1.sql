-- Backend-only RLS for global/shared and server-internal tables.
-- These tables intentionally have no tenant_id. Direct browser roles remain revoked.

BEGIN;

REVOKE ALL ON TABLE public."vie_sources" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."vie_sources" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."vie_sources";
CREATE POLICY vendorai_backend_access ON public."vie_sources" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."vie_items" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."vie_items" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."vie_items";
CREATE POLICY vendorai_backend_access ON public."vie_items" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."commercial_product_profiles" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."commercial_product_profiles" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."commercial_product_profiles";
CREATE POLICY vendorai_backend_access ON public."commercial_product_profiles" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."product_usage_quotas" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."product_usage_quotas" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."product_usage_quotas";
CREATE POLICY vendorai_backend_access ON public."product_usage_quotas" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."usage_metrics" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."usage_metrics" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."usage_metrics";
CREATE POLICY vendorai_backend_access ON public."usage_metrics" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."consumption_pack_definitions" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."consumption_pack_definitions" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."consumption_pack_definitions";
CREATE POLICY vendorai_backend_access ON public."consumption_pack_definitions" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."prospecting_objections" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."prospecting_objections" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."prospecting_objections";
CREATE POLICY vendorai_backend_access ON public."prospecting_objections" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."site_contatos" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."site_contatos" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."site_contatos";
CREATE POLICY vendorai_backend_access ON public."site_contatos" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public."instagram_publish_staging_v2" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."instagram_publish_staging_v2" TO vendorai_app;
DROP POLICY IF EXISTS vendorai_backend_access ON public."instagram_publish_staging_v2";
CREATE POLICY vendorai_backend_access ON public."instagram_publish_staging_v2" AS PERMISSIVE FOR ALL TO vendorai_app USING (true) WITH CHECK (true);

COMMIT;
