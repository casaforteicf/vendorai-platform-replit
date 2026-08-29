CREATE TABLE IF NOT EXISTS access_licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'prepaid' CHECK (mode IN ('prepaid','annual','legacy')),
  status text NOT NULL DEFAULT 'read_only' CHECK (status IN ('active','read_only','pending_contract','cancelled')),
  access_ends_at timestamp,
  free_benefit_month text,
  free_activated_at timestamp,
  free_ends_at timestamp,
  annual_starts_at timestamp,
  annual_ends_at timestamp,
  annual_contract_id text,
  reminder_stage integer NOT NULL DEFAULT 0,
  reminder_sent_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT access_licenses_tenant_unique UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS access_pass_purchases (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  days integer NOT NULL DEFAULT 5 CHECK (days = 5),
  amount numeric(10,2) NOT NULL DEFAULT 399.00 CHECK (amount = 399.00),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded','chargeback')),
  provider text NOT NULL DEFAULT 'asaas',
  provider_charge_id text,
  provider_customer_id text,
  invoice_url text,
  idempotency_key text,
  paid_at timestamp,
  access_starts_at timestamp,
  access_ends_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT access_pass_purchases_idempotency_unique UNIQUE (tenant_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS access_contract_acceptances (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  responsible_name text NOT NULL,
  responsible_cpf text NOT NULL,
  responsible_role text NOT NULL,
  responsible_email text NOT NULL,
  terms_version text NOT NULL,
  terms_hash text NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  accepted_at timestamp,
  accepted_ip text,
  accepted_user_agent text,
  monthly_amount numeric(10,2),
  commitment_months integer NOT NULL DEFAULT 12,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','active','cancelled')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS access_licenses_status_idx ON access_licenses(status,access_ends_at);
CREATE INDEX IF NOT EXISTS access_pass_purchases_charge_idx ON access_pass_purchases(provider_charge_id);
CREATE INDEX IF NOT EXISTS access_contract_acceptances_tenant_idx ON access_contract_acceptances(tenant_id,created_at DESC);
