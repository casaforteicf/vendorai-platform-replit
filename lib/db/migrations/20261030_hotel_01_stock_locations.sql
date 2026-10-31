-- HOTEL-01: locais e solicitações de transferência internas (estrutura inicial).
-- Não movimenta saldos existentes. Aplicação requer revisão de migration e políticas.
-- Chaves compostas garantem que referências cruzadas pertençam ao mesmo tenant.
CREATE UNIQUE INDEX IF NOT EXISTS hotel_stock_inventory_tenant_id
 ON inventory_items(tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_stock_users_tenant_id
 ON users(tenant_id, id);

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
  requested_by text,
  approved_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_stock_requester_tenant_fk FOREIGN KEY (tenant_id, requested_by)
    REFERENCES users(tenant_id, id),
  CONSTRAINT hotel_stock_approver_tenant_fk FOREIGN KEY (tenant_id, approved_by)
    REFERENCES users(tenant_id, id),
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
  inventory_item_id text NOT NULL,
  quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, transfer_id)
    REFERENCES hotel_stock_transfer_requests(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT hotel_stock_item_tenant_fk FOREIGN KEY (tenant_id, inventory_item_id)
    REFERENCES inventory_items(tenant_id, id)
);

-- Integridade de item e usuários é garantida por FKs compostas, sem trigger.

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

-- Importante: esta migration NÃO efetiva transferências nem modifica saldos de inventory_items.
-- A baixa/crédito atômica e o controle de concorrência virão na próxima etapa,
-- após testes de transação e de estoque insuficiente.

-- HOTEL-01: saldos operacionais por local; não migra saldos globais automaticamente.
CREATE TABLE IF NOT EXISTS hotel_stock_location_balances (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id text NOT NULL,
  inventory_item_id text NOT NULL,
  quantity numeric(15,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, location_id, inventory_item_id),
  FOREIGN KEY (tenant_id, location_id)
    REFERENCES hotel_stock_locations(tenant_id, id),
  FOREIGN KEY (tenant_id, inventory_item_id)
    REFERENCES inventory_items(tenant_id, id)
);
CREATE INDEX IF NOT EXISTS hotel_stock_balances_item
  ON hotel_stock_location_balances(tenant_id, inventory_item_id);

CREATE TABLE IF NOT EXISTS hotel_stock_transfer_ledger (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  transfer_id text NOT NULL,
  inventory_item_id text NOT NULL,
  origin_location_id text NOT NULL,
  destination_location_id text NOT NULL,
  quantity numeric(15,4) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, transfer_id, inventory_item_id),
  FOREIGN KEY (tenant_id, transfer_id)
    REFERENCES hotel_stock_transfer_requests(tenant_id, id),
  FOREIGN KEY (tenant_id, inventory_item_id)
    REFERENCES inventory_items(tenant_id, id),
  FOREIGN KEY (tenant_id, origin_location_id)
    REFERENCES hotel_stock_locations(tenant_id, id),
  FOREIGN KEY (tenant_id, destination_location_id)
    REFERENCES hotel_stock_locations(tenant_id, id)
);

ALTER TABLE hotel_stock_location_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_stock_transfer_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_stock_balances_isolation ON hotel_stock_location_balances
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY hotel_stock_ledger_isolation ON hotel_stock_transfer_ledger
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Uma transferência aprovada é efetivada uma única vez, na transação do chamador.
-- SECURITY INVOKER: não contorna RLS nem permissões do papel de aplicação.
-- A aplicação deve restringir quem pode aprovar e chamar esta função.
CREATE OR REPLACE FUNCTION hotel_stock_complete_transfer(
  p_tenant_id text, p_transfer_id text
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_transfer hotel_stock_transfer_requests%ROWTYPE;
  v_item record;
BEGIN
  IF p_tenant_id IS DISTINCT FROM current_setting('app.tenant_id', true)
     OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant context does not match';
  END IF;

  SELECT * INTO v_transfer
    FROM hotel_stock_transfer_requests
   WHERE tenant_id = p_tenant_id AND id = p_transfer_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
  IF v_transfer.status = 'completed' THEN RETURN; END IF;
  IF v_transfer.status <> 'approved' THEN
    RAISE EXCEPTION 'transfer must be approved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hotel_stock_transfer_items
     WHERE tenant_id = p_tenant_id AND transfer_id = p_transfer_id
  ) THEN
    RAISE EXCEPTION 'transfer has no items';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM hotel_stock_locations
     WHERE tenant_id = p_tenant_id AND id = v_transfer.origin_location_id AND active
  ) OR NOT EXISTS (
    SELECT 1 FROM hotel_stock_locations
     WHERE tenant_id = p_tenant_id AND id = v_transfer.destination_location_id AND active
  ) THEN
    RAISE EXCEPTION 'transfer location inactive';
  END IF;

  -- Agrega itens iguais para impedir duas deduções concorrentes do mesmo item.
  -- Locks são tomados sempre na mesma ordem de item; o lock da transferência
  -- serializa retentativas da mesma solicitação.
  FOR v_item IN
    SELECT inventory_item_id, sum(quantity)::numeric(15,4) AS total_quantity
      FROM hotel_stock_transfer_items
     WHERE tenant_id = p_tenant_id AND transfer_id = p_transfer_id
     GROUP BY inventory_item_id ORDER BY inventory_item_id
  LOOP
    -- Serializa transferências opostas para o mesmo item entre locais.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id || ':' || v_item.inventory_item_id, 0));
    UPDATE hotel_stock_location_balances
       SET quantity = quantity - v_item.total_quantity,
           updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND location_id = v_transfer.origin_location_id
       AND inventory_item_id = v_item.inventory_item_id
       AND quantity >= v_item.total_quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient stock for inventory item %', v_item.inventory_item_id;
    END IF;

    INSERT INTO hotel_stock_location_balances
      (tenant_id, location_id, inventory_item_id, quantity)
    VALUES
      (p_tenant_id, v_transfer.destination_location_id,
       v_item.inventory_item_id, v_item.total_quantity)
    ON CONFLICT (tenant_id, location_id, inventory_item_id)
    DO UPDATE SET quantity = hotel_stock_location_balances.quantity + EXCLUDED.quantity,
                  updated_at = now();

    INSERT INTO hotel_stock_transfer_ledger
      (id, tenant_id, transfer_id, inventory_item_id, origin_location_id,
       destination_location_id, quantity)
    VALUES
      (gen_random_uuid()::text, p_tenant_id, p_transfer_id, v_item.inventory_item_id,
       v_transfer.origin_location_id, v_transfer.destination_location_id,
       v_item.total_quantity);
  END LOOP;

  UPDATE hotel_stock_transfer_requests
     SET status = 'completed', updated_at = now()
   WHERE tenant_id = p_tenant_id AND id = p_transfer_id;
END;
$$;

-- Itens de transferências não podem ser editados depois que deixam rascunho/solicitado.
CREATE OR REPLACE FUNCTION hotel_stock_guard_transfer_items()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM hotel_stock_transfer_requests
   WHERE tenant_id = COALESCE(NEW.tenant_id, OLD.tenant_id)
     AND id = COALESCE(NEW.transfer_id, OLD.transfer_id) FOR UPDATE;
  IF v_status NOT IN ('draft', 'requested') THEN
    RAISE EXCEPTION 'transfer items are locked after approval';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER hotel_stock_guard_transfer_items_trg
BEFORE INSERT OR UPDATE OR DELETE ON hotel_stock_transfer_items
FOR EACH ROW EXECUTE FUNCTION hotel_stock_guard_transfer_items();

-- Execução será concedida explicitamente apenas ao papel de API autorizado.
REVOKE ALL ON FUNCTION hotel_stock_complete_transfer(text, text) FROM PUBLIC;

-- NÃO ativar em produção até testar privilégios, RLS, aprovações,
-- reenvio de solicitações, bootstrap dos saldos e concorrência entre locais.
-- A soma dos saldos por local NÃO deve ser somada ao saldo global legado.
