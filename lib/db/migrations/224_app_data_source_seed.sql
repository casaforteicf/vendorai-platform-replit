-- VendorAI App Builder — data sources universais iniciais.
-- As entradas apenas registram contratos; a execução continua restrita a
-- handlers allowlisted no backend e sempre valida tenant/app/membership.

INSERT INTO app_data_source_registry (
  id, key, name, description, category, executor_key,
  config_schema, output_schema, required_permissions, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'viewer.profile',
  'Perfil do usuário do app',
  'Dados básicos da própria identidade externa autenticada.',
  'viewer',
  'viewer.profile',
  '{}'::jsonb,
  '{"type":"object","properties":{"id":{"type":"string"},"displayName":{"type":"string"},"email":{"type":["string","null"]},"phone":{"type":["string","null"]},"locale":{"type":["string","null"]},"roleKey":{"type":"string"},"permissions":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  '[]'::jsonb,
  'active',
  '{"scope":"self","readOnly":true}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  executor_key = EXCLUDED.executor_key,
  config_schema = EXCLUDED.config_schema,
  output_schema = EXCLUDED.output_schema,
  required_permissions = EXCLUDED.required_permissions,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();

INSERT INTO app_data_source_registry (
  id, key, name, description, category, executor_key,
  config_schema, output_schema, required_permissions, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'viewer.linked_contact.summary',
  'Resumo do contato CRM vinculado',
  'Resumo allowlisted do único contato CRM explicitamente vinculado ao App User autenticado.',
  'viewer',
  'viewer.linked_contact.summary',
  '{}'::jsonb,
  '{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"},"email":{"type":["string","null"]},"phone":{"type":["string","null"]},"company":{"type":["string","null"]},"contactKind":{"type":"string"}}}'::jsonb,
  '["profile.crm.read_self"]'::jsonb,
  'active',
  '{"scope":"self_linked_contact","readOnly":true}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  executor_key = EXCLUDED.executor_key,
  config_schema = EXCLUDED.config_schema,
  output_schema = EXCLUDED.output_schema,
  required_permissions = EXCLUDED.required_permissions,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = now();
