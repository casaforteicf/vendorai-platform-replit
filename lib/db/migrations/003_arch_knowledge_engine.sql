-- Sprint 7 — Knowledge Engine: arch_knowledge_entries + arch_knowledge_tags
CREATE TABLE IF NOT EXISTS arch_knowledge_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  titulo TEXT,
  tipo TEXT,
  area_m2 NUMERIC(8,2),
  orcamento_total NUMERIC(12,2),
  status TEXT,
  tags JSONB,
  materiais_usados JSONB,
  fabricantes JSONB,
  componentes JSONB,
  prompts_usados JSONB,
  render_count INTEGER DEFAULT 0,
  renders_aprovados INTEGER DEFAULT 0,
  cenas_count INTEGER DEFAULT 0,
  revisoes INTEGER DEFAULT 0,
  snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT arch_knowledge_entries_project_unique UNIQUE (project_id)
);

CREATE TABLE IF NOT EXISTS arch_knowledge_tags (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'geral',
  count INTEGER NOT NULL DEFAULT 1,
  score REAL NOT NULL DEFAULT 0.5,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_knowledge_entries_tenant ON arch_knowledge_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_knowledge_entries_tipo   ON arch_knowledge_entries(tipo);
CREATE INDEX IF NOT EXISTS idx_arch_knowledge_tags_tenant    ON arch_knowledge_tags(tenant_id);
