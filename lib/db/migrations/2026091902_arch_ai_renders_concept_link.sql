ALTER TABLE "arch_ai_renders"
  ALTER COLUMN "project_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "concept_project_id" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'arch_ai_renders_concept_project_id_fk'
      AND conrelid = 'public.arch_ai_renders'::regclass
  ) THEN
    ALTER TABLE "arch_ai_renders"
      ADD CONSTRAINT "arch_ai_renders_concept_project_id_fk"
      FOREIGN KEY ("concept_project_id")
      REFERENCES "public"."arch_concept_projects"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_arch_ai_renders_concept_project_created"
  ON "arch_ai_renders" ("tenant_id", "concept_project_id", "created_at")
  WHERE "concept_project_id" IS NOT NULL;
