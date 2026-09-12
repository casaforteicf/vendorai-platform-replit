-- 165_ai_visibility.sql
-- Centro de Visibilidade em IA por tenant.
-- O primeiro provedor suportado e o Bing Webmaster Tools / AI Performance.
-- Cada importacao e um snapshot independente para permitir historico e comparacao.

CREATE TABLE IF NOT EXISTS ai_visibility_imports (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'bing_ai_performance',
  file_name text,
  checksum text NOT NULL,
  period_start date,
  period_end date,
  row_count integer NOT NULL DEFAULT 0,
  imported_by text,
  imported_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_visibility_imports_tenant_provider_checksum
  ON ai_visibility_imports (tenant_id, provider, checksum);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_imports_tenant_date
  ON ai_visibility_imports (tenant_id, imported_at DESC);

CREATE TABLE IF NOT EXISTS ai_visibility_citations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  import_id text NOT NULL REFERENCES ai_visibility_imports(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'bing_ai_performance',
  page_url text NOT NULL,
  grounding_query text,
  topic text,
  intent text,
  citations integer NOT NULL DEFAULT 0,
  citation_share numeric(10,4),
  period_start date,
  period_end date,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_visibility_citations_tenant_import
  ON ai_visibility_citations (tenant_id, import_id);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_citations_tenant_page
  ON ai_visibility_citations (tenant_id, page_url);
CREATE INDEX IF NOT EXISTS idx_ai_visibility_citations_tenant_query
  ON ai_visibility_citations (tenant_id, grounding_query)
  WHERE grounding_query IS NOT NULL;
