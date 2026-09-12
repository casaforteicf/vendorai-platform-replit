CREATE TABLE IF NOT EXISTS seo_backlink_opportunities (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_domain text NOT NULL,
  source_url text,
  target_url text NOT NULL,
  priority_cluster text,
  status text NOT NULL DEFAULT 'identified',
  live_url text,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  won_at timestamp
);

CREATE INDEX IF NOT EXISTS seo_backlink_opportunities_tenant_idx
  ON seo_backlink_opportunities (tenant_id);

CREATE INDEX IF NOT EXISTS seo_backlink_opportunities_tenant_status_idx
  ON seo_backlink_opportunities (tenant_id, status);

ALTER TABLE seo_backlink_opportunities
  DROP CONSTRAINT IF EXISTS seo_backlink_opportunities_status_check;

ALTER TABLE seo_backlink_opportunities
  ADD CONSTRAINT seo_backlink_opportunities_status_check
  CHECK (status IN ('identified', 'contacted', 'negotiating', 'won', 'lost'));
