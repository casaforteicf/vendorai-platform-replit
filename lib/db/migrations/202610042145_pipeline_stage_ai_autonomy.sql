-- Pipeline AI autonomy per stage + shared BI event metadata
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS ai_config jsonb NOT NULL DEFAULT '{
    "mode":"desativada",
    "allowedActions":[],
    "approvalRequiredActions":[],
    "entryCriteria":[],
    "exitCriteria":[],
    "nextBestActionEnabled":true
  }'::jsonb;

COMMENT ON COLUMN pipeline_stages.ai_config IS
  'Configuração de autonomia da IA por etapa: modo, ações permitidas, aprovações, critérios de entrada/saída e NBA.';

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_ai_mode_idx
  ON pipeline_stages (tenant_id, pipeline, ((ai_config->>'mode')));
