ALTER TABLE google_ads_connections
  ADD COLUMN IF NOT EXISTS data_manager_lead_conversion_action_id text,
  ADD COLUMN IF NOT EXISTS data_manager_trial_conversion_action_id text,
  ADD COLUMN IF NOT EXISTS data_manager_sale_conversion_action_id text,
  ADD COLUMN IF NOT EXISTS data_manager_configured_at timestamp;

COMMENT ON COLUMN google_ads_connections.data_manager_lead_conversion_action_id IS
  'Google Ads Conversion Action ID (UPLOAD_CLICKS) used by Data Manager API for lead conversions.';
COMMENT ON COLUMN google_ads_connections.data_manager_trial_conversion_action_id IS
  'Google Ads Conversion Action ID (UPLOAD_CLICKS) used by Data Manager API for activated-trial conversions.';
COMMENT ON COLUMN google_ads_connections.data_manager_sale_conversion_action_id IS
  'Google Ads Conversion Action ID (UPLOAD_CLICKS) used by Data Manager API for sale conversions.';
