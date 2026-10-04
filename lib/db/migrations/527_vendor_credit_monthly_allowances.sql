-- Vendor Credits monthly franchise compatibility
-- Adds generic monthly Vendor Credits to the commercial products that already
-- exist in the current catalog. This is additive metadata and safe to revise
-- when the full new catalog is promoted.

WITH credit_policy(commercial_key, included_credits) AS (
  VALUES
    ('vendor.crm', 1500),
    ('vendor.prospector', 2500),
    ('vendor.omnichannel', 2000),
    ('vendor.ai_team', 2500),
    ('vendor.revenue_scout', 1500),
    ('vendor.management', 1000),
    ('vendor.content_studio', 2500),
    ('vendor.growth', 7500)
)
UPDATE commercial_product_profiles p
SET metadata = p.metadata || jsonb_build_object(
      'includedVendorCreditsMonthly', policy.included_credits,
      'vendorCreditPolicyVersion', 'v2'
    ),
    updated_at = now()
FROM credit_policy policy
WHERE p.commercial_key = policy.commercial_key;

-- Legacy free product intentionally receives no recurring Vendor Credits.
UPDATE commercial_product_profiles
SET metadata = metadata || '{"includedVendorCreditsMonthly":0,"vendorCreditPolicyVersion":"v2"}'::jsonb,
    updated_at = now()
WHERE commercial_key = 'vendor.crm.free';
