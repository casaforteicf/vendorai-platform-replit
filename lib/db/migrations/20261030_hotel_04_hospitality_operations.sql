-- HOTEL-04 initial foundation: lodging rooms, guests and stay reservations.
-- Independent from HOTEL-03. No billing or automatic meal forecasts.
CREATE TABLE IF NOT EXISTS hotel_rooms (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 code text NOT NULL,
 name text NOT NULL,
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 30),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','maintenance','inactive')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS hotel_guests (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 full_name text NOT NULL,
 contact_email text,
 contact_phone text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS hotel_reservations (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 room_id text NOT NULL,
 primary_guest_id text NOT NULL,
 arrival_date date NOT NULL,
 departure_date date NOT NULL,
 guest_count integer NOT NULL CHECK(guest_count BETWEEN 1 AND 30),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','checked_in','checked_out','cancelled')),
 checked_in_at timestamptz,
 checked_out_at timestamptz,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(departure_date>arrival_date),
 FOREIGN KEY(tenant_id,room_id) REFERENCES hotel_rooms(tenant_id,id),
 FOREIGN KEY(tenant_id,primary_guest_id) REFERENCES hotel_guests(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS hotel_reservations_room_dates ON hotel_reservations(tenant_id,room_id,arrival_date,departure_date);
ALTER TABLE hotel_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotel_reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_rooms_tenant ON hotel_rooms USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY hotel_guests_tenant ON hotel_guests USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY hotel_reservations_tenant ON hotel_reservations USING(tenant_id=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
-- Application locks must serialize overlapping bookings on the room row.

ALTER TABLE hotel_rooms ADD COLUMN IF NOT EXISTS housekeeping_status text NOT NULL DEFAULT 'clean' CHECK(housekeeping_status IN ('clean','dirty','cleaning','inspection'));
CREATE TABLE IF NOT EXISTS hotel_room_operational_events (
 id text PRIMARY KEY,
 tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 room_id text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN ('housekeeping','maintenance','release')),
 previous_status text NOT NULL,
 new_status text NOT NULL,
 notes text,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,room_id) REFERENCES hotel_rooms(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS hotel_room_events_lookup ON hotel_room_operational_events(tenant_id,room_id,created_at DESC);
ALTER TABLE hotel_room_operational_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY hotel_room_events_tenant ON hotel_room_operational_events
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
