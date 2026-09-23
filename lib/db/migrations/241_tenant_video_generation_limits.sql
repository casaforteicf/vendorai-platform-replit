-- Per-tenant video generation guardrails.
-- Limits are operational cost controls; tenants see quotas/tokens, not provider currency.

CREATE TABLE IF NOT EXISTS tenant_video_generation_limits (
  tenant_id text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  monthly_video_jobs_limit integer NOT NULL DEFAULT 10 CHECK (monthly_video_jobs_limit >= 0),
  monthly_premium_video_jobs_limit integer NOT NULL DEFAULT 1 CHECK (monthly_premium_video_jobs_limit >= 0),
  max_concurrent_video_jobs integer NOT NULL DEFAULT 1 CHECK (max_concurrent_video_jobs >= 1),
  max_duration_seconds integer NOT NULL DEFAULT 30 CHECK (max_duration_seconds BETWEEN 4 AND 120),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_video_generation_limits_enabled_idx
  ON tenant_video_generation_limits(enabled);

-- Seed every current tenant with conservative defaults.
INSERT INTO tenant_video_generation_limits (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- Make commercial video quotas hard by default.
UPDATE product_usage_quotas
SET hard_cap_quantity = monthly_quantity,
    overage_allowed = false,
    updated_at = now()
WHERE metric_key = 'video'
  AND active = true;
