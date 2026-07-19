-- Seed: tenant institucional (formulário do site / SDR inbound)
-- Garante tenant sistema + credenciais para +5549998089269 (appvendorai.ai)
INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES (
  'vendorai-institucional',
  'VendorAI Institucional',
  'vendorai-institucional',
  'active',
  NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_configs
  (id, tenant_id, zapi_instance_id, zapi_token, zapi_client_token, agents, created_at, updated_at)
VALUES (
  gen_random_uuid()::text,
  'vendorai-institucional',
  '3F4B096FA7AD21713937F6DAA4CB42D9',
  'F6220ACB787A36D9C7966393',
  'Fe921a2894051472ab785be24e73b55b5S',
  '{}'::jsonb,
  NOW(), NOW()
)
ON CONFLICT (tenant_id) DO UPDATE SET
  zapi_instance_id  = '3F4B096FA7AD21713937F6DAA4CB42D9',
  zapi_token        = 'F6220ACB787A36D9C7966393',
  zapi_client_token = 'Fe921a2894051472ab785be24e73b55b5S',
  updated_at        = NOW();
