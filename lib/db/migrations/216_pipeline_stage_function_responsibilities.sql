-- Responsabilidade de execução das etapas da pipeline por função, não por pessoa.
-- `pipeline` separa Comercial, Execução, Suporte, Aquecimento, Parceiros e Scout.
-- Registros antigos continuam como `comercial` para compatibilidade.

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'comercial';

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS responsaveis_funcoes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Versões antigas da tabela podem ter unicidade apenas por (tenant_id, key).
-- Ela precisa incluir a pipeline porque algumas pipelines compartilham keys
-- como `entregue` e `parceiro`.
DROP INDEX IF EXISTS pipeline_stages_tenant_key_unique;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT c.conname
    INTO constraint_name
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'pipeline_stages'
    AND c.contype = 'u'
    AND regexp_replace(pg_get_constraintdef(c.oid), '\\s+', '', 'g')
        LIKE 'UNIQUE(tenant_id,key)%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pipeline_stages DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_tenant_pipeline_key_unique
  ON pipeline_stages (tenant_id, pipeline, key);

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_pipeline_ordem_idx
  ON pipeline_stages (tenant_id, pipeline, ordem);

CREATE INDEX IF NOT EXISTS pipeline_stages_responsaveis_funcoes_gin_idx
  ON pipeline_stages USING GIN (responsaveis_funcoes);
