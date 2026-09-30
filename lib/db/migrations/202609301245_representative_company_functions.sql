-- Company representatives linked directly to tenant user functions.
-- The represented tenant owns the function and therefore owns the delegated access policy.
ALTER TABLE tenant_user_functions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS linked_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_tenant_code TEXT,
  ADD COLUMN IF NOT EXISTS lead_access_scope TEXT NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS representative_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tenant_user_functions
  DROP CONSTRAINT IF EXISTS tenant_user_functions_kind_check,
  ADD CONSTRAINT tenant_user_functions_kind_check
    CHECK (kind IN ('internal', 'external_company'));

ALTER TABLE tenant_user_functions
  DROP CONSTRAINT IF EXISTS tenant_user_functions_lead_access_scope_check,
  ADD CONSTRAINT tenant_user_functions_lead_access_scope_check
    CHECK (lead_access_scope IN ('assigned', 'territory', 'all_authorized'));

ALTER TABLE tenant_user_functions
  DROP CONSTRAINT IF EXISTS tenant_user_functions_representative_user_ids_array,
  ADD CONSTRAINT tenant_user_functions_representative_user_ids_array
    CHECK (jsonb_typeof(representative_user_ids) = 'array');

CREATE INDEX IF NOT EXISTS tenant_user_functions_linked_tenant_idx
  ON tenant_user_functions(linked_tenant_id)
  WHERE kind = 'external_company';

COMMENT ON COLUMN tenant_user_functions.linked_tenant_id IS
  'Tenant externo que atua como representante desta função. As permissões da função valem somente no tenant representado.';
COMMENT ON COLUMN tenant_user_functions.lead_access_scope IS
  'Escopo de leads da representada: assigned, territory ou all_authorized.';
