-- Arqdor ecosystem catalog
-- Makes every active project-library product from an Arqdor-enabled tenant
-- discoverable in the Arqdor ecosystem without duplicating the master product.

WITH eligible AS (
  SELECT
    pc.id AS master_product_id,
    pc.tenant_id AS vendedor_tenant_id,
    pc.nome,
    pc.descricao,
    cp.nome AS categoria,
    COALESCE(pc.preco_arqdor, pc.preco_base) AS preco,
    (
      SELECT COALESCE(jsonb_agg(DISTINCT img), '[]'::jsonb)
      FROM (
        SELECT NULLIF(pc.imagem_url, '') AS img
        UNION ALL
        SELECT jsonb_array_elements_text(COALESCE(pc.imagens, '[]'::jsonb))
      ) x
      WHERE img IS NOT NULL
    ) AS imagens,
    jsonb_build_object(
      'source', 'produtos_catalogo',
      'masterProductId', pc.id,
      'sourceTenantId', pc.tenant_id,
      'model3dUrl', pc.model3d_url,
      'textureUrl', pc.texture_url,
      'projectLibraryEnabled', pc.project_library_enabled
    ) AS especificacoes
  FROM produtos_catalogo pc
  JOIN tenants t
    ON t.id = pc.tenant_id
   AND t.status = 'active'
  JOIN tenant_nav_modules tnm
    ON tnm.tenant_id = pc.tenant_id
   AND tnm.module_key = 'arch'
   AND tnm.is_enabled = true
  LEFT JOIN categorias_produto cp
    ON cp.id = pc.categoria_id
   AND cp.tenant_id = pc.tenant_id
  WHERE pc.ativo = true
    AND pc.project_library_enabled = true
    AND COALESCE(pc.tipo_calculo, '') <> 'componente_interno_engenharia'
)
INSERT INTO arch_marketplace_items (
  id,
  vendedor_tenant_id,
  master_product_id,
  nome,
  descricao,
  categoria,
  preco,
  imagens,
  especificacoes,
  ativo,
  created_at
)
SELECT
  gen_random_uuid()::text,
  e.vendedor_tenant_id,
  e.master_product_id,
  e.nome,
  e.descricao,
  e.categoria,
  e.preco,
  e.imagens,
  e.especificacoes,
  true,
  now()
FROM eligible e
ON CONFLICT (vendedor_tenant_id, master_product_id)
  WHERE master_product_id IS NOT NULL
DO UPDATE SET
  nome = EXCLUDED.nome,
  descricao = EXCLUDED.descricao,
  categoria = EXCLUDED.categoria,
  preco = EXCLUDED.preco,
  imagens = EXCLUDED.imagens,
  especificacoes = EXCLUDED.especificacoes,
  ativo = true;

UPDATE arch_marketplace_items ami
SET ativo = false
WHERE ami.master_product_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM produtos_catalogo pc
    JOIN tenants t
      ON t.id = pc.tenant_id
     AND t.status = 'active'
    JOIN tenant_nav_modules tnm
      ON tnm.tenant_id = pc.tenant_id
     AND tnm.module_key = 'arch'
     AND tnm.is_enabled = true
    WHERE pc.id = ami.master_product_id
      AND pc.tenant_id = ami.vendedor_tenant_id
      AND pc.ativo = true
      AND pc.project_library_enabled = true
      AND COALESCE(pc.tipo_calculo, '') <> 'componente_interno_engenharia'
  );
