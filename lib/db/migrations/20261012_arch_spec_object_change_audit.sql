-- Apply to homologation before enabling the audited update endpoint.
CREATE TABLE IF NOT EXISTS arch_spec_object_change_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id TEXT NULL,
 project_id TEXT NOT NULL,
 spec_object_id UUID NOT NULL REFERENCES arch_spec_objects(id) ON DELETE CASCADE,
 actor_id TEXT NULL,
 actor_name TEXT NULL,
 project_revision TEXT NULL,
 changes JSONB NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arch_spec_change_audit_object
 ON arch_spec_object_change_audit (spec_object_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_arch_spec_change_audit_tenant_project
 ON arch_spec_object_change_audit (tenant_id, project_id, occurred_at DESC);
-- Ledger is insert-only for normal application use; deletion is reserved for database maintenance.
