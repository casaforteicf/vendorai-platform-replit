-- Adiciona fontes temáticas ao Radar do Dia para arquitetura, design, construção e inspirações.
-- O VendorAI armazena metadados, link e resumo do feed; o conteúdo integral permanece no veículo de origem.

WITH source_seed(code, name, endpoint_url, website_url, categories, reliability_score) AS (
  VALUES
    (
      'google-news-arquitetura-design',
      'Google News — Arquitetura & Design',
      'https://news.google.com/rss/search?q=arquitetura%20design%20interiores&hl=pt-BR&gl=BR&ceid=BR:pt-419',
      'https://news.google.com/',
      '["arquitetura-design","arquitetura","design","interiores","mercado"]'::jsonb,
      78
    ),
    (
      'google-news-construcao-civil',
      'Google News — Construção Civil',
      'https://news.google.com/rss/search?q=construcao%20civil%20mercado%20obras&hl=pt-BR&gl=BR&ceid=BR:pt-419',
      'https://news.google.com/',
      '["construcao","construcao-civil","engenharia-civil","obras","mercado"]'::jsonb,
      78
    ),
    (
      'google-news-inspiracoes-projetos',
      'Google News — Inspirações para Projetos',
      'https://news.google.com/rss/search?q=projetos%20arquitetura%20fachadas%20interiores%20design&hl=pt-BR&gl=BR&ceid=BR:pt-419',
      'https://news.google.com/',
      '["inspiracoes-projetos","arquitetura","design","fachadas","interiores"]'::jsonb,
      76
    )
)
INSERT INTO vie_sources (
  id, code, name, domain, scope, source_type, endpoint_url, website_url,
  country_code, categories, reliability_score, active, license_notes, terms_url, metadata
)
SELECT
  'source_' || replace(code, '-', '_'), code, name, 'news', 'national', 'rss', endpoint_url, website_url,
  'BR', categories, reliability_score, true,
  'Feed RSS de agregação. Armazenar somente metadados, link e resumo; não republicar conteúdo integral.',
  'https://news.google.com/',
  jsonb_build_object('provider', 'Google News', 'purpose', code)
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
