CREATE TABLE IF NOT EXISTS follower_growth_daily_approvals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_date date NOT NULL DEFAULT CURRENT_DATE,
  action_type text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by_user_id text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, approval_date, action_type, source_id)
);

CREATE INDEX IF NOT EXISTS follower_growth_daily_approvals_tenant_date_idx
  ON follower_growth_daily_approvals (tenant_id, approval_date DESC, status);
