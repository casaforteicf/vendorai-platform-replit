CREATE TABLE IF NOT EXISTS obra_financeiro_titulos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  status text NOT NULL DEFAULT 'aberto',
  origem text NOT NULL DEFAULT 'manual',
  origem_id text,
  pedido_compra_id text REFERENCES obra_pedidos_compra(id) ON DELETE SET NULL,
  execucao_snapshot_id text REFERENCES obra_execucao_snapshots(id) ON DELETE SET NULL,
  orcamento_id text REFERENCES obra_orcamentos(id) ON DELETE SET NULL,
  contraparte text,
  documento_numero text,
  descricao text NOT NULL,
  categoria text,
  centro_custo text,
  competencia date,
  data_emissao date,
  data_vencimento date,
  valor_original numeric(15,4) NOT NULL,
  valor_aberto numeric(15,4) NOT NULL,
  valor_liquidado numeric(15,4) NOT NULL DEFAULT 0,
  juros numeric(15,4) NOT NULL DEFAULT 0,
  multa numeric(15,4) NOT NULL DEFAULT 0,
  desconto numeric(15,4) NOT NULL DEFAULT 0,
  previsao_caixa boolean NOT NULL DEFAULT true,
  observacoes text,
  metadata jsonb,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_financeiro_titulos_obra_tipo_status_idx ON obra_financeiro_titulos(obra_id,tipo,status);
CREATE INDEX IF NOT EXISTS obra_financeiro_titulos_vencimento_idx ON obra_financeiro_titulos(data_vencimento);
CREATE INDEX IF NOT EXISTS obra_financeiro_titulos_origem_idx ON obra_financeiro_titulos(origem,origem_id);

CREATE TABLE IF NOT EXISTS obra_financeiro_movimentos (
  id text PRIMARY KEY,
  titulo_id text NOT NULL REFERENCES obra_financeiro_titulos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  data_movimento date NOT NULL,
  valor numeric(15,4) NOT NULL,
  forma_pagamento text,
  conta_financeira text,
  documento_numero text,
  observacoes text,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_financeiro_movimentos_titulo_data_idx ON obra_financeiro_movimentos(titulo_id,data_movimento);

CREATE TABLE IF NOT EXISTS obra_financeiro_fluxo_snapshots (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  data_referencia date NOT NULL,
  contas_pagar_aberto numeric(15,4) NOT NULL DEFAULT 0,
  contas_receber_aberto numeric(15,4) NOT NULL DEFAULT 0,
  pago_acumulado numeric(15,4) NOT NULL DEFAULT 0,
  recebido_acumulado numeric(15,4) NOT NULL DEFAULT 0,
  saldo_caixa numeric(15,4) NOT NULL DEFAULT 0,
  custo_realizado numeric(15,4) NOT NULL DEFAULT 0,
  receita_contratada numeric(15,4) NOT NULL DEFAULT 0,
  margem_realizada numeric(15,4) NOT NULL DEFAULT 0,
  memoria_calculo jsonb NOT NULL,
  criado_por_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);