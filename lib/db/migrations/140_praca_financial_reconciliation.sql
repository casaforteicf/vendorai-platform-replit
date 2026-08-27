-- Fechamento e conciliação financeira auditável da operação Praça.ai.
CREATE TABLE IF NOT EXISTS praca_reconciliation_batches (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  period_from date NOT NULL,
  period_to date NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','reviewed','closed')),
  payments_count integer NOT NULL DEFAULT 0,
  balanced_count integer NOT NULL DEFAULT 0,
  divergent_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  gross_centavos bigint NOT NULL DEFAULT 0,
  provider_fee_centavos bigint NOT NULL DEFAULT 0,
  net_centavos bigint NOT NULL DEFAULT 0,
  difference_centavos bigint NOT NULL DEFAULT 0,
  created_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by text REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_to>=period_from)
);

CREATE TABLE IF NOT EXISTS praca_reconciliation_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  batch_id text NOT NULL REFERENCES praca_reconciliation_batches(id) ON DELETE RESTRICT,
  payment_intent_id text NOT NULL REFERENCES praca_payment_intents(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  payment_status text NOT NULL,
  reconciliation_status text NOT NULL CHECK (reconciliation_status IN ('balanced','divergent','pending','blocked')),
  gross_centavos bigint NOT NULL,
  provider_fee_centavos bigint,
  net_centavos bigint,
  expected_net_centavos bigint,
  allocations_centavos bigint NOT NULL DEFAULT 0,
  difference_centavos bigint NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by text REFERENCES users(id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id,payment_intent_id)
);

CREATE TABLE IF NOT EXISTS praca_reconciliation_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  batch_id text NOT NULL REFERENCES praca_reconciliation_batches(id) ON DELETE RESTRICT,
  item_id text REFERENCES praca_reconciliation_items(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('generated','item_resolved','reviewed','closed','reopened')),
  actor_id text REFERENCES users(id) ON DELETE SET NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS praca_reconciliation_batches_idx ON praca_reconciliation_batches (tenant_id,period_to DESC,created_at DESC);
CREATE INDEX IF NOT EXISTS praca_reconciliation_items_idx ON praca_reconciliation_items (batch_id,reconciliation_status,difference_centavos);
CREATE INDEX IF NOT EXISTS praca_reconciliation_events_idx ON praca_reconciliation_events (batch_id,created_at,id);

CREATE OR REPLACE FUNCTION prevent_praca_reconciliation_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'praca_reconciliation_events is append-only'; END;
$$;
DROP TRIGGER IF EXISTS praca_reconciliation_events_immutable ON praca_reconciliation_events;
CREATE TRIGGER praca_reconciliation_events_immutable BEFORE UPDATE OR DELETE ON praca_reconciliation_events
FOR EACH ROW EXECUTE FUNCTION prevent_praca_reconciliation_event_mutation();

ALTER TABLE praca_reconciliation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_reconciliation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_reconciliation_events ENABLE ROW LEVEL SECURITY;
DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['praca_reconciliation_batches','praca_reconciliation_items'] LOOP
    BEGIN EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t||'_tenant',t);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $policies$;
DO $$ BEGIN CREATE POLICY praca_reconciliation_events_select ON praca_reconciliation_events FOR SELECT
USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY praca_reconciliation_events_insert ON praca_reconciliation_events FOR INSERT
WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
