ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_source text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_campaign_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origin_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_origin_tenant_idx ON leads(origin_tenant_id);

CREATE TABLE IF NOT EXISTS arqdor_origin_commission_rules (
  id text PRIMARY KEY,
  origin_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category text,
  campaign_id text,
  share_percent numeric(7,4) NOT NULL DEFAULT 25,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_origin_commission_rules_percent_chk CHECK (share_percent >= 0 AND share_percent <= 100)
);
CREATE INDEX IF NOT EXISTS arqdor_origin_commission_rules_origin_idx
  ON arqdor_origin_commission_rules(origin_tenant_id,active,priority);

CREATE TABLE IF NOT EXISTS arqdor_origin_commission_events (
  id text PRIMARY KEY,
  seller_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  origin_tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  parent_commission_event_id text REFERENCES commission_events(id) ON DELETE SET NULL,
  source_type text,
  source_id text,
  category text,
  campaign_id text,
  gross_commission_cents integer NOT NULL DEFAULT 0,
  share_percent numeric(7,4) NOT NULL DEFAULT 25,
  origin_share_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'released',
  correlation_id text NOT NULL,
  metadata_json text,
  released_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_origin_commission_events_percent_chk CHECK (share_percent >= 0 AND share_percent <= 100),
  CONSTRAINT arqdor_origin_commission_events_status_chk CHECK (status IN ('validation','released','paid','reversed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS arqdor_origin_commission_events_correlation_uidx
  ON arqdor_origin_commission_events(seller_tenant_id,correlation_id);
CREATE INDEX IF NOT EXISTS arqdor_origin_commission_events_origin_idx
  ON arqdor_origin_commission_events(origin_tenant_id,status);
CREATE INDEX IF NOT EXISTS arqdor_origin_commission_events_seller_idx
  ON arqdor_origin_commission_events(seller_tenant_id,status);
CREATE INDEX IF NOT EXISTS arqdor_origin_commission_events_deal_idx
  ON arqdor_origin_commission_events(deal_id);
