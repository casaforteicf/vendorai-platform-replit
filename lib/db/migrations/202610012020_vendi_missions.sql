CREATE TABLE IF NOT EXISTS vendi_missions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'user',
  source_ref_id text,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'planning',
  priority integer NOT NULL DEFAULT 50,
  risk_policy text NOT NULL DEFAULT 'standard',
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb,
  success_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  last_error text,
  created_by_user_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendi_missions_tenant_status_idx ON vendi_missions(tenant_id, status);
CREATE INDEX IF NOT EXISTS vendi_missions_tenant_created_idx ON vendi_missions(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS vendi_mission_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id text NOT NULL REFERENCES vendi_missions(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  type text NOT NULL,
  tool_id text,
  status text NOT NULL DEFAULT 'recorded',
  input jsonb,
  output jsonb,
  error text,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendi_mission_events_mission_sequence_idx ON vendi_mission_events(mission_id, sequence);
CREATE INDEX IF NOT EXISTS vendi_mission_events_tenant_created_idx ON vendi_mission_events(tenant_id, created_at);
