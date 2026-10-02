-- Business Intelligence Core
-- Adds structured commercial intelligence to the existing master product.
-- Additive/non-breaking: existing tenants keep an empty JSON object until enriched.

ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS commercial_intelligence jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS produtos_catalogo_commercial_intelligence_gin_idx
  ON produtos_catalogo USING gin (commercial_intelligence);

COMMENT ON COLUMN produtos_catalogo.commercial_intelligence IS
  'Structured approved commercial knowledge: features, differentials, benefits, pains, objections, proofs, personas, allowed/prohibited claims and complementary products.';
