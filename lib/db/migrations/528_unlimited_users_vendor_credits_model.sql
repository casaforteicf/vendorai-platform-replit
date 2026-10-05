-- VendorAI commercial model: unlimited users across every plan/product.
-- Monetization is based on product subscriptions and Vendor Credits, never seats.
-- This migration supersedes the seat enforcement introduced in migration 248.

UPDATE commercial_product_profiles
SET max_users = NULL,
    metadata = metadata || '{"usersPolicy":"unlimited","usersPolicyVersion":"v2"}'::jsonb,
    updated_at = now()
WHERE max_users IS NOT NULL
   OR COALESCE(metadata->>'usersPolicy', '') <> 'unlimited';

UPDATE plans
SET max_users = NULL
WHERE max_users IS NOT NULL;

DROP TRIGGER IF EXISTS trg_enforce_tenant_user_limit ON users;
DROP FUNCTION IF EXISTS enforce_tenant_user_limit();
DROP FUNCTION IF EXISTS tenant_effective_user_limit(text);
