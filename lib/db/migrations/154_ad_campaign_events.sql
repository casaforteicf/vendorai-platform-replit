CREATE TABLE IF NOT EXISTS ad_campaign_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  dedupe_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaign_events_dedupe_idx
  ON ad_campaign_events (tenant_id, campaign_id, dedupe_key);
CREATE INDEX IF NOT EXISTS ad_campaign_events_tenant_created_idx
  ON ad_campaign_events (tenant_id, created_at DESC);
