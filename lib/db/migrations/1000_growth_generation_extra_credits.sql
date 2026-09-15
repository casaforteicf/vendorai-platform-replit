ALTER TABLE agent_configs
  ADD COLUMN IF NOT EXISTS content_generation_extra_used integer NOT NULL DEFAULT 0;
