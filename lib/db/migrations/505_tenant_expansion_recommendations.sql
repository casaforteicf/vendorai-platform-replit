CREATE TABLE IF NOT EXISTS tenant_expansion_recommendations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  commercial_key text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'identified',
  score integer NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  monthly_price_cents integer,
  generated_by text NOT NULL DEFAULT 'revenue_scout',
  presented_at timestamp,
  accepted_at timestamp,
  rejected_at timestamp,
  contracted_at timestamp,
  last_seen_at timestamp NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_expansion_recommendations_tenant_status_idx
  ON tenant_expansion_recommendations(tenant_id, status);

CREATE INDEX IF NOT EXISTS tenant_expansion_recommendations_tenant_score_idx
  ON tenant_expansion_recommendations(tenant_id, score);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_expansion_recommendations_open_uq
  ON tenant_expansion_recommendations(tenant_id, commercial_key)
  WHERE active = true AND status IN ('identified','presented','accepted');
