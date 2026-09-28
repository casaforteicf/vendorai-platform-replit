-- Fases executivas do orçamento/obra e medições financeiras por fase.
-- A proposta aprovada continua sendo a linha-base; estas tabelas materializam
-- as fases para acompanhamento, medição e portal do cliente.

CREATE TABLE IF NOT EXISTS obra_etapa_fases (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  etapa_id text NOT NULL REFERENCES obra_etapas(id) ON DELETE CASCADE,
  origem_fase_id text,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  data_inicio_prevista date,
  data_fim_prevista date,
  data_inicio_real date,
  data_fim_real date,
  status text NOT NULL DEFAULT 'pendente',
  percentual_etapa numeric(7,4) NOT NULL DEFAULT 0,
  percentual_executado numeric(5,2) NOT NULL DEFAULT 0,
  custo_previsto numeric(15,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS obra_etapa_fases_origem_uq
  ON obra_etapa_fases(etapa_id, origem_fase_id)
  WHERE origem_fase_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS obra_etapa_fases_obra_idx ON obra_etapa_fases(obra_id);
CREATE INDEX IF NOT EXISTS obra_etapa_fases_etapa_idx ON obra_etapa_fases(etapa_id);

CREATE TABLE IF NOT EXISTS obra_etapa_fase_dependencias (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  fase_id text NOT NULL REFERENCES obra_etapa_fases(id) ON DELETE CASCADE,
  depende_de_fase_id text NOT NULL REFERENCES obra_etapa_fases(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'FS',
  defasagem_dias integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS obra_etapa_fase_dependencias_uq
  ON obra_etapa_fase_dependencias(fase_id, depende_de_fase_id);

CREATE TABLE IF NOT EXISTS obra_etapa_fase_medicoes (
  id text PRIMARY KEY,
  fase_id text NOT NULL REFERENCES obra_etapa_fases(id) ON DELETE CASCADE,
  data date NOT NULL,
  percentual_anterior numeric(5,2) NOT NULL DEFAULT 0,
  percentual_novo numeric(5,2) NOT NULL,
  valor_bruto numeric(15,2) NOT NULL DEFAULT 0,
  amortizacao_entrada numeric(15,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(15,2) NOT NULL DEFAULT 0,
  saldo_entrada_apos numeric(15,2) NOT NULL DEFAULT 0,
  responsavel_id text REFERENCES users(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obra_etapa_fase_medicoes_fase_idx ON obra_etapa_fase_medicoes(fase_id);
CREATE INDEX IF NOT EXISTS obra_etapa_fase_medicoes_data_idx ON obra_etapa_fase_medicoes(data);
