-- Proximidade real (raio) por vendedor — complementa cidade/região em texto
-- pra quando mais de um vendedor atende a mesma cidade grande.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lead_assignment_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lead_assignment_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lead_assignment_raio_km DOUBLE PRECISION;

-- Cache do geocoding do endereço do lead (Nominatim/OSM, mesma lib do
-- módulo Fretes) — evita geocodificar de novo a cada tentativa de match.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Ordem configurável dos critérios de distribuição (segmento x território)
-- por tenant. Ausência de linha = ordem padrão ["segmento","territorio"],
-- aplicada em código (não depende de INSERT default aqui).
CREATE TABLE IF NOT EXISTS tenant_distribuicao_config (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  criterios JSONB NOT NULL DEFAULT '["segmento","territorio"]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
