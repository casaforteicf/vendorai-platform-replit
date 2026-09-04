-- VendorAI App Builder — fundação segura para Actions universais.
-- O registry permanece declarativo: executor_key aponta somente para handlers
-- allowlisted no backend. Nenhum SQL, URL ou código executável é armazenado aqui.

ALTER TABLE app_action_registry
  ADD COLUMN IF NOT EXISTS executor_key text,
  ADD COLUMN IF NOT EXISTS output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS app_action_registry_status_idx
  ON app_action_registry (status);
CREATE INDEX IF NOT EXISTS app_action_registry_executor_idx
  ON app_action_registry (executor_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_action_registry_required_permissions_array_check'
      AND conrelid = 'app_action_registry'::regclass
  ) THEN
    ALTER TABLE app_action_registry
      ADD CONSTRAINT app_action_registry_required_permissions_array_check
      CHECK (jsonb_typeof(required_permissions) = 'array');
  END IF;
END $$;

-- A API SuperAdmin já protege a autoria do registry. O runtime recebe apenas
-- SELECT e ainda exige executor allowlisted + policy publicada + permissão atual.
GRANT SELECT, INSERT, UPDATE, DELETE ON app_action_registry TO vendorai_app;

COMMENT ON COLUMN app_action_registry.executor_key IS
  'Chave opaca de handler implementado e allowlisted no backend; nunca SQL, URL ou código.';
COMMENT ON COLUMN app_action_registry.required_permissions IS
  'Permissões atuais do membership exigidas antes de executar a Action.';
COMMENT ON COLUMN app_action_registry.output_schema IS
  'Contrato declarativo da resposta segura retornada ao App Runtime.';

-- Primeira Action universal: altera apenas campos não sensíveis do próprio
-- App User autenticado. Email, status, tenant, lead e identidade de autenticação
-- ficam deliberadamente fora deste contrato.
INSERT INTO app_action_registry (
  id, key, name, description, category, input_schema, output_schema,
  executor_key, required_permissions, risk_level, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'viewer.profile.update',
  'Atualizar próprio perfil',
  'Atualiza somente nome, telefone e locale da identidade externa autenticada.',
  'viewer',
  '{"type":"object","additionalProperties":false,"properties":{"displayName":{"type":"string","minLength":2,"maxLength":160},"phone":{"type":["string","null"],"minLength":3,"maxLength":40},"locale":{"type":["string","null"],"minLength":2,"maxLength":35}},"minProperties":1}'::jsonb,
  '{"type":"object","properties":{"id":{"type":"string"},"displayName":{"type":"string"},"email":{"type":["string","null"]},"phone":{"type":["string","null"]},"locale":{"type":["string","null"]}}}'::jsonb,
  'viewer.profile.update',
  '["profile.write_self"]'::jsonb,
  'low',
  'active',
  '{"scope":"self","writesSensitiveIdentity":false}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  executor_key = EXCLUDED.executor_key,
  required_permissions = EXCLUDED.required_permissions,
  risk_level = EXCLUDED.risk_level,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();
