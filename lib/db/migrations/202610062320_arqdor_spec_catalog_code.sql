COMMENT ON COLUMN arch_spec_objects.catalog_code IS
  'Código/SKU/referência técnica do item selecionado no catálogo, preservado na especificação.';
COMMENT ON COLUMN arch_budget_items.catalog_code IS
  'Código/SKU/referência técnica copiado da especificação para o orçamento.';
ALTER TABLE arch_spec_objects
  ADD COLUMN IF NOT EXISTS catalog_code text;

ALTER TABLE arch_budget_items
  ADD COLUMN IF NOT EXISTS catalog_code text;

COMMENT ON COLUMN arch_spec_objects.catalog_code IS
  'Código/SKU/referência técnica do item selecionado no catálogo, preservado na especificação.';

COMMENT ON COLUMN arch_budget_items.catalog_code IS
  'Código/SKU/referência técnica copiado da especificação para o orçamento.';
