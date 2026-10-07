CREATE TABLE IF NOT EXISTS obra_piscinas (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  codigo text,
  nome text NOT NULL,
  tipo text NOT NULL,
  estrutura text NOT NULL,
  comprimento_m numeric(15,4),
  largura_m numeric(15,4),
  profundidade_min_m numeric(15,4),
  profundidade_max_m numeric(15,4),
  area_espelho_m2 numeric(15,4),
  volume_m3 numeric(15,4),
  area_revestimento_m2 numeric(15,4),
  perimetro_m numeric(15,4),
  impermeabilizacao_tipo text,
  revestimento_tipo text,
  composicao_estrutura_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  composicao_impermeabilizacao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  composicao_revestimento_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  origem text,
  origem_ref text,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_piscinas_obra_tipo_idx ON obra_piscinas(obra_id, tipo);

CREATE TABLE IF NOT EXISTS obra_piscina_casas_maquinas (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  distancia_piscina_m numeric(15,4),
  desnivel_m numeric(15,4),
  ventilacao_obrigatoria boolean NOT NULL DEFAULT true,
  dreno_obrigatorio boolean NOT NULL DEFAULT true,
  ponto_eletrico_obrigatorio boolean NOT NULL DEFAULT true,
  acesso_manutencao boolean NOT NULL DEFAULT true,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_piscina_circuitos (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  casa_maquinas_id text REFERENCES obra_piscina_casas_maquinas(id) ON DELETE SET NULL,
  codigo text,
  tipo text NOT NULL,
  diametro_mm numeric(10,2),
  comprimento_m numeric(15,4),
  vazao_m3h numeric(15,4),
  perda_carga_mca numeric(15,4),
  quantidade_pontos integer,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_piscina_circuitos_piscina_tipo_idx ON obra_piscina_circuitos(piscina_id, tipo);

CREATE TABLE IF NOT EXISTS obra_piscina_equipamentos (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  casa_maquinas_id text REFERENCES obra_piscina_casas_maquinas(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  nome text NOT NULL,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  potencia_kw numeric(15,4),
  vazao_m3h numeric(15,4),
  capacidade text,
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_piscina_tratamento (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  automatizado boolean NOT NULL DEFAULT false,
  controle_ph boolean NOT NULL DEFAULT false,
  controle_orp boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_piscina_aquecimento (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  potencia_kw numeric(15,4),
  temperatura_alvo_c numeric(10,2),
  delta_t_projeto_c numeric(10,2),
  apoio text,
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_piscina_overflow (
  id text PRIMARY KEY,
  piscina_id text NOT NULL REFERENCES obra_piscinas(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  comprimento_calha_m numeric(15,4),
  volume_compensacao_m3 numeric(15,4),
  reservatorio_compensacao boolean NOT NULL DEFAULT true,
  bomba_recalque boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);