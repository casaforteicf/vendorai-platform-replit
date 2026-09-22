CREATE TABLE IF NOT EXISTS admin_internal_knowledge_segments (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
