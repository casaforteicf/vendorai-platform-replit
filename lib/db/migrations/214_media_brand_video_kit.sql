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

-- FK simples garante existência, mas não garante que o asset pertença ao mesmo
-- tenant. O trigger fecha essa brecha no próprio banco, independentemente da API.
CREATE OR REPLACE FUNCTION validate_media_brand_video_kit_assets()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  asset_id TEXT;
BEGIN
  FOREACH asset_id IN ARRAY ARRAY[
    NEW.logo_asset_id,
    NEW.intro_asset_id,
    NEW.outro_asset_id,
    NEW.default_music_asset_id
  ]
  LOOP
    IF asset_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM media_assets a WHERE a.id = asset_id AND a.tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'Brand Video Kit asset % does not belong to tenant %', asset_id, NEW.tenant_id
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS media_brand_video_kits_validate_assets ON media_brand_video_kits;
CREATE TRIGGER media_brand_video_kits_validate_assets
  BEFORE INSERT OR UPDATE OF tenant_id, logo_asset_id, intro_asset_id, outro_asset_id, default_music_asset_id
  ON media_brand_video_kits
  FOR EACH ROW
  EXECUTE FUNCTION validate_media_brand_video_kit_assets();

GRANT SELECT, INSERT, UPDATE, DELETE ON media_brand_video_kits TO vendorai_app;
GRANT EXECUTE ON FUNCTION validate_media_brand_video_kit_assets() TO vendorai_app;

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
