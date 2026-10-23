CREATE TABLE IF NOT EXISTS seller_commissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  seller_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cliente_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
  deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  plan_slug text,
  cliente_nome text,
  valor_implantacao_cents integer NOT NULL,
  percentual numeric(7,4) NOT NULL DEFAULT 0,
  valor_comissao_cents integer NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text,
  paid_at timestamp,
  paid_by_user_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_commissions_tenant_idx ON seller_commissions(tenant_id);
CREATE INDEX IF NOT EXISTS seller_commissions_seller_idx ON seller_commissions(seller_user_id);
CREATE INDEX IF NOT EXISTS seller_commissions_deal_idx ON seller_commissions(deal_id);
ALTER TABLE seller_commissions
  ALTER COLUMN percentual TYPE numeric(7,4) USING percentual::numeric,
  ALTER COLUMN percentual SET DEFAULT 0;

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN seller_commissions.percentual IS
  'Percentual efetivo ponderado. A regra de cada item fica em detalhes.';

COMMENT ON COLUMN seller_commissions.detalhes IS
  'Comissão por item vendido, calculada sobre o preço efetivo da proposta.';
