-- HOTEL-03: planejamento de refeições e sugestões de compra.
-- Não cria reservas, pedidos de compra ou movimentações de estoque reais.
-- Ocupação é informada explicitamente por um operador/fonte autorizada.
CREATE TABLE IF NOT EXISTS hotel_meal_forecasts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_date date NOT NULL,
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner')),
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
