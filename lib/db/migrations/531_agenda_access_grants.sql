-- Explicit access grants; an agenda is never shared just because it belongs to a tenant.
CREATE TABLE IF NOT EXISTS agenda_access_grants (
  agenda_id text NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by text REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (agenda_id, user_id)
);
CREATE INDEX IF NOT EXISTS agenda_access_grants_tenant_user_idx ON agenda_access_grants (tenant_id, user_id);
