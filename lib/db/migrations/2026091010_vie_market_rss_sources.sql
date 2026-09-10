-- Amplia o Radar do JARVIS com fontes editoriais específicas para mercado financeiro.
-- O VendorAI armazena somente metadados, link e resumo; o conteúdo integral permanece no veículo de origem.

WITH source_seed(code, name, endpoint_url, website_url, categories, reliability_score) AS (
  VALUES
    (
      'investing-br-acoes',
      'Investing.com Brasil — Mercado de Ações',
      'https://br.investing.com/rss/news_25.rss',
      'https://br.investing.com/news/stock-market-news',
      '["bolsa-de-valores","acoes","ibovespa","b3","mercado"]'::jsonb,
      86
    ),
    (
      'investing-br-cripto',
      'Investing.com Brasil — Criptomoedas',
      'https://br.investing.com/rss/news_301.rss',
      'https://br.investing.com/news/cryptocurrency-news',
      '["criptomoedas","bitcoin","ethereum","cripto","mercado"]'::jsonb,
      86
    ),
    (
      'investing-br-politica',
      'Investing.com Brasil — Política',
      'https://br.investing.com/rss/news_289.rss',
      'https://br.investing.com/news/politics',
      '["politica","governo","regulacao","economia"]'::jsonb,
      86
    )
)
INSERT INTO vie_sources (
  id, code, name, domain, scope, source_type, endpoint_url, website_url,
  country_code, categories, reliability_score, active, license_notes, terms_url, metadata
)
SELECT
  'source_' || replace(code, '-', '_'), code, name, 'news', 'national', 'rss', endpoint_url, website_url,
  'BR', categories, reliability_score, true,
  'RSS público disponibilizado pelo próprio veículo. Armazenar somente metadados, link e resumo próprio; não republicar conteúdo integral.',
  'https://br.investing.com/webmaster-tools/rss',
  jsonb_build_object('provider', 'Investing.com', 'verified_feed_page', 'https://br.investing.com/webmaster-tools/rss')
FROM source_seed
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  scope = EXCLUDED.scope,
  source_type = EXCLUDED.source_type,
  endpoint_url = EXCLUDED.endpoint_url,
  website_url = EXCLUDED.website_url,
  country_code = EXCLUDED.country_code,
  categories = EXCLUDED.categories,
  reliability_score = EXCLUDED.reliability_score,
  active = EXCLUDED.active,
  license_notes = EXCLUDED.license_notes,
  terms_url = EXCLUDED.terms_url,
  metadata = EXCLUDED.metadata,
  updated_at = now();
