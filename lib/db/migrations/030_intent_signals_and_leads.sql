-- intent_signals table + leads intent/construction/business_activity columns
CREATE TABLE IF NOT EXISTS intent_signals (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id     TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  source      TEXT NOT NULL,
  product_name TEXT,
  search_term TEXT,
  url         TEXT,
  value       REAL NOT NULL DEFAULT 50,
  confidence  REAL NOT NULL DEFAULT 0.8,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_intent_signals_lead     ON intent_signals(lead_id);
CREATE INDEX IF NOT EXISTS idx_intent_signals_tenant   ON intent_signals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_intent_signals_captured ON intent_signals(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_intent_signals_type     ON intent_signals(signal_type);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_score REAL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_intent_update TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS construction_stage TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS context_answered_at TIMESTAMPTZ;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_activity TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_sub_activity TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_description TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_activity_confidence REAL DEFAULT 0;
