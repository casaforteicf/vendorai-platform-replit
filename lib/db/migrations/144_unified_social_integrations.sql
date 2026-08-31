ALTER TYPE message_canal ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE message_canal ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE message_canal ADD VALUE IF NOT EXISTS 'tiktok';

CREATE TABLE IF NOT EXISTS social_connections (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('youtube', 'linkedin', 'tiktok')),
  external_account_id text,
  account_name text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamp,
  scopes text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}',
  connected_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  disconnected_at timestamp,
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS social_publications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id text REFERENCES social_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  external_id text,
  content_type text NOT NULL DEFAULT 'post',
  text text,
  media_url text,
  status text NOT NULL DEFAULT 'draft',
  metrics jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_publications_tenant_provider_idx
  ON social_publications (tenant_id, provider, created_at DESC);
