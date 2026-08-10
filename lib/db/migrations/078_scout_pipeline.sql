ALTER TABLE scout_oportunidades
  ADD COLUMN IF NOT EXISTS pipeline_stage varchar(30) NOT NULL DEFAULT 'identificada',
  ADD COLUMN IF NOT EXISTS assigned_to text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamp;

CREATE INDEX IF NOT EXISTS scout_oportunidades_tenant_pipeline_idx
  ON scout_oportunidades (tenant_id, pipeline_stage, created_at DESC);

UPDATE scout_oportunidades
SET pipeline_stage = CASE
  WHEN status = 'converteu' THEN 'convertida'
  WHEN status = 'ignorado' THEN 'descartada'
  WHEN status IN ('enviado', 'respondeu') THEN 'em_contato'
  ELSE pipeline_stage
END;
