-- ARQDOR Render Studio — metadados persistentes de versão
-- Compatível com registros existentes: todos os novos campos são nullable/default.

ALTER TABLE arch_ai_renders
  ADD COLUMN IF NOT EXISTS operation_type VARCHAR(30) DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS material_id TEXT,
  ADD COLUMN IF NOT EXISTS material_name TEXT,
  ADD COLUMN IF NOT EXISTS selection_metadata JSONB,
  ADD COLUMN IF NOT EXISTS cost_estimate_usd NUMERIC(12,6),
  ADD COLUMN IF NOT EXISTS approval_note TEXT;

CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_project_created
  ON arch_ai_renders (tenant_id, project_id, created_at);

CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_parent
  ON arch_ai_renders (parent_render_id);
