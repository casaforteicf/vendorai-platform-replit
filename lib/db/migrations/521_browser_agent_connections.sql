CREATE TABLE IF NOT EXISTS browser_agent_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_url text NOT NULL,
  allowed_hosts jsonb NOT NULL DEFAULT '[]'::jsonb,
  username_encrypted text,
  password_encrypted text,
  cookies_encrypted text,
  last_used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_agent_connections_tenant_name_unique
  ON browser_agent_connections(tenant_id, name);

CREATE INDEX IF NOT EXISTS browser_agent_connections_tenant_idx
  ON browser_agent_connections(tenant_id);
