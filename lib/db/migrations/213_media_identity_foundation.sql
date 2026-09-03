-- VendorAI Media Identity Foundation.
-- Forward-only persistence for people/personas, voice profiles and auditable
-- audiovisual consent. No external avatar provider is required by this model.

CREATE TABLE IF NOT EXISTS media_identities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'person',
  status TEXT NOT NULL DEFAULT 'draft',
  face_reference_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT media_identities_kind_check CHECK (kind IN ('person', 'persona')),
  CONSTRAINT media_identities_status_check CHECK (status IN ('draft', 'active', 'blocked', 'archived'))
);

CREATE TABLE IF NOT EXISTS media_voice_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id TEXT NOT NULL REFERENCES media_identities(id) ON DELETE CASCADE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reference_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'vendorai',
  model_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT media_voice_profiles_status_check CHECK (status IN ('draft', 'ready', 'blocked', 'archived')),
  CONSTRAINT media_voice_profiles_provider_check CHECK (provider = 'vendorai')
);

CREATE TABLE IF NOT EXISTS media_identity_consents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id TEXT NOT NULL REFERENCES media_identities(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  granted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  evidence_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  consent_version TEXT NOT NULL DEFAULT '1',
  granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revocation_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT media_identity_consents_scope_check CHECK (
    scope IN ('face_use', 'voice_use', 'ai_generation', 'organic_publish', 'paid_ads')
  ),
  CONSTRAINT media_identity_consents_status_check CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT media_identity_consents_revocation_check CHECK (
    (status <> 'revoked') OR revoked_at IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS media_identity_consent_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id TEXT NOT NULL REFERENCES media_identities(id) ON DELETE CASCADE,
  consent_id TEXT REFERENCES media_identity_consents(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  scope TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT media_identity_consent_events_type_check CHECK (
    event_type IN ('granted', 'revoked', 'expired', 'blocked', 'unblocked')
  ),
  CONSTRAINT media_identity_consent_events_scope_check CHECK (
    scope IN ('face_use', 'voice_use', 'ai_generation', 'organic_publish', 'paid_ads')
  )
);

CREATE INDEX IF NOT EXISTS media_identities_tenant_status_idx
  ON media_identities (tenant_id, status);
CREATE INDEX IF NOT EXISTS media_voice_profiles_identity_status_idx
  ON media_voice_profiles (identity_id, status);
CREATE INDEX IF NOT EXISTS media_identity_consents_lookup_idx
  ON media_identity_consents (tenant_id, identity_id, scope, status);
CREATE INDEX IF NOT EXISTS media_identity_consent_events_identity_created_idx
  ON media_identity_consent_events (identity_id, created_at);

-- Returns true only when the identity belongs to the tenant, is active and an
-- unrevoked, unexpired consent exists for the requested audiovisual scope.
CREATE OR REPLACE FUNCTION media_identity_has_active_consent(
  p_tenant_id TEXT,
  p_identity_id TEXT,
  p_scope TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM media_identities i
    JOIN media_identity_consents c
      ON c.identity_id = i.id
     AND c.tenant_id = i.tenant_id
    WHERE i.id = p_identity_id
      AND i.tenant_id = p_tenant_id
      AND i.status = 'active'
      AND c.scope = p_scope
      AND c.status = 'active'
      AND c.revoked_at IS NULL
      AND (c.expires_at IS NULL OR c.expires_at > NOW())
  );
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  media_identities,
  media_voice_profiles,
  media_identity_consents,
  media_identity_consent_events
TO vendorai_app;

GRANT EXECUTE ON FUNCTION media_identity_has_active_consent(TEXT, TEXT, TEXT)
TO vendorai_app;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'media_identities',
    'media_voice_profiles',
    'media_identity_consents',
    'media_identity_consent_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_access ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS vendorai_tenant_guard ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_access ON %I AS PERMISSIVE FOR ALL TO vendorai_app USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id()) WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY vendorai_tenant_guard ON %I AS RESTRICTIVE FOR ALL TO vendorai_app USING (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id()) WITH CHECK (app_security.is_super_admin() OR tenant_id = app_security.current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;
