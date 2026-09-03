-- Self-service installation: tracking IDs used by generated sites.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS linkedin_insight_tag_id VARCHAR(40);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tiktok_pixel_id VARCHAR(80);