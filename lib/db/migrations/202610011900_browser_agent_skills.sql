CREATE TABLE IF NOT EXISTS browser_agent_skills (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id text REFERENCES browser_agent_connections(id) ON DELETE SET NULL,
  name text NOT NULL,
  start_url text NOT NULL,
  allowed_hosts jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_agent_skills_tenant_name_unique
  ON browser_agent_skills(tenant_id, name);

CREATE INDEX IF NOT EXISTS browser_agent_skills_tenant_idx
  ON browser_agent_skills(tenant_id);
