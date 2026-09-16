-- VendorAI App Builder — catálogo real do tenant para apps commerce.
-- A execução permanece allowlisted em app_runtime_data_sources.ts e sempre
-- respeita o tenant do App User autenticado.

INSERT INTO app_data_source_registry (
  id, key, name, description, category, executor_key,
  config_schema, output_schema, required_permissions, status, metadata
)
VALUES (
  gen_random_uuid()::text,
  'catalog.products',
  'Produtos ativos do catálogo',
  'Coleção estruturada de produtos ativos, categorias, preços, promoções e disponibilidade do catálogo real do tenant.',
  'catalog',
  'catalog.products',
  '{}'::jsonb,
  '{
    "type":"object",
    "properties":{
      "items":{"type":"array","items":{"type":"object","properties":{
        "id":{"type":"string"},
        "name":{"type":"string"},
        "sku":{"type":["string","null"]},
        "brand":{"type":["string","null"]},
        "description":{"type":["string","null"]},
        "unit":{"type":"string"},
        "imageUrl":{"type":["string","null"]},
        "basePrice":{"type":"string"},
        "promotionalPrice":{"type":["string","null"]},
        "promotionEndsAt":{"type":["string","null"]},
        "controlsStock":{"type":"boolean"},
        "stockQuantity":{"type":["integer","null"]},
        "available":{"type":"boolean"},
        "categoryId":{"type":["string","null"]},
        "categoryName":{"type":["string","null"]},
        "highlighted":{"type":"boolean"},
        "deliveryDays":{"type":["integer","null"]}
      }}},
      "categories":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"name":{"type":"string"}}}},
      "total":{"type":"integer"},
      "sourceOfTruth":{"type":"string"}
    }
  }'::jsonb,
  '[]'::jsonb,
  'active',
  '{"scope":"tenant_catalog","readOnly":true,"structuredCollection":true,"sourceOfTruth":"vendorai.catalog"}'::jsonb
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
