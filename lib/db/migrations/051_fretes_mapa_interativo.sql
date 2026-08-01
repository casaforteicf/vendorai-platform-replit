-- Mapa interativo: ponto exato marcado no mapa pra coleta/entrega (além do
-- endereço em texto) + histórico de posições pra desenhar o rastro do
-- trajeto percorrido, não só a posição atual.

ALTER TABLE fretes_cargas
  ADD COLUMN IF NOT EXISTS endereco_coleta_lat double precision,
  ADD COLUMN IF NOT EXISTS endereco_coleta_lng double precision,
  ADD COLUMN IF NOT EXISTS endereco_entrega_lat double precision,
  ADD COLUMN IF NOT EXISTS endereco_entrega_lng double precision;

CREATE TABLE IF NOT EXISTS fretes_localizacoes_historico (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carga_id text NOT NULL REFERENCES fretes_cargas(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  registrado_em timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fretes_localizacoes_historico_carga_idx
  ON fretes_localizacoes_historico(carga_id, registrado_em);
