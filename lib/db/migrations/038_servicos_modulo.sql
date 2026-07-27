-- Módulo Serviços (pedreiro/eletricista/encanador) — 6º dos 8 segmentos novos.
CREATE TABLE IF NOT EXISTS servicos_prestadores (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome varchar(255) NOT NULL,
  email varchar(255),
  telefone varchar(20),
  especialidade varchar(20) NOT NULL DEFAULT 'geral',
  raio_atendimento_km integer DEFAULT 15,
  comissao_base numeric(5,2) DEFAULT 60,
  ativo boolean DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servicos_tipos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome varchar(255) NOT NULL,
  descricao text,
  especialidade varchar(20) NOT NULL DEFAULT 'geral',
  preco_base numeric(10,2),
  requer_visita_tecnica boolean DEFAULT true,
  ativo boolean DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS servicos_ordens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cliente_id text NOT NULL REFERENCES leads(id) ON DELETE RESTRICT,
  prestador_id text REFERENCES servicos_prestadores(id) ON DELETE SET NULL,
  tipo_servico_id text NOT NULL REFERENCES servicos_tipos(id) ON DELETE RESTRICT,
  endereco_atendimento text NOT NULL,
  status varchar(25) DEFAULT 'orcamento_pendente',
  data_hora_visita timestamp,
  valor_orcado numeric(10,2),
  valor_final numeric(10,2),
  fotos_antes jsonb,
  fotos_depois jsonb,
  observacoes text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_servicos_prestadores_tenant ON servicos_prestadores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_servicos_tipos_tenant ON servicos_tipos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_servicos_ordens_tenant ON servicos_ordens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_servicos_ordens_prestador ON servicos_ordens(prestador_id);
CREATE INDEX IF NOT EXISTS idx_servicos_ordens_status ON servicos_ordens(tenant_id, status);
