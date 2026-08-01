ALTER TABLE seller_commissions
  ALTER COLUMN percentual TYPE numeric(7,4) USING percentual::numeric,
  ALTER COLUMN percentual SET DEFAULT 0;

ALTER TABLE seller_commissions
  ADD COLUMN IF NOT EXISTS detalhes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN seller_commissions.percentual IS
  'Percentual efetivo ponderado. A regra de cada item fica em detalhes.';

COMMENT ON COLUMN seller_commissions.detalhes IS
  'Comissão por item vendido, calculada sobre o preço efetivo da proposta.';
