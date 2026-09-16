-- App Runtime commerce capabilities. Checkout é medium risk e exige confirmação
-- explícita no payload; por isso não pode virar action_form genérico.
INSERT INTO app_action_registry (
  id, key, name, description, category, input_schema, output_schema,
  executor_key, required_permissions, risk_level, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'commerce.checkout.start',
  'Iniciar checkout automático',
  'Valida o carrinho no catálogo oficial, reserva estoque controlado e cria a cobrança real no Asaas do tenant.',
  'commerce',
  '{
    "type":"object",
    "required":["confirmPurchase","idempotencyKey","items"],
    "properties":{
      "confirmPurchase":{"const":true},
      "idempotencyKey":{"type":"string","minLength":8,"maxLength":120},
      "billingType":{"type":"string","enum":["PIX","BOLETO","CREDIT_CARD","UNDEFINED"]},
      "cpfCnpj":{"type":"string","maxLength":24},
      "phone":{"type":"string","maxLength":40},
      "items":{"type":"array","minItems":1,"maxItems":50,"items":{"type":"object","required":["sku","quantity"],"properties":{"sku":{"type":"string"},"quantity":{"type":"integer","minimum":1,"maximum":99}}}}
    },
    "additionalProperties":false
  }'::jsonb,
  '{
    "type":"object",
    "properties":{
      "orderId":{"type":"string"},
      "status":{"type":"string"},
      "paymentUrl":{"type":["string","null"]},
      "provider":{"type":"string"},
      "totals":{"type":"object"},
      "reused":{"type":"boolean"}
    }
  }'::jsonb,
  'commerce.checkout.start',
  '[]'::jsonb,
  'medium',
  'active',
  '{"requiresExplicitConfirmation":true,"idempotent":true,"paymentProvider":"asaas","sourceOfTruth":"vendorai.commerce"}'::jsonb
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

INSERT INTO app_data_source_registry (
  id, key, name, description, category, executor_key,
  config_schema, output_schema, required_permissions, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'commerce.orders',
  'Pedidos do usuário do app',
  'Histórico de pedidos e checkouts do App User autenticado dentro da App Instance atual.',
  'commerce',
  'commerce.orders',
  '{}'::jsonb,
  '{
    "type":"object",
    "properties":{
      "items":{"type":"array"},
      "sourceOfTruth":{"type":"string"}
    }
  }'::jsonb,
  '[]'::jsonb,
  'active',
  '{"scope":"app_user","readOnly":true,"sourceOfTruth":"vendorai.commerce"}'::jsonb
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
