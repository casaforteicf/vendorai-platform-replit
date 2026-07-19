-- agent_execution_log: tracks scheduled agent runs for monitoring
CREATE TABLE IF NOT EXISTS agent_execution_log (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_name    TEXT NOT NULL,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success       BOOLEAN,
  error_message TEXT,
  duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_exec_log_agent ON agent_execution_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_exec_log_at    ON agent_execution_log(executed_at DESC);
