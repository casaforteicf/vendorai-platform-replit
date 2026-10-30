-- HOTEL-03: planejamento de refeições e sugestões de compra.
-- Não cria reservas, pedidos de compra ou movimentações de estoque reais.
-- Ocupação é informada explicitamente por um operador/fonte autorizada.
CREATE TABLE IF NOT EXISTS hotel_meal_forecasts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast','morning_snack','lunch','afternoon_snack','dinner')),
  service_time time,
  guest_count integer NOT NULL CHECK (guest_count >= 0),
  staff_meals integer NOT NULL DEFAULT 0 CHECK (staff_meals >= 0),
  source_type text NOT NULL CHECK (source_type IN ('manual','reservation_import','integration')),
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, service_date, meal_type),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_meal_plan_lines (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_id text NOT NULL,
  recipe_id text NOT NULL,
  planned_portions integer NOT NULL CHECK (planned_portions >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, forecast_id) REFERENCES hotel_meal_forecasts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, recipe_id) REFERENCES hotel_recipe_cards(tenant_id, id),
  UNIQUE (tenant_id, forecast_id, recipe_id)
);

CREATE TABLE IF NOT EXISTS hotel_purchase_suggestions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  forecast_id text NOT NULL,
  location_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  FOREIGN KEY (tenant_id, forecast_id) REFERENCES hotel_meal_forecasts(tenant_id, id),
  FOREIGN KEY (tenant_id, location_id) REFERENCES hotel_stock_locations(tenant_id, id),
  UNIQUE (tenant_id, forecast_id, location_id),
  FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id, id),
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS hotel_purchase_suggestion_lines (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  suggestion_id text NOT NULL,
  product_id text NOT NULL,
  quantity_required numeric(15,4) NOT NULL CHECK (quantity_required >= 0),
  quantity_available numeric(15,4) NOT NULL CHECK (quantity_available >= 0),
  quantity_suggested numeric(15,4) NOT NULL CHECK (quantity_suggested >= 0),
  unit text NOT NULL CHECK (unit IN ('g','kg','ml','l','un')),
  FOREIGN KEY (tenant_id, suggestion_id) REFERENCES hotel_purchase_suggestions(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES produtos_catalogo(tenant_id, id),
  UNIQUE (tenant_id, suggestion_id, product_id)
);

CREATE INDEX IF NOT EXISTS hotel_meal_forecasts_schedule ON hotel_meal_forecasts(tenant_id, service_date);
CREATE INDEX IF NOT EXISTS hotel_meal_plan_lines_forecast ON hotel_meal_plan_lines(tenant_id, forecast_id);
CREATE INDEX IF NOT EXISTS hotel_purchase_suggestions_forecast ON hotel_purchase_suggestions(tenant_id, forecast_id);

ALTER TABLE hotel_meal_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_meal_plan_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_purchase_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_purchase_suggestion_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_meal_forecasts_tenant ON hotel_meal_forecasts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY hotel_meal_plan_lines_tenant ON hotel_meal_plan_lines
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY hotel_purchase_suggestions_tenant ON hotel_purchase_suggestions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY hotel_purchase_suggestion_lines_tenant ON hotel_purchase_suggestion_lines
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Antes de usar: validar migration e grants num PostgreSQL isolado.
-- Estoque por local e ingredientes usam catálogos diferentes neste momento.
-- É obrigatória reconciliação explícita de produtos, unidades e saldos antes
-- de calcular faltas ou produzir sugestões destinadas ao setor de compras.

-- Consolidado semanal, separado das sugestões individuais por refeição.
-- Snapshot do estoque e da necessidade; não cria pedido de compra real.
CREATE TABLE IF NOT EXISTS hotel_weekly_purchase_requests (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 location_id text NOT NULL,
 period_start date NOT NULL,
 period_end date NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','dismissed')),
 requested_by text NOT NULL,
 reviewed_by text,
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (period_end >= period_start AND period_end <= period_start + 6),
 FOREIGN KEY (tenant_id, location_id) REFERENCES hotel_stock_locations(tenant_id,id),
 FOREIGN KEY (tenant_id, requested_by) REFERENCES users(tenant_id,id),
 FOREIGN KEY (tenant_id, reviewed_by) REFERENCES users(tenant_id,id),
 UNIQUE (tenant_id,location_id,period_start,period_end),
 UNIQUE (tenant_id,id)
);
CREATE TABLE IF NOT EXISTS hotel_weekly_purchase_request_lines (
 id text PRIMARY KEY,
 tenant_id text NOT NULL,
 request_id text NOT NULL,
 product_id text NOT NULL,
 unit text NOT NULL CHECK (unit IN ('g','ml','un')),
 quantity_required numeric(15,4) NOT NULL CHECK (quantity_required >= 0),
 quantity_available numeric(15,4) NOT NULL CHECK (quantity_available >= 0),
 quantity_suggested numeric(15,4) NOT NULL CHECK (quantity_suggested >= 0),
 FOREIGN KEY (tenant_id,request_id) REFERENCES hotel_weekly_purchase_requests(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY (tenant_id,product_id) REFERENCES produtos_catalogo(tenant_id,id),
 UNIQUE (tenant_id,request_id,product_id,unit)
);
ALTER TABLE hotel_weekly_purchase_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_weekly_purchase_request_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_weekly_requests_tenant ON hotel_weekly_purchase_requests
 USING (tenant_id = current_setting('app.tenant_id',true))
 WITH CHECK (tenant_id = current_setting('app.tenant_id',true));
CREATE POLICY hotel_weekly_lines_tenant ON hotel_weekly_purchase_request_lines
 USING (tenant_id = current_setting('app.tenant_id',true))
 WITH CHECK (tenant_id = current_setting('app.tenant_id',true));

-- Hotelaria reutiliza o cadastro de fornecedores do ecossistema de compras.
-- Uma solicitação semanal pode consultar diversos fornecedores, sem emitir pedidos.
CREATE TABLE IF NOT EXISTS hotel_weekly_supplier_quotes (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 request_id text NOT NULL,
 supplier_id text NOT NULL,
 status text NOT NULL DEFAULT 'selected' CHECK (status IN ('selected','sending','invited','responded','declined','cancelled')),
 invited_at timestamptz,
 responded_at timestamptz,
 currency text NOT NULL DEFAULT 'BRL',
 total_amount numeric(15,2),
 delivery_days integer CHECK (delivery_days >= 0),
 payment_terms text,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (tenant_id,request_id) REFERENCES hotel_weekly_purchase_requests(tenant_id,id) ON DELETE CASCADE,
 UNIQUE (tenant_id,request_id,supplier_id),
 UNIQUE (tenant_id,id)
);
CREATE INDEX IF NOT EXISTS hotel_weekly_supplier_quotes_request
 ON hotel_weekly_supplier_quotes(tenant_id,request_id);
ALTER TABLE hotel_weekly_supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_weekly_supplier_quotes_tenant ON hotel_weekly_supplier_quotes
 USING (tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK (tenant_id=current_setting('app.tenant_id',true));
-- supplier_id é validado na API contra fornecedores do mesmo tenant.
-- 'selected' registra seleção interna; 'invited' somente após envio confirmado.

CREATE TABLE IF NOT EXISTS hotel_supplier_quote_deliveries (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 quote_id text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','whatsapp')),
 destination text NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','sent','failed')),
 provider_message_id text,
 error_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 FOREIGN KEY(tenant_id,quote_id) REFERENCES hotel_weekly_supplier_quotes(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS hotel_supplier_quote_deliveries_lookup ON hotel_supplier_quote_deliveries(tenant_id,quote_id);
ALTER TABLE hotel_supplier_quote_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_supplier_quote_deliveries_tenant ON hotel_supplier_quote_deliveries
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));

-- Escolha humana da proposta; um único fornecedor vencedor por solicitação.
CREATE TABLE IF NOT EXISTS hotel_weekly_quote_awards (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 request_id text NOT NULL,
 quote_id text NOT NULL,
 approved_by text NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now(),
 notes text,
 FOREIGN KEY(tenant_id,request_id) REFERENCES hotel_weekly_purchase_requests(tenant_id,id),
 FOREIGN KEY(tenant_id,quote_id) REFERENCES hotel_weekly_supplier_quotes(tenant_id,id),
 FOREIGN KEY(tenant_id,approved_by) REFERENCES users(tenant_id,id),
 UNIQUE(tenant_id,request_id)
);
ALTER TABLE hotel_weekly_quote_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_weekly_quote_awards_tenant ON hotel_weekly_quote_awards
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
