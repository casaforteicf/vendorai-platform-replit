-- Vincula as imagens públicas Branno aos produtos já cadastrados.
-- O código visual é compartilhado pelas variantes GL, BR e BPS do mesmo acabamento.
UPDATE produtos_catalogo
SET
  imagem_url = 'https://appvendorai.com/imagens/branno/branno-' ||
    substring(sku FROM '^BRN-([0-9]{3})-') ||
    '-estatica.jpg',
  imagens = jsonb_build_array(
    'https://appvendorai.com/imagens/branno/branno-' ||
      substring(sku FROM '^BRN-([0-9]{3})-') ||
      '-estatica.jpg',
    'https://appvendorai.com/imagens/branno/branno-' ||
      substring(sku FROM '^BRN-([0-9]{3})-') ||
      '-aplicacao.jpg'
  ),
  updated_at = now()
WHERE sku ~ '^BRN-(00[1-9]|01[0-9]|02[0-5])-(GL|BR|BPS)$'
  AND (
    lower(COALESCE(marca, '')) = 'branno'
    OR descricao ILIKE '%Branno%'
  );
