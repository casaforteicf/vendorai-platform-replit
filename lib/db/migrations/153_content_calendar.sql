-- Calendário de conteúdo -- pedido real: plano pra "viralizar" o negócio
-- usando as peças que já existiam soltas (marca/perfil, gerar legenda,
-- gerar criativo, publicar no Instagram, revisão de performance) --
-- só faltava o calendário que agenda os posts ao longo do tempo e liga
-- essas peças numa sequência.
CREATE TABLE IF NOT EXISTS content_calendar_items (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_plan_id text REFERENCES media_plans(id) ON DELETE SET NULL,
  data_agendada date NOT NULL,
  pilar text NOT NULL,
  tema_sugerido text NOT NULL,
  tipo text NOT NULL DEFAULT 'feed',
  canal text NOT NULL DEFAULT 'instagram',
  status text NOT NULL DEFAULT 'planejado',
  content_generation_id text,
  variation_idx integer,
  content_id_publicado text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_tenant_data
  ON content_calendar_items (tenant_id, data_agendada);
