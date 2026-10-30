-- HOTEL-01: locais e solicitações de transferência internas (estrutura inicial).
-- Não movimenta saldos existentes. Aplicação requer revisão de migration e políticas.
CREATE TABLE IF NOT EXISTS hotel_stock_locations (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('central','kitchen','restaurant','bar','other')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_stock_transfer_requests (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  origin_location_id text NOT NULL,
  destination_location_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','requested','approved','rejected','cancelled','completed')),
  requested_by text REFERENCES users(id) ON DELETE SET NULL,
  approved_by text REFERENCES users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_stock_distinct_locations CHECK (origin_location_id <> destination_location_id),
  CONSTRAINT hotel_stock_origin_fk FOREIGN KEY (tenant_id, origin_location_id)
    REFERENCES hotel_stock_locations(tenant_id, id),
  CONSTRAINT hotel_stock_destination_fk FOREIGN KEY (tenant_id, destination_location_id)
    REFERENCES hotel_stock_locations(tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_stock_transfer_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id text NOT NULL,
  inventory_item_id text NOT NULL REFERENCES inventory_items(id),
  quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, transfer_id)
    REFERENCES hotel_stock_transfer_requests(tenant_id, id) ON DELETE CASCADE
);

-- Confirma que o item pertence ao mesmo tenant antes de aceitar o registro.
CREATE OR REPLACE FUNCTION hotel_stock_validate_item_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM inventory_items i
     WHERE i.id = NEW.inventory_item_id AND i.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'inventory item does not belong to this tenant';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hotel_stock_item_tenant_guard ON hotel_stock_transfer_items;
CREATE TRIGGER hotel_stock_item_tenant_guard
BEFORE INSERT OR UPDATE OF tenant_id, inventory_item_id ON hotel_stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION hotel_stock_validate_item_tenant();

CREATE INDEX IF NOT EXISTS hotel_stock_transfer_tenant_date
 ON hotel_stock_transfer_requests(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hotel_stock_transfer_items_transfer
 ON hotel_stock_transfer_items(tenant_id, transfer_id);

ALTER TABLE hotel_stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_stock_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_stock_transfer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotel_stock_locations_isolation ON hotel_stock_locations;
CREATE POLICY hotel_stock_locations_isolation ON hotel_stock_locations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS hotel_stock_transfers_isolation ON hotel_stock_transfer_requests;
CREATE POLICY hotel_stock_transfers_isolation ON hotel_stock_transfer_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS hotel_stock_transfer_items_isolation ON hotel_stock_transfer_items;
CREATE POLICY hotel_stock_transfer_items_isolation ON hotel_stock_transfer_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Importante: esta migration NÃO efetiva transferências nem altera inventory_items.
-- A baixa/crédito atômica e o controle de concorrência virão na próxima etapa,
-- após testes de transação e de estoque insuficiente.
