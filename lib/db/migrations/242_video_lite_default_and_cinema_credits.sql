-- Cost-optimized video policy.
-- Standard video: Veo 3.1 Lite 720p.
-- Cinema: no included monthly allowance by default; explicitly grant per tenant.

ALTER TABLE tenant_video_generation_limits
  ALTER COLUMN monthly_premium_video_jobs_limit SET DEFAULT 0;

UPDATE tenant_video_generation_limits
SET monthly_premium_video_jobs_limit = 0,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'standardEngine', 'google/veo-3.1-lite',
      'standardResolution', '720p',
      'cinemaEngine', 'google/veo-3.1',
      'cinemaRequiresExtraCredit', true
    ),
    updated_at = now();

-- Keep standard Growth allowance hard-capped at 10 videos/month.
UPDATE product_usage_quotas
SET monthly_quantity = 10,
    hard_cap_quantity = 10,
    overage_allowed = false,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'defaultMode', 'standard',
      'defaultEngine', 'google/veo-3.1-lite',
      'defaultResolution', '720p',
      'cinemaIncluded', false
    ),
    updated_at = now()
WHERE commercial_key = 'vendor.growth'
  AND metric_key = 'video'
  AND active = true;
