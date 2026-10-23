-- Explicit deny policies for dormant VendorAI foundation schemas.
-- vendorai_app currently has zero table grants on these objects; this migration
-- preserves that inactive state while making the RLS posture intentional.

BEGIN;

REVOKE ALL ON TABLE "ai"."agents" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."agents" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."agents" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."agents";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."agents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."conversations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."conversations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."conversations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."conversations";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."conversations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."embeddings" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."embeddings" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."embeddings" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."embeddings";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."embeddings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "ai"."messages" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."messages" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "ai"."messages" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "ai"."messages";
CREATE POLICY vendorai_intentionally_blocked ON "ai"."messages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "audit"."logs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "audit"."logs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "audit"."logs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "audit"."logs";
CREATE POLICY vendorai_intentionally_blocked ON "audit"."logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."pipeline_stages" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."pipeline_stages" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."pipeline_stages" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."pipeline_stages";
CREATE POLICY vendorai_intentionally_blocked ON "business"."pipeline_stages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."products" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."products" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."products" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."products";
CREATE POLICY vendorai_intentionally_blocked ON "business"."products" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "business"."services" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."services" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "business"."services" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "business"."services";
CREATE POLICY vendorai_intentionally_blocked ON "business"."services" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."ai_agents" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."ai_agents" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."ai_agents" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."ai_agents";
CREATE POLICY vendorai_intentionally_blocked ON "core"."ai_agents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."business_profiles" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."business_profiles" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."business_profiles" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."business_profiles";
CREATE POLICY vendorai_intentionally_blocked ON "core"."business_profiles" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_contacts" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_contacts" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_contacts" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_contacts";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_contacts" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_deals" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_deals" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_deals" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_deals";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_deals" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_pipelines" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_pipelines" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_pipelines" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_pipelines";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_pipelines" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."crm_stages" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_stages" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."crm_stages" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."crm_stages";
CREATE POLICY vendorai_intentionally_blocked ON "core"."crm_stages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."dashboard_configs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."dashboard_configs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."dashboard_configs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."dashboard_configs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."dashboard_configs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."integrations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."integrations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."integrations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."integrations";
CREATE POLICY vendorai_intentionally_blocked ON "core"."integrations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."knowledge_sources" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."knowledge_sources" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."knowledge_sources" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."knowledge_sources";
CREATE POLICY vendorai_intentionally_blocked ON "core"."knowledge_sources" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."permissions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."permissions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."permissions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."permissions";
CREATE POLICY vendorai_intentionally_blocked ON "core"."permissions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."provisioning_jobs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."provisioning_jobs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."provisioning_jobs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."provisioning_jobs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."provisioning_jobs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."provisioning_logs" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."provisioning_logs" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."provisioning_logs" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."provisioning_logs";
CREATE POLICY vendorai_intentionally_blocked ON "core"."provisioning_logs" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."role_permissions" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."role_permissions" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."role_permissions" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."role_permissions";
CREATE POLICY vendorai_intentionally_blocked ON "core"."role_permissions" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."roles" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."roles" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."roles" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."roles";
CREATE POLICY vendorai_intentionally_blocked ON "core"."roles" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenant_settings" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenant_settings" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenant_settings" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenant_settings";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenant_settings" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenant_templates" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenant_templates" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenant_templates" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenant_templates";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenant_templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "core"."tenants" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenants" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "core"."tenants" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "core"."tenants";
CREATE POLICY vendorai_intentionally_blocked ON "core"."tenants" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "executive"."kpis" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "executive"."kpis" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "executive"."kpis" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "executive"."kpis";
CREATE POLICY vendorai_intentionally_blocked ON "executive"."kpis" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "knowledge"."assets" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "knowledge"."assets" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "knowledge"."assets" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "knowledge"."assets";
CREATE POLICY vendorai_intentionally_blocked ON "knowledge"."assets" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "knowledge"."documents" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "knowledge"."documents" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "knowledge"."documents" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "knowledge"."documents";
CREATE POLICY vendorai_intentionally_blocked ON "knowledge"."documents" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."assignments" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."assignments" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."assignments" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."assignments";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."assignments" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."channels" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."channels" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."channels" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."channels";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."channels" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."conversations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."conversations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."conversations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."conversations";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."conversations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."messages" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."messages" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."messages" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."messages";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."messages" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."queues" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."queues" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."queues" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."queues";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."queues" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "omnichannel"."templates" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."templates" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "omnichannel"."templates" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "omnichannel"."templates";
CREATE POLICY vendorai_intentionally_blocked ON "omnichannel"."templates" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."appointments" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."appointments" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."appointments" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."appointments";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."appointments" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."calendar_integrations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."calendar_integrations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."calendar_integrations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."calendar_integrations";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."calendar_integrations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."calendars" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."calendars" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."calendars" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."calendars";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."calendars" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."confirmations" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."confirmations" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."confirmations" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."confirmations";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."confirmations" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."resources" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."resources" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."resources" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."resources";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."resources" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "schedule"."waiting_list" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."waiting_list" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "schedule"."waiting_list" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "schedule"."waiting_list";
CREATE POLICY vendorai_intentionally_blocked ON "schedule"."waiting_list" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE "system"."events" FROM PUBLIC;
DO $$
BEGIN
  IF to_regrole('anon') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "system"."events" FROM anon';
  END IF;
  IF to_regrole('authenticated') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "system"."events" FROM authenticated';
  END IF;
END $$;
DROP POLICY IF EXISTS vendorai_intentionally_blocked ON "system"."events";
CREATE POLICY vendorai_intentionally_blocked ON "system"."events" AS PERMISSIVE FOR ALL TO vendorai_app USING (false) WITH CHECK (false);

COMMIT;
