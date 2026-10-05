-- Synchronize the current Vendor.ai commercial offers into the master
-- produtos_catalogo. Scoped only to the institutional Vendor.ai catalog.
-- Existing tenant product catalogs are untouched.

WITH vendor_catalog AS (
  SELECT tenant_id, categoria_id
  FROM produtos_catalogo
  WHERE tenant_id IS NOT NULL
    AND (
      sku LIKE 'vendor-%'
      OR lower(nome) IN ('arqdor.ai','arqdor')
    )
  ORDER BY
    CASE WHEN sku IN ('vendor-crm-monthly','vendor-growth-monthly') THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1
),
offers(sku, nome, product_type, preco, descricao, credits, destaque, tags) AS (
  VALUES
    ('vendor-prepaid', 'Vendor Pré-Pago', 'saas_plan', 0::numeric,
      'Entrada sem mensalidade. Usuários ilimitados e compra de Vendor Credits sob demanda.', 0, false,
      '["Vendor.ai","Pré-Pago","Vendor Credits"]'::jsonb),
    ('vendor-start-monthly', 'Vendor Start', 'saas_plan', 49::numeric,
      'CRM básico, agenda, propostas simples e IA básica. Usuários ilimitados. Inclui 500 Vendor Credits por mês.', 500, true,
      '["Vendor.ai","CRM","Start","Vendor Credits"]'::jsonb),
    ('vendor-sales-monthly', 'Vendor Sales', 'saas_plan', 149::numeric,
      'CRM comercial completo com pipelines, propostas, negociação, Next Best Action e Closer assistido. Usuários ilimitados. Inclui 1.500 Vendor Credits por mês.', 1500, true,
      '["Vendor.ai","Vendas","CRM","Vendor Credits"]'::jsonb),
    ('vendor-prospector-v2-monthly', 'Vendor Prospector', 'saas_plan', 197::numeric,
      'Prospecção, enriquecimento, sinais de oportunidade e descoberta de decisores. Usuários ilimitados. Inclui 2.500 Vendor Credits por mês.', 2500, true,
      '["Vendor.ai","Prospecção","Vendor Credits"]'::jsonb),
    ('vendor-marketing-monthly', 'Vendor Marketing', 'saas_plan', 197::numeric,
      'Planejamento, conteúdo, campanhas, mídia e biblioteca integrados. Usuários ilimitados. Inclui 2.500 Vendor Credits por mês.', 2500, true,
      '["Vendor.ai","Marketing","Vendor Credits"]'::jsonb),
    ('vendor-service-monthly', 'Vendor Service', 'saas_plan', 197::numeric,
      'Atendimento omnichannel, suporte e pós-venda conectados ao CRM. Usuários ilimitados. Inclui 2.000 Vendor Credits por mês.', 2000, true,
      '["Vendor.ai","Atendimento","Omnichannel","Vendor Credits"]'::jsonb),
    ('vendor-agents-monthly', 'Vendor Agents', 'saas_plan', 197::numeric,
      'Agentes especializados de IA para SDR, Closer, Financeiro, Cobrança, Suporte, Agendamento e Pós-venda. Usuários ilimitados. Inclui 2.500 Vendor Credits por mês.', 2500, true,
      '["Vendor.ai","Agentes IA","Vendor Credits"]'::jsonb),
    ('vendor-intelligence-monthly', 'Vendor Intelligence', 'saas_plan', 197::numeric,
      'BI, Customer Intelligence, Revenue Intelligence, forecast, intenção, churn e Next Best Action. Usuários ilimitados. Inclui 1.500 Vendor Credits por mês.', 1500, false,
      '["Vendor.ai","BI","Inteligência","Vendor Credits"]'::jsonb),
    ('vendor-finance-monthly', 'Vendor Finance', 'saas_plan', 149::numeric,
      'Financeiro operacional conectado ao CRM: recebíveis, cobranças, alertas e previsão. Usuários ilimitados. Inclui 1.000 Vendor Credits por mês.', 1000, false,
      '["Vendor.ai","Financeiro","Vendor Credits"]'::jsonb),
    ('vendor-build-monthly', 'Vendor Build', 'saas_plan', 297::numeric,
      'Gestão de obras e execução: diário, cronograma, custos, compras, fornecedores, checklists e portal do cliente. Usuários ilimitados. Inclui 2.000 Vendor Credits por mês.', 2000, true,
      '["Vendor.ai","Obras","Construção","Vendor Credits"]'::jsonb),
    ('arqdor-monthly', 'Arqdor', 'saas_plan', 197::numeric,
      'Pré-projeto, planta 2D/3D, imagem para planta, materiais, IFC e renders arquitetônicos. Usuários ilimitados. Inclui 2.500 Vendor Credits por mês.', 2500, true,
      '["Vendor.ai","Arqdor","Arquitetura","Render","Vendor Credits"]'::jsonb),
    ('vendor-commerce-monthly', 'Vendor Commerce', 'saas_plan', 149::numeric,
      'Catálogo, produtos, pedidos, checkout, pagamentos, ofertas, upsell e cross-sell. Usuários ilimitados. Inclui 1.000 Vendor Credits por mês. Taxa transacional aplicável.', 1000, false,
      '["Vendor.ai","Commerce","Checkout","Vendor Credits"]'::jsonb),
    ('vendor-complete-monthly', 'Vendor.ai Complete', 'saas_plan', 697::numeric,
      'Todos os produtos especializados aplicáveis ao tenant em uma única plataforma. Usuários ilimitados. Inclui 7.500 Vendor Credits por mês.', 7500, true,
      '["Vendor.ai","Complete","Bundle","Vendor Credits"]'::jsonb)
),
upserted AS (
  INSERT INTO produtos_catalogo (
    id, tenant_id, categoria_id, nome, sku, product_type, descricao,
    preco_base, preco_mensalidade, unidade, ativo, destaque, recorrencia,
    tags, especificacoes, inteligencia_comercial, project_library_enabled,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid()::text,
    vc.tenant_id,
    vc.categoria_id,
    o.nome,
    o.sku,
    o.product_type,
    o.descricao,
    o.preco,
    o.preco,
    'un',
    true,
    o.destaque,
    'mensal',
    o.tags,
    jsonb_build_array(
      jsonb_build_object('label','Mensalidade','value',
        CASE WHEN o.preco = 0 THEN 'R$ 0/mês'
             ELSE 'R$ ' || trim(to_char(o.preco, 'FM999G999G990D00')) || '/mês' END),
      jsonb_build_object('label','Usuários','value','Ilimitados'),
      jsonb_build_object('label','Vendor Credits incluídos','value',
        trim(to_char(o.credits, 'FM999G999G990')) || '/mês'),
      jsonb_build_object('label','Credits adicionais','value','Compra disponível sem troca de plano')
    ),
    jsonb_build_object(
      'beneficios', jsonb_build_array('Usuários ilimitados', 'Vendor Credits mensais incluídos'),
      'afirmacoesPermitidas', jsonb_build_array(
        'Vendor Credits são a unidade comercial do Vendor.ai',
        'Tokens técnicos e custos de provedor não são exibidos ao tenant'
      ),
      'notasComerciais', jsonb_build_array(
        'Operações normais do software não consomem Vendor Credits',
        'Credits adicionais podem ser comprados a qualquer momento'
      ),
      'origem', 'manual',
      'aprovadoEm', now()::text
    ),
    false,
    now(),
    now()
  FROM vendor_catalog vc
  CROSS JOIN offers o
  WHERE NOT EXISTS (
    SELECT 1
    FROM produtos_catalogo existing
    WHERE existing.tenant_id = vc.tenant_id
      AND existing.sku = o.sku
  )
  RETURNING id, sku
)
UPDATE produtos_catalogo p
SET nome = o.nome,
    product_type = o.product_type,
    descricao = o.descricao,
    preco_base = o.preco,
    preco_mensalidade = o.preco,
    unidade = 'un',
    ativo = true,
    destaque = o.destaque,
    recorrencia = 'mensal',
    tags = o.tags,
    especificacoes = jsonb_build_array(
      jsonb_build_object('label','Mensalidade','value',
        CASE WHEN o.preco = 0 THEN 'R$ 0/mês'
             ELSE 'R$ ' || trim(to_char(o.preco, 'FM999G999G990D00')) || '/mês' END),
      jsonb_build_object('label','Usuários','value','Ilimitados'),
      jsonb_build_object('label','Vendor Credits incluídos','value',
        trim(to_char(o.credits, 'FM999G999G990')) || '/mês'),
      jsonb_build_object('label','Credits adicionais','value','Compra disponível sem troca de plano')
    ),
    inteligencia_comercial = coalesce(p.inteligencia_comercial, '{}'::jsonb) || jsonb_build_object(
      'beneficios', jsonb_build_array('Usuários ilimitados', 'Vendor Credits mensais incluídos'),
      'afirmacoesPermitidas', jsonb_build_array(
        'Vendor Credits são a unidade comercial do Vendor.ai',
        'Tokens técnicos e custos de provedor não são exibidos ao tenant'
      ),
      'notasComerciais', jsonb_build_array(
        'Operações normais do software não consomem Vendor Credits',
        'Credits adicionais podem ser comprados a qualquer momento'
      ),
      'origem', 'manual',
      'aprovadoEm', now()::text
    ),
    project_library_enabled = false,
    updated_at = now()
FROM vendor_catalog vc
JOIN offers o ON true
WHERE p.tenant_id = vc.tenant_id
  AND p.sku = o.sku;

-- Repoint current commercial profiles to the corresponding catalog products.
UPDATE commercial_product_profiles cpp
SET catalog_product_id = pc.id,
    updated_at = now()
FROM produtos_catalogo pc
WHERE pc.sku = CASE cpp.commercial_key
  WHEN 'vendor.prepaid' THEN 'vendor-prepaid'
  WHEN 'vendor.start' THEN 'vendor-start-monthly'
  WHEN 'vendor.sales' THEN 'vendor-sales-monthly'
  WHEN 'vendor.prospector' THEN 'vendor-prospector-v2-monthly'
  WHEN 'vendor.marketing' THEN 'vendor-marketing-monthly'
  WHEN 'vendor.service' THEN 'vendor-service-monthly'
  WHEN 'vendor.agents' THEN 'vendor-agents-monthly'
  WHEN 'vendor.intelligence' THEN 'vendor-intelligence-monthly'
  WHEN 'vendor.finance' THEN 'vendor-finance-monthly'
  WHEN 'vendor.build' THEN 'vendor-build-monthly'
  WHEN 'arqdor.ai' THEN 'arqdor-monthly'
  WHEN 'vendor.commerce' THEN 'vendor-commerce-monthly'
  WHEN 'vendor.complete' THEN 'vendor-complete-monthly'
  ELSE NULL
END
AND (cpp.metadata ->> 'commercialCatalogVersion') = '2026-10';

-- Hide superseded institutional Vendor.ai SaaS offers from new sales/catalog
-- screens. They remain in the database for history and legacy references.
WITH vendor_catalog AS (
  SELECT tenant_id
  FROM produtos_catalogo
  WHERE sku IN ('vendor-start-monthly','vendor-complete-monthly')
  ORDER BY created_at DESC
  LIMIT 1
)
UPDATE produtos_catalogo p
SET ativo = false,
    destaque = false,
    updated_at = now()
FROM vendor_catalog vc
WHERE p.tenant_id = vc.tenant_id
  AND p.sku IN (
    'vendor-crm-free','vendor-crm-monthly','vendor-growth-monthly','vendor-growth-5d',
    'vendor-prospector-monthly','vendor-omnichannel-monthly','vendor-ai-team-10-monthly',
    'vendor-revenue-scout-monthly','vendor-content-planner-monthly',
    'vendor-content-studio-monthly','vendor-creative-studio-monthly',
    'vendor-sites-autopilot-monthly','vendor-ads-monthly',
    'vendor-jarvis-monthly','vendor-financeiro-erp-monthly'
  );
