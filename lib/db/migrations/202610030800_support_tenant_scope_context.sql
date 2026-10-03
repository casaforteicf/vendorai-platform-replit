-- Persist support tenant context and automatic scope classification.
ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS change_scope text,
  ADD COLUMN IF NOT EXISTS scope_reason text,
  ADD COLUMN IF NOT EXISTS tenant_context_snapshot jsonb;

CREATE INDEX IF NOT EXISTS bug_reports_change_scope_idx
  ON bug_reports (change_scope);

ALTER TABLE admin_improvements
  ADD COLUMN IF NOT EXISTS change_scope text,
  ADD COLUMN IF NOT EXISTS scope_reason text,
  ADD COLUMN IF NOT EXISTS tenant_context_snapshot jsonb;

CREATE INDEX IF NOT EXISTS admin_improvements_change_scope_idx
  ON admin_improvements (change_scope);
