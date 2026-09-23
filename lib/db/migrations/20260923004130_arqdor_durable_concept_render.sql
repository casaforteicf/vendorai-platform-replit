-- Generated with Supabase CLI; consumed by the existing versioned migration runner.
-- No replacement or deletion of historical renders.
ALTER TABLE arch_ai_renders
  ADD COLUMN IF NOT EXISTS concept_project_id text,
  ADD COLUMN IF NOT EXISTS job_input jsonb,
  ADD COLUMN IF NOT EXISTS job_lease_token text,
  ADD COLUMN IF NOT EXISTS job_lease_until timestamptz,
  ADD COLUMN IF NOT EXISTS job_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_prediction_id text,
  ADD COLUMN IF NOT EXISTS provider_submission_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS source varchar(20),
  ADD COLUMN IF NOT EXISTS render_view varchar(20);

CREATE INDEX IF NOT EXISTS arch_ai_renders_tenant_concept_created_idx
  ON arch_ai_renders (tenant_id, concept_project_id, created_at);
CREATE INDEX IF NOT EXISTS arch_ai_renders_pending_concept_idx
  ON arch_ai_renders (created_at, id, job_lease_until)
  WHERE job_input IS NOT NULL AND status IN ('queued', 'processando');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'arch_ai_renders'::regclass
      AND confrelid = 'arch_concept_projects'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE arch_ai_renders
      ADD CONSTRAINT arch_ai_renders_concept_project_id_fk
      FOREIGN KEY (concept_project_id) REFERENCES arch_concept_projects(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
