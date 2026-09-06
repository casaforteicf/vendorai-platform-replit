CREATE TABLE IF NOT EXISTS jarvis_cases (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  signal_key text NOT NULL,
  source text NOT NULL DEFAULT 'internal',
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  metric text,
  confidence integer,
  impact integer,
  href text,
  status text NOT NULL DEFAULT 'open',
  evidence jsonb,
  recommended_action text,
  result_summary text,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS jarvis_cases_tenant_signal_idx
  ON jarvis_cases (tenant_id, signal_key);

CREATE INDEX IF NOT EXISTS jarvis_cases_tenant_updated_idx
  ON jarvis_cases (tenant_id, updated_at DESC);
