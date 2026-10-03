CREATE TABLE IF NOT EXISTS dev_agent_memory_entries (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('engineering','execution')),
  request_id text NOT NULL,
  signature text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_agent_memory_kind_created_idx
  ON dev_agent_memory_entries(kind, created_at DESC);

CREATE INDEX IF NOT EXISTS dev_agent_memory_request_idx
  ON dev_agent_memory_entries(request_id, created_at DESC);
