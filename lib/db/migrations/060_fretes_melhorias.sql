-- Melhorias do módulo de Fretes: avaliação pós-entrega e rotas com
-- múltiplas paradas (motorista carrega várias cargas numa sequência).

CREATE TABLE IF NOT EXISTS fretes_rotas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  motorista_id text REFERENCES users(id) ON DELETE SET NULL,
  veiculo_id text REFERENCES fretes_veiculos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada','em_andamento','concluida','cancelada')),
  nome text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fretes_rotas_tenant_idx ON fretes_rotas(tenant_id);

ALTER TABLE fretes_cargas ADD COLUMN IF NOT EXISTS avaliacao_nota numeric(2,0);
ALTER TABLE fretes_cargas ADD COLUMN IF NOT EXISTS avaliacao_comentario text;
ALTER TABLE fretes_cargas ADD COLUMN IF NOT EXISTS avaliado_em timestamp;
ALTER TABLE fretes_cargas ADD COLUMN IF NOT EXISTS rota_id text;
ALTER TABLE fretes_cargas ADD COLUMN IF NOT EXISTS ordem_na_rota numeric(3,0);
CREATE INDEX IF NOT EXISTS fretes_cargas_rota_idx ON fretes_cargas(rota_id);
