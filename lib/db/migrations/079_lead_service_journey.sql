ALTER TABLE lead_briefings
  ADD COLUMN IF NOT EXISTS journey_stage text DEFAULT 'abordagem',
  ADD COLUMN IF NOT EXISTS journey_checklist jsonb DEFAULT '{}'::jsonb;
