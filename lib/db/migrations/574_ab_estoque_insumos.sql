-- 574_ab_estoque_insumos.sql
--
-- No A&B o insumo É o produto de estoque. O recebimento passa a aceitar
-- `insumo_id` diretamente e o saldo físico fica em `ab_estoque_insumos`.
-- O caminho legado por `produtos_catalogo` continua aceito.
--
-- Idempotente.

ALTER TABLE ab_recebimentos
  ALTER COLUMN produto_catalogo_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS insumo_id text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ab_recebimentos_insumo_fk') THEN
    ALTER TABLE ab_recebimentos
      ADD CONSTRAINT ab_recebimentos_insumo_fk
      FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ab_recebimentos_insumo_idx
  ON ab_recebimentos(tenant_id, insumo_id);

CREATE TABLE IF NOT EXISTS ab_estoque_insumos (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  insumo_id text NOT NULL REFERENCES insumos(id) ON DELETE RESTRICT,
  quantidade numeric(15,4) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ab_estoque_insumos_tenant_id_uq UNIQUE (tenant_id, id),
  CONSTRAINT ab_estoque_insumos_local_insumo_uq UNIQUE (tenant_id, location_id, insumo_id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES hotel_stock_locations(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ab_estoque_insumos_tenant_insumo_idx
  ON ab_estoque_insumos(tenant_id, insumo_id);

ALTER TABLE ab_estoque_insumos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ab_estoque_insumos_tenant_isolation ON ab_estoque_insumos;
CREATE POLICY ab_estoque_insumos_tenant_isolation ON ab_estoque_insumos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vendorai_app_login') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ab_estoque_insumos TO vendorai_app_login';
  END IF;
END $$;
