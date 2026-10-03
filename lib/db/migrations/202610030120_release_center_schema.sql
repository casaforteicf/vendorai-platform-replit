CREATE TABLE IF NOT EXISTS admin_improvements (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  module text NOT NULL DEFAULT 'Plataforma',
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'solicitada',
  branch text,
  pr_number integer,
  pr_url text,
  homolog_url text,
  production_url text,
  package_key text,
  test_status text NOT NULL DEFAULT 'pending',
  test_summary text,
  created_by text,
  approved_homolog_by text,
  approved_homolog_at timestamptz,
  approved_production_by text,
  approved_production_at timestamptz,
  merged_staging_sha text,
  source_type text NOT NULL DEFAULT 'super_admin',
  source_ref_id text,
  source_tenant_id text,
  owner_agent text NOT NULL DEFAULT 'vendi',
  agent_status text NOT NULL DEFAULT 'idle',
  agent_summary text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_improvements_status_idx
  ON admin_improvements(status);
CREATE INDEX IF NOT EXISTS admin_improvements_package_idx
  ON admin_improvements(package_key);
CREATE INDEX IF NOT EXISTS admin_improvements_pr_idx
  ON admin_improvements(pr_number);

CREATE TABLE IF NOT EXISTS admin_releases (
  id uuid PRIMARY KEY,
  version text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  improvement_ids uuid[] NOT NULL DEFAULT '{}',
  test_url text,
  test_status text NOT NULL DEFAULT 'pending',
  test_summary text,
  impact jsonb,
  base_sha text,
  head_sha text,
  approval_fingerprint text,
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  started_at timestamptz,
  published_at timestamptz,
  duration_ms integer,
  release_pr_number integer,
  release_pr_url text,
  release_branch text,
  published_sha text,
  rollback_version text,
  last_error text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_releases
  ADD COLUMN IF NOT EXISTS release_branch text;

CREATE INDEX IF NOT EXISTS admin_releases_status_idx
  ON admin_releases(status, scheduled_at);

CREATE TABLE IF NOT EXISTS admin_improvement_events (
  id uuid PRIMARY KEY,
  improvement_id uuid NOT NULL REFERENCES admin_improvements(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  message text NOT NULL DEFAULT '',
  payload jsonb,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_improvement_events_improvement_idx
  ON admin_improvement_events(improvement_id, created_at DESC);

ALTER TABLE admin_improvements
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'super_admin',
  ADD COLUMN IF NOT EXISTS source_ref_id text,
  ADD COLUMN IF NOT EXISTS source_tenant_id text,
  ADD COLUMN IF NOT EXISTS owner_agent text NOT NULL DEFAULT 'vendi',
  ADD COLUMN IF NOT EXISTS agent_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS agent_summary text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours');
