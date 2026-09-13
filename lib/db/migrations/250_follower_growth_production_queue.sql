CREATE TABLE IF NOT EXISTS follower_growth_production_queue (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  title text NOT NULL,
  theme text,
  priority text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'todo',
  pack jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignee_user_id text,
  due_at timestamptz,
  created_by_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, external_key)
);

CREATE INDEX IF NOT EXISTS follower_growth_production_queue_tenant_status_idx
  ON follower_growth_production_queue (tenant_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS follower_growth_production_queue_history (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  queue_item_id text NOT NULL REFERENCES follower_growth_production_queue(id) ON DELETE CASCADE,
  actor_user_id text,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS follower_growth_production_queue_history_item_idx
  ON follower_growth_production_queue_history (tenant_id, queue_item_id, created_at DESC);
