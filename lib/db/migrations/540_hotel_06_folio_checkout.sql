-- HOTEL-06: fecha o fluxo operacional do hotel.
-- Categoria de apartamento, tarifa aplicada à reserva e conta (folio) com
-- diárias, extras/descontos/impostos, pagamentos e fechamento no check-out.
-- Migration transacional e idempotente na criação de colunas/tabelas.

ALTER TABLE hotel_rooms
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'standard'
  CHECK (char_length(category) BETWEEN 1 AND 40);

ALTER TABLE hotel_rate_plans
  ADD COLUMN IF NOT EXISTS room_category text
  CHECK (room_category IS NULL OR char_length(room_category) BETWEEN 1 AND 40);

ALTER TABLE hotel_reservations
  ADD COLUMN IF NOT EXISTS rate_plan_id text,
  ADD COLUMN IF NOT EXISTS quotation_id text,
  ADD COLUMN IF NOT EXISTS nightly_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'BRL';

ALTER TABLE hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_rate_plan_fk;
ALTER TABLE hotel_reservations
  ADD CONSTRAINT hotel_reservations_rate_plan_fk
  FOREIGN KEY (tenant_id, rate_plan_id) REFERENCES hotel_rate_plans(tenant_id, id);

ALTER TABLE hotel_reservations
  DROP CONSTRAINT IF EXISTS hotel_reservations_quotation_fk;
ALTER TABLE hotel_reservations
  ADD CONSTRAINT hotel_reservations_quotation_fk
  FOREIGN KEY (tenant_id, quotation_id) REFERENCES hotel_rate_quotations(tenant_id, id);

CREATE INDEX IF NOT EXISTS hotel_rate_plans_category
  ON hotel_rate_plans(tenant_id, room_category);

CREATE TABLE IF NOT EXISTS hotel_folios (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reservation_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  currency char(3) NOT NULL DEFAULT 'BRL',
  charges_total numeric(14,2) NOT NULL DEFAULT 0,
  payments_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (payments_total >= 0),
  balance numeric(14,2) NOT NULL DEFAULT 0,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by text,
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES hotel_reservations(tenant_id, id),
  FOREIGN KEY (tenant_id, closed_by) REFERENCES users(tenant_id, id),
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, reservation_id)
);

CREATE TABLE IF NOT EXISTS hotel_folio_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folio_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('room','extra','discount','tax')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 180),
  service_date date,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  total_amount numeric(14,2) NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'discount' AND total_amount <= 0) OR (kind <> 'discount' AND total_amount >= 0)),
  FOREIGN KEY (tenant_id, folio_id) REFERENCES hotel_folios(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_folio_payments (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  folio_id text NOT NULL,
  method text NOT NULL CHECK (method IN ('cash','pix','credit_card','debit_card','transfer','other')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, folio_id) REFERENCES hotel_folios(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, created_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS hotel_folios_status
  ON hotel_folios(tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS hotel_folio_items_lookup
  ON hotel_folio_items(tenant_id, folio_id, created_at);

CREATE INDEX IF NOT EXISTS hotel_folio_payments_lookup
  ON hotel_folio_payments(tenant_id, folio_id, created_at);

ALTER TABLE hotel_folios ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_folio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_folio_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_folios_tenant ON hotel_folios;
CREATE POLICY hotel_folios_tenant ON hotel_folios
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_folio_items_tenant ON hotel_folio_items;
CREATE POLICY hotel_folio_items_tenant ON hotel_folio_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS hotel_folio_payments_tenant ON hotel_folio_payments;
CREATE POLICY hotel_folio_payments_tenant ON hotel_folio_payments
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
