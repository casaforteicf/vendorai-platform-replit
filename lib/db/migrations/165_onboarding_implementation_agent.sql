ALTER TABLE onboarding_progress
  ADD COLUMN IF NOT EXISTS implementation_state JSONB;
