CREATE TABLE IF NOT EXISTS tenant_lead_capture_tools (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tool_key text NOT NULL,
  tool_label text NOT NULL,
  vertical text,
  delivery_type text NOT NULL DEFAULT 'tool',
  enabled boolean NOT NULL DEFAULT true,
  free_policy jsonb NOT NULL DEFAULT '{"mode":"uses","limit":1}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT tenant_lead_capture_tools_tenant_tool_unique UNIQUE (tenant_id, tool_key)
);

CREATE TABLE IF NOT EXISTS lead_capture_campaigns (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  audience text,
  magnets jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_tool_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_capture_campaigns_tenant_idx ON lead_capture_campaigns(tenant_id);

CREATE TABLE IF NOT EXISTS lead_capture_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id text REFERENCES lead_capture_campaigns(id) ON DELETE CASCADE,
  lead_id text,
  event_type text NOT NULL,
  magnet_id text,
  tool_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_capture_events_tenant_campaign_idx
  ON lead_capture_events(tenant_id, campaign_id);
