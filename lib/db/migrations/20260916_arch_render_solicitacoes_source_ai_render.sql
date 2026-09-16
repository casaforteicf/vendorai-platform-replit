ALTER TABLE arch_render_solicitacoes
  ADD COLUMN IF NOT EXISTS source_ai_render_id text;

CREATE INDEX IF NOT EXISTS arch_render_solicitacoes_source_ai_render_idx
  ON arch_render_solicitacoes (source_ai_render_id)
  WHERE source_ai_render_id IS NOT NULL;

-- Mantemos a referência sem FK nesta etapa de compatibilidade:
-- arch_render_solicitacoes pertence ao fluxo legado de cenas, enquanto
-- arch_ai_renders é a fonte oficial do Render Studio. A API valida tenant,
-- projeto e existência da versão antes de gravar source_ai_render_id.
