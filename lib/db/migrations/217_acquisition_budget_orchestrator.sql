CREATE TABLE IF NOT EXISTS acquisition_budget_orchestrator (
  id text PRIMARY KEY DEFAULT 'global',
  currency text NOT NULL DEFAULT 'BRL',
  total_budget numeric(14,2) NOT NULL DEFAULT 0,
  period text NOT NULL DEFAULT 'monthly',
  autonomy text NOT NULL DEFAULT 'approval_required',
  active boolean NOT NULL DEFAULT false,
  guardrails jsonb NOT NULL DEFAULT '{"minimumEvidenceStarts":5,"maxShiftPercentPerCycle":20,"reservePercent":10,"minAllocationPercentPerBucket":5,"maxAllocationPercentPerBucket":45}'::jsonb,
  last_plan jsonb,
  last_plan_at timestamp,
  last_approved_at timestamp,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO acquisition_budget_orchestrator (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;
