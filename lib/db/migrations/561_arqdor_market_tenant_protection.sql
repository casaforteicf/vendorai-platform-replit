CREATE TABLE IF NOT EXISTS arqdor_market_protecoes_tenant (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  escopo text NOT NULL,
  valor text NOT NULL,
  valor_normalizado text NOT NULL,
  modo text NOT NULL DEFAULT 'exclusivo',
  prioridade integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT arqdor_market_protecoes_escopo_chk CHECK (escopo IN ('categoria','subcategoria','produto_servico')),
  CONSTRAINT arqdor_market_protecoes_modo_chk CHECK (modo IN ('exclusivo','preferencial','aberto','bloqueado'))
);

CREATE INDEX IF NOT EXISTS arqdor_market_protecoes_tenant_idx
  ON arqdor_market_protecoes_tenant (tenant_id, ativo, prioridade);

CREATE UNIQUE INDEX IF NOT EXISTS arqdor_market_protecoes_tenant_rule_uidx
  ON arqdor_market_protecoes_tenant (tenant_id, escopo, valor_normalizado);
