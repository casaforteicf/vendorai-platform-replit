-- Modelo de ML treinado (LightGBM), pronto pra quando a feature store
-- tiver dado real acumulado. Binário guardado direto no Postgres (bytea)
-- pra não depender de mais uma peça de infra (Storage externo) só pra um
-- arquivo pequeno.

CREATE TABLE IF NOT EXISTS ml_models (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'propensao_conversao',
  modelo_binario bytea NOT NULL,
  metricas jsonb NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ml_models_ativo ON ml_models(nome, ativo) WHERE ativo = true;
