-- D-005: análise de conteúdo (SEO/legibilidade) em cada página gerada
-- (landing page, e-commerce, institucional). Reaproveita o mesmo tipo
-- de checklist já usado no Content Autopilot (Otimizador), adaptado
-- pra HTML em vez de markdown de artigo.
ALTER TABLE generated_sites
  ADD COLUMN IF NOT EXISTS seo_score integer,
  ADD COLUMN IF NOT EXISTS seo_checklist jsonb,
  ADD COLUMN IF NOT EXISTS analisado_em timestamp;
