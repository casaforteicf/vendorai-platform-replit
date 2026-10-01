ALTER TABLE browser_agent_skills
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready',
  ADD COLUMN IF NOT EXISTS repair_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_at timestamp,
  ADD COLUMN IF NOT EXISTS last_success_at timestamp,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS watch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS watch_fingerprint text,
  ADD COLUMN IF NOT EXISTS watch_last_changed_at timestamp;
