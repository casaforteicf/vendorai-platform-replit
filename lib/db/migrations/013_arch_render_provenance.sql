-- Render provenance: bind every new render to the originating project revision and 3D scene/camera.
ALTER TABLE arch_ai_renders
  ADD COLUMN IF NOT EXISTS project_revision TEXT NULL,
  ADD COLUMN IF NOT EXISTS scene_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS scene_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS camera_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS source_model_version TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_project_revision
  ON arch_ai_renders (tenant_id, concept_project_id, project_revision, created_at);

CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_scene
  ON arch_ai_renders (tenant_id, concept_project_id, scene_id)
  WHERE scene_id IS NOT NULL;
