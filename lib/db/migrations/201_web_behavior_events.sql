CREATE TABLE IF NOT EXISTS web_behavior_events (
  id text PRIMARY KEY,
  anonymous_session_id text NOT NULL,
  tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  ad_campaign_id text REFERENCES ad_campaigns(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  page_url text,
  path text,
  referrer text,
  landing_page_slug text,
  engaged_ms integer,
  scroll_depth integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_behavior_events_session_idx
  ON web_behavior_events (anonymous_session_id, created_at);
CREATE INDEX IF NOT EXISTS web_behavior_events_lead_idx
  ON web_behavior_events (lead_id, created_at);
CREATE INDEX IF NOT EXISTS web_behavior_events_campaign_idx
  ON web_behavior_events (ad_campaign_id, created_at);
CREATE INDEX IF NOT EXISTS web_behavior_events_type_idx
  ON web_behavior_events (event_type, created_at);
