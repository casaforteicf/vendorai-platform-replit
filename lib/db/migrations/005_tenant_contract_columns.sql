-- Tenant contract template + settings columns + round-robin last_assigned_at
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_template_html TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_template_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_settings JSONB NOT NULL DEFAULT '{}';

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP;
