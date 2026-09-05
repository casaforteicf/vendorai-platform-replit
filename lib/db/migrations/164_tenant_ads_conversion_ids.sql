-- IDs de conversão/pixel por tenant, pra sites gerados pelo Vendor.ai
-- (cada cliente cola o próprio ID de Google Ads / Meta Pixel, distinto
-- da tag do site institucional appvendorai.com).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS google_ads_conversion_id VARCHAR(40);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS meta_pixel_id VARCHAR(40);
