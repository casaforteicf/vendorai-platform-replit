-- Tenant-safe objection learning for the Closer.
-- Legacy prospecting_objections rows intentionally keep tenant_id NULL because
-- their original tenant cannot be inferred safely. New code only reads/writes
-- tenant-scoped rows.

ALTER TABLE prospecting_objections
  ADD COLUMN IF NOT EXISTS tenant_id text REFERENCES tenants(id) ON DELETE CASCADE;

ALTER TABLE prospecting_objections
  ADD COLUMN IF NOT EXISTS avancos integer NOT NULL DEFAULT 0;

ALTER TABLE prospecting_objections
  ADD COLUMN IF NOT EXISTS taxa_quebra numeric(5,2);

CREATE INDEX IF NOT EXISTS prospecting_objections_tenant_segment_idx
  ON prospecting_objections (tenant_id, segmento);

CREATE UNIQUE INDEX IF NOT EXISTS prospecting_objections_tenant_normalized_uidx
  ON prospecting_objections (tenant_id, segmento, lower(objecao))
  WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sales_objection_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  objection_id text REFERENCES prospecting_objections(id) ON DELETE SET NULL,
  objection_message_id text,
  response_message_id text,
  raw_objection text NOT NULL,
  normalized_objection text NOT NULL,
  category text NOT NULL DEFAULT 'outro',
  segmento text NOT NULL DEFAULT 'geral',
  response_text text,
  responder_type text,
  agent_name text,
  trigger_used text,
  deal_stage text,
  outcome text NOT NULL DEFAULT 'pending',
  broke_objection boolean NOT NULL DEFAULT false,
  confidence numeric(5,4),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sales_objection_events_tenant_message_uidx
  ON sales_objection_events (tenant_id, conversation_id, objection_message_id);

CREATE INDEX IF NOT EXISTS sales_objection_events_tenant_created_idx
  ON sales_objection_events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sales_objection_events_tenant_category_idx
  ON sales_objection_events (tenant_id, category);

CREATE INDEX IF NOT EXISTS sales_objection_events_tenant_objection_idx
  ON sales_objection_events (tenant_id, objection_id);

CREATE INDEX IF NOT EXISTS sales_objection_events_lead_idx
  ON sales_objection_events (lead_id, created_at DESC);
