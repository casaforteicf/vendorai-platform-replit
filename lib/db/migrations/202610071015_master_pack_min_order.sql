-- Regras de embalagem mestre e quantidade mínima de venda.
-- Valores expressos em quantidade de pacotes primários.
--
-- Exemplo: fechamento_pacote=6m², embalagem_mestre_quantidade=6:
-- necessidade de 7 pacotes => faturamento de 12 pacotes quando fracionamento=false.

ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS embalagem_mestre_quantidade integer,
  ADD COLUMN IF NOT EXISTS quantidade_minima_venda integer,
  ADD COLUMN IF NOT EXISTS multiplo_venda integer,
  ADD COLUMN IF NOT EXISTS permite_fracionar_embalagem_mestre boolean NOT NULL DEFAULT false;

ALTER TABLE produtos_catalogo
  DROP CONSTRAINT IF EXISTS produtos_catalogo_embalagem_mestre_quantidade_check,
  ADD CONSTRAINT produtos_catalogo_embalagem_mestre_quantidade_check
    CHECK (embalagem_mestre_quantidade IS NULL OR embalagem_mestre_quantidade > 0),
  DROP CONSTRAINT IF EXISTS produtos_catalogo_quantidade_minima_venda_check,
  ADD CONSTRAINT produtos_catalogo_quantidade_minima_venda_check
    CHECK (quantidade_minima_venda IS NULL OR quantidade_minima_venda > 0),
  DROP CONSTRAINT IF EXISTS produtos_catalogo_multiplo_venda_check,
  ADD CONSTRAINT produtos_catalogo_multiplo_venda_check
    CHECK (multiplo_venda IS NULL OR multiplo_venda > 0);
