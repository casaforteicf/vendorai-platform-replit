-- Formação auditável do preço de venda e rendimento técnico dos produtos
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS controla_estoque boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS margem_percentual numeric(7, 2),
  ADD COLUMN IF NOT EXISTS frete_percentual numeric(7, 2),
  ADD COLUMN IF NOT EXISTS custo_financeiro_percentual numeric(7, 2),
  ADD COLUMN IF NOT EXISTS rendimento_por_unidade numeric(12, 3),
  ADD COLUMN IF NOT EXISTS unidade_rendimento text;

COMMENT ON COLUMN produtos_catalogo.custo_fornecedor IS 'Custo de aquisição do produto em reais';
COMMENT ON COLUMN produtos_catalogo.margem_percentual IS 'Margem adicionada sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.frete_percentual IS 'Frete adicionado sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.comissao_percentual IS 'Comissão adicionada sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.custo_financeiro_percentual IS 'Custo financeiro adicionado sobre o custo, em percentual';
COMMENT ON COLUMN produtos_catalogo.preco_base IS 'Preço final calculado para o cliente';
COMMENT ON COLUMN produtos_catalogo.rendimento_por_unidade IS 'Rendimento técnico de uma unidade comercial vendida';
COMMENT ON COLUMN produtos_catalogo.unidade_rendimento IS 'Unidade de medida do rendimento, por exemplo m²';

-- Recupera o custo apenas dos registros cuja descrição confirma margem de 120%.
UPDATE produtos_catalogo
SET
  custo_fornecedor = round(preco_base / 2.20, 2),
  margem_percentual = 120.00
WHERE custo_fornecedor IS NULL
  AND descricao ILIKE '%margem de 120% aplicada sobre o custo-base%';

-- Parâmetros comerciais confirmados para o catálogo Branno.
UPDATE produtos_catalogo
SET
  fornecedor = 'Branno',
  prazo_entrega_dias = 20,
  frete_percentual = 10.00,
  comissao_percentual = 5.00,
  custo_financeiro_percentual = 10.00,
  controla_estoque = false,
  estoque_quantidade = NULL
WHERE lower(COALESCE(marca, '')) = 'branno'
   OR descricao ILIKE '%Branno%';

-- Recalcula o valor ao cliente com margem 120% + frete 10% + comissão 5%
-- + custo financeiro 10%, todos adicionados sobre o custo.
UPDATE produtos_catalogo
SET preco_base = round(custo_fornecedor * 2.45, 2)
WHERE custo_fornecedor IS NOT NULL
  AND (
    lower(COALESCE(marca, '')) = 'branno'
    OR descricao ILIKE '%Branno%'
  );

-- Extrai o rendimento verdadeiro já registrado na descrição de cada embalagem.
UPDATE produtos_catalogo
SET
  rendimento_por_unidade = replace(
    (regexp_match(descricao, 'rendimento aproximado de ([0-9]+,[0-9]+) m²', 'i'))[1],
    ',',
    '.'
  )::numeric,
  unidade_rendimento = 'm²'
WHERE rendimento_por_unidade IS NULL
  AND descricao ~* 'rendimento aproximado de [0-9]+,[0-9]+ m²';

-- A tabela oficial informa faixa de 2,40-2,50 m² (GL) e 10,00-11,00 m²
-- (BR/BPS) para Finezza. Para orçamento usa-se o limite conservador.
UPDATE produtos_catalogo
SET rendimento_por_unidade = CASE
  WHEN nome ~* ' - GL 5,5 kg' THEN 2.400
  ELSE 10.000
END,
unidade_rendimento = 'm²'
WHERE nome ~* '(Finezza Preziosa|Pietra Finezza)';

-- Branni Satinatto #14 usa a coluna de granulometria #14 da tabela:
-- 1,20 m² para GL e 5,00 m² para BR/BPS.
UPDATE produtos_catalogo
SET rendimento_por_unidade = CASE
  WHEN nome ~* ' - GL 5,5 kg' THEN 1.200
  ELSE 5.000
END,
unidade_rendimento = 'm²'
WHERE nome ~* '^Branni Satinatto .*#14';

-- Mantém a descrição técnica sincronizada com o rendimento conferido.
UPDATE produtos_catalogo
SET descricao = regexp_replace(
  descricao,
  'rendimento aproximado de [0-9]+,[0-9]+ m²',
  'rendimento aproximado de ' ||
    replace(to_char(rendimento_por_unidade, 'FM999990.00'), '.', ',') ||
    ' m²',
  'i'
)
WHERE rendimento_por_unidade IS NOT NULL
  AND descricao ~* 'rendimento aproximado de [0-9]+,[0-9]+ m²';

-- Remove a regra comercial da descrição, preservando a informação técnica.
UPDATE produtos_catalogo
SET descricao = trim(regexp_replace(
  descricao,
  '\s*Preço final com margem de 120% aplicada sobre o custo-base\.?',
  '',
  'gi'
))
WHERE descricao ILIKE '%Preço final com margem de 120% aplicada sobre o custo-base%';
