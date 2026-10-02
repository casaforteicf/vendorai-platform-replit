-- Customer Intelligence V2: saúde do relacionamento, rastreabilidade e histórico.
-- Compatível com o modelo legado: churn_risk e churn_reasons permanecem disponíveis.

ALTER TABLE "customer_intelligence"
  ADD COLUMN IF NOT EXISTS "health_score" integer,
  ADD COLUMN IF NOT EXISTS "health_status" text,
  ADD COLUMN IF NOT EXISTS "risk_type" text,
  ADD COLUMN IF NOT EXISTS "risk_level" text,
  ADD COLUMN IF NOT EXISTS "risk_trend" text,
  ADD COLUMN IF NOT EXISTS "analysis_confidence" integer,
  ADD COLUMN IF NOT EXISTS "health_dimensions" jsonb,
  ADD COLUMN IF NOT EXISTS "positive_signals" jsonb,
  ADD COLUMN IF NOT EXISTS "negative_signals" jsonb,
  ADD COLUMN IF NOT EXISTS "risk_factors" jsonb,
  ADD COLUMN IF NOT EXISTS "risk_events" jsonb,
  ADD COLUMN IF NOT EXISTS "analysis_version" integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  ALTER TABLE "customer_intelligence"
    ADD CONSTRAINT "health_score_range" CHECK ("health_score" IS NULL OR ("health_score" >= 0 AND "health_score" <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "customer_intelligence"
    ADD CONSTRAINT "analysis_confidence_range" CHECK ("analysis_confidence" IS NULL OR ("analysis_confidence" >= 0 AND "analysis_confidence" <= 100));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "customer_intelligence_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lead_id" text NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "source_type" text NOT NULL,
  "source_module" text NOT NULL,
  "source_id" text,
  "source_url" text,
  "title" text,
  "captured_at" timestamp NOT NULL DEFAULT now(),
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ci_sources_tenant_lead_idx"
  ON "customer_intelligence_sources" ("tenant_id", "lead_id", "captured_at");

CREATE TABLE IF NOT EXISTS "customer_intelligence_facts" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lead_id" text NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "intelligence_id" text REFERENCES "customer_intelligence"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "fact_key" text NOT NULL,
  "value" jsonb NOT NULL,
  "confidence" integer,
  "source_id" text REFERENCES "customer_intelligence_sources"("id") ON DELETE SET NULL,
  "valid_from" timestamp,
  "valid_to" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ci_facts_tenant_lead_idx"
  ON "customer_intelligence_facts" ("tenant_id", "lead_id", "fact_key");

CREATE TABLE IF NOT EXISTS "customer_intelligence_events" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lead_id" text NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "event_type" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "source_module" text,
  "source_id" text,
  "occurred_at" timestamp NOT NULL DEFAULT now(),
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ci_events_tenant_lead_time_idx"
  ON "customer_intelligence_events" ("tenant_id", "lead_id", "occurred_at");

CREATE TABLE IF NOT EXISTS "customer_intelligence_snapshots" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lead_id" text NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "intelligence_id" text REFERENCES "customer_intelligence"("id") ON DELETE CASCADE,
  "health_score" integer,
  "risk_type" text,
  "risk_level" text,
  "risk_trend" text,
  "analysis_confidence" integer,
  "payload" jsonb NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ci_snapshots_tenant_lead_time_idx"
  ON "customer_intelligence_snapshots" ("tenant_id", "lead_id", "created_at");

CREATE TABLE IF NOT EXISTS "lead_stage_dynamic_questions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "lead_id" text NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "deal_id" text REFERENCES "deals"("id") ON DELETE CASCADE,
  "stage_key" text NOT NULL,
  "question_text" text NOT NULL,
  "objective" text,
  "status" text NOT NULL DEFAULT 'pendente',
  "answer" text,
  "source" text NOT NULL DEFAULT 'ai',
  "confidence" integer,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "answered_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lead_stage_dynamic_questions_lookup_idx"
  ON "lead_stage_dynamic_questions" ("tenant_id", "lead_id", "stage_key", "status");
