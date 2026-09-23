-- Primary selection is independent of mutable concept draft JSON.
ALTER TABLE arch_ai_renders ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS arch_ai_renders_concept_primary_idx
  ON arch_ai_renders (tenant_id, concept_project_id)
  WHERE is_primary = true AND concept_project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS arch_ai_renders_regeneration_key_idx
  ON arch_ai_renders (tenant_id, (job_input->>'regenerationKey'))
  WHERE job_input->>'regenerationKey' IS NOT NULL;
