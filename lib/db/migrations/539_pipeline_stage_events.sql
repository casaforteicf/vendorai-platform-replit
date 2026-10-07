-- Eventos configuráveis por etapa da pipeline.
-- Compatibilidade: tenants existentes recebem [] e não têm qualquer envio novo
-- até o admin configurar eventos explicitamente.
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS eventos jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pipeline_stages.eventos IS
  'Eventos configuráveis da etapa: mensagens, mídias, documentos, playbooks e demandas.';

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_pipeline_events_idx
  ON pipeline_stages (tenant_id, pipeline)
  WHERE jsonb_array_length(eventos) > 0;

CREATE TABLE IF NOT EXISTS pipeline_stage_event_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  stage_key TEXT NOT NULL,
  gatilho TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'executing',
  attempts INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  executed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stage_event_runs_unique_execution_idx
  ON pipeline_stage_event_runs (
    tenant_id,
    stage_id,
    event_id,
    entity_type,
    entity_id,
    stage_key,
    gatilho
  );

CREATE INDEX IF NOT EXISTS pipeline_stage_event_runs_tenant_created_idx
  ON pipeline_stage_event_runs (tenant_id, created_at DESC);

