CREATE TABLE IF NOT EXISTS "arch_concept_projects" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "arch_projeto_id" text,
  "title" varchar(255) DEFAULT 'Meu pré-projeto' NOT NULL,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "lot" jsonb NOT NULL,
  "configuration" jsonb NOT NULL,
  "rooms" jsonb NOT NULL,
  "opening_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "customer_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "facade_preferences" jsonb DEFAULT '{"style":"contemporaneo","roof":"platibanda","primaryMaterial":"pintura","accentMaterial":"madeira","facadeTone":"claro","frameTone":"preto","landscaping":"medio"}'::jsonb NOT NULL,
  "concept_render" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "selected_variant" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "arch_concept_projects_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "arch_concept_projects_owner_user_id_users_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "arch_concept_projects_arch_projeto_id_arch_projetos_id_fk"
    FOREIGN KEY ("arch_projeto_id") REFERENCES "public"."arch_projetos"("id") ON DELETE set null ON UPDATE no action
);

CREATE INDEX IF NOT EXISTS "arch_concept_projects_tenant_owner_updated_idx"
  ON "arch_concept_projects" ("tenant_id", "owner_user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "arch_concept_projects_arch_projeto_idx"
  ON "arch_concept_projects" ("arch_projeto_id")
  WHERE "arch_projeto_id" IS NOT NULL;

ALTER TABLE "arch_concept_projects" ENABLE ROW LEVEL SECURITY;
