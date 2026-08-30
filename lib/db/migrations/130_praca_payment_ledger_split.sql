-- Ledger e split financeiro do ciclo Praça.ai.
CREATE TABLE IF NOT EXISTS praca_payment_recipients (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  owner_type text NOT NULL CHECK (owner_type IN ('seller','praca','courier')),
  owner_id text NOT NULL,
  provider text NOT NULL DEFAULT 'asaas',
  wallet_id text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','blocked','inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,provider,owner_type,owner_id)
);

CREATE TABLE IF NOT EXISTS praca_payment_intents (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'asaas',
  provider_payment_id text,
  provider_customer_id text,
  idempotency_key text NOT NULL,
  billing_type text NOT NULL CHECK (billing_type IN ('PIX','CREDIT_CARD','BOLETO','UNDEFINED')),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','pending','confirmed','received','overdue','refunded',
                      'chargeback','cancelled','failed')),
  currency char(3) NOT NULL DEFAULT 'BRL',
  gross_centavos bigint NOT NULL CHECK (gross_centavos >= 0),
  provider_fee_centavos bigint CHECK (provider_fee_centavos IS NULL OR provider_fee_centavos >= 0),
  net_centavos bigint CHECK (net_centavos IS NULL OR net_centavos >= 0),
  due_date date NOT NULL,
  checkout_url text,
  invoice_url text,
  pix_payload text,
  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  received_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key),
  UNIQUE (provider,provider_payment_id),
  UNIQUE (tenant_id,order_id)
);

CREATE TABLE IF NOT EXISTS praca_payment_allocations (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_intent_id text NOT NULL REFERENCES praca_payment_intents(id) ON DELETE RESTRICT,
  beneficiary_type text NOT NULL CHECK (beneficiary_type IN ('seller','praca','courier','provider')),
  beneficiary_id text NOT NULL,
  wallet_id text,
  amount_centavos bigint NOT NULL CHECK (amount_centavos >= 0),
  basis text NOT NULL,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','scheduled','settled','blocked','reversed','failed')),
  provider_split_id text,
  settled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_intent_id,beneficiary_type,beneficiary_id)
);

CREATE TABLE IF NOT EXISTS praca_payment_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  payment_intent_id text REFERENCES praca_payment_intents(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider,provider_event_id)
);

CREATE INDEX IF NOT EXISTS praca_payment_intents_order_idx
  ON praca_payment_intents (tenant_id,order_id);
CREATE INDEX IF NOT EXISTS praca_payment_intents_status_idx
  ON praca_payment_intents (tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS praca_payment_allocations_intent_idx
  ON praca_payment_allocations (payment_intent_id);
CREATE INDEX IF NOT EXISTS praca_payment_events_intent_idx
  ON praca_payment_events (payment_intent_id,received_at DESC);

CREATE OR REPLACE FUNCTION prevent_praca_payment_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'praca_payment_events is append-only'; END;
$$;
DROP TRIGGER IF EXISTS praca_payment_events_immutable ON praca_payment_events;
CREATE TRIGGER praca_payment_events_immutable
BEFORE UPDATE OR DELETE ON praca_payment_events
FOR EACH ROW EXECUTE FUNCTION prevent_praca_payment_event_mutation();

ALTER TABLE praca_payment_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_payment_events ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['praca_payment_recipients','praca_payment_intents','praca_payment_allocations'] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',
      t || '_tenant', t
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY praca_payment_events_select ON praca_payment_events FOR SELECT
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')
    OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY praca_payment_events_insert ON praca_payment_events FOR INSERT
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')
    OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
