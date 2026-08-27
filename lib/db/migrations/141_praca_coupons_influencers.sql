-- Cupons, parceiros de marca, influenciadores e Clientes Indicados.
ALTER TABLE praca_payment_recipients DROP CONSTRAINT IF EXISTS praca_payment_recipients_owner_type_check;
ALTER TABLE praca_payment_recipients ADD CONSTRAINT praca_payment_recipients_owner_type_check
  CHECK (owner_type IN ('seller','praca','courier','influencer'));
ALTER TABLE praca_payment_allocations DROP CONSTRAINT IF EXISTS praca_payment_allocations_beneficiary_type_check;
ALTER TABLE praca_payment_allocations ADD CONSTRAINT praca_payment_allocations_beneficiary_type_check
  CHECK (beneficiary_type IN ('seller','praca','courier','provider','influencer'));

CREATE TABLE IF NOT EXISTS praca_brand_partners (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  partner_type text NOT NULL CHECK (partner_type IN ('empresa','influenciador')),
  name text NOT NULL,
  document text,
  email text,
  whatsapp text,
  default_commission_bps integer NOT NULL DEFAULT 0 CHECK (default_commission_bps BETWEEN 0 AND 10000),
  wallet_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','blocked','inactive')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS praca_partner_coupons (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  partner_id text REFERENCES praca_brand_partners(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  discount_bps integer NOT NULL DEFAULT 0 CHECK (discount_bps BETWEEN 0 AND 10000),
  commission_bps integer CHECK (commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000),
  minimum_centavos bigint NOT NULL DEFAULT 0 CHECK (minimum_centavos>=0),
  maximum_discount_centavos bigint CHECK (maximum_discount_centavos IS NULL OR maximum_discount_centavos>=0),
  total_usage_limit integer CHECK (total_usage_limit IS NULL OR total_usage_limit>0),
  per_customer_limit integer CHECK (per_customer_limit IS NULL OR per_customer_limit>0),
  establishes_referral boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,code)
);

CREATE TABLE IF NOT EXISTS praca_customer_referrals (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_key text NOT NULL,
  influencer_partner_id text NOT NULL REFERENCES praca_brand_partners(id) ON DELETE RESTRICT,
  source_coupon_id text REFERENCES praca_partner_coupons(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','ended')),
  linked_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_reason text,
  UNIQUE (tenant_id,customer_key)
);

CREATE TABLE IF NOT EXISTS praca_coupon_redemptions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  coupon_id text NOT NULL REFERENCES praca_partner_coupons(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  customer_key text NOT NULL,
  subtotal_centavos bigint NOT NULL,
  discount_bps integer NOT NULL,
  discount_centavos bigint NOT NULL,
  status text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','confirmed','reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS praca_partner_commissions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  partner_id text NOT NULL REFERENCES praca_brand_partners(id) ON DELETE RESTRICT,
  referral_id text NOT NULL REFERENCES praca_customer_referrals(id) ON DELETE RESTRICT,
  order_id text NOT NULL REFERENCES praca_pedidos(id) ON DELETE RESTRICT,
  coupon_id text REFERENCES praca_partner_coupons(id) ON DELETE SET NULL,
  payment_intent_id text REFERENCES praca_payment_intents(id) ON DELETE RESTRICT,
  base_centavos bigint NOT NULL CHECK (base_centavos>=0),
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  amount_centavos bigint NOT NULL CHECK (amount_centavos>=0),
  status text NOT NULL DEFAULT 'calculated' CHECK (status IN ('calculated','scheduled','earned','paid','blocked','reversed')),
  earned_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id,partner_id)
);

CREATE TABLE IF NOT EXISTS praca_partner_events (
  id bigserial PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  partner_id text REFERENCES praca_brand_partners(id) ON DELETE RESTRICT,
  referral_id text REFERENCES praca_customer_referrals(id) ON DELETE RESTRICT,
  commission_id text REFERENCES praca_partner_commissions(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('partner_created','coupon_created','customer_linked','commission_calculated','commission_earned','commission_paid','commission_reversed','referral_ended')),
  actor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE praca_pedidos ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE praca_pedidos ADD COLUMN IF NOT EXISTS influencer_partner_id text REFERENCES praca_brand_partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS praca_partner_type_idx ON praca_brand_partners (tenant_id,partner_type,status);
CREATE INDEX IF NOT EXISTS praca_coupon_active_idx ON praca_partner_coupons (tenant_id,active,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS praca_referral_partner_idx ON praca_customer_referrals (influencer_partner_id,status,linked_at);
CREATE INDEX IF NOT EXISTS praca_commission_partner_idx ON praca_partner_commissions (partner_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS praca_partner_events_idx ON praca_partner_events (tenant_id,created_at,id);

CREATE OR REPLACE FUNCTION prevent_praca_partner_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'praca_partner_events is append-only'; END; $$;
DROP TRIGGER IF EXISTS praca_partner_events_immutable ON praca_partner_events;
CREATE TRIGGER praca_partner_events_immutable BEFORE UPDATE OR DELETE ON praca_partner_events
FOR EACH ROW EXECUTE FUNCTION prevent_praca_partner_event_mutation();

ALTER TABLE praca_brand_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_partner_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_customer_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_partner_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE praca_partner_events ENABLE ROW LEVEL SECURITY;
DO $policies$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['praca_brand_partners','praca_partner_coupons','praca_customer_referrals','praca_coupon_redemptions','praca_partner_commissions'] LOOP
  BEGIN EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'') WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''') OR current_setting(''app.platform_role'',true)=''super_admin'')',t||'_tenant',t);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
 END LOOP;
END $policies$;
DO $$ BEGIN CREATE POLICY praca_partner_events_select ON praca_partner_events FOR SELECT USING (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY praca_partner_events_insert ON praca_partner_events FOR INSERT WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'') OR current_setting('app.platform_role',true)='super_admin'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
