-- PT.01-PT.04 — partner developments, technical lot revisions and revocable project invites.
-- Migration prepared only. NOT executed against any database.
CREATE TABLE IF NOT EXISTS arqdor_partner_developments (
  id text NOT NULL,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  partner_name text,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id)
);
CREATE TABLE IF NOT EXISTS arqdor_partner_lots (
  id text NOT NULL,
  tenant_id text NOT NULL,
  development_id text NOT NULL,
  block text NOT NULL,
  lot_number text NOT NULL,
  technical_revision integer NOT NULL DEFAULT 1 CHECK(technical_revision >= 1),
  availability text NOT NULL DEFAULT 'unavailable' CHECK(availability IN ('available','reserved','sold','unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,development_id) REFERENCES arqdor_partner_developments(tenant_id,id) ON DELETE RESTRICT,
  UNIQUE(tenant_id,development_id,block,lot_number)
);
CREATE TABLE IF NOT EXISTS arqdor_partner_lot_revisions (
  tenant_id text NOT NULL,
  lot_id text NOT NULL,
  revision integer NOT NULL CHECK(revision >= 1),
  geometry_json jsonb NOT NULL,
  crs text NOT NULL,
  area_m2 numeric(18,4) NOT NULL CHECK(area_m2 > 0),
  perimeter_m numeric(18,4) NOT NULL CHECK(perimeter_m > 0),
  survey_source text NOT NULL,
  survey_date date,
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  PRIMARY KEY (tenant_id,lot_id,revision),
  FOREIGN KEY (tenant_id,lot_id) REFERENCES arqdor_partner_lots(tenant_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS arqdor_partner_lot_invites (
  id text NOT NULL,
  tenant_id text NOT NULL,
  lot_id text NOT NULL,
  revision integer NOT NULL,
  nonce_hash text NOT NULL,
  allowed_origin text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE(tenant_id,nonce_hash),
  FOREIGN KEY (tenant_id,lot_id,revision) REFERENCES arqdor_partner_lot_revisions(tenant_id,lot_id,revision) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS arqdor_partner_invites_lookup ON arqdor_partner_lot_invites(tenant_id,lot_id,expires_at) WHERE revoked_at IS NULL;
-- Security: DB service API must explicitly tenant-scope every query and enforce RBAC.
-- No direct public table access; evaluate RLS with existing Supabase role strategy before migration promotion.
