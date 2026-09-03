-- Responsabilidade de execução das etapas da pipeline por função, não por pessoa.
-- Valores seguem o formato `builtin:<user_function>` ou
-- `custom:<tenant_user_functions.id>`. Array vazio preserva o comportamento
-- legado (etapa sem restrição por função).

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS responsaveis_funcoes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX IF NOT EXISTS pipeline_stages_responsaveis_funcoes_gin_idx
  ON pipeline_stages USING GIN (responsaveis_funcoes);
