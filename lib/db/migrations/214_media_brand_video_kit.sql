-- Brand Video Kit — identidade audiovisual persistente por tenant.
-- Reutiliza media_assets para logo, abertura, encerramento e trilha padrão.

CREATE TABLE IF NOT EXISTS media_brand_video_kits (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT 'Kit principal',
  status TEXT NOT NULL DEFAULT 'active',
  logo_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  intro_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  outro_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  default_music_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  caption_preset TEXT NOT NULL DEFAULT 'reels_bold',
  visual_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  audio_config JSONB NOT NULL DEFAULT '{"musicVolume":0.22,"originalVolume":1,"ducking":true,"fadeIn":0.5,"fadeOut":1}'::jsonb,
  broll_config JSONB NOT NULL DEFAULT '{"enabled":true,"maxInsertions":4,"preferOwnMedia":true}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT media_brand_video_kits_status_check CHECK (status IN ('draft', 'active', 'archived')),
  CONSTRAINT media_brand_video_kits_caption_preset_check CHECK (
    caption_preset IN ('reels_bold', 'clean', 'highlight', 'minimal')
  )
);

CREATE INDEX IF NOT EXISTS media_brand_video_kits_tenant_status_idx
  ON media_brand_video_kits (tenant_id, status);

-- Nesta fundação existe um único kit ativo por tenant. Kits anteriores podem
-- ser arquivados sem destruir a identidade usada por versões já renderizadas.
CREATE UNIQUE INDEX IF NOT EXISTS media_brand_video_kits_one_active_per_tenant_idx
  ON media_brand_video_kits (tenant_id)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON media_brand_video_kits TO vendorai_app;

ALTER TABLE media_brand_video_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendorai_tenant_access ON media_brand_video_kits;
CREATE POLICY vendorai_tenant_access ON media_brand_video_kits
  AS PERMISSIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());

DROP POLICY IF EXISTS vendorai_tenant_guard ON media_brand_video_kits;
CREATE POLICY vendorai_tenant_guard ON media_brand_video_kits
  AS RESTRICTIVE FOR ALL TO vendorai_app
  USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())
  WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id());
