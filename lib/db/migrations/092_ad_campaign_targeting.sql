ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS segmentacao jsonb NOT NULL DEFAULT '{}'::jsonb;
