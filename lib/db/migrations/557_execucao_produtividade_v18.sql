CREATE TABLE IF NOT EXISTS obra_execucao_atividades (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id text REFERENCES obra_etapas(id) ON DELETE SET NULL,
  orcamento_etapa_id text REFERENCES obra_orcamento_etapas(id) ON DELETE SET NULL,
  orcamento_item_id text REFERENCES obra_orcamento_itens(id) ON DELETE SET NULL,
  elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  codigo text,
  nome text NOT NULL,
  unidade text NOT NULL,
  quantidade_planejada numeric(15,4) NOT NULL,
  quantidade_executada numeric(15,4) NOT NULL DEFAULT 0,
  percentual_executado numeric(9,4) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planejada',
  inicio_previsto date,
  fim_previsto date,
  inicio_real timestamptz,
  fim_real timestamptz,
  custo_planejado numeric(15,4) NOT NULL DEFAULT 0,
  custo_realizado numeric(15,4) NOT NULL DEFAULT 0,
  produtividade_planejada numeric(15,6),
  produtividade_real numeric(15,6),
  unidade_produtividade text,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  origem text,
  origem_ref text,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_execucao_atividades_obra_status_idx ON obra_execucao_atividades(obra_id,status);
CREATE INDEX IF NOT EXISTS obra_execucao_atividades_orc_item_idx ON obra_execucao_atividades(orcamento_item_id);

CREATE TABLE IF NOT EXISTS obra_execucao_medicoes (
  id text PRIMARY KEY,
  atividade_id text NOT NULL REFERENCES obra_execucao_atividades(id) ON DELETE CASCADE,
  data_medicao date NOT NULL,
  quantidade_executada numeric(15,4) NOT NULL,
  percentual_informado numeric(9,4),
  origem text NOT NULL DEFAULT 'manual',
  origem_ref text,
  qualidade_status text NOT NULL DEFAULT 'pendente',
  aprovado boolean NOT NULL DEFAULT false,
  aprovado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  observacoes text,
  metadata jsonb,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_execucao_consumos (
  id text PRIMARY KEY,
  atividade_id text NOT NULL REFERENCES obra_execucao_atividades(id) ON DELETE CASCADE,
  insumo_id text REFERENCES insumos(id) ON DELETE SET NULL,
  descricao text NOT NULL,
  quantidade numeric(15,4) NOT NULL,
  unidade text NOT NULL,
  custo_unitario numeric(15,6) NOT NULL,
  custo_total numeric(15,4) NOT NULL,
  origem_estoque boolean NOT NULL DEFAULT false,
  data_referencia date NOT NULL,
  perda_quantidade numeric(15,4) NOT NULL DEFAULT 0,
  motivo_perda text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_execucao_mao_obra (
  id text PRIMARY KEY,
  atividade_id text NOT NULL REFERENCES obra_execucao_atividades(id) ON DELETE CASCADE,
  recurso_id text,
  funcao text,
  quantidade_pessoas numeric(10,2) NOT NULL DEFAULT 1,
  horas numeric(15,4) NOT NULL,
  custo_hora numeric(15,4) NOT NULL,
  custo_total numeric(15,4) NOT NULL,
  data_referencia date NOT NULL,
  origem text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_execucao_equipamentos (
  id text PRIMARY KEY,
  atividade_id text NOT NULL REFERENCES obra_execucao_atividades(id) ON DELETE CASCADE,
  equipamento_id text,
  descricao text,
  horas numeric(15,4) NOT NULL,
  custo_hora numeric(15,4) NOT NULL,
  custo_total numeric(15,4) NOT NULL,
  data_referencia date NOT NULL,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_execucao_snapshots (
  id text PRIMARY KEY,
  atividade_id text NOT NULL REFERENCES obra_execucao_atividades(id) ON DELETE CASCADE,
  data_referencia date NOT NULL,
  quantidade_executada numeric(15,4) NOT NULL,
  percentual_executado numeric(9,4) NOT NULL,
  horas_homem numeric(15,4) NOT NULL DEFAULT 0,
  horas_equipamento numeric(15,4) NOT NULL DEFAULT 0,
  custo_mao_obra numeric(15,4) NOT NULL DEFAULT 0,
  custo_equipamentos numeric(15,4) NOT NULL DEFAULT 0,
  custo_materiais numeric(15,4) NOT NULL DEFAULT 0,
  custo_total_realizado numeric(15,4) NOT NULL DEFAULT 0,
  produtividade_real numeric(15,6),
  desvio_custo_percentual numeric(9,4),
  desvio_produtividade_percentual numeric(9,4),
  memoria_calculo jsonb NOT NULL,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);