ALTER TABLE follower_growth_daily_approvals
  ADD COLUMN IF NOT EXISTS execution_status text NOT NULL DEFAULT 'released',
  ADD COLUMN IF NOT EXISTS execution_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS executed_by_user_id text;

CREATE INDEX IF NOT EXISTS follower_growth_daily_approvals_execution_idx
  ON follower_growth_daily_approvals (tenant_id, approval_date, status, execution_status, updated_at DESC);
