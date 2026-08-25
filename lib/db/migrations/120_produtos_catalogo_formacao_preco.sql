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
