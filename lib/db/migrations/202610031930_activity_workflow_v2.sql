-- Activity Workflow V2 — tarefas executáveis, próxima ação e modelos por etapa.
-- Aditiva e idempotente; não remove o modelo legado.

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS atividades_padrao jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS objetivo text,
  ADD COLUMN IF NOT EXISTS resultado_esperado text,
  ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS estado_execucao text NOT NULL DEFAULT 'criada',
  ADD COLUMN IF NOT EXISTS categoria_execucao text,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origem_etapa_id text,
  ADD COLUMN IF NOT EXISTS origem_etapa_key text,
  ADD COLUMN IF NOT EXISTS origem_template_key text,
  ADD COLUMN IF NOT EXISTS bloqueia_avanco boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agente_responsavel_key text,
  ADD COLUMN IF NOT EXISTS proxima_acao_texto text,
  ADD COLUMN IF NOT EXISTS atividade_pai_id text;

CREATE INDEX IF NOT EXISTS activities_deal_stage_template_idx
  ON activities (tenant_id, deal_id, origem_etapa_key, origem_template_key);

CREATE INDEX IF NOT EXISTS activities_open_execution_idx
  ON activities (tenant_id, deal_id, status, bloqueia_avanco);

COMMENT ON COLUMN pipeline_stages.atividades_padrao IS
  'Lista de atividades padrão da etapa: obrigatórias, sugeridas ou automáticas, com prazo, responsável e regra de bloqueio.';

COMMENT ON COLUMN activities.estado_execucao IS
  'Estado operacional detalhado: criada, planejada, em_execucao, aguardando, concluida, nao_realizada ou cancelada.';
