CREATE TABLE IF NOT EXISTS arch_render_videos (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  render_id text NOT NULL REFERENCES arch_ai_renders(id) ON DELETE CASCADE,
  movement text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '16:9',
  status text NOT NULL DEFAULT 'queued',
  provider text,
  model text,
  provider_prediction_id text,
  video_url text,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);

CREATE INDEX IF NOT EXISTS arch_render_videos_tenant_render_idx
  ON arch_render_videos(tenant_id, render_id, created_at DESC);
