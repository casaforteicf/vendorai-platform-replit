CREATE TABLE IF NOT EXISTS growth_lab_promises (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promise text NOT NULL,
  lp_name text NOT NULL DEFAULT 'Nova promessa',
  lp_path text,
  source text NOT NULL DEFAULT 'manual',
  capability_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'review',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS growth_lab_promises_tenant_created_idx
  ON growth_lab_promises (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS growth_lab_promises_tenant_status_idx
  ON growth_lab_promises (tenant_id, status);

CREATE TABLE IF NOT EXISTS growth_lab_backlog (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  capability_id text NOT NULL,
  capability_name text NOT NULL,
  module text NOT NULL,
  current_status text NOT NULL DEFAULT 'missing',
  affected_promises integer NOT NULL DEFAULT 0,
  priority_score integer NOT NULL DEFAULT 0,
  action text NOT NULL DEFAULT 'complete_product',
  state text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_lab_backlog_tenant_capability_uq
  ON growth_lab_backlog (tenant_id, capability_id);

CREATE INDEX IF NOT EXISTS growth_lab_backlog_tenant_priority_idx
  ON growth_lab_backlog (tenant_id, priority_score DESC, created_at DESC);
