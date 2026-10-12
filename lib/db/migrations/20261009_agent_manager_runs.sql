-- AGENT-01: durable audit of actual scans (not merely configured schedules).
CREATE TABLE IF NOT EXISTS public.agent_manager_runs (
  tenant_id text NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  domain text NOT NULL,
  period_key text NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL DEFAULT 'completed',
  finding_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, domain, period_key)
);
CREATE INDEX IF NOT EXISTS agent_manager_runs_recent_idx
  ON public.agent_manager_runs(domain, checked_at DESC);
