ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lead_assignment_enabled boolean,
  ADD COLUMN IF NOT EXISTS lead_assignment_cities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lead_assignment_regions jsonb NOT NULL DEFAULT '[]'::jsonb;
