-- Módulo Imóveis — 3º dos 6 segmentos operacionais pendentes.
CREATE TYPE imoveis_tipo AS ENUM ('casa', 'apartamento', 'terreno', 'comercial', 'rural', 'sala_comercial');
CREATE TYPE imoveis_finalidade AS ENUM ('venda', 'aluguel');
CREATE TYPE imoveis_status AS ENUM ('disponivel', 'reservado', 'vendido', 'alugado', 'inativo');
CREATE TYPE imoveis_visita_status AS ENUM ('agendada', 'confirmada', 'realizada', 'cancelada');

CREATE TABLE IF NOT EXISTS imoveis_propriedades (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  tipo imoveis_tipo NOT NULL,
  finalidade imoveis_finalidade NOT NULL,
  endereco text,
  bairro text,
  cidade text,
  cep text,
  area_m2 numeric(10,2),
  quartos integer,
  banheiros integer,
  vagas integer,
  valor numeric(14,2) NOT NULL,
  valor_condominio numeric(10,2),
  valor_iptu numeric(10,2),
  fotos jsonb,
  status imoveis_status NOT NULL DEFAULT 'disponivel',
  destaque boolean NOT NULL DEFAULT false,
  corretor_responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS imoveis_visitas (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  propriedade_id text NOT NULL REFERENCES imoveis_propriedades(id) ON DELETE CASCADE,
  cliente_id text NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  corretor_id text REFERENCES users(id) ON DELETE SET NULL,
  data_hora timestamp NOT NULL,
  status imoveis_visita_status NOT NULL DEFAULT 'agendada',
  feedback text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imoveis_propriedades_tenant ON imoveis_propriedades(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_propriedades_status ON imoveis_propriedades(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_imoveis_visitas_tenant ON imoveis_visitas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_imoveis_visitas_propriedade ON imoveis_visitas(propriedade_id);
