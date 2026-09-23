-- Arqdor Concept: permitir renders vinculados ao pré-projeto antes da promoção.
ALTER TABLE arch_ai_renders
  ADD COLUMN IF NOT EXISTS concept_project_id TEXT;

DO $$
BEGIN
  ALTER TABLE arch_ai_renders
    ADD CONSTRAINT arch_ai_renders_concept_project_id_fk
    FOREIGN KEY (concept_project_id)
    REFERENCES arch_concept_projects(id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS arch_ai_renders_concept_project_id_idx
  ON arch_ai_renders (concept_project_id);
