-- Sprint 9 — Office OS: pipeline_stage column on arch_projetos + arch_office_templates
ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'lead';

CREATE TABLE IF NOT EXISTS arch_office_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_obra TEXT,
  estilo_base TEXT,
  prazo_estimado INTEGER,
  orcamento_base NUMERIC(12,2),
  ambientes JSONB,
  materiais JSONB,
  prompts JSONB,
  vezes_criado INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_office_templates_tenant ON arch_office_templates(tenant_id);
