CREATE TABLE IF NOT EXISTS obra_pavimentos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nome text NOT NULL,
  codigo text,
  nivel numeric(12,4),
  ordem integer NOT NULL DEFAULT 0,
  origem text,
  origem_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_pavimentos_obra_ordem_idx ON obra_pavimentos(obra_id, ordem);

CREATE TABLE IF NOT EXISTS obra_ambientes (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  pavimento_id text REFERENCES obra_pavimentos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo text,
  codigo text,
  area_bruta numeric(15,4),
  area_liquida numeric(15,4),
  perimetro numeric(15,4),
  altura numeric(15,4),
  origem text,
  origem_ref text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_ambientes_obra_pavimento_idx ON obra_ambientes(obra_id, pavimento_id);

CREATE TABLE IF NOT EXISTS obra_elementos (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  pavimento_id text REFERENCES obra_pavimentos(id) ON DELETE SET NULL,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  codigo text,
  nome text,
  comprimento numeric(15,4),
  altura numeric(15,4),
  espessura numeric(15,4),
  area_bruta numeric(15,4),
  area_aberturas numeric(15,4),
  area_liquida numeric(15,4),
  volume numeric(15,4),
  perimetro numeric(15,4),
  sistema_id text REFERENCES sistemas_construtivos(id) ON DELETE SET NULL,
  sistema_variante_id text,
  origem text,
  origem_ref text,
  projeto_versao text,
  metadata jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_elementos_obra_tipo_idx ON obra_elementos(obra_id, tipo);
CREATE INDEX IF NOT EXISTS obra_elementos_ambiente_idx ON obra_elementos(ambiente_id);

CREATE TABLE IF NOT EXISTS obra_superficies (
  id text PRIMARY KEY,
  obra_id text NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  elemento_id text REFERENCES obra_elementos(id) ON DELETE CASCADE,
  ambiente_id text REFERENCES obra_ambientes(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  face text,
  nome text,
  area_bruta numeric(15,4),
  area_aberturas numeric(15,4),
  area_liquida numeric(15,4),
  perimetro numeric(15,4),
  origem_configuracao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_superficies_elemento_face_idx ON obra_superficies(elemento_id, face);
CREATE INDEX IF NOT EXISTS obra_superficies_ambiente_tipo_idx ON obra_superficies(ambiente_id, tipo);

CREATE TABLE IF NOT EXISTS obra_superficie_zonas (
  id text PRIMARY KEY,
  superficie_id text NOT NULL REFERENCES obra_superficies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  geometria_tipo text NOT NULL DEFAULT 'inteira',
  geometria jsonb,
  area numeric(15,4),
  perimetro numeric(15,4),
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  acabamento_key text,
  origem_configuracao text NOT NULL DEFAULT 'zona',
  prioridade integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS obra_superficie_zonas_superficie_ativo_idx ON obra_superficie_zonas(superficie_id, ativo);

CREATE TABLE IF NOT EXISTS obra_acabamento_padroes (
  id text PRIMARY KEY,
  obra_id text REFERENCES obras(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  tipo_ambiente text,
  tipo_superficie text,
  acabamento_key text,
  composicao_id text REFERENCES composicoes(id) ON DELETE SET NULL,
  parametros jsonb,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);