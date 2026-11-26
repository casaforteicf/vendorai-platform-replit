-- 573_ab_compra_recebimento_entrega.sql
--
-- Liga a ordem de compra ao recebimento por lote:
--  * fornecedor e data prevista de entrega na ordem;
--  * quantidade recebida por item;
--  * status pendente_entrega / parcialmente_recebida;
--  * ordem e item de origem no recebimento.
--
-- Idempotente.

ALTER TABLE ab_ordens_compra
  ADD COLUMN IF NOT EXISTS fornecedor text,
  ADD COLUMN IF NOT EXISTS data_entrega_prevista date;

ALTER TABLE ab_ordem_compra_itens
  ADD COLUMN IF NOT EXISTS quantidade_recebida numeric(15,4) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ab_ordem_compra_itens_recebida_nao_negativa'
  ) THEN
    ALTER TABLE ab_ordem_compra_itens
      ADD CONSTRAINT ab_ordem_compra_itens_recebida_nao_negativa
      CHECK (quantidade_recebida >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ab_ordem_compra_itens_recebida_limite'
  ) THEN
    ALTER TABLE ab_ordem_compra_itens
      ADD CONSTRAINT ab_ordem_compra_itens_recebida_limite
      CHECK (quantidade_recebida <= quantidade);
  END IF;
END $$;

-- Migra o status antigo e amplia o CHECK.
ALTER TABLE ab_ordens_compra DROP CONSTRAINT IF EXISTS ab_ordens_compra_status_valido;
UPDATE ab_ordens_compra SET status = 'pendente_entrega' WHERE status = 'enviada';
ALTER TABLE ab_ordens_compra
  ADD CONSTRAINT ab_ordens_compra_status_valido
  CHECK (status IN ('sugerida', 'aprovada', 'pendente_entrega', 'parcialmente_recebida', 'recebida', 'cancelada'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ab_ordem_compra_itens_tenant_id_uq'
  ) THEN
    ALTER TABLE ab_ordem_compra_itens
      ADD CONSTRAINT ab_ordem_compra_itens_tenant_id_uq UNIQUE (tenant_id, id);
  END IF;
END $$;

ALTER TABLE ab_recebimentos
  ADD COLUMN IF NOT EXISTS ordem_id text,
  ADD COLUMN IF NOT EXISTS ordem_item_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_recebimentos_ordem_fk') THEN
    ALTER TABLE ab_recebimentos
      ADD CONSTRAINT ab_recebimentos_ordem_fk
      FOREIGN KEY (tenant_id, ordem_id) REFERENCES ab_ordens_compra(tenant_id, id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_recebimentos_ordem_item_fk') THEN
    ALTER TABLE ab_recebimentos
      ADD CONSTRAINT ab_recebimentos_ordem_item_fk
      FOREIGN KEY (tenant_id, ordem_item_id) REFERENCES ab_ordem_compra_itens(tenant_id, id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ab_recebimentos_ordem_idx
  ON ab_recebimentos(tenant_id, ordem_id);
CREATE INDEX IF NOT EXISTS ab_recebimentos_ordem_item_idx
  ON ab_recebimentos(tenant_id, ordem_item_id);

-- Pendências de entrega por item (ordem em aberto).
CREATE INDEX IF NOT EXISTS ab_ordem_compra_itens_pendente_idx
  ON ab_ordem_compra_itens(tenant_id, ordem_id)
  WHERE quantidade_recebida < quantidade;
