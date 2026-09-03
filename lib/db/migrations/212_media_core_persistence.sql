-- VendorAI Media Engine foundation.
-- Adds persistent media projects, reusable assets, non-destructive versions and
-- durable processing jobs. Existing Content Studio routes keep their API shape;
-- this migration only establishes the shared persistence layer underneath them.

CREATE TABLE IF NOT EXISTS media_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'video',
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'content_studio',
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES media_projects(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'source',
  storage_url TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  original_filename TEXT,
  source TEXT NOT NULL DEFAULT 'upload',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES media_projects(id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  parent_version_id TEXT REFERENCES media_versions(id) ON DELETE SET NULL,
  operation TEXT NOT NULL DEFAULT 'original',
  label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS media_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES media_projects(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'vendorai',
  provider_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER,
  total INTEGER,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS media_projects_tenant_status_idx
  ON media_projects (tenant_id, status);
CREATE INDEX IF NOT EXISTS media_assets_tenant_type_idx
  ON media_assets (tenant_id, type);
CREATE INDEX IF NOT EXISTS media_assets_project_idx
  ON media_assets (project_id);
CREATE INDEX IF NOT EXISTS media_versions_project_created_idx
  ON media_versions (project_id, created_at);
CREATE INDEX IF NOT EXISTS media_jobs_tenant_status_idx
  ON media_jobs (tenant_id, status);
CREATE INDEX IF NOT EXISTS media_jobs_project_idx
  ON media_jobs (project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  media_projects,
  media_assets,
  media_versions,
  media_jobs
TO vendorai_app;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'media_projects',
    'media_assets',
    'media_versions',
    'media_jobs'
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
