-- Expande Notícias & Mercado do JARVIS para 25 canais RSS oficiais.
-- O VendorAI armazena metadados, link de origem e resumo próprio; não republica conteúdo integral.

WITH source_seed(code, name, scope, endpoint_url, website_url, categories, reliability_score, provider) AS (
  VALUES
    ('agencia-brasil-latest', 'Agência Brasil — Últimas Notícias', 'national', 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', 'https://agenciabrasil.ebc.com.br/', '["geral","nacional"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-economia', 'Agência Brasil — Economia', 'national', 'https://agenciabrasil.ebc.com.br/rss/economia/feed.xml', 'https://agenciabrasil.ebc.com.br/economia', '["economia","mercado","macroeconomia"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-direitos-humanos', 'Agência Brasil — Direitos Humanos', 'national', 'https://agenciabrasil.ebc.com.br/rss/direitos-humanos/feed.xml', 'https://agenciabrasil.ebc.com.br/direitos-humanos', '["direitos-humanos","social"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-educacao', 'Agência Brasil — Educação', 'national', 'https://agenciabrasil.ebc.com.br/rss/educacao/feed.xml', 'https://agenciabrasil.ebc.com.br/educacao', '["educacao","pesquisa"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-esportes', 'Agência Brasil — Esportes', 'national', 'https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml', 'https://agenciabrasil.ebc.com.br/esportes', '["esportes"]'::jsonb, 90, 'EBC'),
    ('agencia-brasil-geral', 'Agência Brasil — Geral', 'national', 'https://agenciabrasil.ebc.com.br/rss/geral/feed.xml', 'https://agenciabrasil.ebc.com.br/geral', '["geral","nacional"]'::jsonb, 90, 'EBC'),
    ('agencia-brasil-internacional', 'Agência Brasil — Internacional', 'international', 'https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml', 'https://agenciabrasil.ebc.com.br/internacional', '["internacional","geopolitica","comercio-exterior"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-justica', 'Agência Brasil — Justiça', 'national', 'https://agenciabrasil.ebc.com.br/rss/justica/feed.xml', 'https://agenciabrasil.ebc.com.br/justica', '["justica","regulatorio"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-politica', 'Agência Brasil — Política', 'national', 'https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', 'https://agenciabrasil.ebc.com.br/politica', '["politica","governo","regulatorio"]'::jsonb, 92, 'EBC'),
    ('agencia-brasil-saude', 'Agência Brasil — Saúde', 'national', 'https://agenciabrasil.ebc.com.br/rss/saude/feed.xml', 'https://agenciabrasil.ebc.com.br/saude', '["saude","regulatorio"]'::jsonb, 92, 'EBC'),
    ('camara-ultimas', 'Agência Câmara — Últimas Notícias', 'national', 'https://www.camara.leg.br/noticias/rss/ultimas-noticias', 'https://www.camara.leg.br/noticias/', '["legislativo","nacional","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-administracao-publica', 'Agência Câmara — Administração Pública', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/ADMINISTRACAO-PUBLICA', 'https://www.camara.leg.br/noticias/', '["administracao-publica","governo","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-agropecuaria', 'Agência Câmara — Agropecuária', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/AGROPECUARIA', 'https://www.camara.leg.br/noticias/', '["agropecuaria","agronegocio","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-ciencia-tecnologia', 'Agência Câmara — Ciência e Tecnologia', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/CIENCIA-E-TECNOLOGIA', 'https://www.camara.leg.br/noticias/', '["ciencia","tecnologia","inovacao"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-cidades', 'Agência Câmara — Cidades', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/CIDADES', 'https://www.camara.leg.br/noticias/', '["cidades","municipios","infraestrutura"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-consumidor', 'Agência Câmara — Consumidor', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/CONSUMIDOR', 'https://www.camara.leg.br/noticias/', '["consumidor","mercado","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-direitos-humanos', 'Agência Câmara — Direitos Humanos', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/DIREITOS-HUMANOS', 'https://www.camara.leg.br/noticias/', '["direitos-humanos","social","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-economia', 'Agência Câmara — Economia', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/ECONOMIA', 'https://www.camara.leg.br/noticias/', '["economia","tributos","mercado","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-educacao-cultura', 'Agência Câmara — Educação e Cultura', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/EDUCACAO-E-CULTURA', 'https://www.camara.leg.br/noticias/', '["educacao","cultura","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-industria-comercio', 'Agência Câmara — Indústria e Comércio', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/INDUSTRIA-E-COMERCIO', 'https://www.camara.leg.br/noticias/', '["industria","comercio","empresas","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-meio-ambiente', 'Agência Câmara — Meio Ambiente', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/MEIO-AMBIENTE', 'https://www.camara.leg.br/noticias/', '["meio-ambiente","sustentabilidade","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-politica', 'Agência Câmara — Política', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/POLITICA', 'https://www.camara.leg.br/noticias/', '["politica","legislativo","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-saude', 'Agência Câmara — Saúde', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/SAUDE', 'https://www.camara.leg.br/noticias/', '["saude","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-trabalho-previdencia', 'Agência Câmara — Trabalho e Previdência', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/TRABALHO-E-PREVIDENCIA', 'https://www.camara.leg.br/noticias/', '["trabalho","previdencia","emprego","regulatorio"]'::jsonb, 96, 'Agência Câmara'),
    ('camara-transporte-transito', 'Agência Câmara — Transporte e Trânsito', 'national', 'https://www.camara.leg.br/noticias/rss/dinamico/TRANSPORTE-E-TRANSITO', 'https://www.camara.leg.br/noticias/', '["transporte","transito","logistica","infraestrutura"]'::jsonb, 96, 'Agência Câmara')
)
INSERT INTO vie_sources (
  id, code, name, domain, scope, source_type, endpoint_url, website_url,
  country_code, categories, reliability_score, active, license_notes, terms_url, metadata
)
SELECT
  'source_' || replace(code, '-', '_'), code, name, 'news', scope, 'rss', endpoint_url, website_url,
  'BR', categories, reliability_score, true,
  CASE provider
    WHEN 'EBC' THEN 'RSS oficial da EBC. Armazenar apenas metadados, link de origem e resumo próprio; respeitar termos vigentes e atribuição.'
    ELSE 'RSS oficial da Agência Câmara. A reprodução é autorizada com crédito; no VendorAI manter metadados, link e resumo próprio.'
  END,
  CASE provider
    WHEN 'EBC' THEN 'https://www.ebc.com.br/termos-de-uso'
    ELSE 'https://www.camara.leg.br/noticias/rss'
  END,
  jsonb_build_object('provider', provider, 'verified_feed_page', CASE provider WHEN 'EBC' THEN 'https://agenciabrasil.ebc.com.br/feed/' ELSE 'https://www.camara.leg.br/noticias/rss' END)
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
