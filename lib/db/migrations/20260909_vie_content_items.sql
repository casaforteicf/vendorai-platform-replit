CREATE TABLE IF NOT EXISTS vie_items (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES vie_sources(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  external_id text,
  title text NOT NULL,
  url text NOT NULL,
  excerpt text,
  author text,
  published_at timestamptz,
  categories jsonb,
  raw_metadata jsonb,
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vie_items_source_fingerprint_idx
  ON vie_items (source_id, fingerprint);

CREATE INDEX IF NOT EXISTS vie_items_published_idx
  ON vie_items (published_at DESC);

CREATE INDEX IF NOT EXISTS vie_items_source_published_idx
  ON vie_items (source_id, published_at DESC);
