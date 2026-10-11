-- MULTI-04.2: rollback-safe snapshots for an explicitly authorized Arqdor restoration.
-- NOT applied automatically. Validate in isolated database before rollout.
CREATE TABLE IF NOT EXISTS arch_concept_restore_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  concept_id text NOT NULL,
  actor_user_id text NOT NULL,
  operation_id text NOT NULL,
  base_updated_at timestamp NOT NULL,
  restored_updated_at timestamp NOT NULL,
  previous_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arch_concept_restore_audit_idempotency UNIQUE (tenant_id, concept_id, operation_id)
);
CREATE INDEX IF NOT EXISTS arch_concept_restore_audit_project_idx
  ON arch_concept_restore_audit (tenant_id, concept_id, created_at DESC);
-- No generic public SELECT privilege should be granted on this table.
