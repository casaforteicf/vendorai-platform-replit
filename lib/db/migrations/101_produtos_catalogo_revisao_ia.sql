-- Auto-cadastro de produto via IA (sync de estoque do ERP): produto novo
-- entra em fila de revisão em vez de ir direto pro catálogo ativo.
-- status_revisao 'pendente_revisao' + ativo=false reaproveita toda a
-- exclusão de site/feed/anúncio que já filtra por produtos_catalogo.ativo.
ALTER TABLE produtos_catalogo
  ADD COLUMN IF NOT EXISTS status_revisao text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS avisos_revisao jsonb;
