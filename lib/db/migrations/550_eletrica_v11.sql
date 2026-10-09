CREATE TABLE IF NOT EXISTS obra_eletrica_pontos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  codigo text,
  tipo text NOT NULL,
  descricao text,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  potencia_w numeric(15,4),
  tensao_v numeric(10,2),
  fases integer,
  circuito_id text,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  inclui_infraestrutura_ate_caixa boolean NOT NULL DEFAULT true,
  inclui_dispositivo_final boolean NOT NULL DEFAULT true,
  origem text,
  origem_ref text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_eletrica_pontos_obra_tipo_idx ON obra_eletrica_pontos(obra_id, tipo);
CREATE INDEX IF NOT EXISTS obra_eletrica_pontos_ambiente_idx ON obra_eletrica_pontos(ambiente_id);

CREATE TABLE IF NOT EXISTS obra_eletrica_circuitos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  tipo text NOT NULL DEFAULT 'circuito',
  quadro_codigo text,
  descricao text,
  tensao_v numeric(10,2),
  fases integer,
  potencia_instalada_w numeric(15,4),
  demanda_w numeric(15,4),
  corrente_a numeric(15,4),
  disjuntor_a numeric(15,4),
  secao_condutor_mm2 numeric(15,4),
  comprimento_m numeric(15,4),
  eletroduto_mm numeric(15,4),
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  origem text,
  origem_ref text,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_eletrica_circuitos_obra_codigo_idx ON obra_eletrica_circuitos(obra_id, codigo);

CREATE TABLE IF NOT EXISTS obra_eletrica_quadros (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'distribuicao',
  tensao_v numeric(10,2),
  fases integer,
  corrente_nominal_a numeric(15,4),
  quantidade_disjuntores integer,
  dr_obrigatorio boolean NOT NULL DEFAULT false,
  dps_obrigatorio boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_eletrica_redes_especiais (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  codigo text,
  descricao text,
  comprimento_m numeric(15,4),
  quantidade_pontos numeric(15,4),
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_energia_sistemas (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  codigo text,
  nome text,
  potencia_kw numeric(15,4),
  energia_kwh numeric(15,4),
  tensao_v numeric(10,2),
  fases integer,
  autonomia_horas numeric(10,2),
  potencia_pico_kw numeric(15,4),
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  parametros jsonb,
  origem text,
  origem_ref text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_energia_sistemas_obra_tipo_idx
  ON obra_energia_sistemas(obra_id, tipo);

CREATE TABLE IF NOT EXISTS obra_energia_componentes (
  id text PRIMARY KEY,
  sistema_id text NOT NULL REFERENCES obra_energia_sistemas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  slot_key text NOT NULL,
  nome text NOT NULL,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  unidade text NOT NULL DEFAULT 'un',
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  circuito_id text REFERENCES obra_eletrica_circuitos(id) ON DELETE SET NULL,
  inclui_infraestrutura boolean NOT NULL DEFAULT false,
  parametros jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_energia_componentes_sistema_slot_idx
  ON obra_energia_componentes(sistema_id, slot_key);
