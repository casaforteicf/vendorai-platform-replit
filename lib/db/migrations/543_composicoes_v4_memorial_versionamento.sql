ALTER TABLE composicoes
  ADD COLUMN IF NOT EXISTS tipo_composicao text NOT NULL DEFAULT 'elementar',
  ADD COLUMN IF NOT EXISTS aplicacao text,
  ADD COLUMN IF NOT EXISTS inclui text,
  ADD COLUMN IF NOT EXISTS nao_inclui text,
  ADD COLUMN IF NOT EXISTS criterio_medicao text,
  ADD COLUMN IF NOT EXISTS observacoes_tecnicas text,
  ADD COLUMN IF NOT EXISTS formula_calculo jsonb,
  ADD COLUMN IF NOT EXISTS parametros_padrao jsonb,
  ADD COLUMN IF NOT EXISTS composicao_origem_id text,
  ADD COLUMN IF NOT EXISTS variante_de_id text,
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status_versao text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS versao_atual boolean NOT NULL DEFAULT true;

ALTER TABLE composicao_insumos
  ADD COLUMN IF NOT EXISTS formula_quantidade jsonb,
  ADD COLUMN IF NOT EXISTS condicao_aplicabilidade jsonb,
  ADD COLUMN IF NOT EXISTS observacao_tecnica text;

CREATE INDEX IF NOT EXISTS composicoes_tenant_origem_versao_idx
  ON composicoes(tenant_id, composicao_origem_id, versao);

CREATE INDEX IF NOT EXISTS composicoes_tenant_tipo_idx
  ON composicoes(tenant_id, tipo_composicao);
