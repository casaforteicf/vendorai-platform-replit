ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS conversation_id uuid,
  ADD COLUMN IF NOT EXISTS resolvido_por text;

CREATE UNIQUE INDEX IF NOT EXISTS bug_reports_tenant_conversation_idx
  ON bug_reports (tenant_id, conversation_id)
  WHERE conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bug_reports_status_created_idx
  ON bug_reports (status, created_at DESC);
