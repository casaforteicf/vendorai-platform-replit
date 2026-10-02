-- Customer Intelligence V2 — acompanhamento inteligente por etapa.
ALTER TABLE "pipeline_stages"
  ADD COLUMN IF NOT EXISTS "acompanhamento_config" jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN "pipeline_stages"."acompanhamento_config" IS
  'Configuração do acompanhamento inteligente: modo, objetivo, cadência, canais e prioridades de lacunas/risco.';

CREATE UNIQUE INDEX IF NOT EXISTS "activities_ci_followup_attempt_unique_idx"
  ON "activities" ("tenant_id", "resultado_execucao")
  WHERE "resultado_execucao" LIKE 'ci-followup:%';
