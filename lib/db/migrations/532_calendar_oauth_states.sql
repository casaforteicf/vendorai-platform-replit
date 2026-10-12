CREATE TABLE IF NOT EXISTS calendar_oauth_states (
  state_hash text PRIMARY KEY,
  agenda_id text NOT NULL REFERENCES agendas(id) ON DELETE CASCADE,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  initiated_by text NOT NULL REFERENCES users(id),
  expires_at timestamp NOT NULL,
  consumed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_oauth_states_expiry_idx ON calendar_oauth_states(expires_at);
