-- Assistência interativa: atividades por etapa, formulários versionados e link público permanente.
-- Aditiva/idempotente; não remove nem altera dados legados.

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS work_card_id text,
  ADD COLUMN IF NOT EXISTS formulario_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS formulario_respostas jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS activities_work_card_stage_template_idx
  ON activities (tenant_id, work_card_id, origem_etapa_key, origem_template_key);

ALTER TABLE work_cards
  ADD COLUMN IF NOT EXISTS public_access_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS work_cards_public_access_token_hash_uidx
  ON work_cards (public_access_token_hash)
  WHERE public_access_token_hash IS NOT NULL;

COMMENT ON COLUMN activities.formulario_snapshot IS
  'Snapshot imutável das perguntas/regras da atividade no momento em que ela foi criada.';
COMMENT ON COLUMN activities.formulario_respostas IS
  'Respostas estruturadas da atividade com autoria, origem, data/hora e histórico de alterações.';
COMMENT ON COLUMN work_cards.public_access_token_hash IS
  'Hash SHA-256 do token do link público permanente do processo operacional.';
