CREATE TABLE IF NOT EXISTS meta_engagement_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_event_id TEXT NOT NULL,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  instagram_scoped_id TEXT NOT NULL,
  username TEXT,
  text_content TEXT,
  media_id TEXT,
  campaign_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_engagement_events_tenant_external_uidx
  ON meta_engagement_events(tenant_id, external_event_id);

CREATE INDEX IF NOT EXISTS meta_engagement_events_tenant_created_idx
  ON meta_engagement_events(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS meta_engagement_events_lead_created_idx
  ON meta_engagement_events(lead_id, created_at DESC);
