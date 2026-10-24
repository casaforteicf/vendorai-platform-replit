-- Adiciona campos de fornecedor, prazo de entrega, custo e estoque ao catálogo de produtos
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS prazo_entrega_dias integer,
  ADD COLUMN IF NOT EXISTS custo_fornecedor numeric(12, 2),
  ADD COLUMN IF NOT EXISTS estoque_quantidade integer,
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS especificacoes jsonb;
