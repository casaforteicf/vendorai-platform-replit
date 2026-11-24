-- 570_ab_briffing_previsoes.sql
--
-- Previsão de ocupação do Briffing por data/serviço.
-- O Briffing continua sendo cálculo de tela; esta tabela guarda a ocupação
-- importada (planilha/documento) para o cálculo usar o número oficial.
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS, policy recriada.

CREATE TABLE IF NOT EXISTS ab_briffing_previsoes (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  data date NOT NULL,
  servico text NOT NULL CHECK (servico IN ('cafe_manha', 'almoco', 'jantar', 'outro')),
  ocupacao integer NOT NULL CHECK (ocupacao >= 0),
  evento text,
  observacoes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_briffing_previsoes_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_briffing_previsoes_data_servico_uq UNIQUE (tenant_id, data, servico)
);

CREATE INDEX IF NOT EXISTS ab_briffing_previsoes_tenant_data_idx
  ON ab_briffing_previsoes(tenant_id, data);

ALTER TABLE ab_briffing_previsoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ab_briffing_previsoes_tenant_isolation ON ab_briffing_previsoes;
CREATE POLICY ab_briffing_previsoes_tenant_isolation ON ab_briffing_previsoes
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_briffing_previsoes TO vendorai_app_login';
  END IF;
END $$;
