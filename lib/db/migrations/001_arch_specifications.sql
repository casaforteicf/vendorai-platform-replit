-- Sprint arch — SpecObject core tables: arch_specifications + arch_spec_items
CREATE TABLE IF NOT EXISTS arch_specifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  projeto_id TEXT NOT NULL,
  render_id TEXT,
  render_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  items_count INTEGER DEFAULT 0,
  specified_count INTEGER DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_spec_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  specification_id TEXT NOT NULL REFERENCES arch_specifications(id) ON DELETE CASCADE,
  categoria TEXT NOT NULL,
  descricao TEXT NOT NULL,
  quantidade INTEGER DEFAULT 1,
  confianca NUMERIC(3,2) DEFAULT 0.80,
  status TEXT NOT NULL DEFAULT 'pendente',
  catalogo_item_id TEXT,
  override_nome TEXT,
  override_fornecedor TEXT,
  override_preco NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_specs_projeto   ON arch_specifications(projeto_id);
CREATE INDEX IF NOT EXISTS idx_arch_specs_tenant    ON arch_specifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_spec_items_spec ON arch_spec_items(specification_id);
