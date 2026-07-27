-- Módulo Fretes — 4º dos 6 segmentos operacionais pendentes.
CREATE TYPE fretes_veiculo_tipo AS ENUM ('utilitario', 'van', 'caminhao_toco', 'caminhao_truck', 'carreta');
CREATE TYPE fretes_carga_status AS ENUM (
  'cotacao_pendente', 'cotado', 'aprovado', 'coletado', 'em_transito',
  'entregue', 'cancelado'
);

CREATE TABLE IF NOT EXISTS fretes_veiculos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  placa text NOT NULL,
  tipo fretes_veiculo_tipo NOT NULL,
  capacidade_kg numeric(10,2),
  capacidade_m3 numeric(10,2),
  motorista_id text REFERENCES public.users(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fretes_cargas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id text NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  veiculo_id text REFERENCES fretes_veiculos(id) ON DELETE SET NULL,
  endereco_coleta text NOT NULL,
  endereco_entrega text NOT NULL,
  tipo_carga text,
  peso_kg numeric(10,2),
  volume_m3 numeric(10,2),
  valor_cotado numeric(12,2),
  status fretes_carga_status NOT NULL DEFAULT 'cotacao_pendente',
  data_coleta_prevista timestamp,
  data_entrega_prevista timestamp,
  data_coleta_real timestamp,
  data_entrega_real timestamp,
  observacoes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fretes_veiculos_tenant ON fretes_veiculos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fretes_cargas_tenant ON fretes_cargas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fretes_cargas_status ON fretes_cargas(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fretes_cargas_veiculo ON fretes_cargas(veiculo_id);
