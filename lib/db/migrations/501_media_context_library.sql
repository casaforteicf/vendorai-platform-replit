CREATE TABLE IF NOT EXISTS media_context_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'assunto',
  summary text NOT NULL,
  details text,
  tags text[] NOT NULL DEFAULT '{}',
  source_type text NOT NULL DEFAULT 'manual',
  source_id text,
  asset_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'approved',
  valid_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_context_entries_status_check CHECK (status IN ('draft', 'approved', 'archived')),
  CONSTRAINT media_context_entries_kind_check CHECK (kind IN (
    'assunto', 'produto', 'servico', 'obra', 'case', 'ferramenta',
    'processo', 'diferencial', 'promocao', 'prova', 'referencia'
  ))
);

CREATE INDEX IF NOT EXISTS media_context_entries_tenant_status_idx
  ON media_context_entries (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS media_context_entries_tags_idx
  ON media_context_entries USING gin (tags);

ALTER TABLE media_context_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_context_entries_tenant_isolation ON media_context_entries;
CREATE POLICY media_context_entries_tenant_isolation ON media_context_entries
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
