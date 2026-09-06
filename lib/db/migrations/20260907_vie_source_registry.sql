CREATE TABLE IF NOT EXISTS vie_sources (
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  domain text NOT NULL DEFAULT 'news',
  scope text NOT NULL,
  source_type text NOT NULL,
  endpoint_url text,
  website_url text,
  country_code text,
  region_code text,
  city text,
  categories jsonb,
  reliability_score integer,
  active boolean NOT NULL DEFAULT true,
  license_notes text,
  terms_url text,
  metadata jsonb,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vie_sources_code_idx
  ON vie_sources (code);

CREATE INDEX IF NOT EXISTS vie_sources_active_domain_scope_idx
  ON vie_sources (active, domain, scope);

ALTER TABLE vie_sources
  DROP CONSTRAINT IF EXISTS vie_sources_reliability_score_check;

ALTER TABLE vie_sources
  ADD CONSTRAINT vie_sources_reliability_score_check
  CHECK (reliability_score IS NULL OR reliability_score BETWEEN 0 AND 100);
