ALTER TABLE "pipeline_stages" ADD COLUMN IF NOT EXISTS "perguntas" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "respostas_etapas" jsonb DEFAULT '{}'::jsonb NOT NULL;
