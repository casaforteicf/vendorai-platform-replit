-- Corrige o host das imagens Branno: os arquivos estáticos são servidos
-- pelo frontend em app.appvendorai.com, não pelo site institucional.
UPDATE produtos_catalogo
SET
  imagem_url = replace(
    imagem_url,
    'https://appvendorai.com/imagens/branno/',
    'https://app.appvendorai.com/imagens/branno/'
  ),
  imagens = (
    SELECT jsonb_agg(
      replace(
        item #>> '{}',
        'https://appvendorai.com/imagens/branno/',
        'https://app.appvendorai.com/imagens/branno/'
      )
      ORDER BY ordinality
    )
    FROM jsonb_array_elements(imagens) WITH ORDINALITY AS gallery(item, ordinality)
  ),
  updated_at = now()
WHERE sku ~ '^BRN-(00[1-9]|01[0-9]|02[0-5])-(GL|BR|BPS)$'
  AND (
    imagem_url LIKE 'https://appvendorai.com/imagens/branno/%'
    OR imagens::text LIKE '%https://appvendorai.com/imagens/branno/%'
  );
