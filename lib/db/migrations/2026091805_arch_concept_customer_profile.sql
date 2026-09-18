ALTER TABLE "arch_concept_projects"
  ADD COLUMN IF NOT EXISTS "customer_profile" jsonb NOT NULL DEFAULT '{}'::jsonb;
