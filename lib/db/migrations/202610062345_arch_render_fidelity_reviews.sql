CREATE TABLE IF NOT EXISTS arch_render_fidelity_reviews (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  render_id TEXT NOT NULL REFERENCES arch_ai_renders(id) ON DELETE CASCADE,
  project_id TEXT,
  base_image_url TEXT NOT NULL,
  render_image_url TEXT NOT NULL,
  requested_change TEXT,
  overall_score INTEGER NOT NULL,
  requires_human_review BOOLEAN NOT NULL DEFAULT FALSE,
  review JSONB NOT NULL,
  model TEXT NOT NULL,
  cost_usd NUMERIC(12,6),
  input_tokens INTEGER,
  output_tokens INTEGER,
  reviewed_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arch_render_fidelity_reviews_render_created
  ON arch_render_fidelity_reviews (tenant_id, render_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arch_render_fidelity_reviews_project_created
  ON arch_render_fidelity_reviews (tenant_id, project_id, created_at DESC);
