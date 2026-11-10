-- Ensure the optional JSONB field defined by the current catalog schema exists.
ALTER TABLE public.produtos_catalogo
  ADD COLUMN IF NOT EXISTS especificacoes jsonb;

-- Remove informações comerciais internas da tabela pública de especificações.
-- Margem e regra de preço permanecem nos campos próprios de formação de preço.
UPDATE produtos_catalogo AS produto
SET especificacoes = COALESCE(
  (
    SELECT jsonb_agg(item)
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(produto.especificacoes) = 'array'
          THEN produto.especificacoes
        ELSE '[]'::jsonb
      END
    ) AS item
    WHERE lower(COALESCE(item ->> 'label', '')) NOT LIKE 'margem%'
      AND lower(COALESCE(item ->> 'label', '')) NOT LIKE 'regra de pre%'
  ),
  '[]'::jsonb
)
WHERE produto.especificacoes IS NOT NULL
  AND (
    lower(COALESCE(produto.marca, '')) = 'branno'
    OR produto.descricao ILIKE '%Branno%'
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(produto.especificacoes) = 'array'
          THEN produto.especificacoes
        ELSE '[]'::jsonb
      END
    ) AS item
    WHERE lower(COALESCE(item ->> 'label', '')) LIKE 'margem%'
       OR lower(COALESCE(item ->> 'label', '')) LIKE 'regra de pre%'
  );
