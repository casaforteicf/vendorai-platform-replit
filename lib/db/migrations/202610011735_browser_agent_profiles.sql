ALTER TABLE browser_agent_connections
  ADD COLUMN IF NOT EXISTS profile_encrypted text;
