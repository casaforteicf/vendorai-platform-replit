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
