-- 166_ai_visibility_dimensions.sql
-- Relatorios complementares do Bing AI Performance sao exportados em visoes
-- separadas (Grounding Queries, Topics/Intents e serie temporal). Esta tabela
-- preserva esses conjuntos sem contaminar o snapshot de paginas/citacoes.

CREATE TABLE IF NOT EXISTS ai_visibility_dimension_imports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'bing_ai_performance',
  dimension_type text NOT NULL,
  file_name text,
  checksum text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  imported_by text,
  imported_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_visibility_dim_import_unique
  ON ai_visibility_dimension_imports (tenant_id, provider, dimension_type, checksum);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_dim_import_tenant
  ON ai_visibility_dimension_imports (tenant_id, dimension_type, imported_at DESC);

CREATE TABLE IF NOT EXISTS ai_visibility_dimensions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_id text NOT NULL REFERENCES ai_visibility_dimension_imports(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'bing_ai_performance',
  dimension_type text NOT NULL,
  page_url text,
  grounding_query text,
  topic text,
  intent text,
  activity_date date,
  citations integer NOT NULL DEFAULT 0,
  citation_share numeric(10,4),
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_dim_tenant_import
  ON ai_visibility_dimensions (tenant_id, import_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_dim_query
  ON ai_visibility_dimensions (tenant_id, grounding_query)
  WHERE grounding_query IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_visibility_dim_date
  ON ai_visibility_dimensions (tenant_id, activity_date)
  WHERE activity_date IS NOT NULL;
