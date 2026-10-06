ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS interacoes_conteudo jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN pipeline_stages.interacoes_conteudo IS
  'Interações de conteúdo ligadas ao SLA da etapa: entrada, percentual do prazo ou final.';
