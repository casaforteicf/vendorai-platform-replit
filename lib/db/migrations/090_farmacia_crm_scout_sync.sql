ALTER TABLE farmacia_pedidos
  ADD COLUMN IF NOT EXISTS deal_id text REFERENCES deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scout_oportunidade_id text REFERENCES scout_oportunidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS farmacia_pedidos_deal_idx
  ON farmacia_pedidos (tenant_id, deal_id);

CREATE INDEX IF NOT EXISTS farmacia_pedidos_scout_idx
  ON farmacia_pedidos (tenant_id, scout_oportunidade_id);
