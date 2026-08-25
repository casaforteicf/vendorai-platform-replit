-- Formação auditável do preço de venda dos produtos
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS margem_percentual numeric(7, 2),
  ADD COLUMN IF NOT EXISTS frete_percentual numeric(7, 2),
  ADD COLUMN IF NOT EXISTS custo_financeiro_percentual numeric(7, 2);

COMMENT ON COLUMN produtos_catalogo.custo_fornecedor IS 'Custo de aquisição do produto em reais';
COMMENT ON COLUMN produtos_catalogo.margem_percentual IS 'Margem adicionada sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.frete_percentual IS 'Frete adicionado sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.comissao_percentual IS 'Comissão adicionada sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.custo_financeiro_percentual IS 'Custo financeiro adicionado sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.preco_base IS 'Preço final calculado para o cliente';

-- Migração segura dos produtos que já foram importados com margem de 120%.
-- Só deriva o custo quando a própria descrição confirma essa regra.
UPDATE produtos_catalogo
SET
  custo_fornecedor = round(preco_base / 2.20, 2),
  margem_percentual = 120.00,
  frete_percentual = 0.00,
  comissao_percentual = COALESCE(comissao_percentual, 0.00),
  custo_financeiro_percentual = 0.00
WHERE custo_fornecedor IS NULL
  AND descricao ILIKE '%margem de 120% aplicada sobre o custo-base%';

-- Remove texto comercial indevido da descrição técnica sem alterar o restante.
UPDATE produtos_catalogo
SET descricao = trim(regexp_replace(
  descricao,
  '\\s*Preço final com margem de 120% aplicada sobre o custo-base\\.?',
  '',
  'gi'
))
WHERE descricao ILIKE '%Preço final com margem de 120% aplicada sobre o custo-base%';
