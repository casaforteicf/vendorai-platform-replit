CREATE TABLE IF NOT EXISTS obra_hidraulica_areas_tecnicas (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  codigo text,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'central_hidraulica',
  largura_m numeric(10,4),
  profundidade_m numeric(10,4),
  altura_m numeric(10,4),
  ventilacao_obrigatoria boolean NOT NULL DEFAULT false,
  dreno_obrigatorio boolean NOT NULL DEFAULT false,
  ponto_eletrico_obrigatorio boolean NOT NULL DEFAULT false,
  ponto_gas_obrigatorio boolean NOT NULL DEFAULT false,
  acesso_manutencao boolean NOT NULL DEFAULT true,
  parametros jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_hidraulica_areas_tecnicas_obra_tipo_idx
  ON obra_hidraulica_areas_tecnicas(obra_id, tipo);

CREATE TABLE IF NOT EXISTS obra_hidraulica_manifolds (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  area_tecnica_id text REFERENCES obra_hidraulica_areas_tecnicas(id) ON DELETE SET NULL,
  rede_id text REFERENCES obra_hidraulica_redes(id) ON DELETE SET NULL,
  codigo text,
  nome text NOT NULL,
  funcao text NOT NULL,
  tecnologia text NOT NULL,
  numero_saidas integer NOT NULL DEFAULT 1,
  diametro_entrada_mm numeric(10,2),
  diametro_saidas_mm numeric(10,2),
  registros_individuais boolean NOT NULL DEFAULT true,
  identificacao_circuitos boolean NOT NULL DEFAULT true,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_hidraulica_aquecimento (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  area_tecnica_id text REFERENCES obra_hidraulica_areas_tecnicas(id) ON DELETE SET NULL,
  tipo_geracao text NOT NULL,
  nome text NOT NULL,
  potencia_kw numeric(15,4),
  volume_acumulacao_l numeric(15,4),
  temperatura_projeto_c numeric(10,2),
  quantidade_usuarios integer,
  demanda_simultanea_l_min numeric(15,4),
  recirculacao boolean NOT NULL DEFAULT false,
  apoio_eletrico boolean NOT NULL DEFAULT false,
  apoio_gas boolean NOT NULL DEFAULT false,
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_hidraulica_pressurizacao (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  area_tecnica_id text REFERENCES obra_hidraulica_areas_tecnicas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'pressurizador',
  vazao_projeto_l_min numeric(15,4),
  pressao_projeto_mca numeric(15,4),
  potencia_kw numeric(15,4),
  redundancia text,
  vaso_expansao_l numeric(15,4),
  controle_pressao text,
  bypass boolean NOT NULL DEFAULT false,
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_hidraulica_reservatorios (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  area_tecnica_id text REFERENCES obra_hidraulica_areas_tecnicas(id) ON DELETE SET NULL,
  nome text NOT NULL,
  tipo text NOT NULL,
  volume_l numeric(15,4) NOT NULL,
  material text,
  enterrado boolean NOT NULL DEFAULT false,
  superior boolean NOT NULL DEFAULT false,
  reserva_tecnica_l numeric(15,4),
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);