-- Frete estilo Uber: motorista aceita carga disponível (em vez de ser
-- atribuído manualmente) + rastreio de localização ao vivo enquanto a
-- carga está em rota.

ALTER TABLE fretes_cargas
  ADD COLUMN IF NOT EXISTS motorista_id text REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS localizacao_lat double precision,
  ADD COLUMN IF NOT EXISTS localizacao_lng double precision,
  ADD COLUMN IF NOT EXISTS localizacao_atualizada_em timestamp;

CREATE INDEX IF NOT EXISTS idx_fretes_cargas_motorista ON fretes_cargas(motorista_id);
