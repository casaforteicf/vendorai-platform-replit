CREATE TABLE IF NOT EXISTS obra_hidraulica_redes (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  funcao text NOT NULL,
  tipo_rede text NOT NULL DEFAULT 'ramal',
  tecnologia text NOT NULL,
  configuracao text,
  diametro_mm numeric(10,2),
  classe_pressao text,
  comprimento_m numeric(15,4),
  vazao_l_min numeric(15,4),
  pressao_mca numeric(15,4),
  isolamento text,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  origem text,
  origem_ref text,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_hidraulica_redes_obra_funcao_idx ON obra_hidraulica_redes(obra_id, funcao);
CREATE INDEX IF NOT EXISTS obra_hidraulica_redes_obra_codigo_idx ON obra_hidraulica_redes(obra_id, codigo);

CREATE TABLE IF NOT EXISTS obra_hidraulica_pontos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  codigo text,
  tipo text NOT NULL,
  funcao text NOT NULL,
  rede_id text REFERENCES obra_hidraulica_redes(id) ON DELETE SET NULL,
  quantidade numeric(15,4) NOT NULL DEFAULT 1,
  diametro_mm numeric(10,2),
  inclui_ligacao_ate_rede boolean NOT NULL DEFAULT true,
  inclui_aparelho_final boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  origem text,
  origem_ref text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_hidraulica_pontos_obra_tipo_idx ON obra_hidraulica_pontos(obra_id, tipo);
CREATE INDEX IF NOT EXISTS obra_hidraulica_pontos_ambiente_idx ON obra_hidraulica_pontos(ambiente_id);

CREATE TABLE IF NOT EXISTS obra_hidraulica_segmentos (
  id text PRIMARY KEY,
  rede_id text NOT NULL REFERENCES obra_hidraulica_redes(id) ON DELETE CASCADE,
  codigo text,
  tecnologia text,
  diametro_mm numeric(10,2),
  comprimento_m numeric(15,4),
  origem_elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  destino_elemento_id text REFERENCES obra_elementos(id) ON DELETE SET NULL,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS obra_hidraulica_equipamentos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  funcao text,
  nome text NOT NULL,
  vazao_l_min numeric(15,4),
  pressao_mca numeric(15,4),
  volume_l numeric(15,4),
  potencia_kw numeric(15,4),
  somente_infraestrutura boolean NOT NULL DEFAULT false,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);