-- Explicit deny policies for dormant VendorAI foundation schemas.
-- vendorai_app currently has zero table grants on these objects; this migration
-- preserves that inactive state while making the RLS posture intentional.

BEGIN;

REVOKE ALL ON TABLE "ai"."agents" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."agents";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."agents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."conversations" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."conversations";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."conversations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."embeddings" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."embeddings";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."embeddings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."messages" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."messages";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."messages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "audit"."logs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "audit"."logs";
CREATE POLICY vendorai_intentionally_blocked ON "audit"."logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."pipeline_stages" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."pipeline_stages";
CREATE POLICY vendorai_intentionally_blocked ON "business"."pipeline_stages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."products" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."products";
CREATE POLICY vendorai_intentionally_blocked ON "business"."products" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."services" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."services";
CREATE POLICY vendorai_intentionally_blocked ON "business"."services" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."ai_agents" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."ai_agents";
CREATE POLICY vendorai_intentionally_blocked ON "core"."ai_agents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."business_profiles" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."business_profiles";
CREATE POLICY vendorai_intentionally_blocked ON "core"."business_profiles" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_contacts" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_contacts";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_contacts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_deals" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_deals";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_deals" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_pipelines" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_pipelines";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_pipelines" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_stages" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_stages";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_stages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."dashboard_configs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."dashboard_configs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."dashboard_configs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."integrations" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."integrations";
CREATE POLICY vendorai_intentionally_blocked ON "core"."integrations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."knowledge_sources" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."knowledge_sources";
CREATE POLICY vendorai_intentionally_blocked ON "core"."knowledge_sources" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."permissions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."permissions";
CREATE POLICY vendorai_intentionally_blocked ON "core"."permissions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."provisioning_jobs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."provisioning_jobs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."provisioning_jobs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."provisioning_logs" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."provisioning_logs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."provisioning_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."role_permissions" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."role_permissions";
CREATE POLICY vendorai_intentionally_blocked ON "core"."role_permissions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."roles" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."roles";
CREATE POLICY vendorai_intentionally_blocked ON "core"."roles" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenant_settings" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenant_settings";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenant_settings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenant_templates" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenant_templates";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenant_templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenants" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenants";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenants" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "executive"."kpis" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "executive"."kpis";
CREATE POLICY vendorai_intentionally_blocked ON "executive"."kpis" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "knowledge"."assets" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "knowledge"."assets";
CREATE POLICY vendorai_intentionally_blocked ON "knowledge"."assets" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "knowledge"."documents" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "knowledge"."documents";
CREATE POLICY vendorai_intentionally_blocked ON "knowledge"."documents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."assignments" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."assignments";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."assignments" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."channels" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."channels";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."channels" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."conversations" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."conversations";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."conversations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."messages" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."messages";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."messages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."queues" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."queues";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."queues" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."templates" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."templates";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."appointments" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."appointments";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."appointments" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."calendar_integrations" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."calendar_integrations";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."calendar_integrations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."calendars" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."calendars";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."calendars" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."confirmations" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."confirmations";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."confirmations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."resources" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."resources";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."resources" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."waiting_list" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."waiting_list";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."waiting_list" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "system"."events" FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "system"."events";
CREATE POLICY vendorai_intentionally_blocked ON "system"."events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

COMMIT;
