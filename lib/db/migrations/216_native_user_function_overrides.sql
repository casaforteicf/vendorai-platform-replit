ALTER TABLE tenant_user_functions
  ADD COLUMN IF NOT EXISTS system_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_user_functions_tenant_system_key_uq
  ON tenant_user_functions (tenant_id, system_key)
  WHERE system_key IS NOT NULL;

ALTER TABLE tenant_user_functions
  DROP CONSTRAINT IF EXISTS tenant_user_functions_system_key_check;

ALTER TABLE tenant_user_functions
  ADD CONSTRAINT tenant_user_functions_system_key_check
  CHECK (
    system_key IS NULL OR
    system_key IN (
      'vendedor',
      'representante_comercial',
      'financeiro',
      'suporte',
      'entrega',
      'administrador',
      'outro'
    )
  );
