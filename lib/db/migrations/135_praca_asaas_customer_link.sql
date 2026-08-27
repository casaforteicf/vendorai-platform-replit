-- Vínculo seguro entre o comprador Praça.ai e o pagador Asaas.
ALTER TABLE praca_pedidos
  ADD COLUMN IF NOT EXISTS cliente_documento text,
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

ALTER TABLE praca_pedidos
  DROP CONSTRAINT IF EXISTS praca_pedidos_cliente_documento_check;

ALTER TABLE praca_pedidos
  ADD CONSTRAINT praca_pedidos_cliente_documento_check
  CHECK (
    cliente_documento IS NULL
    OR cliente_documento ~ '^[0-9]{11}$'
    OR cliente_documento ~ '^[0-9]{14}$'
  );

CREATE INDEX IF NOT EXISTS idx_praca_pedidos_asaas_customer
  ON praca_pedidos (tenant_id, asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_praca_pedidos_cliente_documento
  ON praca_pedidos (tenant_id, cliente_documento)
  WHERE cliente_documento IS NOT NULL;
