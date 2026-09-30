-- Responsável IA por etapa da pipeline.
-- Mantém funções humanas em responsaveis_funcoes e adiciona um único agente IA
-- operacional primário, identificado pelo agent_key do catálogo de agentes.
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS responsavel_agente_key TEXT;

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_agent_idx
  ON pipeline_stages (tenant_id, responsavel_agente_key)
  WHERE responsavel_agente_key IS NOT NULL;
