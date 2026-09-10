CREATE TABLE IF NOT EXISTS commerce_checkout_sessions (
  id text PRIMARY KEY,
  site_id text NOT NULL REFERENCES generated_sites(id) ON DELETE RESTRICT,
  site_slug text NOT NULL,
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  offer_snapshot jsonb NOT NULL,
  attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_name text NOT NULL,
  company_name text NOT NULL,
  email text NOT NULL,
  phone text,
  cpf_cnpj text,
  password_hash text NOT NULL,
  billing_type text NOT NULL DEFAULT 'UNDEFINED',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','payment_pending','paid','provisioning','provisioned','failed','cancelled')),
  asaas_customer_id text,
  asaas_charge_id text UNIQUE,
  payment_url text,
  provisioned_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  error_code text,
  paid_at timestamp,
  provisioned_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_checkout_site_idx ON commerce_checkout_sessions(site_id, created_at);
CREATE INDEX IF NOT EXISTS commerce_checkout_email_idx ON commerce_checkout_sessions(email, created_at);
CREATE INDEX IF NOT EXISTS commerce_checkout_status_idx ON commerce_checkout_sessions(status, created_at);
