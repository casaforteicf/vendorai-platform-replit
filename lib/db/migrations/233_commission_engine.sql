CREATE TABLE IF NOT EXISTS commission_rules (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  actor_type text NOT NULL DEFAULT 'seller',
  trigger text NOT NULL DEFAULT 'payment_reconciled',
  product_id text,
  category text,
  channel text,
  region text,
  min_margin_percent numeric(7,4),
  max_discount_percent numeric(7,4),
  commission_percent numeric(7,4) NOT NULL DEFAULT 0,
  cap_percent numeric(7,4),
  recurring boolean NOT NULL DEFAULT false,
  proportional_by_receipt boolean NOT NULL DEFAULT true,
  split_config jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_rules_tenant_idx ON commission_rules(tenant_id);
CREATE INDEX IF NOT EXISTS commission_rules_active_priority_idx ON commission_rules(tenant_id, active, priority);

CREATE TABLE IF NOT EXISTS commission_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rule_id text REFERENCES commission_rules(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  seller_user_id text REFERENCES users(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  actor_id text,
  trigger text NOT NULL,
  source_type text,
  source_id text,
  base_amount_cents integer NOT NULL DEFAULT 0,
  eligible_percent numeric(7,4) NOT NULL DEFAULT 0,
  commission_percent numeric(7,4) NOT NULL DEFAULT 0,
  commission_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'forecast',
  reason text,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  released_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commission_events_tenant_correlation_unique ON commission_events(tenant_id, correlation_id);
CREATE INDEX IF NOT EXISTS commission_events_tenant_status_idx ON commission_events(tenant_id, status);
CREATE INDEX IF NOT EXISTS commission_events_deal_idx ON commission_events(deal_id);
