-- Technical approvals for Specification items.
CREATE TABLE IF NOT EXISTS arch_spec_object_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NULL,
  spec_object_id UUID NOT NULL REFERENCES arch_spec_objects(id) ON DELETE CASCADE,
  approval_context TEXT NOT NULL,
  decision TEXT NOT NULL,
  actor_id TEXT NULL,
  actor_name TEXT NULL,
  note TEXT NULL,
  project_revision TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT arch_spec_object_approval_context_chk
    CHECK (approval_context IN ('technical','architect','client','fabrication','installation')),
  CONSTRAINT arch_spec_object_approval_decision_chk
    CHECK (decision IN ('approved','rejected','revision_requested'))
);

CREATE INDEX IF NOT EXISTS idx_arch_spec_object_approvals_object
  ON arch_spec_object_approvals (spec_object_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arch_spec_object_approvals_context
  ON arch_spec_object_approvals (tenant_id, approval_context, decision, created_at DESC);

ALTER TABLE arch_spec_objects
  ADD COLUMN IF NOT EXISTS technical_approval_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS technical_approved_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS technical_approved_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS technical_approval_note TEXT NULL;

ALTER TABLE arch_spec_objects
  DROP CONSTRAINT IF EXISTS arch_spec_objects_technical_approval_status_chk;

ALTER TABLE arch_spec_objects
  ADD CONSTRAINT arch_spec_objects_technical_approval_status_chk
    CHECK (technical_approval_status IN ('pending','approved','rejected','revision_requested'));
