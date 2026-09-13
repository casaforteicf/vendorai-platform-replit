ALTER TABLE follower_growth_daily_approvals
  ADD COLUMN IF NOT EXISTS execution_evidence_type text,
  ADD COLUMN IF NOT EXISTS execution_evidence_id text,
  ADD COLUMN IF NOT EXISTS execution_evidence_label text,
  ADD COLUMN IF NOT EXISTS execution_evidence_at timestamptz;

CREATE INDEX IF NOT EXISTS follower_growth_daily_approvals_evidence_idx
  ON follower_growth_daily_approvals (tenant_id, approval_date, execution_evidence_type, execution_evidence_id);
