ALTER TABLE content_published_posts ADD COLUMN IF NOT EXISTS instagram_connection_id text;
CREATE INDEX IF NOT EXISTS content_published_posts_instagram_connection_idx ON content_published_posts (tenant_id, instagram_connection_id);
