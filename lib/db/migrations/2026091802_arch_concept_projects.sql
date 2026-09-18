CREATE TABLE IF NOT EXISTS "arch_concept_projects" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "arch_projeto_id" text REFERENCES "arch_projetos"("id") ON DELETE SET NULL,
  "title" varchar(255) NOT NULL DEFAULT 'Meu pré-projeto',
  "status" varchar(30) NOT NULL DEFAULT 'draft',
  "current_step" integer NOT NULL DEFAULT 0,
  "lot" jsonb NOT NULL,
  "configuration" jsonb NOT NULL,
  "rooms" jsonb NOT NULL,
  "opening_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "selected_variant" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "arch_concept_projects_tenant_idx"
  ON "arch_concept_projects" ("tenant_id");

CREATE INDEX IF NOT EXISTS "arch_concept_projects_owner_idx"
  ON "arch_concept_projects" ("owner_user_id");

CREATE INDEX IF NOT EXISTS "arch_concept_projects_updated_idx"
  ON "arch_concept_projects" ("updated_at" DESC);
