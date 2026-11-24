-- AB-10: cardápios de A&B por data e serviço, ligados às fichas técnicas.
--
-- A ficha técnica diz COMO produzir; o cardápio diz O QUE será servido e
-- quantas porções por hóspede. Sem essa ponte o briffing não tem de onde ler
-- a produção do dia. Migration transacional e reaplicável.

CREATE TABLE IF NOT EXISTS ab_cardapios (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (length(btrim(nome)) > 0),
  data date NOT NULL,
  servico text NOT NULL CHECK (servico IN ('cafe_manha', 'almoco', 'jantar', 'outro')),
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cardapios_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cardapios_tenant_data_servico_nome_uq UNIQUE (tenant_id, data, servico, nome),
  CONSTRAINT ab_cardapios_created_by_fk
    FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ab_cardapios_tenant_data_idx
  ON ab_cardapios(tenant_id, data, servico);

CREATE TABLE IF NOT EXISTS ab_cardapio_itens (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cardapio_id text NOT NULL,
  ficha_id text NOT NULL,
  -- Snapshot do nome: o cardápio calculado não muda se a ficha for renomeada.
  ficha_nome text NOT NULL CHECK (length(btrim(ficha_nome)) > 0),
  porcoes_por_pax numeric(8,3) NOT NULL DEFAULT 1 CHECK (porcoes_por_pax > 0),
  ordem integer NOT NULL DEFAULT 0 CHECK (ordem >= 0),
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_cardapio_itens_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_cardapio_itens_cardapio_ficha_uq UNIQUE (tenant_id, cardapio_id, ficha_id),
  CONSTRAINT ab_cardapio_itens_cardapio_fk
    FOREIGN KEY (tenant_id, cardapio_id) REFERENCES ab_cardapios(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT ab_cardapio_itens_ficha_fk
    FOREIGN KEY (tenant_id, ficha_id) REFERENCES ab_fichas_tecnicas(tenant_id, id)
);

CREATE INDEX IF NOT EXISTS ab_cardapio_itens_cardapio_idx
  ON ab_cardapio_itens(tenant_id, cardapio_id, ordem);

ALTER TABLE ab_cardapios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_cardapio_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ab_cardapios_tenant_isolation ON ab_cardapios;
CREATE POLICY ab_cardapios_tenant_isolation ON ab_cardapios
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS ab_cardapio_itens_tenant_isolation ON ab_cardapio_itens;
CREATE POLICY ab_cardapio_itens_tenant_isolation ON ab_cardapio_itens
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
