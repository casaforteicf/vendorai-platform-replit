-- Content Studio Uploads: session-scoped file tracking
CREATE TABLE IF NOT EXISTS content_studio_uploads (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'style_reference',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_studio_uploads_tenant  ON content_studio_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_content_studio_uploads_session ON content_studio_uploads(session_id);
