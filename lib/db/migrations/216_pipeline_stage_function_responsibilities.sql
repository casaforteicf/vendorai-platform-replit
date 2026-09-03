-- Responsabilidade de execução das etapas da pipeline por função, não por pessoa.
-- `pipeline` separa Comercial, Execução, Suporte, Aquecimento, Parceiros e Scout.
-- Registros antigos continuam como `comercial` para compatibilidade.

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS pipeline TEXT NOT NULL DEFAULT 'comercial';

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS responsaveis_funcoes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE pipeline_stages
SET pipeline = 'comercial'
WHERE pipeline IS NULL OR btrim(pipeline) = '';

-- Versões antigas podem ter unicidade somente por (tenant_id, key),
-- eventualmente com outro nome de constraint/index. Removemos pela estrutura
-- das colunas para permitir a mesma key em pipelines diferentes.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, t.relname AS table_name, c.conname AS constraint_name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = 'pipeline_stages'
      AND c.contype = 'u'
      AND cardinality(c.conkey) = 2
      AND (
        SELECT count(*)
        FROM unnest(c.conkey) AS k(attnum)
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid
         AND a.attnum = k.attnum
        WHERE a.attname IN ('tenant_id', 'key')
      ) = 2
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.schema_name,
      r.table_name,
      r.constraint_name
    );
  END LOOP;
END $$;

-- Também cobre versões antigas que criaram um UNIQUE INDEX independente,
-- sem constraint correspondente.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, idx.relname AS index_name
    FROM pg_index i
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    JOIN pg_class idx ON idx.oid = i.indexrelid
    WHERE tbl.relname = 'pipeline_stages'
      AND i.indisunique
      AND i.indnatts = 2
      AND i.indnkeyatts = 2
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conindid = i.indexrelid
      )
      AND (
        SELECT count(*)
        FROM unnest(string_to_array(trim(i.indkey::text), ' ')::smallint[]) AS k(attnum)
        JOIN pg_attribute a
          ON a.attrelid = i.indrelid
         AND a.attnum = k.attnum
        WHERE a.attname IN ('tenant_id', 'key')
      ) = 2
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %I.%I', r.schema_name, r.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_tenant_pipeline_key_unique
  ON pipeline_stages (tenant_id, pipeline, key);

CREATE INDEX IF NOT EXISTS pipeline_stages_tenant_pipeline_ordem_idx
  ON pipeline_stages (tenant_id, pipeline, ordem);

CREATE INDEX IF NOT EXISTS pipeline_stages_responsaveis_funcoes_gin_idx
  ON pipeline_stages USING GIN (responsaveis_funcoes);
