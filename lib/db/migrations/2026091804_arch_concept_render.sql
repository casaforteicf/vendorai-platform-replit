ALTER TABLE "arch_concept_projects"
  ADD COLUMN IF NOT EXISTS "concept_render" jsonb NOT NULL DEFAULT '{}'::jsonb;
