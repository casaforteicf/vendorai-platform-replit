CREATE TABLE IF NOT EXISTS "user_functions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_functions_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_functions_tenant_name_unique"
  ON "user_functions" ("tenant_id", lower("name"));

CREATE INDEX IF NOT EXISTS "user_functions_tenant_idx"
  ON "user_functions" ("tenant_id");

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "custom_function_id" text;

DO $$
BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_custom_function_id_user_functions_id_fk"
    FOREIGN KEY ("custom_function_id")
    REFERENCES "user_functions"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "users_custom_function_id_idx"
  ON "users" ("custom_function_id");
