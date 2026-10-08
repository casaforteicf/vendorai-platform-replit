CREATE TABLE IF NOT EXISTS "prospects" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" text REFERENCES "crm_companies_master"("id") ON DELETE SET NULL,
  "display_name" text,
  "phone" text,
  "email" text,
  "website" text,
  "address" text,
  "segment" text,
  "city" text,
  "source" text DEFAULT 'prospector' NOT NULL,
  "source_ref" text,
  "stage" text DEFAULT 'encontrado' NOT NULL,
  "fit_score" integer,
  "vendorai_fit_score" integer,
  "arqdor_fit_score" integer,
  "recommended_solution" text DEFAULT 'undefined' NOT NULL,
  "primary_hook" text,
  "current_state" text,
  "current_objective" text,
  "next_best_action" text,
  "next_best_action_reason" text,
  "next_action_at" timestamptz,
  "qualification_score" integer,
  "meeting_readiness_score" integer,
  "account_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "qualification" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "opportunity_summary" text,
  "assigned_user_id" text,
  "assigned_agent_id" text,
  "last_interaction_at" timestamptz,
  "converted_lead_id" text REFERENCES "leads"("id") ON DELETE SET NULL,
  "converted_deal_id" text REFERENCES "deals"("id") ON DELETE SET NULL,
  "converted_at" timestamptz,
  "archived_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "prospects_fit_score_range" CHECK ("fit_score" IS NULL OR ("fit_score" >= 0 AND "fit_score" <= 100)),
  CONSTRAINT "prospects_vendorai_fit_score_range" CHECK ("vendorai_fit_score" IS NULL OR ("vendorai_fit_score" >= 0 AND "vendorai_fit_score" <= 100)),
  CONSTRAINT "prospects_arqdor_fit_score_range" CHECK ("arqdor_fit_score" IS NULL OR ("arqdor_fit_score" >= 0 AND "arqdor_fit_score" <= 100)),
  CONSTRAINT "prospects_qualification_score_range" CHECK ("qualification_score" IS NULL OR ("qualification_score" >= 0 AND "qualification_score" <= 100)),
  CONSTRAINT "prospects_meeting_readiness_score_range" CHECK ("meeting_readiness_score" IS NULL OR ("meeting_readiness_score" >= 0 AND "meeting_readiness_score" <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS "prospects_tenant_company_uidx"
  ON "prospects" ("tenant_id", "company_id");
CREATE UNIQUE INDEX IF NOT EXISTS "prospects_tenant_source_ref_uidx"
  ON "prospects" ("tenant_id", "source", "source_ref");
CREATE INDEX IF NOT EXISTS "prospects_tenant_stage_idx"
  ON "prospects" ("tenant_id", "stage");
CREATE INDEX IF NOT EXISTS "prospects_next_action_idx"
  ON "prospects" ("tenant_id", "next_action_at");

ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "commercial_use" boolean DEFAULT false NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "products" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "segments" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "personas" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "pains" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "prospect_stages" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "objectives" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "channels" jsonb DEFAULT '[]'::jsonb NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "auto_send_allowed" boolean DEFAULT false NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "approval_status" text DEFAULT 'draft' NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "content_version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "valid_from" timestamp;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "valid_until" timestamp;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "generated_by_ai" boolean DEFAULT false NOT NULL;
ALTER TABLE "content_library" ADD COLUMN IF NOT EXISTS "generation_context" jsonb DEFAULT '{}'::jsonb NOT NULL;


CREATE TABLE IF NOT EXISTS "prospect_interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "prospect_id" text NOT NULL REFERENCES "prospects"("id") ON DELETE CASCADE,
  "person_id" text,
  "direction" text NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "content" text,
  "subject" text,
  "external_id" text,
  "material_id" text REFERENCES "content_library"("id") ON DELETE SET NULL,
  "objective" text,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scheduled_at" timestamptz,
  "sent_at" timestamptz,
  "occurred_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "prospect_interactions_tenant_prospect_idx"
  ON "prospect_interactions" ("tenant_id", "prospect_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "prospect_interactions_scheduled_idx"
  ON "prospect_interactions" ("tenant_id", "status", "scheduled_at");
