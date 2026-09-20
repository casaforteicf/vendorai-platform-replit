-- Taxonomia explícita de composições por etapa e sistema construtivo.
-- Idempotente para ambientes já atualizados manualmente.
ALTER TABLE composicoes
  ADD COLUMN IF NOT EXISTS etapa_key TEXT,
  ADD COLUMN IF NOT EXISTS sistemas_construtivos TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS comum_todos_sistemas BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS composicoes_tenant_etapa_idx
  ON composicoes (tenant_id, etapa_key);

CREATE INDEX IF NOT EXISTS composicoes_tenant_ativo_idx
  ON composicoes (tenant_id, ativo);

CREATE INDEX IF NOT EXISTS composicoes_sistemas_gin_idx
  ON composicoes USING GIN (sistemas_construtivos);
