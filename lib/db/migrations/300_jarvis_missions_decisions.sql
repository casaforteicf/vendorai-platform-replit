CREATE TABLE IF NOT EXISTS jarvis_missions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  priority INTEGER NOT NULL DEFAULT 50,
  success_metric TEXT,
  target JSONB,
  baseline JSONB,
  current_state JSONB,
  strategy JSONB,
  owner_user_id TEXT,
  created_by_user_id TEXT,
  deadline_at TIMESTAMPTZ,
  last_reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jarvis_missions_tenant_status_idx ON jarvis_missions(tenant_id, status);
CREATE INDEX IF NOT EXISTS jarvis_missions_tenant_priority_idx ON jarvis_missions(tenant_id, priority);

CREATE TABLE IF NOT EXISTS jarvis_decisions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id TEXT REFERENCES jarvis_missions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  question TEXT,
  decision TEXT NOT NULL,
  rationale TEXT,
  confidence INTEGER,
  alternatives JSONB,
  evidence JSONB,
  expected_outcome TEXT,
  success_metric TEXT,
  review_at TIMESTAMPTZ,
  actual_outcome TEXT,
  result_status TEXT NOT NULL DEFAULT 'pending',
  decided_by_user_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jarvis_decisions_tenant_created_idx ON jarvis_decisions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS jarvis_decisions_mission_idx ON jarvis_decisions(mission_id);
CREATE INDEX IF NOT EXISTS jarvis_decisions_review_idx ON jarvis_decisions(tenant_id, review_at);
