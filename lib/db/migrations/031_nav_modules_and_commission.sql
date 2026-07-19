-- tenant_nav_modules + produtos_catalogo commission + tenants commission default
CREATE TABLE IF NOT EXISTS tenant_nav_modules (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_nav_modules_tenant_key_uidx UNIQUE (tenant_id, module_key)
);

ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS comissao_padrao_percentual NUMERIC(5,2) DEFAULT 0;
