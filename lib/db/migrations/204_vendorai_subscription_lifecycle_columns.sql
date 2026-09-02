-- Complete the VendorAI launch subscription lifecycle schema.
-- Migration 202 added enums/source_deal/indexes, while the application schema
-- also depends on the commercial snapshot and cadence columns below.
-- All additions are idempotent so existing environments remain safe.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS campaign_code text,
  ADD COLUMN IF NOT EXISTS billing_phase text NOT NULL DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS promo_phase_1_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS promo_phase_1_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS promo_phase_2_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS promo_phase_2_ends_at timestamp,
  ADD COLUMN IF NOT EXISTS regular_price_at_transition numeric(12, 2),
  ADD COLUMN IF NOT EXISTS accepted_offer_at timestamp,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamp,
  ADD COLUMN IF NOT EXISTS accepted_terms_version text,
  ADD COLUMN IF NOT EXISTS billing_provider text DEFAULT 'asaas';
