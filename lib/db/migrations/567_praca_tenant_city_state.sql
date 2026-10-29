-- Store the seller's municipality and Brazilian state for Praça.ai routing.
-- Additive and safe to re-run; existing tenants remain unset until they complete their profile.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS cidade varchar(120),
  ADD COLUMN IF NOT EXISTS estado varchar(2);

CREATE INDEX IF NOT EXISTS idx_tenants_praca_localidade
  ON tenants (lower(cidade), upper(estado))
  WHERE cidade IS NOT NULL AND estado IS NOT NULL;
