-- Módulo Veículos — 5º e último dos 6 segmentos operacionais pendentes.
CREATE TYPE veiculos_combustivel AS ENUM ('flex', 'gasolina', 'diesel', 'eletrico', 'hibrido', 'gnv');
CREATE TYPE veiculos_cambio AS ENUM ('manual', 'automatico', 'cvt');
CREATE TYPE veiculos_status AS ENUM ('disponivel', 'reservado', 'vendido', 'inativo');
CREATE TYPE veiculos_test_drive_status AS ENUM ('agendado', 'confirmado', 'realizado', 'cancelado');

CREATE TABLE IF NOT EXISTS veiculos_estoque (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  placa text,
  marca text NOT NULL,
  modelo text NOT NULL,
  ano_fabricacao integer,
  ano_modelo integer,
  cor text,
  km integer,
  combustivel veiculos_combustivel,
  cambio veiculos_cambio,
  valor numeric(12,2) NOT NULL,
  valor_promocional numeric(12,2),
  descricao text,
  fotos jsonb,
  status veiculos_status NOT NULL DEFAULT 'inativo',
  vistoria_realizada boolean NOT NULL DEFAULT false,
  vistoria_laudo_url text,
  destaque boolean NOT NULL DEFAULT false,
  vendedor_responsavel_id text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veiculos_test_drives (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  veiculo_id text NOT NULL REFERENCES veiculos_estoque(id) ON DELETE CASCADE,
  cliente_id text NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  vendedor_id text REFERENCES public.users(id) ON DELETE SET NULL,
  data_hora timestamp NOT NULL,
  status veiculos_test_drive_status NOT NULL DEFAULT 'agendado',
  feedback text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veiculos_estoque_tenant ON veiculos_estoque(tenant_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_estoque_status ON veiculos_estoque(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_veiculos_test_drives_tenant ON veiculos_test_drives(tenant_id);
CREATE INDEX IF NOT EXISTS idx_veiculos_test_drives_veiculo ON veiculos_test_drives(veiculo_id);
