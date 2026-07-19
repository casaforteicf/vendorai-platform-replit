-- BLOCO 14 — Organizações (redes de lojas) + audit log de troca de tenant
CREATE TABLE IF NOT EXISTS organizacoes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios_organizacao (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL DEFAULT 'admin_organizacao',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS organizacao_id TEXT REFERENCES organizacoes(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS tenant_switch_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  from_tenant_id TEXT NOT NULL,
  to_tenant_id TEXT NOT NULL,
  organizacao_id TEXT NOT NULL,
  ip_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
