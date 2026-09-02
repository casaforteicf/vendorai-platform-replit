-- Gestão ERP passa a ser add-on comercial do VendorAI por R$ 299/mês.
-- Regra de migração: nenhum tenant recebe ERP por padrão. O Super Admin
-- reativa individualmente após a contratação, sem apagar nenhum dado do ERP.

INSERT INTO tenant_nav_modules (id, tenant_id, module_key, is_enabled, updated_at)
SELECT
  'erp-addon-' || t.id,
  t.id,
  'financeiro',
  FALSE,
  NOW()
FROM tenants t
ON CONFLICT (tenant_id, module_key)
DO UPDATE SET
  is_enabled = FALSE,
  updated_at = NOW();

-- Produto comercial da própria plataforma (tenant_id NULL).
UPDATE produtos_catalogo
SET
  nome = 'Gestão ERP',
  product_type = 'saas_addon',
  descricao = 'Gestão financeira e operacional integrada ao VendorAI. Add-on contratado separadamente.',
  preco_base = 299.00,
  preco_mensalidade = 299.00,
  unidade = 'mês',
  recorrencia = 'mensal',
  ativo = TRUE,
  updated_at = NOW()
WHERE tenant_id IS NULL
  AND sku = 'ERP-ADDON-M';

INSERT INTO produtos_catalogo (
  id,
  tenant_id,
  nome,
  sku,
  product_type,
  descricao,
  preco_base,
  preco_mensalidade,
  unidade,
  recorrencia,
  ativo,
  created_at,
  updated_at
)
SELECT
  'vendorai-erp-addon-monthly',
  NULL,
  'Gestão ERP',
  'ERP-ADDON-M',
  'saas_addon',
  'Gestão financeira e operacional integrada ao VendorAI. Add-on contratado separadamente.',
  299.00,
  299.00,
  'mês',
  'mensal',
  TRUE,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM produtos_catalogo
  WHERE tenant_id IS NULL
    AND sku = 'ERP-ADDON-M'
);
