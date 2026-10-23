-- VendorAI SaaS plans seed for tenant 1d4ea673-58d0-413a-a554-c9aca72a3121
-- The Drizzle schema defines this boolean, but older databases may not yet have it.
-- Ensure the schema dependency exists before the SaaS catalog seed uses it.
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS exige_agendamento boolean NOT NULL DEFAULT false;

-- Deactivate all non-standard products (legacy names or wrong types)
UPDATE produtos_catalogo
SET ativo = false, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121'
  AND nome NOT IN ('Growth Mensal','Growth Anual','PME+ Mensal','PME+ Anual','Enterprise Mensal','Enterprise Anual');

-- Growth Mensal
UPDATE produtos_catalogo
SET preco_base = 1490.00, preco_implantacao = 4900.00, preco_mensalidade = 1490.00,
    product_type = 'saas_plan', recorrencia = 'mensal', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Growth Mensal';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'Growth Mensal', 'saas_plan',
  1490.00, 4900.00, 1490.00, 'mensal', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Growth Mensal'
);

-- Growth Anual
UPDATE produtos_catalogo
SET preco_base = 1190.00, preco_implantacao = 4900.00, preco_mensalidade = 1190.00,
    product_type = 'saas_plan', recorrencia = 'anual', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Growth Anual';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'Growth Anual', 'saas_plan',
  1190.00, 4900.00, 1190.00, 'anual', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Growth Anual'
);

-- PME+ Mensal
UPDATE produtos_catalogo
SET preco_base = 1890.00, preco_implantacao = 6900.00, preco_mensalidade = 1890.00,
    product_type = 'saas_plan', recorrencia = 'mensal', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'PME+ Mensal';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'PME+ Mensal', 'saas_plan',
  1890.00, 6900.00, 1890.00, 'mensal', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'PME+ Mensal'
);

-- PME+ Anual
UPDATE produtos_catalogo
SET preco_base = 1490.00, preco_implantacao = 6900.00, preco_mensalidade = 1490.00,
    product_type = 'saas_plan', recorrencia = 'anual', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'PME+ Anual';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'PME+ Anual', 'saas_plan',
  1490.00, 6900.00, 1490.00, 'anual', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'PME+ Anual'
);

-- Enterprise Mensal
UPDATE produtos_catalogo
SET preco_base = 2490.00, preco_implantacao = 8900.00, preco_mensalidade = 2490.00,
    product_type = 'saas_plan', recorrencia = 'mensal', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Enterprise Mensal';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'Enterprise Mensal', 'saas_plan',
  2490.00, 8900.00, 2490.00, 'mensal', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Enterprise Mensal'
);

-- Enterprise Anual
UPDATE produtos_catalogo
SET preco_base = 1990.00, preco_implantacao = 8900.00, preco_mensalidade = 1990.00,
    product_type = 'saas_plan', recorrencia = 'anual', prazo_contrato = 12,
    ativo = true, destaque = true, updated_at = now()
WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Enterprise Anual';

INSERT INTO produtos_catalogo
  (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
   recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
SELECT gen_random_uuid(), '1d4ea673-58d0-413a-a554-c9aca72a3121', 'Enterprise Anual', 'saas_plan',
  1990.00, 8900.00, 1990.00, 'anual', 12, 'un', true, true, false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM produtos_catalogo
  WHERE tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121' AND nome = 'Enterprise Anual'
);
