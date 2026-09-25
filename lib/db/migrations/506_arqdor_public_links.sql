-- Link público do pré-projeto (Arqdor): o cliente final se cadastra pelo site do profissional,
-- vira lead e acessa somente o próprio pré-projeto.
CREATE TABLE IF NOT EXISTS arqdor_public_links (
  tenant_id      text PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled        boolean NOT NULL DEFAULT false,
  owner_user_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  renders_per_day integer NOT NULL DEFAULT 5,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE arqdor_public_links ENABLE ROW LEVEL SECURITY;
