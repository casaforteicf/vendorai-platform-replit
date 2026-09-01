-- VendorAI paid lifecycle: annual cadence is opt-in and only applies after
-- the promotional monthly phases. Preserve a catalog snapshot so later price
-- changes do not rewrite an already accepted annual commercial condition.

ALTER TYPE billing_event_type ADD VALUE IF NOT EXISTS 'annual';

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS annual_price_at_transition numeric(12, 2);
