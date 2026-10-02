ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS atividade_padrao_titulo text,
  ADD COLUMN IF NOT EXISTS atividade_padrao_descricao text,
  ADD COLUMN IF NOT EXISTS atividade_padrao_prazo_minutos integer;

ALTER TABLE pipeline_stages
  DROP CONSTRAINT IF EXISTS pipeline_stages_atividade_padrao_prazo_minutos_check;

ALTER TABLE pipeline_stages
  ADD CONSTRAINT pipeline_stages_atividade_padrao_prazo_minutos_check
  CHECK (atividade_padrao_prazo_minutos IS NULL OR atividade_padrao_prazo_minutos > 0);