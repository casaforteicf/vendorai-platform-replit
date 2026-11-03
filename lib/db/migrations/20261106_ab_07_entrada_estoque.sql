-- AB-07: entrada em estoque a partir do recebimento.
--
-- Fecha o ciclo físico: Recebimento aprovado → hotel_stock_location_balances
-- → sync (AB-04) → ab_estoque_saldos → motor preditivo.
--
-- Por que colunas novas em vez de um trigger:
--   * o local de destino precisa ser explícito (câmara fria, seco, central);
--   * `estoque_aplicado_em` marca se a entrada já foi somada — sem isso, uma
--     reintrodução do mesmo recebimento somaria o saldo duas vezes;
--   * `motivo_nao_aplicado` guarda por que a soma falhou (ex.: produto sem item
--     de estoque ou unidade sem fator), sem apagar o recebimento.

ALTER TABLE ab_recebimentos
  ADD COLUMN IF NOT EXISTS location_id text,
  ADD COLUMN IF NOT EXISTS estoque_aplicado_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_nao_aplicado text;

-- FK composta por tenant: o local tem que ser do mesmo hotel.
ALTER TABLE ab_recebimentos
  DROP CONSTRAINT IF EXISTS ab_recebimentos_location_fk;
ALTER TABLE ab_recebimentos
  ADD CONSTRAINT ab_recebimentos_location_fk
  FOREIGN KEY (tenant_id, location_id)
  REFERENCES hotel_stock_locations(tenant_id, id);

-- Fila de reprocessamento: recebimentos aprovados que ainda não somaram saldo.
CREATE INDEX IF NOT EXISTS ab_recebimentos_pendentes_estoque_idx
  ON ab_recebimentos(tenant_id, created_at)
  WHERE estoque_aplicado_em IS NULL AND status = 'aprovado';
