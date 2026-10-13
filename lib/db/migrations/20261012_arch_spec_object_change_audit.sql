-- Apply to homologation before enabling the audited update endpoint.
CREATE TABLE IF NOT EXISTS arch_spec_object_change_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id TEXT NULL,
 project_id TEXT NOT NULL,
 spec_object_id UUID NOT NULL,
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
-- Preserve history even when a source component is deleted.
-- Database-level protection against accidental alteration of recorded changes.
CREATE OR REPLACE FUNCTION arch_spec_change_audit_append_only()
RETURNS trigger LANGUAGE plpgsql AS $
BEGIN
  RAISE EXCEPTION 'Technical change history is append-only';
END;
$;
DROP TRIGGER IF EXISTS trg_arch_spec_change_audit_append_only
 ON arch_spec_object_change_audit;
CREATE TRIGGER trg_arch_spec_change_audit_append_only
 BEFORE UPDATE OR DELETE ON arch_spec_object_change_audit
 FOR EACH ROW EXECUTE FUNCTION arch_spec_change_audit_append_only();
