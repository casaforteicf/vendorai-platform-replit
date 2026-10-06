-- Tenant Custom Integrations — API, webhook e n8n por tenant
CREATE TABLE IF NOT EXISTS tenant_custom_integrations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured',
  base_url text,
  auth_type text NOT NULL DEFAULT 'none',
  credential_encrypted text,
  webhook_secret_encrypted text,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_test_at timestamptz,
  last_success_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_custom_integrations_kind_chk CHECK (kind IN ('api','webhook','n8n')),
  CONSTRAINT tenant_custom_integrations_status_chk CHECK (status IN ('connected','attention','error','disabled','not_configured')),
  CONSTRAINT tenant_custom_integrations_auth_chk CHECK (auth_type IN ('none','api_key','bearer','basic'))
);

CREATE INDEX IF NOT EXISTS tenant_custom_integrations_tenant_idx ON tenant_custom_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS tenant_custom_integrations_status_idx ON tenant_custom_integrations(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_custom_integrations TO vendorai_app;

ALTER TABLE tenant_custom_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_custom_integrations_tenant_policy ON tenant_custom_integrations;
CREATE POLICY tenant_custom_integrations_tenant_policy ON tenant_custom_integrations
  FOR ALL TO vendorai_app
  USING (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin())
  WITH CHECK (tenant_id = app_security.current_tenant_id() OR app_security.is_super_admin());
