-- HOTEL-05: tarifas configuráveis. Independente das migrations ainda pendentes de HOTEL-04.
CREATE TABLE IF NOT EXISTS hotel_rate_plans (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name text NOT NULL,
 currency char(3) NOT NULL DEFAULT 'BRL',
 standard_amount numeric(14,2) NOT NULL CHECK(standard_amount>=0),
 extra_guest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(extra_guest_amount>=0),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 UNIQUE(tenant_id,name)
);
CREATE TABLE IF NOT EXISTS hotel_rate_adjustments (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 plan_id text NOT NULL,
 start_date date NOT NULL,
 end_date date NOT NULL,
 weekday smallint,
 amount numeric(14,2) NOT NULL CHECK(amount>=0),
 priority integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date>=start_date),
 CHECK(weekday IS NULL OR weekday BETWEEN 0 AND 6),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES hotel_rate_plans(tenant_id,id),
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS hotel_rate_quotations (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 plan_id text NOT NULL,
 arrival_date date NOT NULL,
 departure_date date NOT NULL,
 guest_count integer NOT NULL CHECK(guest_count>=1),
 nightly_prices jsonb NOT NULL,
 total_amount numeric(14,2) NOT NULL CHECK(total_amount>=0),
 currency char(3) NOT NULL DEFAULT 'BRL',
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(departure_date>arrival_date),
 FOREIGN KEY(tenant_id,plan_id) REFERENCES hotel_rate_plans(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 UNIQUE(tenant_id,id)
);
ALTER TABLE hotel_rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rate_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_rate_quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_rate_plans_tenant ON hotel_rate_plans USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY hotel_rate_adjustments_tenant ON hotel_rate_adjustments USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY hotel_rate_quotations_tenant ON hotel_rate_quotations USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
