ALTER TABLE tenants
 ADD COLUMN IF NOT EXISTS asaas_account_id text,
 ADD COLUMN IF NOT EXISTS asaas_wallet_id text,
 ADD COLUMN IF NOT EXISTS praca_financial_status text NOT NULL DEFAULT 'not_started',
 ADD COLUMN IF NOT EXISTS praca_kyc_status text NOT NULL DEFAULT 'not_started',
 ADD COLUMN IF NOT EXISTS praca_financial_updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_tenants_praca_financial_status ON tenants(praca_financial_status) WHERE praca_financial_status<>'not_started';