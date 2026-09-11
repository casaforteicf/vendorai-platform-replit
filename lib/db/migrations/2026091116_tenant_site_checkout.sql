CREATE TABLE IF NOT EXISTS site_checkout_orders (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  site_id text NOT NULL REFERENCES generated_sites(id) ON DELETE RESTRICT,
  site_slug text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text,
  customer_cpf_cnpj text,
  billing_type text NOT NULL DEFAULT 'UNDEFINED',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  one_time_total numeric(12,2) NOT NULL DEFAULT 0,
  recurring_total numeric(12,2) NOT NULL DEFAULT 0,
  first_charge_total numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'created',
  asaas_customer_id text,
  asaas_charge_id text,
  asaas_subscription_id text,
  payment_url text,
  page_url text,
  error_code text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS site_checkout_orders_asaas_charge_uidx
  ON site_checkout_orders (asaas_charge_id)
  WHERE asaas_charge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS site_checkout_orders_asaas_subscription_uidx
  ON site_checkout_orders (asaas_subscription_id)
  WHERE asaas_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS site_checkout_orders_tenant_status_idx
  ON site_checkout_orders (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS site_checkout_orders_site_idx
  ON site_checkout_orders (site_id, created_at DESC);

CREATE INDEX IF NOT EXISTS site_checkout_orders_email_idx
  ON site_checkout_orders (customer_email, created_at DESC);

ALTER TABLE site_checkout_orders ENABLE ROW LEVEL SECURITY;
