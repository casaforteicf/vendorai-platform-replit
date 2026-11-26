-- 572_ab_cardapio_modelos_preparo.sql
--
-- 1) Modo de preparo na ficha técnica.
-- 2) Cardápios-modelo reutilizáveis + grade semanal + snapshot diário.
-- 3) Categoria e percentual de rateio no prato do cardápio.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX IF NOT EXISTS,
-- constraints/FKs adicionadas via DO quando ainda não existem.

ALTER TABLE ab_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS modo_preparo text;

CREATE TABLE IF NOT EXISTS ab_cardapio_modelos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (char_length(btrim(nome)) > 0),
  servico text NOT NULL CHECK (servico IN ('cafe_manha', 'almoco', 'jantar', 'outro')),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cardapio_modelos_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cardapio_modelos_tenant_servico_nome_uq UNIQUE (tenant_id, servico, nome)
);

CREATE INDEX IF NOT EXISTS ab_cardapio_modelos_tenant_servico_idx
  ON ab_cardapio_modelos(tenant_id, servico, ativo);

CREATE TABLE IF NOT EXISTS ab_cardapio_modelo_itens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  modelo_id text NOT NULL,
  ficha_id text NOT NULL,
  ficha_nome text NOT NULL CHECK (char_length(btrim(ficha_nome)) > 0),
  categoria text NOT NULL DEFAULT 'outro' CHECK (categoria IN ('proteina', 'acompanhamento', 'outro')),
  percentual_rateio numeric(5,2) CHECK (percentual_rateio IS NULL OR (percentual_rateio >= 0 AND percentual_rateio <= 100)),
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cardapio_modelo_itens_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cardapio_modelo_itens_modelo_ficha_uq UNIQUE (tenant_id, modelo_id, ficha_id),
  FOREIGN KEY (tenant_id, modelo_id) REFERENCES ab_cardapio_modelos(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, ficha_id) REFERENCES ab_fichas_tecnicas(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ab_cardapio_modelo_itens_modelo_idx
  ON ab_cardapio_modelo_itens(tenant_id, modelo_id, ordem);

CREATE TABLE IF NOT EXISTS ab_cardapio_grade (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  dia_semana integer NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  servico text NOT NULL CHECK (servico IN ('cafe_manha', 'almoco', 'jantar', 'outro')),
  modelo_id text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cardapio_grade_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cardapio_grade_tenant_dia_servico_uq UNIQUE (tenant_id, dia_semana, servico),
  FOREIGN KEY (tenant_id, modelo_id) REFERENCES ab_cardapio_modelos(tenant_id, id) ON DELETE CASCADE
);

ALTER TABLE ab_cardapios
  ADD COLUMN IF NOT EXISTS modelo_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_cardapios_modelo_id_fk'
  ) THEN
    ALTER TABLE ab_cardapios
      ADD CONSTRAINT ab_cardapios_modelo_id_fk
      FOREIGN KEY (tenant_id, modelo_id)
      REFERENCES ab_cardapio_modelos(tenant_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ab_cardapios_tenant_modelo_idx
  ON ab_cardapios(tenant_id, modelo_id);

ALTER TABLE ab_cardapio_itens
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS percentual_rateio numeric(5,2),
  ADD COLUMN IF NOT EXISTS modelo_item_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_cardapio_itens_categoria_valida'
  ) THEN
    ALTER TABLE ab_cardapio_itens
      ADD CONSTRAINT ab_cardapio_itens_categoria_valida
      CHECK (categoria IN ('proteina', 'acompanhamento', 'outro'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_cardapio_itens_percentual_valido'
  ) THEN
    ALTER TABLE ab_cardapio_itens
      ADD CONSTRAINT ab_cardapio_itens_percentual_valido
      CHECK (percentual_rateio IS NULL OR (percentual_rateio >= 0 AND percentual_rateio <= 100));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ab_cardapio_itens_modelo_item_fk'
  ) THEN
    ALTER TABLE ab_cardapio_itens
      ADD CONSTRAINT ab_cardapio_itens_modelo_item_fk
      FOREIGN KEY (tenant_id, modelo_item_id)
      REFERENCES ab_cardapio_modelo_itens(tenant_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE ab_cardapio_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cardapio_modelos_tenant_isolation ON ab_cardapio_modelos;
CREATE POLICY ab_cardapio_modelos_tenant_isolation ON ab_cardapio_modelos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_cardapio_modelo_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cardapio_modelo_itens_tenant_isolation ON ab_cardapio_modelo_itens;
CREATE POLICY ab_cardapio_modelo_itens_tenant_isolation ON ab_cardapio_modelo_itens
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ab_cardapio_grade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_cardapio_grade_tenant_isolation ON ab_cardapio_grade;
CREATE POLICY ab_cardapio_grade_tenant_isolation ON ab_cardapio_grade
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cardapio_modelos TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cardapio_modelo_itens TO vendorai_app_login';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_cardapio_grade TO vendorai_app_login';
  END IF;
END $$;
