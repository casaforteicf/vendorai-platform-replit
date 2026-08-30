-- Ações financeiras executivas do Praça.ai controladas no Vendor.ai.
CREATE TABLE IF NOT EXISTS praca_payment_actions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  payment_intent_id text NOT NULL REFERENCES praca_payment_intents(id) ON DELETE RESTRICT,
  action_type text NOT NULL CHECK (action_type IN ('cancel_charge','full_refund')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','processing','provider_accepted','completed','failed')),
  reason text NOT NULL,
  idempotency_key text NOT NULL,
  requested_by text,
  request_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  provider_accepted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS praca_payment_actions_order_idx
  ON praca_payment_actions (tenant_id,order_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS praca_payment_actions_intent_idx
  ON praca_payment_actions (payment_intent_id,requested_at DESC);
CREATE INDEX IF NOT EXISTS praca_payment_actions_status_idx
  ON praca_payment_actions (tenant_id,status,requested_at DESC);

ALTER TABLE praca_payment_actions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY praca_payment_actions_tenant ON praca_payment_actions FOR ALL
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')
    OR current_setting('app.platform_role',true)='super_admin')
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')
    OR current_setting('app.platform_role',true)='super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
