-- Watchlist tenant-scoped de pessoas-chave públicas do JARVIS.
-- Não armazena telefone, e-mail privado, localização privada ou outros dados de rastreamento.

CREATE TABLE IF NOT EXISTS jarvis_key_people (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  organization TEXT,
  role TEXT,
  monitoring_reason TEXT,
  public_sources JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jarvis_key_people_tenant_active_idx
  ON jarvis_key_people (tenant_id, active);
