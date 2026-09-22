-- Performance por criativo para testes A/B reais.
-- Mantém snapshots históricos de campanha com creative_id NULL.

ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS external_creative_id text,
  ADD COLUMN IF NOT EXISTS external_ad_id text,
  ADD COLUMN IF NOT EXISTS external_status text CHECK (external_status IS NULL OR external_status IN ('paused','active'));

ALTER TABLE ad_performance_snapshots
  ADD COLUMN IF NOT EXISTS creative_id text REFERENCES ad_creatives(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ad_performance_snapshots_campaign_creative_idx
  ON ad_performance_snapshots (campaign_id, creative_id, data);

CREATE INDEX IF NOT EXISTS ad_creatives_external_ad_idx
  ON ad_creatives (external_ad_id);
