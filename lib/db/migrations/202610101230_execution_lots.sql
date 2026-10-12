-- LOTE 06: reservas de execução parcial por contrato/negócio.
-- Aplicar apenas em homologação, após revisão de schema. Não executar em produção.
CREATE TABLE IF NOT EXISTS execution_lots (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 deal_id text NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
 proposal_id text REFERENCES propostas(id) ON DELETE SET NULL,
 request_key text NOT NULL,
 status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','in_progress','completed','cancelled')),
 label text,
 created_by text REFERENCES users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (tenant_id, deal_id, request_key),
 UNIQUE (id, tenant_id, deal_id)
);
CREATE TABLE IF NOT EXISTS execution_lot_items (
 id text PRIMARY KEY,
 lot_id text NOT NULL,
 tenant_id text NOT NULL,
 deal_id text NOT NULL,
 source_item_id text NOT NULL,
 group_id text,
 environment_id text,
 quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
 status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','in_progress','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (lot_id, tenant_id, deal_id) REFERENCES execution_lots(id, tenant_id, deal_id) ON DELETE RESTRICT,
 UNIQUE(lot_id, source_item_id)
);
CREATE INDEX IF NOT EXISTS execution_lots_deal_idx ON execution_lots(tenant_id, deal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS execution_lot_items_balance_idx ON execution_lot_items(tenant_id, deal_id, source_item_id, status);
CREATE TABLE IF NOT EXISTS execution_lot_events (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 lot_id text NOT NULL REFERENCES execution_lots(id) ON DELETE RESTRICT,
 actor_id text REFERENCES users(id) ON DELETE SET NULL,
 event_type text NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS execution_lot_events_timeline_idx ON execution_lot_events(tenant_id, lot_id, created_at DESC);
REVOKE ALL ON execution_lots, execution_lot_items, execution_lot_events FROM PUBLIC;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  REVOKE ALL ON execution_lots, execution_lot_items, execution_lot_events FROM anon;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  REVOKE ALL ON execution_lots, execution_lot_items, execution_lot_events FROM authenticated;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vendorai_app') THEN
  GRANT SELECT, INSERT, UPDATE, DELETE ON execution_lots, execution_lot_items, execution_lot_events TO vendorai_app;
 END IF;
END $$;
ALTER TABLE execution_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_lot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_lot_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vendorai_app') THEN
  CREATE POLICY execution_lots_backend_access ON execution_lots FOR ALL TO vendorai_app USING (true) WITH CHECK (true);
  CREATE POLICY execution_lot_items_backend_access ON execution_lot_items FOR ALL TO vendorai_app USING (true) WITH CHECK (true);
  CREATE POLICY execution_lot_events_backend_access ON execution_lot_events FOR ALL TO vendorai_app USING (true) WITH CHECK (true);
 END IF;
END $$;
