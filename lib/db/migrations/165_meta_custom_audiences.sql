CREATE TABLE IF NOT EXISTS meta_custom_audiences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  audience_key TEXT NOT NULL,
  label TEXT NOT NULL,
  external_audience_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  eligible_count INTEGER NOT NULL DEFAULT 0,
  synced_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_custom_audiences_tenant_key_uidx
  ON meta_custom_audiences(tenant_id, audience_key);

CREATE INDEX IF NOT EXISTS meta_custom_audiences_tenant_status_idx
  ON meta_custom_audiences(tenant_id, status, updated_at DESC);
