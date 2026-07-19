-- Campaign A/B testing columns + campaign_sent_logs table + lead_optimal_hours
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_sample_pct INTEGER DEFAULT 30;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS variant_a_text TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS variant_b_text TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS winning_variant TEXT;

CREATE TABLE IF NOT EXISTS campaign_sent_logs (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id     TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  variant     TEXT NOT NULL DEFAULT 'main',
  wamid       TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_csl_campaign ON campaign_sent_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_csl_lead     ON campaign_sent_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_csl_wamid    ON campaign_sent_logs(wamid) WHERE wamid IS NOT NULL;

CREATE TABLE IF NOT EXISTS lead_optimal_hours (
  id         TEXT PRIMARY KEY,
  lead_id    TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
  optimal_hour INTEGER,
  confidence REAL NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
