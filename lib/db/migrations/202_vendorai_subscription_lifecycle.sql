-- VendorAI launch subscription lifecycle
-- Keeps legacy enum values and adds catalog slugs that already exist in plans.
ALTER TYPE subscription_plano ADD VALUE IF NOT EXISTS 'start';
ALTER TYPE subscription_plano ADD VALUE IF NOT EXISTS 'pme_plus';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS source_deal_id text REFERENCES deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS subscriptions_source_deal_idx
  ON subscriptions(source_deal_id)
  WHERE source_deal_id IS NOT NULL;

-- `mes` is reused as a billing-cycle id for application-managed subscriptions.
-- The partial unique index prevents two API replicas from creating the same
-- VendorAI subscription cycle concurrently while leaving legacy monthly rows untouched.
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_subscription_cycle_unique
  ON billing_events(mes)
  WHERE mes LIKE 'subscription:%';
