-- MULTI-07 membership audit. Stage-only until reviewed and applied in release order.
CREATE TABLE IF NOT EXISTS arqdor_workspace_member_audit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('grant', 'change', 'revoke')),
  previous_permission TEXT,
  next_permission TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_member_audit_project_fk
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES arqdor_workspace_projects(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS arqdor_member_audit_project_idx
  ON arqdor_workspace_member_audit (tenant_id, project_id, created_at);
-- No backfill. New events are recorded in the same transaction as membership changes.
